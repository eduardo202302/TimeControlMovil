import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  useResponsive,
} from "@/constants/responsive";
import {
  ADMIN_STUDENTS_ROWS,
  fetchAdminStudents,
  type AdminStudent,
} from "../../api/getExcuses";
import {
  buildExcuseCreatePayload,
  createExcuse,
  defaultExcuseStateTag,
  type ExcuseTag,
} from "../../utils/excusesRules";
import {
  formatFileSize,
  getFileIcon,
  type PermissionAttachment,
} from "../timeoff/RevisionFinalModal";
import { MAX_PAYLOAD_BYTES, pickAttachments } from "../permissions/pickAttachments";
import TagOptionSheet from "../permissions/TagOptionSheet";
import TagMultiSelectSheet, {
  type MultiSelectOption,
} from "../users/TagMultiSelectSheet";
import AbsenceCalendar, { type AbsenceRange } from "./AbsenceCalendar";

/**
 * Copia deliberada de PHOTO_HOST/photoUri() de AdminPermissionCreateModal
 * (que a su vez lo copió de adminpunchinout.tsx). `photourl` es una ruta
 * relativa que el backend sirve por su ruta estática pública; si ya viene
 * absoluta se usa tal cual.
 */
const PHOTO_HOST = "https://timecontrol.wsmax.net:8600";

