import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
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
  RADIUS_PILL,
  useResponsive,
} from "@/constants/responsive";
import {
  buildAdminPermissionPayload,
  createAdminPermission,
  typeTagsForAction,
  type PermissionCatalogTag,
} from "../../utils/adminPermissionRules";
import {
  formatEmployeeContact,
  searchEmployees,
  type EmployeeOption,
} from "../../utils/adminPunchRules";
import { normalizePermissionName, toRDDateString, WEEK_DAYS } from "../../utils/punchRules";
import {
  formatDisplayDate,
  formatDisplayTime,
  formatFileSize,
  getFileIcon,
  type PermissionAttachment,
} from "../timeoff/RevisionFinalModal";
import { MAX_PAYLOAD_BYTES, pickAttachments } from "./pickAttachments";
import TagOptionSheet from "./TagOptionSheet";

/** Mismo debounce y mínimo que el selector de Ponche ADM. */
const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_MIN_CHARS = 2;

/**
 * Copia deliberada de PHOTO_HOST/photoUri() de adminpunchinout.tsx (local a
 * ese archivo): se duplica en vez de importar para no acoplar esta pantalla a
 * Ponche ADM. `photourl` es una ruta relativa que el backend sirve por su ruta
 * estática pública; si ya viene absoluta se usa tal cual.
 */
const PHOTO_HOST = "https://timecontrol.wsmax.net:8600";

/** Lado del avatar de las filas — mismo AVATAR_SM_SIZE de Ponche ADM. */
const AVATAR_SM_SIZE = 38;

