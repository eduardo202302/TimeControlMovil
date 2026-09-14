import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import type { MapPressEvent, MarkerDragStartEndEvent } from "react-native-maps";
import type MapViewType from "react-native-maps";
import { RADIUS_LG, RADIUS_MD, useResponsive } from "@/constants/responsive";
import {
  ADDRESS_SEARCH_DEBOUNCE_MS,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_DELTA,
  fetchPlacePredictions,
  geocodeLocation,
  geocodePlace,
  isAddressDraftComplete,
  reverseGeocode,
  type GeocodeResult,
  type AddressTextField,
  type LatLng,
  type PlacePrediction,
} from "../../utils/addressRules";
import { displayPhone } from "../../utils/usersRules";
import type { UserFormController } from "./useUserForm";
import type { UserFormStyles } from "./userFormStyles";

interface UserAddressTabProps {
  ctl: UserFormController;
  styles: UserFormStyles;
}

type EditableField = Exclude<AddressTextField, "formattedAddress">;

/**
 * react-native-maps se carga con require protegido: su import lanza
 * "TurboModuleRegistry.getEnforcing(...): 'RNMapsAirModule' could not be
 * found" AL EVALUAR EL MÓDULO si el dev client no se recompiló con la
 * dependencia. Con un import estático eso tumbaba UserFormModal completo (y
 * users.tsx en cascada). Sin el módulo nativo la tab sigue funcionando
 * (buscador, campos, textarea) y el mapa muestra un aviso.
 */
type MapsModule = typeof import("react-native-maps");
const maps: MapsModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-maps") as MapsModule;
  } catch (error: any) {
    console.warn("react-native-maps no está en el binario (recompilar dev client):", error?.message);
    return null;
  }
})();
const MapView = maps?.default ?? null;
const Marker = maps?.Marker ?? null;

/**
 * Tab "Dirección" — AdressEntity + MapAddressSelector + DraggableMap del
 * webapp en una sola vista: buscador (Places Autocomplete, RD) → mapa con pin
 * arrastrable → campos → "Guardar dirección" → textarea de la dirección.
 */
