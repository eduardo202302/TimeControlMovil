import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React, { useCallback, useMemo, useState } from "react";
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
  RADIUS_SM,
  useResponsive,
} from "@/constants/responsive";
import {
  attachmentFileName,
  buildAttachmentUri,
  isImageAttachment,
  permissionDateKey,
  type PermissionTagRef,
} from "../../utils/permissionRules";
import {
  allowedStateTags,
  buildExcuseEditPayload,
  excuseAdminName,
  excuseEditSnapshot,
  excuseJustificationError,
  excuseReporterName,
  getExcuseDateRange,
  isRejectionExcuseStateTag,
  resolveStateTagDefinition,
  type Excuse,
  type ExcuseEditDraft,
  type ExcuseTag,
} from "../../utils/excusesRules";
import { toRD } from "../../utils/punchRules";
import {
  formatDisplayDate,
  formatDisplayTime,
  formatFileSize,
  getFileIcon,
  type PermissionAttachment,
} from "../timeoff/RevisionFinalModal";
import AbsenceCalendar, { type AbsenceRange } from "./AbsenceCalendar";
import { MAX_PAYLOAD_BYTES, pickAttachments } from "../permissions/pickAttachments";
import TagOptionSheet from "../permissions/TagOptionSheet";

/**
 * Modal unificado de una excusa admin, calcado de ExcusesCrud del webapp: un
 * solo modal con 2 modos internos — "watch" (ver detalle, solo lectura) y
 * "edit" (modificar). El toggle vive en el header, no en el footer, porque es
 * un cambio de vista in-place: no cierra el modal ni descarta los cambios en
 * memoria (el "descarte" real solo pasa si se cierra el modal completo).
 */
export type ExcuseCrudMode = "watch" | "edit";

interface ExcuseCrudModalProps {
  visible: boolean;
  /** Detalle COMPLETO (con absentDays, adjuntos y comentario), no la fila. */
  excuse: Excuse | null;
  loading: boolean;
  loadError: string | null;
  stateTags: ExcuseTag[];
  /** Estado destino elegido desde el chip de la card (p. ej. un rechazo). */
  preselectedStateTagId: number | null;
  /** Con qué modo arranca el modal ("watch" desde la card, "edit" desde un
   * rechazo/cancelación elegido en el chip). */
  initialMode: ExcuseCrudMode;
  /** Decide si el modo edit está permitido (canEditExcuse de la fila). */
  canEdit: boolean;
  saving: boolean;
  /** Mensaje del backend tal cual. */
  submitError: string | null;
  /** Base del colegio para resolver los adjuntos (preview/thumbnails). */
  urlColegio: string | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}

type CrudStyles = ReturnType<typeof createStyles>;

const CHIP_FALLBACK = { background: "#E2E8F0", text: "#475569" };

function chipColors(tag: PermissionTagRef | null | undefined) {
  return {
    backgroundColor: tag?.color || CHIP_FALLBACK.background,
    color: tag?.fontColor || CHIP_FALLBACK.text,
  };
}

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/** "YYYY-MM-DD" a Date local (mismo contrato de tiempo que AbsenceCalendar). */
function dateFromKey(key: string | undefined | null): Date | null {
  const [y, m, d] = String(key ?? "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date local a "YYYY-MM-DD", para el PATCH y el diff. */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Sello de auditoría (createdDate / updatedAt) → "DD/MM/AAAA h:mm a.m." en
 * hora RD. Los instantes (ISO con zona) se convierten con toRD; las fechas
 * planas "YYYY-MM-DD" se muestran por formatDisplayDate — mismo criterio que
 * AdminPermissionDetailModal.
 */
function formatAuditStamp(raw: unknown): string {
  const value = text(raw);
  if (!value) return "";
  if (!value.includes("T")) return formatDisplayDate(permissionDateKey(value));
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatDisplayDate(permissionDateKey(value));
  const rd = toRD(parsed);
  const date = `${String(rd.day).padStart(2, "0")}/${String(rd.month + 1).padStart(2, "0")}/${rd.year}`;
  const time = formatDisplayTime(
    `${String(rd.hours).padStart(2, "0")}:${String(rd.minutes).padStart(2, "0")}`,
  );
  return `${date} ${time}`;
}

function attachmentIcon(path: string): keyof typeof Ionicons.glyphMap {
  if (isImageAttachment(path)) return "image-outline";
  const name = attachmentFileName(path).toLowerCase();
  if (name.endsWith(".pdf")) return "document-text-outline";
  return "document-attach-outline";
}

function InfoRow({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: CrudStyles;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} selectable>
        {value || "—"}
      </Text>
    </View>
  );
}

/** Barra superior común: botón de cierre + título centrado + área de acción. */
function TopBar({
  title,
  onClose,
  right,
  styles,
}: {
  title: string;
  onClose: () => void;
  right?: React.ReactNode;
  styles: CrudStyles;
}) {
  return (
    <View style={styles.topBar}>
      <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.7}>
        <Ionicons name="close" size={22} color="#111827" />
      </TouchableOpacity>
      <Text style={styles.topBarTitle}>{title}</Text>
      <View style={styles.topBarAction}>{right}</View>
    </View>
  );
}