function photoUri(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${PHOTO_HOST}/${raw}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Date → "YYYY-MM-DD" con los campos locales (lo que mostró el picker). */
function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type FieldKey = "students" | "type" | "subject" | "description" | "range";

interface AdminExcuseCreateModalProps {
  visible: boolean;
  token: string | null;
  urlColegio: string | null;
  typeTags: ExcuseTag[];
  stateTags: ExcuseTag[];
  catalogError: string | null;
  onClose: () => void;
  onCreated: (message: string) => void;
}

type CreateStyles = ReturnType<typeof createStyles>;

export default function AdminExcuseCreateModal({
  visible,
  token,
  urlColegio,
  typeTags,
  stateTags,
  catalogError,
  onClose,
  onCreated,
}: AdminExcuseCreateModalProps) {
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
          <Text style={styles.topBarTitle}>Agregar Excusa</Text>
          <View style={styles.topBarSpacer} />
        </View>
        {/* Montado solo mientras está visible: cada apertura arranca en blanco. */}
        {visible && (
          <CreateForm
            token={token}
            urlColegio={urlColegio}
            typeTags={typeTags}
            stateTags={stateTags}
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

interface CreateFormProps extends Omit<AdminExcuseCreateModalProps, "visible"> {
  isTablet: boolean;
  styles: CreateStyles;
}

function CreateForm({
  token,
  urlColegio,
  typeTags,
  stateTags,
  catalogError,
  isTablet,
  styles,
  onClose,
  onCreated,
}: CreateFormProps) {
  // ── Estudiantes ───────────────────────────────────────────────────────────
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [studentsSheetOpen, setStudentsSheetOpen] = useState(false);

  // ── Formulario ────────────────────────────────────────────────────────────
  const [type, setType] = useState<ExcuseTag | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [absenceRange, setAbsenceRange] = useState<AbsenceRange | null>(null);
  const [files, setFiles] = useState<PermissionAttachment[]>([]);
  const [pickingFiles, setPickingFiles] = useState(false);
  const [fileNotice, setFileNotice] = useState<string | null>(null);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /** Estado con el que nace la excusa (default del webapp), si existe. */
  const defaultState = useMemo(() => defaultExcuseStateTag(stateTags), [stateTags]);

  // ── Carga de estudiantes ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const loadStudents = async () => {
      setStudentsLoading(true);
      setStudentsError(null);
      const page = await fetchAdminStudents();
      if (cancelled) return;
      setStudents(page.items);
      if (page.items.length === 0) {
        setStudentsError(
          page.count > 0
            ? `Hay ${page.count} estudiantes pero se pudieron cargar solo ${ADMIN_STUDENTS_ROWS}.`
            : "La escuela no tiene estudiantes cargados.",
        );
      } else {
        setStudentsError(null);
      }
      setStudentsLoading(false);
    };
    loadStudents();
    return () => {
      cancelled = true;
    };
  }, []);

  const studentOptions = useMemo<MultiSelectOption[]>(
    () =>
      students.map((student) => {
        const course = student.course?.[0];
        const subtitle = course
          ? [course.fullName, course.listNumber != null ? `Nº ${course.listNumber}` : ""]
              .filter(Boolean)
              .join(" · ")
          : undefined;
        return {
          id: student.id,
          name: student.fullName || `Estudiante #${student.id}`,
          subtitle,
          avatarUrl: photoUri(student.photourl) ?? undefined,
        };
      }),
    [students],
  );

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
      console.error("AdminExcuseCreate/pickFiles:", error?.message);
      setFileNotice("No se pudo abrir el selector de archivos.");
    } finally {
      setPickingFiles(false);
    }
  }, [filesBytes]);

  // ── Validación (mismos mínimos que el Joi del webapp) ─────────────────────
  const errors = useMemo(() => {
    const found: Partial<Record<FieldKey, string>> = {};
    if (selectedStudentIds.length === 0) {
      found.students = "Selecciona al menos un estudiante.";
    }
    if (!type) found.type = "Selecciona el tipo de excusa.";
    if (subject.trim().length < 3) {
      found.subject = "El asunto debe tener al menos 3 caracteres.";
    }
    if (description.trim().length < 10) {
      found.description = "El motivo debe tener al menos 10 caracteres.";
    }
    if (!absenceRange) {
      found.range = "Selecciona los días de ausencia.";
    }
    return found;
  }, [selectedStudentIds, type, subject, description, absenceRange]);

  const errorFor = (field: FieldKey) => (showErrors ? errors[field] : undefined);

  // ── Envío ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    if (!type || !absenceRange || !token || !urlColegio) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = buildExcuseCreatePayload({
      studentIds: selectedStudentIds,
      subject: subject.trim(),
      description: description.trim(),
      typeTagId: Number(type.id),
      absentDays: [toDateKey(absenceRange.start), toDateKey(absenceRange.end)],
      attachments: files.map((file) => file.dataUri),
      ...(defaultState?.id != null ? { stateTagId: Number(defaultState.id) } : {}),
    });
    const outcome = await createExcuse({ token, urlColegio, payload });
    setSubmitting(false);
    if (outcome.ok) onCreated(outcome.message || "La excusa quedó registrada.");
    else setSubmitError(outcome.message || "No se pudo registrar la excusa.");
  }, [
    errors,
    type,
    absenceRange,
    token,
    urlColegio,
    selectedStudentIds,
    subject,
    description,
    files,
    defaultState,
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
        {/* ── Información: estudiantes y tipo ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="people-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Información</Text>
          </View>
          <Text style={styles.label}>
            Estudiantes <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={[styles.select, !!errorFor("students") && styles.inputInvalid]}
            onPress={() => setStudentsSheetOpen(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="people-outline" size={16} color="#2563EB" />
            <Text style={styles.selectPlaceholder} numberOfLines={2}>
              {selectedStudentIds.length === 0
                ? "Seleccionar estudiantes"
                : `${selectedStudentIds.length} estudiante${selectedStudentIds.length === 1 ? "" : "s"} seleccionado${selectedStudentIds.length === 1 ? "" : "s"}`}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
          </TouchableOpacity>
          {!!errorFor("students") && <Text style={styles.fieldError}>{errorFor("students")}</Text>}
          {studentsLoading && (
            <ActivityIndicator size="small" color="#2563EB" style={styles.inlineLoader} />
          )}
          {!studentsLoading && !!studentsError && (
            <Text style={styles.fieldError}>{studentsError}</Text>
          )}

          {catalogError ? (
            <Text style={[styles.fieldError, styles.labelSpaced]}>{catalogError}</Text>
          ) : (
            <>
              <Text style={[styles.label, styles.labelSpaced]}>
                Tipo de Excusa <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.select, !!errorFor("type") && styles.inputInvalid]}
                onPress={() => setTypeSheetOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={type ? styles.selectValue : styles.selectPlaceholder} numberOfLines={1}>
                  {type?.name ?? "Selecciona un tipo"}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
              {!!errorFor("type") && <Text style={styles.fieldError}>{errorFor("type")}</Text>}
              {typeTags.length === 0 && !catalogError && (
                <Text style={styles.helper}>
                  La escuela no tiene configurados tipos de excusa.
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
            placeholder="Describe el motivo de la ausencia"
            placeholderTextColor="#9CA3AF"
          />
          {!!errorFor("description") && (
            <Text style={styles.fieldError}>{errorFor("description")}</Text>
          )}
        </View>

        {/* ── Días de ausencia ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Días de Ausencia</Text>
          </View>
          <AbsenceCalendar
            selectedRange={absenceRange}
            onChange={setAbsenceRange}
          />
          {!!errorFor("range") && <Text style={styles.fieldError}>{errorFor("range")}</Text>}
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

      {/* ── Tipo de excusa ── */}
      <TagOptionSheet
        visible={typeSheetOpen}
        title="Tipo de Excusa"
        options={typeTags}
        selectedId={type?.id}
        emptyText="No hay tipos de excusa configurados."
        onSelect={(tag) => {
          setType(tag);
          setTypeSheetOpen(false);
        }}
        onClose={() => setTypeSheetOpen(false)}
      />

      {/* ── Estudiantes (multi-selección con buscador client-side) ── */}
      <TagMultiSelectSheet
        visible={studentsSheetOpen}
        title="Estudiantes"
        options={studentOptions}
        selectedIds={selectedStudentIds}
        showCount
        emptyText="Sin estudiantes disponibles"
        onChange={setSelectedStudentIds}
        onClose={() => setStudentsSheetOpen(false)}
      />
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
    inlineLoader: { marginTop: verticalScale(8) },
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
  });
}