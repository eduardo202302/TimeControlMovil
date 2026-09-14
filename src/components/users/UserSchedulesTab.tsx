import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React, { useCallback, useMemo, useState } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RADIUS_2XL, RADIUS_LG, RADIUS_MD, RADIUS_PILL, useResponsive } from "@/constants/responsive";
import { formatTo12Hour, type ScheduleField } from "../../utils/userFormRules";
import type { UserFormController } from "./useUserForm";
import type { UserFormStyles } from "./userFormStyles";

interface UserSchedulesTabProps {
  ctl: UserFormController;
  styles: UserFormStyles;
}

type BulkKey = "workEntry" | "workExit" | "lunchEntry" | "lunchExit";

type PickerTarget =
  | { kind: "row"; weekDay: string; field: ScheduleField }
  | { kind: "bulk"; key: BulkKey };

function timeToDate(value: string): Date {
  const date = new Date();
  const [h, m] = value.split(":").map(Number);
  if (value && !Number.isNaN(h) && !Number.isNaN(m)) date.setHours(h, m, 0, 0);
  return date;
}

function dateToTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Tab "Horarios" — port de Modals/scheduleUserPonch del webapp: 7 días fijos,
 * Jornada (Entrada → Salida) y Almuerzo (Entrada Alm. → Salida Alm.), más el
 * panel de ajustes masivos (abierto por defecto en add).
 */