export default function ExcuseCrudModal({
  visible,
  excuse,
  loading,
  loadError,
  stateTags,
  preselectedStateTagId,
  initialMode,
  canEdit,
  saving,
  submitError,
  urlColegio,
  onClose,
  onSubmit,
}: ExcuseCrudModalProps) {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {loading ? (
          <>
            <TopBar title="Excusa" onClose={onClose} styles={styles} />
            <View style={styles.stateBox}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.stateText}>Cargando excusa…</Text>
            </View>
          </>
        ) : loadError || !excuse ? (
          <>
            <TopBar title="Excusa" onClose={onClose} styles={styles} />
            <View style={styles.stateBox}>
              <Ionicons name="alert-circle-outline" size={34} color="#9CA3AF" />
              <Text style={styles.stateTitle}>{loadError ?? "Excusa no encontrada"}</Text>
            </View>
          </>
        ) : (
          // La key reinicia el borrador (y el modo) cuando cambia la excusa o
          // el estado preelegido, sin setState dentro de un efecto.
          <CrudForm
            key={`${excuse.id}-${preselectedStateTagId ?? "none"}`}
            excuse={excuse}
            stateTags={stateTags}
            preselectedStateTagId={preselectedStateTagId}
            initialMode={initialMode}
            canEdit={canEdit}
            saving={saving}
            submitError={submitError}
            urlColegio={urlColegio}
            isTablet={isTablet}
            styles={styles}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        )}
      </View>
    </Modal>
  );
}

interface CrudFormProps {
  excuse: Excuse;
  stateTags: ExcuseTag[];
  preselectedStateTagId: number | null;
  initialMode: ExcuseCrudMode;
  canEdit: boolean;
  saving: boolean;
  submitError: string | null;
  urlColegio: string | null;
  isTablet: boolean;
  styles: CrudStyles;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}

