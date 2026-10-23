import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  ERROR_COLOR,
  ERROR_TINT_BACKGROUND,
  FIELD_BACKGROUND,
  ON_PRIMARY,
  PRIMARY_700,
  PRIMARY_TINT_BACKGROUND,
  SUCCESS_ACCENT,
  SUCCESS_TINT_BACKGROUND,
  TEXT_BODY,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";
import { RADIUS_LG, RADIUS_PILL, useResponsive } from "@/constants/responsive";
import {
  DIALOG_OVERLAY,
  FOOTER_BTN_CANCEL,
  FOOTER_BTN_SAVE,
  POPUP_CARD,
} from "@/styles/surfaces";

export type ResultDialogTone = "success" | "error";

export interface ResultDialogDetail {
  label: string;
  value: string;
}

interface ResultDialogProps {
  visible: boolean;
  tone: ResultDialogTone;
  title: string;
  message?: string;
  /** Color del mensaje: "body" (por defecto) o "muted" para un dato secundario. */
  messageTone?: "body" | "muted";
  /** Chip bajo el título (p. ej. "Ticket #123"). */
  badge?: string;
  /** Filas etiqueta / valor en un bloque gris. */
  details?: ResultDialogDetail[];
  buttonLabel: string;
  /** Botón atrás de Android y, si no hay `onPress`, el botón principal. */
  onClose: () => void;
  /**
   * Acción del botón principal cuando no es solo cerrar (p. ej. navegar):
   * así el botón atrás nunca la dispara.
   */
  onPress?: () => void;
  /** Debajo del principal, con el estilo de "Cancelar". */
  secondaryButton?: { label: string; onPress: () => void };
}

const TONES: Record<
  ResultDialogTone,
  { icon: keyof typeof Ionicons.glyphMap; color: string; background: string }
> = {
  success: {
    icon: "checkmark-circle",
    color: SUCCESS_ACCENT,
    background: SUCCESS_TINT_BACKGROUND,
  },
  error: {
    icon: "alert-circle",
    color: ERROR_COLOR,
    background: ERROR_TINT_BACKGROUND,
  },
};

/**
 * Resultado de un envío (éxito o error): ícono, título, chip, mensaje,
 * detalles y uno o dos botones. Mismo patrón visual que CompanySelector.
 */
export default function ResultDialog({
  visible,
  tone,
  title,
  message,
  messageTone = "body",
  badge,
  details,
  buttonLabel,
  onClose,
  onPress,
  secondaryButton,
}: ResultDialogProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );
  const { icon, color, background } = TONES[tone];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: background }]}>
            <Ionicons name={icon} size={scale(40)} color={color} />
          </View>

          <Text style={styles.title}>{title}</Text>

          {!!badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}

          {!!message && (
            <Text style={[styles.message, messageTone === "muted" && styles.messageMuted]}>
              {message}
            </Text>
          )}

          {!!details?.length && (
            <View style={styles.details}>
              {details.map((detail) => (
                <View key={detail.label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{detail.label}</Text>
                  <Text style={styles.detailValue} numberOfLines={2}>
                    {detail.value}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={onPress ?? onClose}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{buttonLabel}</Text>
          </TouchableOpacity>

          {secondaryButton && (
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={secondaryButton.onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>{secondaryButton.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    backdrop: {
      ...DIALOG_OVERLAY,
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: scale(24),
    },
    card: {
      ...POPUP_CARD,
      width: "100%",
      maxWidth: 400,
      padding: scale(24),
      alignItems: "center",
    },
    iconCircle: {
      width: scale(72),
      height: scale(72),
      borderRadius: scale(36),
      alignItems: "center",
      justifyContent: "center",
      marginBottom: verticalScale(14),
    },
    title: {
      fontSize: font(18),
      fontWeight: "700",
      color: TEXT_PRIMARY,
      textAlign: "center",
    },
    badge: {
      backgroundColor: PRIMARY_TINT_BACKGROUND,
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(4),
      marginTop: verticalScale(8),
    },
    badgeText: {
      fontSize: font(13),
      fontWeight: "700",
      color: PRIMARY_700,
    },
    message: {
      fontSize: font(14),
      color: TEXT_BODY,
      textAlign: "center",
      lineHeight: font(20),
      marginTop: verticalScale(10),
    },
    messageMuted: { color: TEXT_MUTED },
    details: {
      alignSelf: "stretch",
      backgroundColor: FIELD_BACKGROUND,
      borderRadius: RADIUS_LG,
      paddingHorizontal: scale(14),
      paddingVertical: verticalScale(10),
      marginTop: verticalScale(16),
      gap: verticalScale(8),
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: scale(12),
    },
    detailLabel: {
      fontSize: font(13),
      color: TEXT_MUTED,
    },
    detailValue: {
      flexShrink: 1,
      fontSize: font(13),
      fontWeight: "600",
      color: TEXT_PRIMARY,
      textAlign: "right",
    },
    button: {
      alignSelf: "stretch",
      alignItems: "center",
      justifyContent: "center",
      minHeight: verticalScale(48),
      paddingHorizontal: scale(16),
    },
    primaryButton: {
      ...FOOTER_BTN_SAVE,
      marginTop: verticalScale(20),
    },
    primaryText: {
      fontSize: font(15),
      fontWeight: "700",
      color: ON_PRIMARY,
    },
    secondaryButton: {
      ...FOOTER_BTN_CANCEL,
      marginTop: verticalScale(10),
    },
    secondaryText: {
      fontSize: font(15),
      fontWeight: "600",
      color: TEXT_SECONDARY,
    },
  });
}
