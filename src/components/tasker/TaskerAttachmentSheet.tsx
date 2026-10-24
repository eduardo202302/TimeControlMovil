import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  PRIMARY_700,
  PRIMARY_TINT_50,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";
import { RADIUS_MD, useResponsive } from "@/constants/responsive";
import { BOTTOM_SHEET_CARD, DIALOG_OVERLAY } from "@/styles/surfaces";
import type { TaskerAttachmentSource } from "./pickTaskerAttachment";

export interface TaskerAttachmentOption {
  source: TaskerAttachmentSource;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface TaskerAttachmentSheetProps {
  visible: boolean;
  options: TaskerAttachmentOption[];
  onSelect: (source: TaskerAttachmentSource) => void;
  onClose: () => void;
  /** iOS: el sheet ya terminó de cerrarse (recién ahí se puede abrir la cámara o la galería). */
  onDismiss?: () => void;
}

/**
 * Menú "Adjuntar" de la ventana de comentarios (Reportar y Seguimiento):
 * sube desde abajo, con el título y la "×" de TagOptionSheet y una fila por
 * opción. Igual en iOS y Android (el Alert de Android no admite 4 botones).
 * Tocar fuera lo cierra.
 */
export default function TaskerAttachmentSheet({
  visible,
  options,
  onSelect,
  onClose,
  onDismiss,
}: TaskerAttachmentSheetProps) {
  const { scale, verticalScale, font } = useResponsive();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        {/* Captura los toques del sheet para que no lleguen al overlay y lo cierren. */}
        <View
          style={[styles.sheet, { paddingBottom: verticalScale(12) + insets.bottom }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Adjuntar</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={20} color={TEXT_MUTED} />
            </TouchableOpacity>
          </View>
          {options.map((option) => (
            <TouchableOpacity
              key={option.source}
              style={styles.option}
              onPress={() => onSelect(option.source)}
              accessibilityRole="button"
              activeOpacity={0.75}
            >
              <View style={styles.optionIcon}>
                <Ionicons name={option.icon} size={20} color={PRIMARY_700} />
              </View>
              <Text style={styles.optionText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    overlay: {
      ...DIALOG_OVERLAY,
      flex: 1,
      justifyContent: "flex-end",
    },
    sheet: {
      ...BOTTOM_SHEET_CARD,
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(16),
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: verticalScale(10),
    },
    title: { fontSize: font(16), fontWeight: "700", color: TEXT_PRIMARY },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(12),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(12),
      borderRadius: RADIUS_MD,
      marginBottom: verticalScale(4),
      minHeight: 48,
    },
    optionIcon: {
      width: scale(36),
      height: scale(36),
      borderRadius: RADIUS_MD,
      backgroundColor: PRIMARY_TINT_50,
      alignItems: "center",
      justifyContent: "center",
    },
    optionText: { fontSize: font(14), fontWeight: "600", color: TEXT_SECONDARY },
  });
}