function CrudForm({
  excuse,
  stateTags,
  preselectedStateTagId,
  initialMode,
  canEdit,
  saving,
  submitError,
  urlColegio,
  isTablet,
  styles,
  onClose,
  onSubmit,
}: CrudFormProps) {
  const snapshot = useMemo(() => excuseEditSnapshot(excuse), [excuse]);
  const range = useMemo(() => getExcuseDateRange(excuse), [excuse]);

  const [mode, setMode] = useState<ExcuseCrudMode>(initialMode);
  const [stateTagId, setStateTagId] = useState<number | null>(
    () => preselectedStateTagId ?? snapshot.stateTagId,
  );
  const [comment, setComment] = useState(snapshot.comment);
  const [subject, setSubject] = useState(snapshot.subject);
  const [description, setDescription] = useState(snapshot.description);
  const [absenceRange, setAbsenceRange] = useState<AbsenceRange | null>(() => {
    const [from, to] = snapshot.absentDays;
    const start = dateFromKey(from);
    const end = dateFromKey(to);
    if (!start || !end) return null;
    return { start, end };
  });
  const [newFiles, setNewFiles] = useState<PermissionAttachment[]>([]);
  const [pickingFiles, setPickingFiles] = useState(false);
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const [stateSheetOpen, setStateSheetOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  /** El modo edit SOLO edita si la fila lo permite (canEditExcuse). */
  const editing = mode === "edit" && canEdit;

  const studentAttachments = useMemo(
    () => (Array.isArray(excuse.attachments) ? excuse.attachments : []),
    [excuse.attachments],
  );

  /** El estado GUARDADO manda sobre qué transiciones se ofrecen. */
  const persistedDef = useMemo(
    () => resolveStateTagDefinition(excuse, stateTags),
    [excuse, stateTags],
  );
  const stateOptions = useMemo(
    () => allowedStateTags(persistedDef, stateTags),
    [persistedDef, stateTags],
  );

  const targetTag = useMemo<ExcuseTag | null>(
    () =>
      stateTags.find((tag) => Number(tag.id) === Number(stateTagId)) ??
      (Number(persistedDef?.id) === Number(stateTagId) ? persistedDef : null),
    [stateTags, stateTagId, persistedDef],
  );
  const isRejection = isRejectionExcuseStateTag(targetTag);

  const draft = useMemo<ExcuseEditDraft>(
    () => ({
      stateTagId,
      comment,
      subject,
      description,
      absentDays: absenceRange
        ? [toDateKey(absenceRange.start), toDateKey(absenceRange.end)]
        : [],
      // Los adjuntos admin solo viajan cuando el estado destino es
      // rechazo/cancelación — si la sección estaba oculta no manda datos
      // huérfanos (FASE B, fix 3).
      newAdminAttachments: isRejection ? newFiles.map((file) => file.dataUri) : [],
    }),
    [stateTagId, comment, subject, description, absenceRange, newFiles, isRejection],
  );

  const justificationError = useMemo(
    () => excuseJustificationError(targetTag, snapshot, draft),
    [targetTag, snapshot, draft],
  );

  const newBytes = useMemo(
    () => newFiles.reduce((total, file) => total + file.dataUri.length, 0),
    [newFiles],
  );

  const openAttachment = useCallback(
    (path: string) => {
      const uri = buildAttachmentUri(urlColegio, path);
      if (!uri) return;
      if (isImageAttachment(path)) {
        setPreviewUri(uri);
        return;
      }
      Linking.openURL(uri).catch(() => undefined);
    },
    [urlColegio],
  );

  const renderThumbOrIcon = (path: string) => {
    const uri = buildAttachmentUri(urlColegio, path);
    if (!uri) return <Ionicons name="image-outline" size={18} color="#6B7280" />;
    return <Image source={{ uri }} style={styles.attachmentThumb} resizeMode="cover" />;
  };

  const handleAddFiles = useCallback(async () => {
    setFileNotice(null);
    setPickingFiles(true);
    try {
      const result = await pickAttachments(newBytes);
      if (result.canceled) return;
      if (result.accepted.length > 0) {
        setNewFiles((previous) => [...previous, ...result.accepted]);
      }
      if (result.rejected.length > 0) {
        setFileNotice(`No se adjuntaron: ${result.rejected.join(", ")}`);
      }
    } catch (error: any) {
      console.error("ExcuseCrud/pickFiles:", error?.message);
      setFileNotice("No se pudo abrir el selector de archivos.");
    } finally {
      setPickingFiles(false);
    }
  }, [newBytes]);

  const handleSave = useCallback(() => {
    if (justificationError) {
      setShowErrors(true);
      return;
    }
    const payload = buildExcuseEditPayload(snapshot, draft);
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    onSubmit(payload);
  }, [justificationError, snapshot, draft, onClose, onSubmit]);

  // ── "Cambios sin guardar" — mismo patrón de HolidaysFormModal.tsx: se
  //    compara el estado vivo del formulario contra el snapshot cargado al
  //    abrir en modo edit. Estando en watch no hay campos editables, así que
  //    el guard solo aplica a los cambios hechos en modo edit. ──
  const [discardConfirmVisible, setDiscardConfirmVisible] = useState(false);

  const isDirty = useMemo(() => {
    if (stateTagId !== snapshot.stateTagId) return true;
    if (comment !== snapshot.comment) return true;
    if (subject !== snapshot.subject) return true;
    if (description !== snapshot.description) return true;
    const nowFrom = absenceRange ? toDateKey(absenceRange.start) : "";
    const nowTo = absenceRange ? toDateKey(absenceRange.end) : "";
    if (nowFrom !== (snapshot.absentDays[0] ?? "") || nowTo !== (snapshot.absentDays[1] ?? "")) {
      return true;
    }
    if (newFiles.length > 0) return true;
    return false;
  }, [stateTagId, comment, subject, description, absenceRange, newFiles, snapshot]);

  /** "Cancelar" del footer edit: sin cambios -> watch directo; con cambios,
   *  abre la confirmación. NO cierra el modal completo. */
  const requestExitEdit = useCallback(() => {
    if (isDirty) {
      setDiscardConfirmVisible(true);
      return;
    }
    setMode("watch");
  }, [isDirty]);

  /** "Descartar" del aviso: revierte TODOS los campos al snapshot y vuelve
   *  a modo watch (comportamiento del ojo del header, con guard). */
  const handleDiscardChanges = useCallback(() => {
    setStateTagId(snapshot.stateTagId);
    setComment(snapshot.comment);
    setSubject(snapshot.subject);
    setDescription(snapshot.description);
    setAbsenceRange(() => {
      const [from, to] = snapshot.absentDays;
      const start = dateFromKey(from);
      const end = dateFromKey(to);
      if (!start || !end) return null;
      return { start, end };
    });
    setNewFiles([]);
    setFileNotice(null);
    setShowErrors(false);
    setDiscardConfirmVisible(false);
    setMode("watch");
  }, [snapshot]);

  const stateColors = {
    backgroundColor: targetTag?.color || CHIP_FALLBACK.background,
    color: targetTag?.fontColor || CHIP_FALLBACK.text,
  };

  return (
    <>
      <TopBar
        title={`Excusa Id: ${excuse.id}`}
        onClose={onClose}
        styles={styles}
        right={
          <>
            {/* Impresión/exportación queda fuera del alcance de mobile
                (decisión de producto): el ícono de imprimir del webapp NO se
                implementa en este modal. El toggle watch/edit vive en el
                footer, no en el header: el "Editar" avanza a modo edit y el
                "Cancelar" del modo edit confirma antes de descartar cambios. */}
          </>
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Solicitante ── */}
          <View style={styles.card}>
            <Text style={styles.personName}>{excuse.student?.fullName || "—"}</Text>
            <Text style={styles.muted}>
              {[excuse.enrollment?.course?.fullName, excuse.typeTag?.name]
                .filter(Boolean)
                .join(" · ") || "—"}
            </Text>
          </View>

          {/* ── Quién Reporta ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="person-outline" size={18} color="#2563EB" />
              <Text style={styles.cardTitle}>Quién Reporta</Text>
            </View>
            {/* Sin fallback "No disponible": el nombre queda vacío si no
                existe; la relación tiene su fallback fijo del webapp. */}
            <Text style={styles.personName}>{excuse.parent?.fullName ?? ""}</Text>
            <Text style={styles.muted}>{excuse.parent?.relationship ?? "Madre/Padre"}</Text>
            <Text style={styles.muted}>{excuseReporterName(excuse)}</Text>
            {!!excuseAdminName(excuse) && (
              <Text style={styles.muted}>{excuseAdminName(excuse)}</Text>
            )}
            {mode === "watch" && (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Teléfono</Text>
                  <Text style={styles.infoValue} selectable>
                    {text(excuse.parent?.phone) || "—"}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue} selectable>
                    {text(excuse.parent?.email) || "—"}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* ── Estado ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="flag-outline" size={18} color="#2563EB" />
              <Text style={styles.cardTitle}>Estado</Text>
            </View>
            {editing ? (
              <TouchableOpacity
                style={styles.select}
                onPress={() => setStateSheetOpen(true)}
                disabled={stateOptions.length === 0 || saving}
                activeOpacity={0.75}
              >
                <View style={[styles.stateChip, { backgroundColor: stateColors.backgroundColor }]}>
                  <Text style={[styles.stateChipText, { color: stateColors.color }]}>
                    {targetTag?.name ?? excuse.stateTag?.name ?? "—"}
                  </Text>
                </View>
                <View style={styles.flex} />
                <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            ) : (
              <View style={[styles.stateChip, { backgroundColor: stateColors.backgroundColor }]}>
                <Text style={[styles.stateChipText, { color: stateColors.color }]}>
                  {targetTag?.name ?? excuse.stateTag?.name ?? "—"}
                </Text>
              </View>
            )}
            {editing && isRejection && (
              <Text style={styles.helper}>
                Para rechazar o cancelar es obligatorio un comentario o un adjunto.
              </Text>
            )}
          </View>

          {/* ── Información administrativa: solo en watch ── */}
          {mode === "watch" && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="information-circle-outline" size={18} color="#2563EB" />
                <Text style={styles.cardTitle}>Información</Text>
              </View>
              <InfoRow label="Curso" value={text(excuse.enrollment?.course?.fullName)} styles={styles} />
              <InfoRow
                label="Nº de Lista"
                value={text(excuse.enrollment?.course?.listNumber)}
                styles={styles}
              />
              <InfoRow label="Creado Por" value={excuseAdminName(excuse)} styles={styles} />
              <InfoRow
                label="F. Creación"
                value={formatAuditStamp(excuse.createdDate)}
                styles={styles}
              />
              <InfoRow
                label="Modificado Por"
                value={text(excuse.modifiedByUser?.user?.fullName)}
                styles={styles}
              />
              <InfoRow
                label="F. Modificación"
                value={formatAuditStamp(excuse.updatedAt)}
                styles={styles}
              />
            </View>
          )}

          {/* ── Día/s de ausencia ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="calendar-outline" size={18} color="#2563EB" />
              <Text style={styles.cardTitle}>Ausencia</Text>
            </View>
            {editing ? (
              <AbsenceCalendar selectedRange={absenceRange} onChange={setAbsenceRange} />
            ) : (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{range.isRange ? "Rango" : "Fecha"}</Text>
                  <Text style={styles.infoValue}>
                    {range.isRange
                      ? `${formatDisplayDate(range.from)} — ${formatDisplayDate(range.to)}`
                      : formatDisplayDate(range.from) || "—"}
                  </Text>
                </View>
                {range.isRange && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Total</Text>
                    <Text style={styles.infoValue}>
                      {`${range.totalDays} ${range.totalDays === 1 ? "día" : "días"}`}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* ── Detalle ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={18} color="#2563EB" />
              <Text style={styles.cardTitle}>Detalle</Text>
            </View>
            <Text style={styles.label}>Asunto</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={subject}
                onChangeText={setSubject}
                maxLength={255}
                editable={!saving}
                placeholder="—"
                placeholderTextColor="#9CA3AF"
              />
            ) : (
              <Text style={styles.value}>{text(excuse.subject) || "—"}</Text>
            )}
            <Text style={[styles.label, styles.labelSpaced]}>Motivo</Text>
            {editing ? (
              <TextInput
                style={[styles.input, styles.textarea]}
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
                editable={!saving}
                placeholder="—"
                placeholderTextColor="#9CA3AF"
              />
            ) : (
              <Text style={styles.value}>{text(excuse.description) || "—"}</Text>
            )}
          </View>

          {/* ── Comentario: en edición solo aplica a rechazo/cancelación ── */}
          {editing && isRejection && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="chatbox-ellipses-outline" size={18} color="#2563EB" />
                <Text style={styles.cardTitle}>
                  Comentario <Text style={styles.required}>(Requerido)</Text>
                </Text>
              </View>
              <TextInput
                style={[
                  styles.input,
                  styles.textarea,
                  showErrors && !!justificationError && styles.inputInvalid,
                ]}
                value={comment}
                onChangeText={setComment}
                editable={!saving}
                multiline
                textAlignVertical="top"
                placeholder="Describe el motivo"
                placeholderTextColor="#9CA3AF"
              />
              {showErrors && !!justificationError && (
                <Text style={styles.fieldError}>{justificationError}</Text>
              )}
            </View>
          )}

          {/* ── Comentario en watch: se muestra si ya existía ── */}
          {mode === "watch" && !!text(comment) && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="chatbox-ellipses-outline" size={18} color="#2563EB" />
                <Text style={styles.cardTitle}>Comentario</Text>
              </View>
              <Text style={styles.value}>{text(comment)}</Text>
            </View>
          )}

          {/* ── Adjuntos del solicitante: SIEMPRE visibles y solo lectura ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="attach-outline" size={18} color="#2563EB" />
              <Text style={styles.cardTitle}>Adjuntos ({studentAttachments.length})</Text>
            </View>
            {studentAttachments.map((path, index) => (
              <TouchableOpacity
                key={`std-${path}-${index}`}
                style={styles.attachment}
                onPress={() => openAttachment(path)}
                activeOpacity={0.75}
              >
                {renderThumbOrIcon(path)}
                <Text style={styles.attachmentName} numberOfLines={1}>
                  {attachmentFileName(path)}
                </Text>
                <Ionicons name="open-outline" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Adjuntos administrativos: solo aparece cuando el estado
              destino es rechazo/cancelación (faithful a showAdminCommentsSection
              del webapp). Si no, se oculta COMPLETAMENTE — incl. el botón
              de agregar y el ícono de quitar. ── */}
          {isRejection && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#2563EB" />
              <Text style={styles.cardTitle}>Adjuntos Administrativos</Text>
            </View>

            {snapshot.attachmentsAdm.map((path, index) =>
              editing ? (
                <View key={`adm-${path}-${index}`} style={styles.fileRow}>
                  <Ionicons name="document-attach-outline" size={16} color="#2563EB" />
                  <Text style={styles.fileName} numberOfLines={1}>
                    {attachmentFileName(path)}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  key={`adm-${path}-${index}`}
                  style={styles.attachment}
                  onPress={() => openAttachment(path)}
                  activeOpacity={0.75}
                >
                  <Ionicons name={attachmentIcon(path)} size={18} color="#6B7280" />
                  <Text style={styles.attachmentName} numberOfLines={1}>
                    {attachmentFileName(path)}
                  </Text>
                  <Ionicons name="open-outline" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              ),
            )}

            {newFiles.map((file) => (
              <View key={file.id} style={[styles.fileRow, styles.fileRowNew]}>
                <Ionicons name={getFileIcon(file.mimeType)} size={16} color="#15803D" />
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.name}
                </Text>
                {!!formatFileSize(file.size) && (
                  <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
                )}
                {editing && (
                  <TouchableOpacity
                    onPress={() =>
                      setNewFiles((previous) => previous.filter((item) => item.id !== file.id))
                    }
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {editing && (
              <>
                <TouchableOpacity
                  style={styles.addFileBtn}
                  onPress={handleAddFiles}
                  disabled={pickingFiles || newBytes >= MAX_PAYLOAD_BYTES}
                  activeOpacity={0.75}
                >
                  {pickingFiles ? (
                    <ActivityIndicator size="small" color="#2563EB" />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={18} color="#2563EB" />
                  )}
                  <Text style={styles.addFileText}>
                    {pickingFiles ? "Procesando archivos…" : "Agregar archivos"}
                  </Text>
                </TouchableOpacity>
                {!!fileNotice && <Text style={styles.helper}>{fileNotice}</Text>}
              </>
            )}
          </View>
          )}

          {!!submitError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
              <Text style={styles.errorBannerText}>{submitError}</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {mode === "watch" ? (
            <>
              <TouchableOpacity
                style={[styles.footerBtn, styles.cancelBtn]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelText}>Cerrar</Text>
              </TouchableOpacity>
              {canEdit && (
                <TouchableOpacity
                  style={[styles.footerBtn, styles.saveBtn]}
                  onPress={() => setMode("edit")}
                  activeOpacity={0.8}
                  accessibilityLabel="Editar excusa"
                >
                  <View style={styles.footerBtnContent}>
                    <Ionicons name="create-outline" size={18} color="#fff" />
                    <Text style={styles.saveText}>Editar</Text>
                  </View>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.footerBtn, styles.cancelBtn]}
                onPress={requestExitEdit}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerBtn, styles.saveBtn, saving && styles.saveBtnBusy]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Modificar</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      <TagOptionSheet
        visible={stateSheetOpen}
        title="Estado"
        options={stateOptions}
        selectedId={stateTagId}
        onSelect={(tag) => {
          setStateTagId(Number(tag.id));
          setStateSheetOpen(false);
        }}
        onClose={() => setStateSheetOpen(false)}
      />

      {/* ── ¿Cambios sin guardar? — mismo lenguaje visual que el confirm de
          eliminar (excuses.tsx) y que el "¿Salir sin guardar?" de
          HolidaysFormModal.tsx. Se abre del "Cancelar" del modo edit. ── */}
      <Modal
        transparent
        visible={discardConfirmVisible}
        animationType="fade"
        onRequestClose={() => setDiscardConfirmVisible(false)}
      >
        <View style={styles.discardOverlay}>
          <View style={styles.discardBox}>
            <Text style={styles.discardTitle}>Cambios sin guardar</Text>
            <Text style={styles.discardMessage}>
              Tienes cambios sin guardar. Si sales ahora se perderán. ¿Deseas continuar?
            </Text>
            <View style={styles.discardButtons}>
              <TouchableOpacity onPress={() => setDiscardConfirmVisible(false)}>
                <Text style={styles.discardCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDiscardChanges}>
                <Text style={styles.discardConfirm}>Descartar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={previewUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <TouchableOpacity
          style={styles.previewOverlay}
          activeOpacity={1}
          onPress={() => setPreviewUri(null)}
        >
          {!!previewUri && (
            <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </>
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
    topBarAction: {
      width: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
    },
    topBarTitle: { fontSize: font(17), fontWeight: "700", color: "#142157" },
    stateBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: verticalScale(10),
      padding: scale(24),
    },
    stateText: { fontSize: font(13), color: "#6B7280" },
    stateTitle: {
      fontSize: font(15),
      fontWeight: "700",
      color: "#374151",
      textAlign: "center",
    },
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
    personName: { fontSize: font(16), fontWeight: "700", color: "#111827" },
    muted: { fontSize: font(12), color: "#6B7280", marginTop: verticalScale(4) },
    label: { fontSize: font(12), fontWeight: "600", color: "#374151" },
    labelSpaced: { marginTop: verticalScale(12) },
    required: { color: "#DC2626", fontWeight: "700" },
    value: {
      fontSize: font(14),
      color: "#111827",
      marginTop: verticalScale(3),
      lineHeight: font(20),
    },
    helper: {
      fontSize: font(12),
      color: "#92400E",
      marginTop: verticalScale(8),
      marginBottom: verticalScale(4),
    },
    select: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      borderWidth: 1,
      borderColor: "#D1D5DB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      backgroundColor: "#fff",
    },
    stateChip: {
      alignSelf: "flex-start",
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(4),
    },
    stateChipText: { fontSize: font(12), fontWeight: "700" },
    input: {
      borderWidth: 1,
      borderColor: "#D1D5DB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      fontSize: font(14),
      color: "#111827",
      backgroundColor: "#fff",
      marginTop: verticalScale(6),
    },
    textarea: { minHeight: verticalScale(96) },
    inputInvalid: { borderColor: "#DC2626" },
    fieldError: { fontSize: font(12), color: "#DC2626", marginTop: verticalScale(4) },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: scale(12),
      paddingVertical: verticalScale(7),
      borderBottomWidth: 1,
      borderBottomColor: "#F3F4F6",
    },
    infoLabel: { fontSize: font(12), color: "#6B7280", fontWeight: "600" },
    infoValue: { flex: 1, fontSize: font(13), color: "#111827", textAlign: "right" },
    attachment: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      backgroundColor: APP_BACKGROUND,
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(9),
      marginBottom: verticalScale(8),
    },
    attachmentThumb: {
      width: scale(34),
      height: scale(34),
      borderRadius: RADIUS_SM,
      backgroundColor: "#E5E7EB",
    },
    attachmentName: {
      flex: 1,
      fontSize: font(13),
      color: "#374151",
      fontWeight: "500",
    },
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
    fileRowNew: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
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
      marginTop: verticalScale(4),
    },
    addFileText: { fontSize: font(13), fontWeight: "700", color: "#2563EB" },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
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
    footerBtnContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
    },
    cancelBtn: { backgroundColor: "#F3F4F6" },
    cancelText: { fontSize: font(14), fontWeight: "700", color: "#374151" },
    saveBtn: { backgroundColor: "#2563EB" },
    saveBtnBusy: { opacity: 0.7 },
    saveText: { fontSize: font(14), fontWeight: "700", color: "#fff" },
    discardOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
      padding: scale(20),
    },
    discardBox: {
      width: "100%",
      maxWidth: scale(360),
      backgroundColor: "#fff",
      borderRadius: RADIUS_2XL,
      padding: scale(20),
    },
    discardTitle: { fontSize: font(17), fontWeight: "700", color: "#142157" },
    discardMessage: {
      fontSize: font(14),
      color: "#4B5563",
      lineHeight: font(20),
      marginTop: verticalScale(8),
    },
    discardButtons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: scale(18),
      marginTop: verticalScale(16),
    },
    discardCancel: { fontSize: font(14), fontWeight: "700", color: "#374151" },
    discardConfirm: { fontSize: font(14), fontWeight: "700", color: "#DC2626" },
    previewOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.92)",
      alignItems: "center",
      justifyContent: "center",
      padding: scale(12),
    },
    previewImage: { width: "100%", height: "100%", borderRadius: RADIUS_LG },
  });
}