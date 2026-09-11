import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { APP_BACKGROUND } from "@/constants/colors";
import {
  MAX_CONTENT_WIDTH,
  RADIUS_2XL,
  RADIUS_LG,
  RADIUS_MD,
  useResponsive,
} from "@/constants/responsive";
import {
  buildHolidayPayload,
  createHoliday,
  holidayDateKey,
  parseRangeHours,
  patchHoliday,
  type Holiday,
} from "../../utils/holidaysRules";
import { toRD } from "../../utils/punchRules";
import { formatDisplayDate, formatDisplayTime } from "../timeoff/RevisionFinalModal";

type PickerTarget = "date" | "startTime" | "endTime";
type FieldKey = "name" | "holidayDate" | "startTime" | "endTime";

function minutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * `createdDate` → "DD/MM/AAAA, h:mm a.m." en hora RD — mismo criterio que
 * `formatAuditStamp` de AdminPermissionDetailModal.tsx, con la coma que ya
 * trae el `toLocaleString` del webapp (HolidaysCrud/index.jsx). Es un
 * instante ISO con zona (a diferencia de `holidayDate`, que es solo fecha),
 * por eso pasa por `toRD` en vez del recorte de `holidayDateKey`.
 */
function formatCreatedStamp(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  const rd = toRD(parsed);
  const dateKey = `${rd.year}-${String(rd.month + 1).padStart(2, "0")}-${String(rd.day).padStart(2, "0")}`;
  const timeKey = `${String(rd.hours).padStart(2, "0")}:${String(rd.minutes).padStart(2, "0")}`;
  return `${formatDisplayDate(dateKey)}, ${formatDisplayTime(timeKey)}`;
}

interface HolidaysFormModalProps {
  visible: boolean;
  mode: "create" | "edit" | "view";
  /** El feriado a editar/ver — null en modo "create". */
  holiday: Holiday | null;
  token: string | null;
  urlColegio: string | null;
  onClose: () => void;
  onSaved: () => void;
}

type Styles = ReturnType<typeof createStyles>;