function photoUri(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${PHOTO_HOST}/${raw}`;
}

const AUSENCIA_ACTION_NAME = "ausencia";
const WEEK_DAY_NAMES = Object.values(WEEK_DAYS);

type PickerTarget = "fromDate" | "toDate" | "fromTime" | "toTime";

type FieldKey =
  | "employee"
  | "action"
  | "type"
  | "subject"
  | "description"
  | "fromDate"
  | "toDate"
  | "fromTime"
  | "toTime";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Date → "YYYY-MM-DD" con los campos locales (lo que mostró el picker). */
function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeKey(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Traduce la respuesta del POST. El caso de rango trae el resumen del grupo
 * (createdCount / skipped); "0 creados" llega con success:false y solo
 * `skipped`, mismo contrato que maneja SolicitarPermisoForm.
 */
function describeCreateResult(result: {
  ok: boolean;
  message: string;
  data: any;
}): { ok: boolean; message: string } {
  const data = result.data;
  const isRange =
    !!data && typeof data === "object" && ("createdCount" in data || "skipped" in data);
  const byReason: any[] = Array.isArray(data?.skipped?.byReason) ? data.skipped.byReason : [];
  const reasons = byReason
    .map((entry) => {
      const label =
        entry?.reasonMessage ?? String(entry?.reasonCode ?? entry?.reason ?? "").replace(/_/g, " ");
      const count = Number(entry?.count ?? entry?.total ?? 0);
      if (!label) return "";
      return count > 0 ? `${count} día(s) — ${label}` : label;
    })
    .filter(Boolean);

  if (!result.ok) {
    const head =
      reasons.length > 0
        ? "No se creó ningún permiso para el rango solicitado."
        : result.message || "No se pudo registrar el permiso.";
    return { ok: false, message: [head, ...reasons].join("\n") };
  }

  if (isRange) {
    const created = Number(data.createdCount ?? data.created?.length ?? 0);
    const skipped = Number(data.skippedCount ?? data.skipped?.total ?? 0);
    const head =
      skipped > 0
        ? `Se crearon ${created} día(s) y se omitieron ${skipped}.`
        : `Se crearon ${created} día(s).`;
    return { ok: created > 0, message: [head, ...reasons].join("\n") };
  }

  return { ok: true, message: "El permiso quedó registrado." };
}

interface AdminPermissionCreateModalProps {
  visible: boolean;
  token: string | null;
  urlColegio: string | null;
  actionTags: PermissionCatalogTag[];
  typeCategoryId: number | null;
  catalogError: string | null;
  onClose: () => void;
  onCreated: (message: string) => void;
}

type CreateStyles = ReturnType<typeof createStyles>;

/** Foto del usuario (`photourl ?? s3Photo`, ya resuelto en EmployeeOption) o
 * ícono genérico — mismo avatar de las filas de Ponche ADM. */
function UserAvatar({
  photourl,
  styles,
}: {
  photourl: string | null;
  styles: CreateStyles;
}) {
  const uri = photoUri(photourl);
  return (
    <View style={styles.avatarSmall}>
      {uri ? (
        <Image source={{ uri }} style={styles.avatarSmallImage} resizeMode="cover" />
      ) : (
        <Ionicons name="person" size={18} color="#9CA3AF" />
      )}
    </View>
  );
}

export default function AdminPermissionCreateModal({
  visible,
  token,
  urlColegio,
  actionTags,
  typeCategoryId,
  catalogError,
  onClose,
  onCreated,
}: AdminPermissionCreateModalProps) {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Agregar Permiso</Text>
          <View style={styles.topBarSpacer} />
        </View>
        {/* Montado solo mientras está visible: cada apertura arranca en blanco. */}
        {visible && (
          <CreateForm
            token={token}
            urlColegio={urlColegio}
            actionTags={actionTags}
            typeCategoryId={typeCategoryId}
            catalogError={catalogError}
            isTablet={isTablet}
            styles={styles}
            onClose={onClose}
            onCreated={onCreated}
          />
        )}
      </View>
    </Modal>
  );
}

interface CreateFormProps extends Omit<AdminPermissionCreateModalProps, "visible"> {
  isTablet: boolean;
  styles: CreateStyles;
}

function CreateForm({
  token,
  urlColegio,
  actionTags,
  typeCategoryId,
  catalogError,
  isTablet,
  styles,
  onClose,
  onCreated,
}: CreateFormProps) {
  // ── Empleado ──────────────────────────────────────────────────────────────
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EmployeeOption[]>([]);
  const [searching, setSearching] = useState(false);
  /** Descarta respuestas de búsquedas ya superadas por otra más nueva. */
  const searchSeq = useRef(0);

  // ── Formulario ────────────────────────────────────────────────────────────
  const [action, setAction] = useState<PermissionCatalogTag | null>(null);
  const [type, setType] = useState<PermissionCatalogTag | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [fromTime, setFromTime] = useState<Date | null>(null);
  const [toTime, setToTime] = useState<Date | null>(null);
  const [weekDays, setWeekDays] = useState<string[]>([]);
  const [files, setFiles] = useState<PermissionAttachment[]>([]);
  const [pickingFiles, setPickingFiles] = useState(false);
  const [fileNotice, setFileNotice] = useState<string | null>(null);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [tagSheet, setTagSheet] = useState<"action" | "type" | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerDraft, setPickerDraft] = useState<Date>(() => new Date());
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isFullDay = normalizePermissionName(action?.name) === AUSENCIA_ACTION_NAME;
  const typeOptions = useMemo(
    () => typeTagsForAction(action, typeCategoryId),
    [action, typeCategoryId],
  );

  // ── Búsqueda de empleado ──────────────────────────────────────────────────
  const runSearch = useCallback(
    async (term: string) => {
      const trimmed = term.trim();
      const seq = ++searchSeq.current;
      if (trimmed.length < SEARCH_MIN_CHARS || !token || !urlColegio) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      const found = await searchEmployees({ token, urlColegio, query: trimmed });
      if (seq !== searchSeq.current) return;
      setResults(found);
      setSearching(false);
    },
    [token, urlColegio],
  );

  useEffect(() => {
    if (!selectorOpen) return;
    const timer = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, selectorOpen, runSearch]);

  // ── Pickers ───────────────────────────────────────────────────────────────
  const openPicker = useCallback(
    (target: PickerTarget) => {
      const now = new Date();
      const current =
        target === "fromDate"
          ? fromDate
          : target === "toDate"
            ? (toDate ?? fromDate)
            : target === "fromTime"
              ? fromTime
              : (toTime ?? (fromTime ? new Date(fromTime.getTime() + 60 * 60 * 1000) : null));
      setPickerDraft(current ?? now);
      setPickerTarget(target);
    },
    [fromDate, toDate, fromTime, toTime],
  );

  const commitPicked = useCallback((target: PickerTarget, date: Date) => {
    switch (target) {
      case "fromDate":
        setFromDate(date);
        // "Hasta" nunca queda antes de "Desde".
        setToDate((previous) => (previous && previous < date ? date : previous));
        break;
      case "toDate":
        setToDate(date);
        break;
      case "fromTime":
        setFromTime(date);
        break;
      case "toTime":
        setToTime(date);
        break;
    }
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

  const isDatePicker = pickerTarget === "fromDate" || pickerTarget === "toDate";

  // ── Adjuntos ──────────────────────────────────────────────────────────────
  const filesBytes = useMemo(
    () => files.reduce((total, file) => total + file.dataUri.length, 0),
    [files],
  );

  const handleAddFiles = useCallback(async () => {
    setFileNotice(null);
    setPickingFiles(true);
    try {
      const result = await pickAttachments(filesBytes);
      if (result.canceled) return;
      if (result.accepted.length > 0) setFiles((previous) => [...previous, ...result.accepted]);
      if (result.rejected.length > 0) {
        setFileNotice(`No se adjuntaron: ${result.rejected.join(", ")}`);
      }
    } catch (error: any) {
      console.error("AdminPermissionCreate/pickFiles:", error?.message);
      setFileNotice("No se pudo abrir el selector de archivos.");
    } finally {
      setPickingFiles(false);
    }
  }, [filesBytes]);

  // ── Validación ────────────────────────────────────────────────────────────
  const errors = useMemo(() => {
    const found: Partial<Record<FieldKey, string>> = {};
    if (!employee) found.employee = "Selecciona el usuario.";
    if (!action) found.action = "Selecciona la acción del permiso.";
    if (!type) found.type = "Selecciona el tipo de permiso.";
    if (!subject.trim()) found.subject = "El asunto es requerido.";
    if (!description.trim()) found.description = "El motivo es requerido.";
    if (!fromDate) found.fromDate = "Selecciona la fecha Desde.";
    else if (toDateKey(fromDate) < toRDDateString(new Date())) {
      found.fromDate = "La fecha de inicio no puede estar en el pasado.";
    }
    if (fromDate && toDate && toDateKey(toDate) < toDateKey(fromDate)) {
      found.toDate = "La fecha Hasta no puede ser anterior a la fecha Desde.";
    }
    if (!isFullDay) {
      if (!fromTime) found.fromTime = "Selecciona la hora de Inicio.";
      if (!toTime) found.toTime = "Selecciona la hora de Fin.";
      else if (fromTime && toTimeKey(toTime) <= toTimeKey(fromTime)) {
        found.toTime = "La hora de Fin debe ser posterior a la de Inicio.";
      }
    }
    return found;
  }, [employee, action, type, subject, description, fromDate, toDate, fromTime, toTime, isFullDay]);

  const errorFor = (field: FieldKey) => (showErrors ? errors[field] : undefined);

  // ── Envío ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    if (!employee || !action || !type || !fromDate || !token || !urlColegio) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = buildAdminPermissionPayload({
      schoolUserId: employee.schoolUserId,
      actionTagId: Number(action.id),
      typeTagId: Number(type.id),
      subject: subject.trim(),
      description: description.trim(),
      fromDate: toDateKey(fromDate),
      toDate: toDateKey(toDate ?? fromDate),
      fromTime: fromTime ? toTimeKey(fromTime) : undefined,
      toTime: toTime ? toTimeKey(toTime) : undefined,
      isFullDay,
      attachments: files.map((file) => file.dataUri),
      weekDays,
    });
    const outcome = describeCreateResult(
      await createAdminPermission({ token, urlColegio, payload }),
    );
    setSubmitting(false);
    if (outcome.ok) onCreated(outcome.message);
    else setSubmitError(outcome.message);
  }, [
    errors,
    employee,
    action,
    type,
    fromDate,
    toDate,
    fromTime,
    toTime,
    subject,
    description,
    isFullDay,
    files,
    weekDays,
    token,
    urlColegio,
    onCreated,
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
        {/* ── Información: usuario, acción y tipo ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="people-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Información</Text>
          </View>
          <Text style={styles.label}>
            Usuario <Text style={styles.required}>*</Text>
          </Text>
          {employee ? (
            <View style={styles.employeeRow}>
              <UserAvatar photourl={employee.photourl} styles={styles} />
              {/* Tocar el usuario reabre el picker para cambiarlo. */}
              <TouchableOpacity
                style={styles.employeeInfo}
                onPress={() => setSelectorOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={styles.employeeName} numberOfLines={2}>
                  {employee.fullName}{" "}
                  <Text style={styles.employeeId}>(ID: {employee.schoolUserId})</Text>
                </Text>
                <Text style={styles.employeeMeta} numberOfLines={2}>
                  {formatEmployeeContact(employee)}
                </Text>
              </TouchableOpacity>
              {/* X: limpia la selección sin reabrir el picker. */}
              <TouchableOpacity
                onPress={() => setEmployee(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Quitar usuario"
              >
                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.select, !!errorFor("employee") && styles.inputInvalid]}
              onPress={() => setSelectorOpen(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="search-outline" size={16} color="#2563EB" />
              <Text style={styles.selectPlaceholder}>Buscar usuario</Text>
            </TouchableOpacity>
          )}
          {!!errorFor("employee") && <Text style={styles.fieldError}>{errorFor("employee")}</Text>}

          {catalogError ? (
            <Text style={[styles.fieldError, styles.labelSpaced]}>{catalogError}</Text>
          ) : (
            <>
              <Text style={[styles.label, styles.labelSpaced]}>
                Acción <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.select, !!errorFor("action") && styles.inputInvalid]}
                onPress={() => setTagSheet("action")}
                activeOpacity={0.75}
              >
                <Text
                  style={action ? styles.selectValue : styles.selectPlaceholder}
                  numberOfLines={1}
                >
                  {action?.name ?? "Selecciona una acción"}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
              {!!errorFor("action") && <Text style={styles.fieldError}>{errorFor("action")}</Text>}

              <Text style={[styles.label, styles.labelSpaced]}>
                Tipo Permiso <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.select,
                  !action && styles.selectDisabled,
                  !!errorFor("type") && styles.inputInvalid,
                ]}
                onPress={() => action && setTagSheet("type")}
                disabled={!action}
                activeOpacity={0.75}
              >
                <Text
                  style={type ? styles.selectValue : styles.selectPlaceholder}
                  numberOfLines={1}
                >
                  {type?.name ?? (action ? "Selecciona un tipo" : "Elige primero una acción")}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
              {!!errorFor("type") && <Text style={styles.fieldError}>{errorFor("type")}</Text>}
              {!!action && typeOptions.length === 0 && (
                <Text style={styles.helper}>
                  Esta acción no tiene tipos de permiso configurados.
                </Text>
              )}
            </>
          )}
        </View>

        {/* ── Detalles ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Detalles</Text>
          </View>
          <Text style={styles.label}>
            Asunto <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, !!errorFor("subject") && styles.inputInvalid]}
            value={subject}
            onChangeText={setSubject}
            maxLength={255}
            placeholder="Ej. Cita médica"
            placeholderTextColor="#9CA3AF"
          />
          {!!errorFor("subject") && <Text style={styles.fieldError}>{errorFor("subject")}</Text>}

          <Text style={[styles.label, styles.labelSpaced]}>
            Motivo <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textarea, !!errorFor("description") && styles.inputInvalid]}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            placeholder="Describe el motivo de la solicitud"
            placeholderTextColor="#9CA3AF"
          />
          {!!errorFor("description") && (
            <Text style={styles.fieldError}>{errorFor("description")}</Text>
          )}
        </View>

        {/* ── Fecha y Hora ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Fecha y Hora</Text>
          </View>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>
                Desde <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.select, !!errorFor("fromDate") && styles.inputInvalid]}
                onPress={() => openPicker("fromDate")}
                activeOpacity={0.75}
              >
                <Ionicons name="calendar-outline" size={16} color="#2563EB" />
                <Text style={fromDate ? styles.selectValue : styles.selectPlaceholder}>
                  {fromDate ? formatDisplayDate(toDateKey(fromDate)) : "DD/MM/AAAA"}
                </Text>
              </TouchableOpacity>
              {!!errorFor("fromDate") && (
                <Text style={styles.fieldError}>{errorFor("fromDate")}</Text>
              )}
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Hasta</Text>
              <TouchableOpacity
                style={[styles.select, !!errorFor("toDate") && styles.inputInvalid]}
                onPress={() => openPicker("toDate")}
                activeOpacity={0.75}
              >
                <Ionicons name="calendar-outline" size={16} color="#2563EB" />
                <Text style={toDate ? styles.selectValue : styles.selectPlaceholder}>
                  {toDate ? formatDisplayDate(toDateKey(toDate)) : "DD/MM/AAAA"}
                </Text>
              </TouchableOpacity>
              {!!errorFor("toDate") && <Text style={styles.fieldError}>{errorFor("toDate")}</Text>}
            </View>
          </View>

          {isFullDay ? (
            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={16} color="#1D4ED8" />
              <Text style={styles.noteText}>
                Se registrará todo el día — no hace falta indicar horas.
              </Text>
            </View>
          ) : (
            <View style={[styles.row, styles.rowSpaced]}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>
                  Inicio <Text style={styles.required}>*</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.select, !!errorFor("fromTime") && styles.inputInvalid]}
                  onPress={() => openPicker("fromTime")}
                  activeOpacity={0.75}
                >
                  <Ionicons name="time-outline" size={16} color="#2563EB" />
                  <Text style={fromTime ? styles.selectValue : styles.selectPlaceholder}>
                    {fromTime ? formatDisplayTime(toTimeKey(fromTime)) : "--:--"}
                  </Text>
                </TouchableOpacity>
                {!!errorFor("fromTime") && (
                  <Text style={styles.fieldError}>{errorFor("fromTime")}</Text>
                )}
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>
                  Fin <Text style={styles.required}>*</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.select, !!errorFor("toTime") && styles.inputInvalid]}
                  onPress={() => openPicker("toTime")}
                  activeOpacity={0.75}
                >
                  <Ionicons name="time-outline" size={16} color="#2563EB" />
                  <Text style={toTime ? styles.selectValue : styles.selectPlaceholder}>
                    {toTime ? formatDisplayTime(toTimeKey(toTime)) : "--:--"}
                  </Text>
                </TouchableOpacity>
                {!!errorFor("toTime") && <Text style={styles.fieldError}>{errorFor("toTime")}</Text>}
              </View>
            </View>
          )}

          <Text style={[styles.label, styles.labelSpaced]}>Días de la semana (opcional)</Text>
          <View style={styles.dayChips}>
            {WEEK_DAY_NAMES.map((day) => {
              const active = weekDays.includes(day);
              return (
                <TouchableOpacity
                  key={day}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                  onPress={() =>
                    setWeekDays((previous) =>
                      previous.includes(day)
                        ? previous.filter((value) => value !== day)
                        : [...previous, day],
                    )
                  }
                  activeOpacity={0.75}
                >
                  <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                    {day.slice(0, 3)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Adjuntos ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="attach-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Adjuntar Archivos</Text>
          </View>
          {files.map((file) => (
            <View key={file.id} style={styles.fileRow}>
              <Ionicons name={getFileIcon(file.mimeType)} size={16} color="#2563EB" />
              <Text style={styles.fileName} numberOfLines={1}>
                {file.name}
              </Text>
              {!!formatFileSize(file.size) && (
                <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
              )}
              <TouchableOpacity
                onPress={() => setFiles((previous) => previous.filter((f) => f.id !== file.id))}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            style={styles.addFileBtn}
            onPress={handleAddFiles}
            disabled={pickingFiles || filesBytes >= MAX_PAYLOAD_BYTES}
            activeOpacity={0.75}
          >
            {pickingFiles ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Ionicons name="cloud-upload-outline" size={18} color="#2563EB" />
            )}
            <Text style={styles.addFileText}>
              {pickingFiles ? "Procesando archivos…" : "Seleccionar archivos"}
            </Text>
          </TouchableOpacity>
          <Text style={styles.hint}>Opcional · máx. 5 MB c/u · 20MB en total</Text>
          {!!fileNotice && <Text style={styles.helper}>{fileNotice}</Text>}
        </View>

        {!!submitError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.footerBtn, styles.cancelBtn]}
          onPress={onClose}
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

      {/* ── Acción / Tipo ── */}
      <TagOptionSheet
        visible={tagSheet !== null}
        title={tagSheet === "type" ? "Tipo de Permiso" : "Acción"}
        options={tagSheet === "type" ? typeOptions : actionTags}
        selectedId={tagSheet === "type" ? type?.id : action?.id}
        onSelect={(tag) => {
          if (tagSheet === "action") {
            if (Number(tag.id) !== Number(action?.id)) setType(null);
            setAction(tag);
          } else {
            setType(tag);
          }
          setTagSheet(null);
        }}
        onClose={() => setTagSheet(null)}
      />

      {/* ── Picker de usuario — calcado del de Ponche ADM, sin cámara ni
          contador "Cant.": acá se elige UN solo usuario. ── */}
      <Modal
        visible={selectorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectorOpen(false)}
      >
        <View style={styles.selectorOverlay}>
          <View style={styles.selectorCard}>
            <View style={styles.selectorHeader}>
              <View style={styles.selectorHeaderIcon}>
                <Ionicons name="people-outline" size={22} color="#2563EB" />
              </View>
              <Text style={styles.selectorTitle}>Seleccionar Usuario</Text>
              <TouchableOpacity
                onPress={() => setSelectorOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Cerrar"
              >
                <Ionicons name="close" size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.selectorSearchRow}>
              <View style={styles.searchInputWrap}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Nombre, cédula, email o código"
                  placeholderTextColor="#9CA3AF"
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="search"
                  onSubmitEditing={() => runSearch(query)}
                />
                {query.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setQuery("")}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
              {/* La búsqueda ya es en vivo (debounce de arriba); la lupa solo
                  la adelanta, igual que en Ponche ADM. */}
              <TouchableOpacity
                style={styles.iconBtnPrimary}
                onPress={() => runSearch(query)}
                activeOpacity={0.8}
                accessibilityLabel="Buscar"
              >
                <Ionicons name="search" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.selectorList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {searching ? (
                <ActivityIndicator color="#2563EB" style={styles.inlineLoader} />
              ) : query.trim().length < SEARCH_MIN_CHARS ? (
                <View style={styles.emptyBlock}>
                  <Ionicons name="search-outline" size={28} color="#D1D5DB" />
                  <Text style={styles.emptyText}>
                    Escribe al menos {SEARCH_MIN_CHARS} caracteres
                  </Text>
                </View>
              ) : results.length === 0 ? (
                <View style={styles.emptyBlock}>
                  <Ionicons name="person-outline" size={28} color="#D1D5DB" />
                  <Text style={styles.emptyText}>Sin resultados</Text>
                </View>
              ) : (
                results.map((option) => (
                  <TouchableOpacity
                    key={option.schoolUserId}
                    style={styles.resultRow}
                    onPress={() => {
                      setEmployee(option);
                      setSelectorOpen(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <UserAvatar photourl={option.photourl} styles={styles} />
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName} numberOfLines={2}>
                        {option.fullName}{" "}
                        <Text style={styles.resultId}>(ID: {option.schoolUserId})</Text>
                      </Text>
                      <Text style={styles.resultMeta} numberOfLines={2}>
                        {formatEmployeeContact(option)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Picker de fecha/hora ── */}
      {pickerTarget && Platform.OS === "android" && (
        <DateTimePicker
          value={pickerDraft}
          mode={isDatePicker ? "date" : "time"}
          minimumDate={isDatePicker ? new Date() : undefined}
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
                mode={isDatePicker ? "date" : "time"}
                display="spinner"
                minimumDate={isDatePicker ? new Date() : undefined}
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
    /** Tamaño fijo: botón de ícono, mismo criterio que PermissionDetailView. */
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
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      marginBottom: verticalScale(10),
    },
    cardTitle: { fontSize: font(15), fontWeight: "700", color: "#111827" },
    label: { fontSize: font(12), fontWeight: "600", color: "#374151", marginBottom: verticalScale(6) },
    labelSpaced: { marginTop: verticalScale(12) },
    required: { color: "#DC2626", fontWeight: "700" },
    helper: { fontSize: font(12), color: "#92400E", marginTop: verticalScale(6) },
    hint: { fontSize: font(11), color: "#6B7280", marginTop: verticalScale(6), textAlign: "center" },
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
    selectDisabled: { backgroundColor: "#F3F4F6" },
    selectValue: { flex: 1, fontSize: font(14), color: "#111827" },
    selectPlaceholder: { flex: 1, fontSize: font(14), color: "#9CA3AF" },
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
    textarea: { minHeight: verticalScale(96) },
    inputInvalid: { borderColor: "#DC2626" },
    fieldError: { fontSize: font(12), color: "#DC2626", marginTop: verticalScale(4) },
    row: { flexDirection: "row", gap: scale(10) },
    rowSpaced: { marginTop: verticalScale(12) },
    rowItem: { flex: 1 },
    note: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      backgroundColor: "#EFF6FF",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(8),
      marginTop: verticalScale(12),
    },
    noteText: { flex: 1, fontSize: font(12), color: "#1D4ED8" },
    dayChips: { flexDirection: "row", flexWrap: "wrap", gap: scale(6) },
    dayChip: {
      borderWidth: 1,
      borderColor: "#D1D5DB",
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(6),
      backgroundColor: "#fff",
    },
    dayChipActive: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
    dayChipText: { fontSize: font(12), fontWeight: "600", color: "#374151" },
    dayChipTextActive: { color: "#fff" },
    /** Usuario elegido: misma caja que los selects del formulario. */
    employeeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      borderWidth: 1,
      borderColor: "#D1D5DB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(8),
      backgroundColor: "#fff",
    },
    employeeInfo: { flex: 1 },
    employeeName: { fontSize: font(14), fontWeight: "700", color: "#111827" },
    employeeId: { fontSize: font(12), fontWeight: "500", color: "#6B7280" },
    employeeMeta: { fontSize: font(12), color: "#6B7280", marginTop: verticalScale(2) },
    linkText: { fontSize: font(14), fontWeight: "700", color: "#2563EB" },
    fileRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(9),
      marginBottom: verticalScale(8),
      backgroundColor: APP_BACKGROUND,
    },
    fileName: { flex: 1, fontSize: font(13), color: "#374151" },
    fileSize: { fontSize: font(11), color: "#6B7280" },
    addFileBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: "#93C5FD",
      borderRadius: RADIUS_LG,
      paddingVertical: verticalScale(12),
    },
    addFileText: { fontSize: font(13), fontWeight: "700", color: "#2563EB" },
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
    /* ── Picker de usuario: valores calcados de adminpunchinout.tsx ── */
    selectorOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: scale(20),
    },
    selectorCard: {
      width: "100%",
      // Mismo tope/criterio que el picker de Ponche ADM.
      maxWidth: 440,
      maxHeight: "88%",
      backgroundColor: "#fff",
      borderRadius: RADIUS_2XL,
      padding: scale(20),
      elevation: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
    },
    selectorHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingBottom: verticalScale(14),
      borderBottomWidth: 1,
      borderBottomColor: "#F3F4F6",
    },
    /** Ícono de cabecera: tamaño fijo, mismo criterio que Ponche ADM. */
    selectorHeaderIcon: {
      width: 42,
      height: 42,
      borderRadius: RADIUS_LG,
      backgroundColor: "#EFF6FF",
      alignItems: "center",
      justifyContent: "center",
    },
    selectorTitle: {
      flex: 1,
      fontSize: font(17),
      fontWeight: "700",
      color: "#111827",
    },
    selectorSearchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      marginTop: verticalScale(14),
    },
    /** Botón cuadrado de ícono — lado fijo, mismo criterio que los avatares. */
    iconBtnPrimary: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#2563EB",
      borderRadius: RADIUS_MD,
    },
    selectorList: { marginTop: verticalScale(6) },
    searchInputWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      backgroundColor: "#F9FAFB",
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    searchInput: {
      flex: 1,
      fontSize: font(12),
      color: "#111827",
      // eslint-disable-next-line local/no-raw-numbers-in-stylesheet -- 0 resetea el padding por defecto del TextInput en Android, no es un valor de diseño
      padding: 0,
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingVertical: verticalScale(10),
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
    },
    resultInfo: { flex: 1 },
    resultName: {
      fontSize: font(14),
      fontWeight: "700",
      color: "#111827",
      flexShrink: 1,
    },
    resultId: { fontWeight: "700", color: "#2563EB" },
    resultMeta: {
      fontSize: font(12),
      color: "#6B7280",
      marginTop: verticalScale(1),
    },
    avatarSmall: {
      width: AVATAR_SM_SIZE,
      height: AVATAR_SM_SIZE,
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: AVATAR_SM_SIZE / 2,
      backgroundColor: "#F3F4F6",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarSmallImage: {
      width: AVATAR_SM_SIZE,
      height: AVATAR_SM_SIZE,
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: AVATAR_SM_SIZE / 2,
    },
    inlineLoader: { marginVertical: verticalScale(16) },
    emptyBlock: {
      alignItems: "center",
      gap: scale(6),
      paddingVertical: verticalScale(20),
    },
    emptyText: { fontSize: font(13), color: "#9CA3AF" },
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
