import { Ionicons } from "@expo/vector-icons";
import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  ON_PRIMARY,
  PRIMARY_COLOR,
  SECTION_ICON_COLOR,
  type SectionTone,
} from "@/constants/colors";
import SectionIcon from "@/components/ui/SectionIcon";
import { getStateChipColors } from "../../utils/taskerRules";
import { getTaskerStateLabel } from "../../utils/taskerFollowUpRules";
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

/**
 * Chip de estado (tarjetas, detalle y franja): punto con state.color y fondo
 * con ese color muy atenuado. Nombre con getTaskerStateLabel.
 */
export function StateChip({
  state,
  styles,
  style,
}: {
  state: TaskerState;
  styles: FollowUpStyles;
  style?: StyleProp<ViewStyle>;
}) {
  const { dot, background } = getStateChipColors(state.color);
  return (
    <View style={[styles.stateChip, { backgroundColor: background }, style]}>
      <View style={[styles.stateDot, { backgroundColor: dot }]} />
      <Text style={styles.stateText} numberOfLines={1}>
        {getTaskerStateLabel(state)}
      </Text>
    </View>
  );
}

interface NoticeProps {
  styles: FollowUpStyles;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: SectionTone;
  /** Spinner en lugar del ícono (cargando). */
  loading?: boolean;
  action?: { label: string; onPress: () => void };
}

/** Tarjeta de estado dentro de una pestaña: cargando, vacío, error o "selecciona un ticket". */
export function FollowUpNotice({
  styles,
  message,
  icon = "information-circle-outline",
  tone = "blue",
  loading = false,
  action,
}: NoticeProps) {
  return (
    <View style={[styles.card, styles.notice]} accessibilityLiveRegion="polite">
      {loading ? (
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
      ) : (
        <SectionIcon tone={tone}>
          <Ionicons name={icon} size={18} color={SECTION_ICON_COLOR} />
        </SectionIcon>
      )}
      <Text style={styles.noticeText}>{message}</Text>
      {action && (
        <TouchableOpacity style={styles.noticeBtn} onPress={action.onPress} activeOpacity={0.8}>
          <Ionicons name="refresh" size={16} color={ON_PRIMARY} />
          <Text style={styles.noticeBtnText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
