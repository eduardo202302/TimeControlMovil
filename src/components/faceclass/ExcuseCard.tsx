import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  RADIUS_PILL,
  RADIUS_SM,
  useResponsive,
} from "@/constants/responsive";
import { formatDisplayDate } from "../timeoff/RevisionFinalModal";
import {
  getExcuseDateRange,
  type Excuse,
  type ExcuseTag,
} from "../../utils/excusesRules";
import type { PermissionTagRef } from "../../utils/permissionRules";
import { CARD_ROW, ROW_ACTION_BTN } from "@/styles/surfaces";
import {
  CARD_BORDER,
  DANGER_ICON,
  FOOTER_BORDER,
  PRIMARY_COLOR,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";

const CHIP_FALLBACK = { background: CARD_BORDER, text: TEXT_SECONDARY };

function chipColors(tag: PermissionTagRef | null | undefined) {
  return {
    backgroundColor: tag?.color || CHIP_FALLBACK.background,
    color: tag?.fontColor || CHIP_FALLBACK.text,
  };
}

interface ExcuseCardProps {
  item: Excuse;
  /** Definición enriquecida del estado (catálogo + fila), para el dropdown. */
  stateDef: ExcuseTag | null;
  /** Editar anula el dropdown (mismo `disabled={!canEdit}` del webapp). */
  canEdit: boolean;
  canDelete: boolean;
  /** Tocar la card completa abre el modal unificado en mode="watch". */
  onOpen: (item: Excuse) => void;
  /** El lápiz del footer abre el modal unificado en mode="edit". */
  onEdit: (item: Excuse) => void;
  onStatePress: (item: Excuse, stateDef: ExcuseTag | null) => void;
  onDelete: (item: Excuse) => void;
}

/** Una excusa del listado administrativo. */
export default function ExcuseCard({
  item,
  stateDef,
  canEdit,
  canDelete,
  onOpen,
  onEdit,
  onStatePress,
  onDelete,
}: ExcuseCardProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );
  const state = chipColors(item.stateTag);
  const type = chipColors(item.typeTag);
  const range = getExcuseDateRange(item);
  const course = item.enrollment?.course;
  const attachments = item.attachments?.length ?? 0;
  const attachmentsAdm = item.attachmentsAdm?.length ?? 0;

  const stateEditable = canEdit;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onOpen(item)}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <TouchableOpacity
          style={[styles.stateChip, { backgroundColor: state.backgroundColor }]}
          onPress={() => onStatePress(item, stateDef)}
          disabled={!stateEditable}
          activeOpacity={0.75}
          hitSlop={6}
        >
          <Text style={[styles.stateChipText, { color: state.color }]}>
            {item.stateTag?.name ?? "N/A"}
          </Text>
          {stateEditable && (
            <Ionicons name="chevron-down" size={12} color={state.color} />
          )}
        </TouchableOpacity>
        <Text style={styles.cardDate}>
          {range.from ? formatDisplayDate(range.from) : "—"}
          {range.isRange && ` — ${formatDisplayDate(range.to)}`}
        </Text>
      </View>

      <Text style={styles.studentLabel}>Estudiante</Text>
      <Text style={styles.studentName} numberOfLines={2}>
        {item.student?.fullName || `Excusa #${item.id}`}
      </Text>

      {(!!course?.fullName || !!item.typeTag?.name) && (
        <View style={styles.cardTags}>
          {!!course?.fullName && (
            <Text style={styles.courseText} numberOfLines={1}>
              {course.fullName}
              {course.listNumber != null ? ` · Nº ${course.listNumber}` : ""}
            </Text>
          )}
          {!!item.typeTag?.name && (
            <View style={[styles.chipSm, { backgroundColor: type.backgroundColor }]}>
              <Text style={[styles.chipSmText, { color: type.color }]}>
                {item.typeTag.name}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.cardFooterInfo}>
          <View style={styles.footerLine}>
            <Ionicons name="calendar-outline" size={13} color={TEXT_MUTED} />
            <Text style={styles.cardFooterText} numberOfLines={1}>
              {range.totalDays > 0
                ? `${range.totalDays} ${range.totalDays === 1 ? "día" : "días"}`
                : "Sin fechas"}
            </Text>
          </View>
          {attachments + attachmentsAdm > 0 && (
            <View style={styles.footerLine}>
              <Ionicons name="attach-outline" size={13} color={TEXT_MUTED} />
              <Text style={styles.cardFooterText} numberOfLines={1}>
                {`${attachments + attachmentsAdm} adjunto${attachments + attachmentsAdm === 1 ? "" : "s"}`}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.rowActions}>
          {canEdit && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => onEdit(item)}
              hitSlop={6}
              accessibilityLabel="Editar"
            >
              <Ionicons name="create-outline" size={18} color={PRIMARY_COLOR} />
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => onDelete(item)}
              hitSlop={6}
              accessibilityLabel="Eliminar"
            >
              <Ionicons name="trash-outline" size={18} color={DANGER_ICON} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    card: {
      ...CARD_ROW,
      paddingHorizontal: scale(14),
      paddingVertical: verticalScale(12),
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: scale(8),
    },
    stateChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(4),
      borderRadius: RADIUS_SM,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(5),
    },
    stateChipText: { fontSize: font(12), fontWeight: "700" },
    cardDate: {
      fontSize: font(12),
      color: TEXT_SECONDARY,
      fontWeight: "700",
      flexShrink: 1,
      textAlign: "right",
    },
    studentLabel: {
      fontSize: font(11),
      color: TEXT_MUTED,
      fontWeight: "600",
      marginTop: verticalScale(10),
    },
    studentName: {
      fontSize: font(14),
      fontWeight: "700",
      color: TEXT_PRIMARY,
      marginTop: verticalScale(2),
    },
    cardTags: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      marginTop: verticalScale(8),
    },
    courseText: {
      flexShrink: 1,
      fontSize: font(12),
      color: TEXT_SECONDARY,
      fontWeight: "600",
    },
    chipSm: {
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(3),
    },
    chipSmText: { fontSize: font(10), fontWeight: "700" },
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      marginTop: verticalScale(9),
      borderTopWidth: 1,
      borderTopColor: FOOTER_BORDER,
      paddingTop: verticalScale(9),
    },
    cardFooterInfo: { flex: 1, gap: verticalScale(3) },
    footerLine: { flexDirection: "row", alignItems: "center", gap: scale(6) },
    cardFooterText: { flex: 1, fontSize: font(12), color: TEXT_MUTED },
    rowActions: { flexDirection: "row", alignItems: "center", gap: scale(4) },
    iconBtn: {
      ...ROW_ACTION_BTN,
      padding: scale(6),
    },
  });
}