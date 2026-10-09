import { Ionicons } from "@expo/vector-icons";
import React, { type ReactNode } from "react";
import { Text, View } from "react-native";
import { SECTION_ICON_COLOR, type SectionTone } from "@/constants/colors";
import SectionIcon from "@/components/ui/SectionIcon";
import { getStateChipColors } from "../../utils/taskerRules";
import type { TaskerState } from "../../../types/typesTasker/TaskerTypes";
import type { FollowUpStyles } from "./followUpStyles";

/** Piezas compartidas por las pestañas de Seguimiento. */

interface CardHeaderProps {
  styles: FollowUpStyles;
  tone: SectionTone;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Contenido a la derecha del título (chip, botones). */
  children?: ReactNode;
}

export function FollowUpCardHeader({ styles, tone, icon, title, children }: CardHeaderProps) {
  return (
    <View style={styles.cardHeader}>
      <SectionIcon tone={tone}>
        <Ionicons name={icon} size={18} color={SECTION_ICON_COLOR} />
      </SectionIcon>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** Chip de estado: punto con state.color y fondo con ese color muy atenuado. */
export function StateChip({ state, styles }: { state: TaskerState; styles: FollowUpStyles }) {
  const { dot, background } = getStateChipColors(state.color);
  return (
    <View style={[styles.stateChip, { backgroundColor: background }]}>
      <View style={[styles.stateDot, { backgroundColor: dot }]} />
      <Text style={styles.stateText}>{state.name}</Text>
    </View>
  );
}
