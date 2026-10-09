import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import type { MapPressEvent } from "react-native-maps";
import type MapViewType from "react-native-maps";
import {
  APP_BACKGROUND_V2,
  CARD_BACKGROUND,
  CARD_BORDER,
  ERROR_COLOR,
  FIELD_DISABLED_BACKGROUND,
  FOOTER_BORDER,
  HEADER_BUTTON_BACKGROUND,
  HEADER_TEXT,
  ON_PRIMARY,
  PRIMARY_700,
  PRIMARY_COLOR,
  PRIMARY_TINT_50,
  PRIMARY_TINT_BORDER,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";
import {
  MAX_CONTENT_WIDTH,
  RADIUS_LG,
  RADIUS_MD,
  useResponsive,
} from "@/constants/responsive";
import {
  CARD_FORM,
  FIELD_SURFACE,
  FOOTER_BAR,
  FOOTER_BTN_CANCEL,
  FOOTER_BTN_SAVE,
  MODAL_TOPBAR,
} from "@/styles/surfaces";
import {
  ADDRESS_SEARCH_DEBOUNCE_MS,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_DELTA,
  fetchPlacePredictions,
  geocodeLocation,
  geocodePlace,
  reverseGeocode,
  type GeocodeResult,
  type LatLng,
  type PlacePrediction,
} from "../../utils/addressRules";
import {
  applyTaskerGeocode,
  buildTaskerAddress,
  isTaskerAddressComplete,
  resolveTaskerAddressConfig,
  resolveTaskerInitialPoint,
  taskerDraftFromAddress,
} from "../../utils/taskerRules";
import type {
  TaskerAddress,
  TaskerAddressDraft,
} from "../../../types/typesTasker/TaskerTypes";

type Styles = ReturnType<typeof createStyles>;

/** Mismo require protegido que UserAddressTab: sin el módulo nativo, aviso en lugar del mapa. */
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

/** Mismo mínimo de caracteres que el buscador de UserAddressTab. */
const SEARCH_MIN_CHARS = 3;
/** Mismo tope de espera del GPS que punchinout.tsx. */
const LOCATION_TIMEOUT_MS = 10_000;

interface TaskerAddressModalProps {
  visible: boolean;
  /** null = dirección nueva; si no, la que se edita. */
  address: TaskerAddress | null;
  onClose: () => void;
  onSelect: (address: TaskerAddress) => void;
}

/**
 * "Seleccionar Ubicación" de Reportar Avería — MapAddressSelector de Tasker:
 * buscador → mapa (tocar mueve el marcador, que NO se arrastra) → campos →
 * "Seleccionar". Nada va al backend; la única red es Google vía addressRules.
 */
export default function TaskerAddressModal({
  visible,
  address,
  onClose,
  onSelect,
}: TaskerAddressModalProps) {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={HEADER_TEXT} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Seleccionar Ubicación</Text>
          <View style={styles.topBarSpacer} />
        </View>
        {/* Montado solo mientras está visible: cada apertura arranca de `address`. */}
        {visible && (
          <AddressForm
            address={address}
            isTablet={isTablet}
            styles={styles}
            onClose={onClose}
            onSelect={onSelect}
          />
        )}
      </View>
    </Modal>
  );
}

interface AddressFormProps {
  address: TaskerAddress | null;
  isTablet: boolean;
  styles: Styles;
  onClose: () => void;
  onSelect: (address: TaskerAddress) => void;
}