export default function HolidaysFormModal({
  visible,
  mode,
  holiday,
  token,
  urlColegio,
  onClose,
  onSaved,
}: HolidaysFormModalProps) {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          {/* Mismo bypass del "¿Salir sin guardar?" que ya tiene onRequestClose
              (back físico de Android): requestClose vive dentro de HolidayForm,
              no accesible desde acá — puramente visual, no se cambia ese
              comportamiento en este pase. */}
          <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>
            {mode === "edit" ? "Editar Feriado" : mode === "view" ? "Ver Feriado" : "Agregar Feriado"}
          </Text>
          <View style={styles.topBarSpacer} />
        </View>
        {/* Montado solo mientras está visible: cada apertura arranca desde el
            snapshot correcto (create en blanco, edit/view con los datos de
            `holiday`). */}
        {visible && (
          <HolidayForm
            key={mode === "create" ? "create" : `${mode}-${holiday?.id}`}
            mode={mode}
            holiday={holiday}
            token={token}
            urlColegio={urlColegio}
            isTablet={isTablet}
            styles={styles}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </View>
    </Modal>
  );
}

interface HolidayFormProps {
  mode: "create" | "edit" | "view";
  holiday: Holiday | null;
  token: string | null;
  urlColegio: string | null;
  isTablet: boolean;
  styles: Styles;
  onClose: () => void;
  onSaved: () => void;
}

function HolidayForm({
  mode,
  holiday,
  token,
  urlColegio,
  isTablet,
  styles,
  onClose,
  onSaved,
}: HolidayFormProps) {
  /** Mismo criterio que `readOnly` en AdminPermissionEditModal.tsx: deshabilita
   * todos los campos y reduce el footer a un solo botón "Cerrar". */
  const readOnly = mode === "view";

  const seededRange = useMemo(() => parseRangeHours(holiday?.rangeHours), [holiday]);
  const seededDate = useMemo(() => {
    const key = holidayDateKey(holiday?.holidayDate);
    if (!key) return null;
    const [y, m, d] = key.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }, [holiday]);

  const [name, setName] = useState(holiday?.name ?? "");
  const [holidayDate, setHolidayDate] = useState<Date | null>(seededDate);
  const [working, setWorking] = useState(holiday?.working ?? false);
  const [startTime, setStartTime] = useState<Date | null>(seededRange?.start ?? null);
  const [endTime, setEndTime] = useState<Date | null>(seededRange?.end ?? null);
  const [applyLunch, setApplyLunch] = useState(holiday?.applyLunch ?? false);
  const [doublePayment, setDoublePayment] = useState(holiday?.doublePayment ?? false);

  // ── Snapshot inicial — para el "¿Salir sin guardar?" ──────────────────────
  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        name: holiday?.name ?? "",
        holidayDate: seededDate?.getTime() ?? null,
        working: holiday?.working ?? false,
        startTime: seededRange?.start.getTime() ?? null,
        endTime: seededRange?.end.getTime() ?? null,
        applyLunch: holiday?.applyLunch ?? false,
        doublePayment: holiday?.doublePayment ?? false,
      }),
    [holiday, seededDate, seededRange],
  );
  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        name,
        holidayDate: holidayDate?.getTime() ?? null,
        working,
        startTime: startTime?.getTime() ?? null,
        endTime: endTime?.getTime() ?? null,
        applyLunch,
        doublePayment,
      }),
    [name, holidayDate, working, startTime, endTime, applyLunch, doublePayment],
  );
  const isDirty = initialSnapshot !== currentSnapshot;
  const [exitConfirmVisible, setExitConfirmVisible] = useState(false);

  const requestClose = useCallback(() => {
    if (isDirty) setExitConfirmVisible(true);
    else onClose();
  }, [isDirty, onClose]);

  // ── Picker de fecha/hora — mismo patrón Android-diálogo/iOS-modal-spinner
  //    de AdminPermissionCreateModal.tsx (357, 918-923). ──
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerDraft, setPickerDraft] = useState<Date>(() => new Date());

  const openPicker = useCallback(
    (target: PickerTarget) => {
      const now = new Date();
      const current =
        target === "date" ? holidayDate : target === "startTime" ? startTime : endTime;
      setPickerDraft(current ?? now);
      setPickerTarget(target);
    },
    [holidayDate, startTime, endTime],
  );

  const commitPicked = useCallback((target: PickerTarget, date: Date) => {
    if (target === "date") setHolidayDate(date);
    else if (target === "startTime") setStartTime(date);
    else setEndTime(date);
  }, []);

  const handlePickerChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === "android") {
        const target = pickerTarget;
        setPickerTarget(null);
        if (event.type !== "set" || !date || !target) return;
        commitPicked(target, date);
        return;
      }
      if (date) setPickerDraft(date);
    },
    [pickerTarget, commitPicked],
  );

  const confirmIosPicker = useCallback(() => {
    if (pickerTarget) commitPicked(pickerTarget, pickerDraft);
    setPickerTarget(null);
  }, [pickerTarget, pickerDraft, commitPicked]);

  const pickerMode = pickerTarget === "date" ? "date" : "time";

  // ── Laborable: al desactivarse resetea Horario/Almuerzo/Pago Doble ────────
  const handleWorkingChange = useCallback((next: boolean) => {
    setWorking(next);
    if (!next) {
      setStartTime(null);
      setEndTime(null);
      setApplyLunch(false);
      setDoublePayment(false);
    }
  }, []);

  // ── Validación ────────────────────────────────────────────────────────────
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const errors = useMemo(() => {
    const found: Partial<Record<FieldKey, string>> = {};
    const trimmedName = name.trim();
    if (!trimmedName) found.name = "Nombre es un campo requerido.";
    else if (trimmedName.length < 2) found.name = "Nombre debe tener mínimo 2 caracteres.";
    else if (trimmedName.length > 100) found.name = "Nombre debe tener máximo 100 caracteres.";
    if (!holidayDate) found.holidayDate = "Selecciona la fecha del feriado.";
    if (working) {
      if (!startTime) found.startTime = "Hora de inicio es requerida.";
      if (!endTime) found.endTime = "Hora de fin es requerida.";
      else if (startTime && minutesOf(endTime) <= minutesOf(startTime)) {
        found.endTime = "La hora de fin debe ser posterior a la de inicio.";
      }
    }
    return found;
  }, [name, holidayDate, working, startTime, endTime]);

  const errorFor = (field: FieldKey) => (showErrors ? errors[field] : undefined);

  const handleSubmit = useCallback(async () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    if (!holidayDate || !token || !urlColegio) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = buildHolidayPayload({
      name,
      holidayDate,
      working,
      startTime,
      endTime,
      applyLunch,
      doublePayment,
    });

    const result =
      mode === "edit" && holiday
        ? await patchHoliday({ token, urlColegio, id: holiday.id, payload })
        : await createHoliday({ token, urlColegio, payload });

    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.message || "No se pudo guardar el feriado.");
      return;
    }
    onSaved();
  }, [
    errors,
    holidayDate,
    token,
    urlColegio,
    name,
    working,
    startTime,
    endTime,
    applyLunch,
    doublePayment,
    mode,
    holiday,
    onSaved,
  ]);

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
        {/* ── Auditoría — solo en edit/view, el feriado en "create" no existe
            todavía. Mismo criterio visual que el bloque de dos columnas del
            webapp (HolidaysCrud/index.jsx: ícono persona + ícono calendario). ── */}
        {mode !== "create" && (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Creado por</Text>
                <View style={[styles.select, styles.inputDisabled, styles.auditFieldBox]}>
                  <Ionicons name="person-outline" size={16} color="#9CA3AF" />
                  <Text style={styles.selectValue} numberOfLines={2}>
                    {holiday?.adminUser?.user?.fullName || "—"}
                  </Text>
                </View>
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Fecha de creación</Text>
                <View style={[styles.select, styles.inputDisabled, styles.auditFieldBox]}>
                  <Ionicons name="calendar-outline" size={16} color="#9CA3AF" />
                  <Text style={styles.selectValue} numberOfLines={2}>
                    {formatCreatedStamp(holiday?.createdDate)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>
            Nombre <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[
              styles.input,
              readOnly && styles.inputDisabled,
              !!errorFor("name") && styles.inputInvalid,
            ]}
            value={name}
            onChangeText={setName}
            editable={!readOnly}
            maxLength={100}
            placeholder="Ej. Año Nuevo"
            placeholderTextColor="#9CA3AF"
          />
          {!!errorFor("name") && <Text style={styles.fieldError}>{errorFor("name")}</Text>}

          <Text style={[styles.label, styles.labelSpaced]}>
            Fecha <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={[
              styles.select,
              readOnly && styles.inputDisabled,
              !!errorFor("holidayDate") && styles.inputInvalid,
            ]}
            onPress={() => openPicker("date")}
            disabled={readOnly}
            activeOpacity={0.75}
          >
            <Ionicons name="calendar-outline" size={16} color="#2563EB" />
            <Text style={holidayDate ? styles.selectValue : styles.selectPlaceholder}>
              {holidayDate
                ? formatDisplayDate(
                    `${holidayDate.getFullYear()}-${String(holidayDate.getMonth() + 1).padStart(2, "0")}-${String(holidayDate.getDate()).padStart(2, "0")}`,
                  )
                : "DD/MM/AAAA"}
            </Text>
          </TouchableOpacity>
          {!!errorFor("holidayDate") && (
            <Text style={styles.fieldError}>{errorFor("holidayDate")}</Text>
          )}
        </View>

        <View style={styles.card}>
          <View style={[styles.switchRow]}>
            <Text style={styles.switchLabel}>Laborable</Text>
            <Switch
              value={working}
              onValueChange={handleWorkingChange}
              disabled={readOnly || submitting}
            />
          </View>

          {working && (
            <>
              <View style={[styles.row, styles.rowSpaced]}>
                <View style={styles.rowItem}>
                  <Text style={styles.label}>
                    Inicio <Text style={styles.required}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.select,
                      readOnly && styles.inputDisabled,
                      !!errorFor("startTime") && styles.inputInvalid,
                    ]}
                    onPress={() => openPicker("startTime")}
                    disabled={readOnly}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="time-outline" size={16} color="#2563EB" />
                    <Text style={startTime ? styles.selectValue : styles.selectPlaceholder}>
                      {startTime
                        ? formatDisplayTime(
                            `${String(startTime.getHours()).padStart(2, "0")}:${String(startTime.getMinutes()).padStart(2, "0")}`,
                          )
                        : "--:--"}
                    </Text>
                  </TouchableOpacity>
                  {!!errorFor("startTime") && (
                    <Text style={styles.fieldError}>{errorFor("startTime")}</Text>
                  )}
                </View>
                <View style={styles.rowItem}>
                  <Text style={styles.label}>
                    Fin <Text style={styles.required}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.select,
                      readOnly && styles.inputDisabled,
                      !!errorFor("endTime") && styles.inputInvalid,
                    ]}
                    onPress={() => openPicker("endTime")}
                    disabled={readOnly}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="time-outline" size={16} color="#2563EB" />
                    <Text style={endTime ? styles.selectValue : styles.selectPlaceholder}>
                      {endTime
                        ? formatDisplayTime(
                            `${String(endTime.getHours()).padStart(2, "0")}:${String(endTime.getMinutes()).padStart(2, "0")}`,
                          )
                        : "--:--"}
                    </Text>
                  </TouchableOpacity>
                  {!!errorFor("endTime") && (
                    <Text style={styles.fieldError}>{errorFor("endTime")}</Text>
                  )}
                </View>
              </View>

              <View style={[styles.switchRow, styles.rowSpaced]}>
                <Text style={styles.switchLabel}>Aplica Almuerzo</Text>
                <Switch
                  value={applyLunch}
                  onValueChange={setApplyLunch}
                  disabled={readOnly || submitting}
                />
              </View>

              <View style={[styles.switchRow, styles.rowSpaced]}>
                <Text style={styles.switchLabel}>Pago Doble</Text>
                <Switch
                  value={doublePayment}
                  onValueChange={setDoublePayment}
                  disabled={readOnly || submitting}
                />
              </View>
            </>
          )}
        </View>

        {!!submitError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        )}
      </ScrollView>

      {/* En modo "view" el arrow-back del topBar ya cierra — el footer
          completo (Cerrar + Guardar) es redundante, no solo Guardar. */}
      {!readOnly && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerBtn, styles.cancelBtn]}
            onPress={requestClose}
            disabled={submitting}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerBtn, styles.saveBtn, submitting && styles.saveBtnBusy]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveText}>Guardar</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Picker de fecha/hora ── */}
      {pickerTarget && Platform.OS === "android" && (
        <DateTimePicker
          value={pickerDraft}
          mode={pickerMode}
          minimumDate={pickerTarget === "date" ? new Date() : undefined}
          onChange={handlePickerChange}
        />
      )}
      {Platform.OS === "ios" && (
        <Modal
          visible={pickerTarget !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerTarget(null)}
        >
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerCard}>
              <DateTimePicker
                value={pickerDraft}
                mode={pickerMode}
                display="spinner"
                minimumDate={pickerTarget === "date" ? new Date() : undefined}
                onChange={handlePickerChange}
              />
              <View style={styles.pickerActions}>
                <TouchableOpacity onPress={() => setPickerTarget(null)}>
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmIosPicker}>
                  <Text style={styles.linkText}>Listo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ── ¿Salir sin guardar? — mismo lenguaje visual que el confirm de
          eliminar (permissions.tsx / holidays.tsx). No hay este patrón
          hoy en AdminPermissionCreateModal/EditModal.tsx (ninguno de los dos
          confirma al salir) — se agrega igual porque el flujo lo pide. ── */}
      <Modal
        transparent
        visible={exitConfirmVisible}
        animationType="fade"
        onRequestClose={() => setExitConfirmVisible(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Salir sin guardar</Text>
            <Text style={styles.confirmMessage}>
              Tienes cambios sin guardar. ¿Está seguro que desea salir del formulario?
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity onPress={() => setExitConfirmVisible(false)}>
                <Text style={styles.confirmCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setExitConfirmVisible(false);
                  onClose();
                }}
              >
                <Text style={styles.confirmConfirm}>Salir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    screen: { flex: 1, backgroundColor: APP_BACKGROUND },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: "#fff",
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(48),
      paddingBottom: verticalScale(14),
      borderBottomWidth: 1,
      borderBottomColor: "#F3F4F6",
    },
    /** Tamaño fijo: botón de ícono, mismo criterio que AdminPermissionDetailModal.tsx. */
    backBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_MD,
    },
    topBarSpacer: { width: 40 },
    topBarTitle: { fontSize: font(17), fontWeight: "700", color: "#142157" },
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
      backgroundColor: "#fff",
      borderRadius: RADIUS_2XL,
      borderWidth: 1.5,
      borderColor: "#E5E7EB",
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(14),
      paddingBottom: verticalScale(16),
    },
    label: { fontSize: font(12), fontWeight: "600", color: "#374151", marginBottom: verticalScale(6) },
    labelSpaced: { marginTop: verticalScale(12) },
    required: { color: "#DC2626", fontWeight: "700" },
    input: {
      borderWidth: 1,
      borderColor: "#D1D5DB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      fontSize: font(14),
      color: "#111827",
      backgroundColor: "#fff",
    },
    // Copia literal de AdminPermissionEditModal.tsx:651 — mismo molde readOnly.
    inputDisabled: { backgroundColor: "#F3F4F6", color: "#6B7280" },
    inputInvalid: { borderColor: "#DC2626" },
    fieldError: { fontSize: font(12), color: "#DC2626", marginTop: verticalScale(4) },
    select: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      borderWidth: 1,
      borderColor: "#D1D5DB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(11),
      backgroundColor: "#fff",
    },
    // Alto idéntico entre "Creado por" (1 línea) y "Fecha de creación" (2
    // líneas) — sin esto el box de 1 línea se ve más chico que el de 2.
    auditFieldBox: { minHeight: verticalScale(58) },
    selectValue: { flex: 1, fontSize: font(14), color: "#111827" },
    selectPlaceholder: { flex: 1, fontSize: font(14), color: "#9CA3AF" },
    row: { flexDirection: "row", gap: scale(10) },
    rowSpaced: { marginTop: verticalScale(14) },
    rowItem: { flex: 1 },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    switchLabel: { fontSize: font(13), fontWeight: "700", color: "#111827" },
    linkText: { fontSize: font(14), fontWeight: "700", color: "#2563EB" },
    errorBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: scale(8),
      backgroundColor: "#FEF2F2",
      borderWidth: 1,
      borderColor: "#FECACA",
      borderRadius: RADIUS_LG,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    errorBannerText: { flex: 1, fontSize: font(13), color: "#B91C1C" },
    footer: {
      flexDirection: "row",
      gap: scale(10),
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(12),
      paddingBottom: verticalScale(28),
      backgroundColor: "#fff",
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
    },
    footerBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: verticalScale(13),
      borderRadius: RADIUS_LG,
    },
    cancelBtn: { backgroundColor: "#F3F4F6" },
    cancelText: { fontSize: font(14), fontWeight: "700", color: "#374151" },
    saveBtn: { backgroundColor: "#2563EB" },
    saveBtnBusy: { opacity: 0.7 },
    saveText: { fontSize: font(14), fontWeight: "700", color: "#fff" },
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
    confirmOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    confirmBox: {
      backgroundColor: "#fff",
      borderRadius: RADIUS_LG,
      padding: scale(24),
      width: "80%",
      maxWidth: 400,
      elevation: 5,
    },
    confirmTitle: {
      fontSize: font(15),
      fontWeight: "700",
      color: "#DC2626",
      marginBottom: verticalScale(8),
    },
    confirmMessage: { fontSize: font(14), color: "#444" },
    confirmButtons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: scale(20),
      marginTop: verticalScale(24),
    },
    confirmCancel: { color: "#6B7280", fontWeight: "600", fontSize: font(14) },
    confirmConfirm: { color: "#DC2626", fontWeight: "600", fontSize: font(14) },
  });
}
