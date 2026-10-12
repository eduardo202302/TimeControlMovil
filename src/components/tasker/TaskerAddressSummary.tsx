import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React, { useMemo } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  CARD_BACKGROUND,
  ICON_VIEW,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";
import { RADIUS_SM, useResponsive } from "@/constants/responsive";
import { FILE_ROW } from "@/styles/surfaces";
import { buildMapsUrl, getTaskerAddressLines } from "../../utils/taskerRules";
import type { TaskerAddress } from "../../../types/typesTasker/TaskerTypes";

interface TaskerAddressSummaryProps {
  address: TaskerAddress;
  style?: StyleProp<ViewStyle>;
  /** Debajo de los textos (p. ej. "Seleccionar" en Reportar Avería). */
  children?: React.ReactNode;
  /** Botones a la derecha, después del de mapa (p. ej. editar y eliminar). */
  actions?: React.ReactNode;
  /** false = sin el botón de mapa (resumen de solo lectura de Seguimiento). */
  showMapButton?: boolean;
}

/**
 * Fila de dirección compartida por Reportar Avería y Seguimiento: título en
 * negrita, calle y número, sector/ciudad/provincia en gris y, salvo que se
 * apague, el botón de mapa.
 */
export default function TaskerAddressSummary({
  address,
  style,
  children,
  actions,
  showMapButton = true,
}: TaskerAddressSummaryProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { title, streetLine, areaLine } = getTaskerAddressLines(address);
  const hasCoords =
    address.latitude != null &&
    address.latitude !== "" &&
    address.longitude != null &&
    address.longitude !== "";

  const openMap = () => {
    if (!hasCoords) return;
    Linking.openURL(buildMapsUrl(address.latitude!, address.longitude!)).catch(
      () => undefined,
    );
  };

  return (
    <View style={[styles.addressRow, style]}>
      <View style={styles.addressBody}>
        <Text style={styles.addressTitle}>{title}</Text>
        {!!streetLine && <Text style={styles.addressStreet}>{streetLine}</Text>}
        {!!areaLine && <Text style={styles.addressArea}>{areaLine}</Text>}
        {children}
      </View>
      {(showMapButton || actions) && (
        <View style={styles.addressActions}>
          {/* Sin coordenadas no hay qué abrir: deshabilitado y atenuado (no es una acción pendiente). */}
          {showMapButton && (
            <TouchableOpacity
              style={[styles.addressBtn, !hasCoords && styles.addressBtnDisabled]}
              onPress={openMap}
              disabled={!hasCoords}
              accessibilityLabel="Ver dirección en el mapa"
              accessibilityState={{ disabled: !hasCoords }}
              activeOpacity={0.75}
            >
              <Ionicons name="map-outline" size={18} color={ICON_VIEW} />
            </TouchableOpacity>
          )}
          {actions}
        </View>
      )}
    </View>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    addressRow: {
      ...FILE_ROW,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: scale(10),
      padding: scale(12),
    },
    addressBody: { flex: 1 },
    addressTitle: { fontSize: font(14), fontWeight: "700", color: TEXT_PRIMARY },
    addressStreet: {
      marginTop: verticalScale(2),
      fontSize: font(13),
      lineHeight: font(18),
      color: TEXT_SECONDARY,
    },
    addressArea: { fontSize: font(13), lineHeight: font(18), color: TEXT_MUTED },
    addressActions: { flexDirection: "row", gap: scale(6) },
    // Botón de ícono cuadrado: 36×36 fijo (área táctil del ícono).
    addressBtn: {
      width: 36,
      height: 36,
      borderRadius: RADIUS_SM,
      backgroundColor: CARD_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
    },
    addressBtnDisabled: { opacity: 0.4 },
  });
}