export default function UserAddressTab({ ctl, styles }: UserAddressTabProps) {
  const { scale, verticalScale, font } = useResponsive();
  const local = useMemo(() => createStyles(scale, verticalScale, font), [scale, verticalScale, font]);
  const disabled = ctl.isWatch;
  const draft = ctl.addressDraft;
  const saved = ctl.form.address?.[0] ?? null;

  const mapRef = useRef<MapViewType>(null);
  /** El pin queda donde el usuario lo soltó; la ubicación guardada es la del geocode. */
  const [marker, setMarker] = useState<LatLng>(ctl.addressCoords);
  const [query, setQuery] = useState(draft.formattedAddress);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  /** Solo lo que TECLEA el usuario dispara el autocomplete; el texto que se
   * pone por código (formatted_address del geocode) no vuelve a buscar. */
  const [searchTerm, setSearchTerm] = useState("");

  const onQueryChange = (text: string) => {
    setQuery(text);
    setSearchTerm(text.trim());
    if (text.trim().length < 3) setPredictions([]);
  };

  // ── Autocomplete con debounce ─────────────────────────────────────────────
  useEffect(() => {
    const term = searchTerm;
    if (disabled || term.length < 3) return;
    let alive = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await fetchPlacePredictions(term);
        if (alive) setPredictions(result);
      } catch (error: any) {
        console.error("address/autocomplete:", error?.message);
        if (alive) setPredictions([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, ADDRESS_SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [searchTerm, disabled]);

  const setQueryFromCode = (text: string) => {
    setQuery(text);
    setSearchTerm("");
    setPredictions([]);
  };

  /** Vuelca un resultado de Geocoding (place_id o latlng) a los campos. */
  const applyResult = useCallback(
    (result: GeocodeResult, point: LatLng) => {
      ctl.applyAddressGeocode(result, point);
      setQueryFromCode(result.formatted_address ?? "");
    },
    [ctl],
  );

  // ── Reverse geocode (pin arrastrado o toque en el mapa) ───────────────────
  const locate = useCallback(
    async (point: LatLng) => {
      setMarker(point);
      setGeocoding(true);
      setGeoError(null);
      try {
        const result = await reverseGeocode(point);
        if (!result) {
          setGeoError("No se encontró una dirección para esa ubicación.");
          return;
        }
        applyResult(result, point);
      } catch (error: any) {
        console.error("address/reverseGeocode:", error?.message);
        setGeoError("No se pudo obtener la dirección.");
      } finally {
        setGeocoding(false);
      }
    },
    [applyResult],
  );

  /**
   * Sugerencia elegida → Geocoding por place_id: de esa misma respuesta salen
   * geometry.location (pin y centro del mapa) y address_components (campos).
   */
  const choosePrediction = async (prediction: PlacePrediction) => {
    setQueryFromCode(prediction.description);
    setGeocoding(true);
    setGeoError(null);
    try {
      const result = await geocodePlace(prediction.placeId);
      const point = geocodeLocation(result);
      if (!result || !point) {
        setGeoError("No se pudo ubicar la dirección seleccionada.");
        return;
      }
      setMarker(point);
      mapRef.current?.animateToRegion(
        { latitude: point.lat, longitude: point.lng, latitudeDelta: DEFAULT_MAP_DELTA, longitudeDelta: DEFAULT_MAP_DELTA },
        400,
      );
      applyResult(result, point);
    } catch (error: any) {
      console.error("address/geocodePlace:", error?.message);
      setGeoError("No se pudo ubicar la dirección seleccionada.");
    } finally {
      setGeocoding(false);
    }
  };

  const onMapPress = (event: MapPressEvent) => {
    if (disabled) return;
    const { latitude, longitude } = event.nativeEvent.coordinate;
    locate({ lat: latitude, lng: longitude });
  };

  const onDragEnd = (event: MarkerDragStartEndEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    locate({ lat: latitude, lng: longitude });
  };

  const confirmDelete = () => {
    Alert.alert("Eliminar dirección", "¿Está seguro que desea eliminar la dirección?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => {
          ctl.clearAddress();
          setMarker({ ...DEFAULT_MAP_CENTER });
          mapRef.current?.animateToRegion(
            {
              latitude: DEFAULT_MAP_CENTER.lat,
              longitude: DEFAULT_MAP_CENTER.lng,
              latitudeDelta: DEFAULT_MAP_DELTA,
              longitudeDelta: DEFAULT_MAP_DELTA,
            },
            400,
          );
          setQueryFromCode("");
          setPredictions([]);
          setGeoError(null);
        },
      },
    ]);
  };

  const renderField = (
    label: string,
    field: EditableField,
    options: { required?: boolean; display?: (v: string) => string; inputProps?: TextInputProps } = {},
  ) => (
    <View style={styles.labelSpaced}>
      <Text style={styles.label}>
        {label} {options.required && <Text style={styles.required}>*</Text>}
      </Text>
      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        value={options.display ? options.display(draft[field]) : draft[field]}
        onChangeText={(text) => ctl.setAddressField(field, text)}
        editable={!disabled}
        placeholderTextColor="#9CA3AF"
        autoCorrect={false}
        {...options.inputProps}
      />
    </View>
  );

  const complete = isAddressDraftComplete(draft);
  const hasAnything = saved !== null || Object.values(draft).some((v) => v !== "");

  return (
    <>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="location-outline" size={16} color="#2563EB" />
            <Text style={styles.cardTitle}>Seleccionar Ubicación</Text>
          </View>
          {!disabled && hasAnything && (
            <TouchableOpacity onPress={confirmDelete} hitSlop={8} accessibilityLabel="Eliminar dirección">
              <Ionicons name="trash-outline" size={18} color="#B43333" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Buscador (Places Autocomplete, RD) ── */}
        <View style={[local.searchBox, disabled && styles.inputDisabled]}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput
            style={local.searchInput}
            value={query}
            onChangeText={onQueryChange}
            placeholder="Buscar dirección…"
            placeholderTextColor="#9CA3AF"
            editable={!disabled}
            autoCorrect={false}
            multiline
          />
          {searching || geocoding ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            !!query &&
            !disabled && (
              <TouchableOpacity onPress={() => setQueryFromCode("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            )
          )}
        </View>
        {predictions.length > 0 && (
          <View style={local.predictions}>
            {predictions.map((prediction) => (
              <TouchableOpacity
                key={prediction.placeId}
                style={local.prediction}
                onPress={() => choosePrediction(prediction)}
                activeOpacity={0.75}
              >
                <Ionicons name="location-outline" size={14} color="#6B7280" />
                <Text style={local.predictionText} numberOfLines={2}>
                  {prediction.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {!!geoError && <Text style={styles.fieldError}>{geoError}</Text>}

        {/* ── Mapa ── */}
        <View style={local.mapWrapper}>
          {MapView && Marker ? (
            <MapView
              ref={mapRef}
              style={local.map}
              mapType="standard"
              initialRegion={{
                latitude: ctl.addressCoords.lat,
                longitude: ctl.addressCoords.lng,
                latitudeDelta: DEFAULT_MAP_DELTA,
                longitudeDelta: DEFAULT_MAP_DELTA,
              }}
              onPress={onMapPress}
              toolbarEnabled={false}
            >
              <Marker
                coordinate={{ latitude: marker.lat, longitude: marker.lng }}
                draggable={!disabled}
                onDragEnd={onDragEnd}
              />
            </MapView>
          ) : (
            <View style={local.mapFallback}>
              <Ionicons name="map-outline" size={28} color="#9CA3AF" />
              <Text style={local.mapFallbackText}>
                El mapa no está disponible en esta versión de la app. Puedes buscar la dirección o completar los campos.
              </Text>
            </View>
          )}
        </View>
        <Text style={local.mapHint}>
          {ctl.addressHasLocation
            ? "Arrastra el marcador para ajustar la ubicación exacta. Los campos se actualizan automáticamente."
            : "Sin ubicación seleccionada: busca una dirección, toca el mapa o arrastra el marcador."}
        </Text>

        {/* ── Campos (inputs de MapAddressSelector) ── */}
        {renderField("Título", "title", { inputProps: { placeholder: "Ej. Oficina Principal" } })}
        <View style={styles.row}>
          <View style={styles.rowItem}>{renderField("Provincia", "province", { required: true })}</View>
          <View style={styles.rowItem}>{renderField("Ciudad", "city", { required: true })}</View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>{renderField("Sector", "sector", { required: true })}</View>
          <View style={styles.rowItem}>{renderField("Zona", "zone")}</View>
        </View>
        <View style={styles.row}>
          <View style={local.streetItem}>{renderField("Calle", "street", { required: true })}</View>
          <View style={styles.rowItem}>
            {renderField("Número", "streetNumber", {
              required: true,
              inputProps: { placeholder: "Ej: 123, 123A" },
            })}
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>
            {renderField("Edificio", "building", { inputProps: { placeholder: "Edificio, Casa, etc." } })}
          </View>
          <View style={styles.rowItem}>
            {renderField("N° de Apartamento", "apartmentNumber", { inputProps: { placeholder: "A-3, 201" } })}
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>{renderField("Código Postal", "postalCode")}</View>
          <View style={styles.rowItem}>
            {/* Máscara solo visual; se guarda lo que se escribe (igual que el webapp). */}
            {renderField("Teléfono", "phone", {
              display: (v) => displayPhone(v) || v,
              inputProps: { keyboardType: "phone-pad", placeholder: "Teléfono 1" },
            })}
          </View>
        </View>
        {renderField("Referencias para llegar", "referenceToArrive", {
          inputProps: {
            multiline: true,
            placeholder: "Entre qué calles está, alguna referencia, etc.",
            style: [styles.input, local.textArea, disabled && styles.inputDisabled],
          },
        })}

        {!disabled && (
          <TouchableOpacity
            style={[local.saveBtn, !complete && local.saveBtnDisabled]}
            onPress={ctl.saveAddressDraft}
            disabled={!complete}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={local.saveText}>Guardar dirección</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Textarea de AdressEntity: escribe directo en la dirección guardada ── */}
      <View style={styles.card}>
        <Text style={styles.label}>Dirección:</Text>
        <TextInput
          style={[styles.input, local.textArea, disabled && styles.inputDisabled]}
          value={draft.formattedAddress}
          onChangeText={ctl.setAddressFormatted}
          editable={!disabled}
          multiline
          placeholder="Ej. Calle Duarte #45, La Vega, República Dominicana"
          placeholderTextColor="#9CA3AF"
        />
      </View>
    </>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      borderWidth: 1,
      borderColor: "#D1D5DB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      backgroundColor: "#fff",
    },
    searchInput: {
      flex: 1,
      fontSize: font(14),
      color: "#111827",
      paddingVertical: verticalScale(10),
    },
    predictions: {
      marginTop: verticalScale(4),
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      backgroundColor: "#fff",
      overflow: "hidden",
    },
    prediction: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      borderBottomWidth: 1,
      borderBottomColor: "#F3F4F6",
    },
    predictionText: { flex: 1, fontSize: font(13), color: "#374151" },
    mapWrapper: {
      marginTop: verticalScale(10),
      height: verticalScale(260),
      borderRadius: RADIUS_LG,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "#E5E7EB",
    },
    map: { flex: 1 },
    mapFallback: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: verticalScale(6),
      paddingHorizontal: scale(16),
      backgroundColor: "#F3F4F6",
    },
    mapFallbackText: { fontSize: font(12), color: "#6B7280", textAlign: "center" },
    mapHint: { fontSize: font(12), color: "#6B7280", marginTop: verticalScale(6) },
    streetItem: { flex: 2 },
    textArea: { minHeight: verticalScale(72), textAlignVertical: "top" },
    saveBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(6),
      marginTop: verticalScale(16),
      paddingVertical: verticalScale(12),
      borderRadius: RADIUS_LG,
      backgroundColor: "#2563EB",
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveText: { fontSize: font(14), fontWeight: "700", color: "#fff" },
  });
}
