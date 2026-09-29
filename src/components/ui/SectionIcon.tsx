import React, { type ReactNode, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { SECTION_TONES, type SectionTone } from "@/constants/colors";
import { RADIUS_SM, useResponsive } from "@/constants/responsive";
import { tintedShadow } from "@/constants/shadows";

interface SectionIconProps {
  tone: SectionTone;
  /** Lado del cuadrito. Por defecto scale(32). */
  size?: number;
  /**
   * El ícono que ya tenía el título, tal cual (mismo nombre, familia y
   * tamaño). No se clona ni se modifica: el llamado le pasa
   * color={SECTION_ICON_COLOR}.
   */
  children: ReactNode;
}

/**
 * Chip sólido detrás del ícono de un título de sección — rediseño v2. Solo
 * envuelve: no cambia el ícono ni el orden del header.
 */
export default function SectionIcon({ tone, size, children }: SectionIconProps) {
  const { scale } = useResponsive();
  const styles = useMemo(() => createStyles(), []);

  const side = size ?? scale(32);
  const color = SECTION_TONES[tone];

  return (
    <View
      style={[
        styles.chip,
        { width: side, height: side, backgroundColor: color },
        tintedShadow(color),
      ]}
    >
      {children}
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    chip: {
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_SM,
    },
  });
}