export default function UserSchedulesTab({ ctl, styles }: UserSchedulesTabProps) {
  const { scale, verticalScale, font } = useResponsive();
  const local = useMemo(() => createStyles(scale, verticalScale, font), [scale, verticalScale, font]);
  const disabled = ctl.isWatch;
  // Columnas de almuerzo ocultas con "Trabaja Almuerzo" apagado.
  const showLunch = ctl.form.isWorkingLunch;

  const [showBulk, setShowBulk] = useState(ctl.mode === "add");
  const [bulk, setBulk] = useState<Record<BulkKey, string>>({
    workEntry: "",
    workExit: "",
    lunchEntry: "",
    lunchExit: "",
  });

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerDraft, setPickerDraft] = useState<Date>(() => new Date());

  const currentValue = useCallback(
    (target: PickerTarget): string => {
      if (target.kind === "bulk") return bulk[target.key];
      return ctl.schedules.find((row) => row.weekDay === target.weekDay)?.[target.field] ?? "";
    },
    [bulk, ctl.schedules],
  );

  const commit = useCallback(
    (target: PickerTarget, value: string) => {
      if (target.kind === "bulk") setBulk((prev) => ({ ...prev, [target.key]: value }));
      else ctl.setScheduleField(target.weekDay, target.field, value);
    },
    [ctl],
  );

  const openPicker = (target: PickerTarget) => {
    if (disabled) return;
    setPickerDraft(timeToDate(currentValue(target)));
    setPickerTarget(target);
  };

  const handlePickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      const target = pickerTarget;
      setPickerTarget(null);
      if (event.type !== "set" || !date || !target) return;
      commit(target, dateToTime(date));
      return;
    }
    if (date) setPickerDraft(date);
  };

  const confirmIosPicker = () => {
    if (pickerTarget) commit(pickerTarget, dateToTime(pickerDraft));
    setPickerTarget(null);
  };

  const renderTimeBox = (
    value: string,
    target: PickerTarget,
    tone: "entry" | "exit" | "lunch",
  ) => (
    <TouchableOpacity
      style={[local.timeBox, disabled && styles.inputDisabled]}
      onPress={() => openPicker(target)}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <Ionicons
        name="time-outline"
        size={14}
        color={tone === "lunch" ? "#D97706" : tone === "exit" ? "#DC2626" : "#16A34A"}
      />
      <Text style={value ? local.timeText : local.timePlaceholder} numberOfLines={1}>
        {value ? formatTo12Hour(value) : "--:--"}
      </Text>
      {!!value && !disabled && (
        <TouchableOpacity onPress={() => commit(target, "")} hitSlop={8}>
          <Ionicons name="close-circle" size={14} color="#9CA3AF" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderPair = (
    label: string,
    entry: React.ReactNode,
    exit: React.ReactNode,
    entryLabel: string,
    exitLabel: string,
  ) => (
    <View style={local.section}>
      <Text style={local.sectionTitle}>{label}</Text>
      <View style={local.pairRow}>
        <View style={local.pairItem}>
          <Text style={local.timeLabel}>{entryLabel}</Text>
          {entry}
        </View>
        <Ionicons name="arrow-forward" size={14} color="#9CA3AF" style={local.arrow} />
        <View style={local.pairItem}>
          <Text style={local.timeLabel}>{exitLabel}</Text>
          {exit}
        </View>
      </View>
    </View>
  );

  const renderBulkActions = (onAll: () => void, onLaborables: () => void, onClear: () => void) => (
    <View style={local.bulkActions}>
      <TouchableOpacity style={local.bulkBtn} onPress={onAll} disabled={disabled} activeOpacity={0.8}>
        <Text style={local.bulkBtnText}>Todos</Text>
      </TouchableOpacity>
      <TouchableOpacity style={local.bulkBtn} onPress={onLaborables} disabled={disabled} activeOpacity={0.8}>
        <Text style={local.bulkBtnText}>Laborables</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[local.bulkBtn, local.bulkClearBtn]}
        onPress={onClear}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityLabel="Limpiar"
      >
        <Ionicons name="trash-outline" size={16} color="#B43333" />
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="time-outline" size={16} color="#2563EB" />
            <Text style={styles.cardTitle}>
              Horarios {ctl.capabilities.canApplyTimeControl && <Text style={styles.required}>*</Text>}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.inlineRow}
            onPress={() => setShowBulk((prev) => !prev)}
            hitSlop={6}
          >
            <Ionicons name={showBulk ? "eye-off-outline" : "eye-outline"} size={16} color="#2563EB" />
            <Text style={styles.smallBtnText}>{showBulk ? "Ocultar ajustes" : "Mostrar ajustes"}</Text>
          </TouchableOpacity>
        </View>

        {!!ctl.scheduleError && (
          <View style={local.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
            <Text style={local.errorText}>{ctl.scheduleError}</Text>
          </View>
        )}

        {showBulk && (
          <View style={local.bulkPanel}>
            <View style={local.bulkGroup}>
              {renderPair(
                "Jornada",
                renderTimeBox(bulk.workEntry, { kind: "bulk", key: "workEntry" }, "entry"),
                renderTimeBox(bulk.workExit, { kind: "bulk", key: "workExit" }, "exit"),
                "Entrada",
                "Salida",
              )}
              {renderBulkActions(
                () => ctl.applyBulk("all", { workEntryTime: bulk.workEntry, workExitTime: bulk.workExit }),
                () =>
                  ctl.applyBulk("laborables", {
                    workEntryTime: bulk.workEntry,
                    workExitTime: bulk.workExit,
                  }),
                () => {
                  // handleClearAll: limpia los ajustes y las 7 filas completas.
                  setBulk({ workEntry: "", workExit: "", lunchEntry: "", lunchExit: "" });
                  ctl.clearSchedules();
                },
              )}
            </View>
            {showLunch && (
              <View style={[local.bulkGroup, local.bulkGroupSpaced]}>
                {renderPair(
                  "Almuerzo",
                  renderTimeBox(bulk.lunchEntry, { kind: "bulk", key: "lunchEntry" }, "lunch"),
                  renderTimeBox(bulk.lunchExit, { kind: "bulk", key: "lunchExit" }, "lunch"),
                  "Entrada Alm.",
                  "Salida Alm.",
                )}
                {renderBulkActions(
                  () =>
                    ctl.applyBulk("all", {
                      lunchEntryTime: bulk.lunchEntry,
                      lunchExitTime: bulk.lunchExit,
                    }),
                  () =>
                    ctl.applyBulk("laborables", {
                      lunchEntryTime: bulk.lunchEntry,
                      lunchExitTime: bulk.lunchExit,
                    }),
                  () => {
                    setBulk((prev) => ({ ...prev, lunchEntry: "", lunchExit: "" }));
                    ctl.clearLunch();
                  },
                )}
              </View>
            )}
          </View>
        )}
      </View>

      {ctl.schedules.map((row) => (
        <View key={row.weekDay} style={local.dayCard}>
          <View style={local.dayHeader}>
            <Ionicons name="calendar-outline" size={15} color="#2563EB" />
            <Text style={local.dayTitle}>{row.weekDay}</Text>
          </View>
          {renderPair(
            "Jornada",
            renderTimeBox(row.workEntryTime, { kind: "row", weekDay: row.weekDay, field: "workEntryTime" }, "entry"),
            renderTimeBox(row.workExitTime, { kind: "row", weekDay: row.weekDay, field: "workExitTime" }, "exit"),
            "Entrada",
            "Salida",
          )}
          {showLunch &&
            renderPair(
              "Almuerzo",
              renderTimeBox(
                row.lunchEntryTime,
                { kind: "row", weekDay: row.weekDay, field: "lunchEntryTime" },
                "lunch",
              ),
              renderTimeBox(
                row.lunchExitTime,
                { kind: "row", weekDay: row.weekDay, field: "lunchExitTime" },
                "lunch",
              ),
              "Entrada Alm.",
              "Salida Alm.",
            )}
        </View>
      ))}

      {/* ── Picker de hora — mismo patrón Android-diálogo/iOS-modal de HolidaysFormModal ── */}
      {pickerTarget && Platform.OS === "android" && (
        <DateTimePicker value={pickerDraft} mode="time" onChange={handlePickerChange} />
      )}
      {Platform.OS === "ios" && (
        <Modal
          visible={pickerTarget !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerTarget(null)}
        >
          <View style={local.pickerOverlay}>
            <View style={local.pickerCard}>
              <DateTimePicker
                value={pickerDraft}
                mode="time"
                display="spinner"
                onChange={handlePickerChange}
              />
              <View style={local.pickerActions}>
                <TouchableOpacity onPress={() => setPickerTarget(null)}>
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmIosPicker}>
                  <Text style={styles.smallBtnText}>Listo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    errorBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: scale(6),
      backgroundColor: "#FEF2F2",
      borderWidth: 1,
      borderColor: "#FECACA",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(8),
      marginBottom: verticalScale(10),
    },
    errorText: { flex: 1, fontSize: font(12), color: "#B91C1C" },
    bulkPanel: {
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_LG,
      padding: scale(10),
      backgroundColor: "#F9FAFB",
    },
    bulkGroup: {},
    bulkGroupSpaced: {
      marginTop: verticalScale(10),
      paddingTop: verticalScale(10),
      borderTopWidth: 1,
      borderTopColor: "#E5E7EB",
    },
    bulkActions: { flexDirection: "row", gap: scale(6), marginTop: verticalScale(8) },
    bulkBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_MD,
      backgroundColor: "#EFF6FF",
      paddingVertical: verticalScale(8),
    },
    bulkClearBtn: { flex: 0, paddingHorizontal: scale(14), backgroundColor: "#FEF2F2" },
    bulkBtnText: { fontSize: font(12), fontWeight: "700", color: "#2563EB" },
    dayCard: {
      backgroundColor: "#fff",
      borderRadius: RADIUS_2XL,
      borderWidth: 1.5,
      borderColor: "#E5E7EB",
      paddingHorizontal: scale(14),
      paddingVertical: verticalScale(12),
      gap: verticalScale(8),
    },
    dayHeader: { flexDirection: "row", alignItems: "center", gap: scale(6) },
    dayTitle: { fontSize: font(14), fontWeight: "700", color: "#111827" },
    section: { gap: verticalScale(4) },
    sectionTitle: { fontSize: font(11), fontWeight: "700", color: "#6B7280" },
    pairRow: { flexDirection: "row", alignItems: "flex-end", gap: scale(6) },
    pairItem: { flex: 1, gap: verticalScale(3) },
    arrow: { marginBottom: verticalScale(10) },
    timeLabel: { fontSize: font(11), color: "#6B7280" },
    timeBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      borderWidth: 1,
      borderColor: "#D1D5DB",
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(8),
      backgroundColor: "#fff",
    },
    timeText: { flex: 1, fontSize: font(13), fontWeight: "600", color: "#111827" },
    timePlaceholder: { flex: 1, fontSize: font(13), color: "#9CA3AF" },
    pickerOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    pickerCard: {
      backgroundColor: "#fff",
      borderTopLeftRadius: RADIUS_2XL,
      borderTopRightRadius: RADIUS_2XL,
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(8),
      paddingBottom: verticalScale(28),
    },
    pickerActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: scale(8),
      paddingTop: verticalScale(8),
    },
  });
}