function AddressForm({ address, isTablet, styles, onClose, onSelect }: AddressFormProps) {
  const config = useMemo(() => resolveTaskerAddressConfig(), []);
  const initialPoint = useMemo(() => resolveTaskerInitialPoint(address), [address]);
  const mapStart = initialPoint ?? DEFAULT_MAP_CENTER;

  const mapRef = useRef<MapViewType>(null);
  /** Cada geocodificación lleva un número; solo aplica la última pedida. */
  const requestRef = useRef(0);
  const [draft, setDraft] = useState<TaskerAddressDraft>(() => taskerDraftFromAddress(address));
  /** Último resultado de Google aplicado: de ahí salen las coordenadas al seleccionar. */
  const [geocode, setGeocode] = useState<GeocodeResult | null>(null);
  const [marker, setMarker] = useState<LatLng | null>(initialPoint);
  const [query, setQuery] = useState(address?.address ?? "");
  /** Solo lo que TECLEA el usuario dispara el autocomplete. */
  const [searchTerm, setSearchTerm] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const onQueryChange = (text: string) => {
    setQuery(text);
    setSearchTerm(text.trim());
    if (text.trim().length < SEARCH_MIN_CHARS) setPredictions([]);
  };

  // ── Autocomplete con debounce ─────────────────────────────────────────────
  useEffect(() => {
    const term = searchTerm;
    if (term.length < SEARCH_MIN_CHARS) return;
    let alive = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await fetchPlacePredictions(term);
        if (alive) setPredictions(result);
      } catch (error: any) {
        console.error("tasker/address/autocomplete:", error?.message);
        if (alive) setPredictions([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, ADDRESS_SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const setQueryFromCode = (text: string) => {
    setQuery(text);
    setSearchTerm("");
    setPredictions([]);
  };

  const moveMapTo = (point: LatLng) => {
    mapRef.current?.animateToRegion(
      {
        latitude: point.lat,
        longitude: point.lng,
        latitudeDelta: DEFAULT_MAP_DELTA,
        longitudeDelta: DEFAULT_MAP_DELTA,
      },
      400,
    );
  };

  /**
   * reverseGeocode del punto → el formulario se rellena con ese resultado y
   * el buscador pasa a su dirección completa. Lo usan el toque en el mapa,
   * "mi ubicación" y la sugerencia elegida (segundo paso).
   */
  const locate = useCallback(async (point: LatLng) => {
    const request = ++requestRef.current;
    setMarker(point);
    setGeocoding(true);
    setGeoError(null);
    try {
      const result = await reverseGeocode(point);
      if (request !== requestRef.current) return;
      if (!result) {
        setGeoError("No se encontró una dirección para esa ubicación.");
        return;
      }
      setDraft((prev) => applyTaskerGeocode(prev, result));
      setGeocode(result);
      setQueryFromCode(result.formatted_address ?? "");
    } catch (error: any) {
      console.error("tasker/address/reverseGeocode:", error?.message);
      if (request === requestRef.current) setGeoError("No se pudo obtener la dirección.");
    } finally {
      if (request === requestRef.current) setGeocoding(false);
    }
  }, []);

  /**
   * Sugerencia elegida (como Tasker): geocodePlace → coordenadas del lugar →
   * mapa y marcador ahí → reverseGeocode de esas coordenadas → ESE segundo
   * resultado rellena el formulario.
   */
  const choosePrediction = async (prediction: PlacePrediction) => {
    const request = ++requestRef.current;
    setQueryFromCode(prediction.description);
    setGeocoding(true);
    setGeoError(null);
    try {
      const place = await geocodePlace(prediction.placeId);
      if (request !== requestRef.current) return;
      const point = geocodeLocation(place);
      if (!point) {
        setGeoError("No se pudo ubicar la dirección seleccionada.");
        setGeocoding(false);
        return;
      }
      moveMapTo(point);
      await locate(point);
    } catch (error: any) {
      console.error("tasker/address/geocodePlace:", error?.message);
      if (request === requestRef.current) {
        setGeoError("No se pudo ubicar la dirección seleccionada.");
        setGeocoding(false);
      }
    }
  };

  const onMapPress = (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    locate({ lat: latitude, lng: longitude });
  };

  const goToMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso Denegado", "Se requiere acceso a la ubicación para centrar el mapa.");
        return;
      }
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
      ]);
      if (!position) {
        Alert.alert("Error de Ubicación", "No se pudo obtener tu ubicación.");
        return;
      }
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      moveMapTo(point);
      await locate(point);
    } catch (error: any) {
      console.error("tasker/address/myLocation:", error?.message);
      Alert.alert("Error de Ubicación", "No se pudo obtener tu ubicación.");
    } finally {
      setLocating(false);
    }
  };

  const setField = (field: keyof TaskerAddressDraft, text: string) =>
    setDraft((prev) => ({ ...prev, [field]: text }));

  const complete = isTaskerAddressComplete(draft);

  const handleSelect = () => {
    if (!complete) return;
    onSelect(buildTaskerAddress({ previous: address, draft, geocode, initialPoint }));
  };

  const renderField = (
    field: keyof TaskerAddressDraft,
    label: string | null,
    placeholder: string,
    options: { required?: boolean; inputProps?: TextInputProps } = {},
  ) => (
    <View style={styles.fieldBlock}>
      {label !== null && (
        <Text style={styles.label}>
          {label}
          {options.required && <Text style={styles.required}> *</Text>}
        </Text>
      )}
      <TextInput
        style={styles.input}
        value={draft[field]}
        onChangeText={(text) => setField(field, text)}
        placeholder={placeholder}
        placeholderTextColor={TEXT_PLACEHOLDER}
        autoCorrect={false}
        {...options.inputProps}
      />
    </View>
  );

  const textAreaProps: TextInputProps = {
    multiline: true,
    textAlignVertical: "top",
    style: [styles.input, styles.textArea],
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={PRIMARY_700} />
            <Text style={styles.noticeText}>
              Ingresa tu dirección o ingresa una ubicación cercana. Luego arrastra el mapa para
              señalar tu dirección precisa.
            </Text>
          </View>

          {/* ── Buscador (Places Autocomplete, RD) ── */}
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color={TEXT_PLACEHOLDER} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={onQueryChange}
              placeholder="Buscar dirección…"
              placeholderTextColor={TEXT_PLACEHOLDER}
              autoCorrect={false}
              multiline
            />
            {searching || geocoding ? (
              <ActivityIndicator size="small" color={PRIMARY_COLOR} />
            ) : (
              !!query && (
                <TouchableOpacity onPress={() => setQueryFromCode("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={TEXT_PLACEHOLDER} />
                </TouchableOpacity>
              )
            )}
          </View>
          {predictions.length > 0 && (
            <View style={styles.predictions}>
              {predictions.map((prediction) => (
                <TouchableOpacity
                  key={prediction.placeId}
                  style={styles.prediction}
                  onPress={() => choosePrediction(prediction)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="location-outline" size={14} color={TEXT_MUTED} />
                  <Text style={styles.predictionText} numberOfLines={2}>
                    {prediction.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {!!geoError && <Text style={styles.fieldError}>{geoError}</Text>}

          {/* ── Mapa: tocar mueve el marcador (no se arrastra) ── */}
          <View style={styles.mapWrapper}>
            {MapView && Marker ? (
              <>
                <MapView
                  ref={mapRef}
                  style={styles.map}
                  mapType="standard"
                  initialRegion={{
                    latitude: mapStart.lat,
                    longitude: mapStart.lng,
                    latitudeDelta: DEFAULT_MAP_DELTA,
                    longitudeDelta: DEFAULT_MAP_DELTA,
                  }}
                  onPress={onMapPress}
                  toolbarEnabled={false}
                >
                  {marker && (
                    <Marker
                      coordinate={{ latitude: marker.lat, longitude: marker.lng }}
                      draggable={false}
                    />
                  )}
                </MapView>
                <TouchableOpacity
                  style={styles.locateBtn}
                  onPress={goToMyLocation}
                  disabled={locating}
                  accessibilityLabel="Usar mi ubicación"
                  activeOpacity={0.8}
                >
                  {locating ? (
                    <ActivityIndicator size="small" color={PRIMARY_COLOR} />
                  ) : (
                    <Ionicons name="locate" size={20} color={PRIMARY_700} />
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.mapFallback}>
                <Ionicons name="map-outline" size={28} color={TEXT_PLACEHOLDER} />
                <Text style={styles.mapFallbackText}>
                  El mapa no está disponible en esta versión de la app. Puedes buscar la dirección
                  o completar los campos.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Campos, en el orden de Tasker ── */}
        <View style={styles.card}>
          {renderField("title", null, "Título")}
          <View style={styles.row}>
            <View style={styles.rowItem}>
              {renderField("province", "Provincia", "Provincia", { required: true })}
            </View>
            <View style={styles.rowItem}>
              {renderField("city", "Ciudad", "Ciudad", { required: true })}
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              {renderField("sector", "Sector", "Sector", { required: true })}
            </View>
            <View style={styles.rowItem}>{renderField("zone", "Zona", "Zona")}</View>
          </View>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              {renderField("street", "Calle", "Calle", { required: true })}
            </View>
            <View style={styles.rowItem}>
              {renderField("streetNumber", "Número", "Ej: 123, 123A, 123B, etc.", {
                required: true,
              })}
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              {renderField("building", "Edificio", "Edificio, Casa, etc.")}
            </View>
            <View style={styles.rowItem}>
              {renderField("apartmentNumber", "N° de Apartamento", "A-3, 201, B-5, etc.")}
            </View>
          </View>
          {renderField(
            "referenceToArrive",
            "Referencias para llegar",
            "Puedes agregar cualquier información adicional que nos pueda servir para llegar más rápido (entre qué calles estás, alguna referencia, etc.)",
            { inputProps: textAreaProps },
          )}
          {config.showWhoReceives &&
            renderField(
              "whoReceives",
              "Quién Recibe",
              "Nombre y/o teléfono de la persona que recibirá",
            )}
          {config.showRestrictions &&
            renderField(
              "restrictions",
              "Restricciones",
              "Indica cualquier restricción de acceso o entrega",
              { inputProps: textAreaProps },
            )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={[styles.footerRow, isTablet && styles.contentTablet]}>
          <TouchableOpacity
            style={[styles.footerBtn, styles.cancelBtn]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>Atrás</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerBtn, styles.saveBtn, !complete && styles.saveBtnDisabled]}
            onPress={handleSelect}
            disabled={!complete}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark" size={18} color={ON_PRIMARY} />
            <Text style={styles.saveText}>Seleccionar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: APP_BACKGROUND_V2 },
    topBar: {
      ...MODAL_TOPBAR,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(48),
      paddingBottom: verticalScale(14),
    },
    /** Tamaño fijo: botón de ícono, mismo criterio que AdminPermissionCreateModal. */
    backBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_MD,
      backgroundColor: HEADER_BUTTON_BACKGROUND,
    },
    topBarSpacer: { width: 40 },
    topBarTitle: { fontSize: font(17), fontWeight: "700", color: HEADER_TEXT },
    content: {
      padding: scale(16),
      gap: verticalScale(14),
      paddingBottom: verticalScale(24),
    },
    contentTablet: {
      maxWidth: MAX_CONTENT_WIDTH,
      alignSelf: "center",
      width: "100%",
    },
    card: {
      ...CARD_FORM,
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(14),
      paddingBottom: verticalScale(16),
    },
    notice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: scale(8),
      padding: scale(12),
      marginBottom: verticalScale(12),
      borderRadius: RADIUS_MD,
      borderWidth: 1,
      borderColor: PRIMARY_TINT_BORDER,
      backgroundColor: PRIMARY_TINT_50,
    },
    noticeText: { flex: 1, fontSize: font(13), lineHeight: font(18), color: PRIMARY_700 },
    searchBox: {
      ...FIELD_SURFACE,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      paddingHorizontal: scale(12),
    },
    searchInput: {
      flex: 1,
      fontSize: font(14),
      color: TEXT_PRIMARY,
      paddingVertical: verticalScale(10),
    },
    predictions: {
      marginTop: verticalScale(4),
      borderWidth: 1,
      borderColor: CARD_BORDER,
      borderRadius: RADIUS_MD,
      backgroundColor: CARD_BACKGROUND,
      overflow: "hidden",
    },
    prediction: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      borderBottomWidth: 1,
      borderBottomColor: FOOTER_BORDER,
    },
    predictionText: { flex: 1, fontSize: font(13), color: TEXT_SECONDARY },
    fieldError: { fontSize: font(12), color: ERROR_COLOR, marginTop: verticalScale(4) },
    mapWrapper: {
      marginTop: verticalScale(10),
      height: verticalScale(260),
      borderRadius: RADIUS_LG,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: CARD_BORDER,
    },
    map: { flex: 1 },
    // Botón de ícono cuadrado: 40×40 fijo (área táctil), anclado a la esquina del mapa.
    locateBtn: {
      position: "absolute",
      top: 10,
      right: 10,
      width: 40,
      height: 40,
      borderRadius: RADIUS_MD,
      borderWidth: 1,
      borderColor: CARD_BORDER,
      backgroundColor: CARD_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
    },
    mapFallback: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: verticalScale(6),
      paddingHorizontal: scale(16),
      backgroundColor: FIELD_DISABLED_BACKGROUND,
    },
    mapFallbackText: { fontSize: font(12), color: TEXT_MUTED, textAlign: "center" },
    fieldBlock: { marginTop: verticalScale(12) },
    row: { flexDirection: "row", gap: scale(10) },
    rowItem: { flex: 1 },
    label: {
      fontSize: font(12),
      fontWeight: "600",
      color: TEXT_SECONDARY,
      marginBottom: verticalScale(6),
    },
    required: { color: ERROR_COLOR, fontWeight: "700" },
    input: {
      ...FIELD_SURFACE,
      minHeight: verticalScale(46),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      fontSize: font(14),
      color: TEXT_PRIMARY,
    },
    textArea: { minHeight: verticalScale(88) },
    footer: {
      ...FOOTER_BAR,
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(12),
      paddingBottom: verticalScale(28),
    },
    footerRow: { flexDirection: "row", gap: scale(10) },
    footerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      minHeight: verticalScale(48),
    },
    cancelBtn: { ...FOOTER_BTN_CANCEL, flex: 1 },
    cancelText: { fontSize: font(15), fontWeight: "600", color: TEXT_SECONDARY },
    saveBtn: { ...FOOTER_BTN_SAVE, flex: 2 },
    // Sin sombra mientras está translúcido: en Android la elevation se ve a través del botón.
    saveBtnDisabled: { opacity: 0.5, shadowColor: "transparent", elevation: 0 },
    saveText: { fontSize: font(15), fontWeight: "700", color: ON_PRIMARY },
  });
}
