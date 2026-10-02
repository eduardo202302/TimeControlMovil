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
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  APP_BACKGROUND_V2,
  CARD_BACKGROUND,
  CARD_BORDER,
  ERROR_COLOR,
  ERROR_TEXT,
  FOOTER_BORDER,
  HEADER_BUTTON_BACKGROUND,
  HEADER_NAVY,
  HEADER_TEXT,
  ONLINE_DOT,
  ON_PRIMARY,
  OVERLAY_VIEWER,
  PRIMARY_COLOR,
  SECTION_ICON_COLOR,
  SUCCESS_COLOR,
  SUCCESS_TINT_50,
  SUCCESS_TINT_BORDER,
  type SectionTone,
  TEXT_BODY,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WARNING_TEXT_STRONG,
} from "@/constants/colors";
import SectionIcon from "@/components/ui/SectionIcon";
import {
  MAX_CONTENT_WIDTH,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
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
import {
  ADD_FILE_BTN,
  ALERT_BANNER,
  CARD_FORM,
  DIALOG_BOX,
  DIALOG_OVERLAY,
  FIELD_DISABLED,
  FIELD_SURFACE,
  FILE_ROW,
  FOOTER_BAR,
  FOOTER_BTN_CANCEL,
  FOOTER_BTN_SAVE,
  MODAL_TOPBAR,
  THUMB_TILE,
} from "@/styles/surfaces";

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

const CHIP_FALLBACK = { background: CARD_BORDER, text: TEXT_SECONDARY };

const PHOTO_HOST = "https://timecontrol.wsmax.net:8600";

function photoUri(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${PHOTO_HOST}/${raw}`;
}

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
        <Ionicons name="close" size={22} color={HEADER_TEXT} />
      </TouchableOpacity>
      <Text style={styles.topBarTitle}>{title}</Text>
      <View style={styles.topBarAction}>{right}</View>
    </View>
  );
}

/** Card colapsable, igual que CardContainer canCollapse del webapp. */
function CollapsibleCard({
  icon,
  tone,
  title,
  defaultOpen = true,
  styles,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: SectionTone;
  title: React.ReactNode;
  defaultOpen?: boolean;
  styles: CrudStyles;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={[styles.cardHeader, !open && styles.cardHeaderCollapsed]}
        onPress={() => setOpen((value) => !value)}
        activeOpacity={0.7}
      >
        <SectionIcon tone={tone}>
          <Ionicons name={icon} size={18} color={SECTION_ICON_COLOR} />
        </SectionIcon>
        <Text style={styles.cardTitle}>{title}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={TEXT_PLACEHOLDER}
          style={styles.chevron}
        />
      </TouchableOpacity>
      {open && children}
    </View>
  );
}

/** Punto de color del tag (DropdownTriggerWithColor del webapp). */
function TagDot({ color, styles }: { color?: string | null; styles: CrudStyles }) {
  if (!color) return null;
  return <View style={[styles.tagDot, { backgroundColor: color }]} />;
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
      {/* TopBar navy: íconos claros mientras está abierto; al desmontar se desapila y queda el light-content del shell. */}
      <StatusBar barStyle="light-content" />
      <View style={styles.screen}>
        {loading ? (
          <>
            <TopBar title="Excusa" onClose={onClose} styles={styles} />
            <View style={styles.stateBox}>
              <ActivityIndicator size="large" color={PRIMARY_COLOR} />
              <Text style={styles.stateText}>Cargando excusa…</Text>
            </View>
          </>
        ) : loadError || !excuse ? (
          <>
            <TopBar title="Excusa" onClose={onClose} styles={styles} />
            <View style={styles.stateBox}>
              <Ionicons name="alert-circle-outline" size={34} color={TEXT_PLACEHOLDER} />
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

  const studentPhoto = photoUri(excuse.student?.photourl || excuse.student?.s3Photo);
  const listNumber = text(excuse.enrollment?.listNumber);
  const courseName = text(excuse.enrollment?.course?.fullName);
  const studentCode = text(excuse.student?.code);
  const studentPhone = text(excuse.student?.phone);

  const stateName = targetTag?.name ?? excuse.stateTag?.name ?? "—";
  const stateDotColor = targetTag?.color || excuse.stateTag?.color || null;

  // Quién Reporta — "Nombre - Relación" (fallback de relación del webapp).
  const reporterName = excuseReporterName(excuse);
  const relationship = excuse.parent?.relationship ?? "Madre/Padre";
  const reporterLine = relationship ? `${reporterName} - ${relationship}` : reporterName;
  const requestedAt = formatAuditStamp(excuse.createdDate);
  const parentPhone = text(excuse.parent?.phone);
  // El chip de Quién Reporta es el estado GUARDADO, no el que se está editando.
  const persistedChip = chipColors(persistedDef ?? excuse.stateTag);
  const persistedStateName = persistedDef?.name ?? excuse.stateTag?.name ?? "—";
  const modifiedBy = text(excuse.modifiedByUser?.user?.fullName);
  const createdBy = text(excuse.createdByUser?.user?.fullName);
  const auditLabel = modifiedBy ? "Modificado por:" : createdBy ? "Creado por:" : "";
  const auditName = modifiedBy || createdBy;

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
          {/* ── 1. Tarjeta del estudiante (no colapsa) ── */}
          <View style={styles.card}>
            <View style={styles.studentRow}>
              <View style={styles.avatarWrap}>
                {studentPhoto ? (
                  <Image source={{ uri: studentPhoto }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="person" size={26} color={TEXT_PLACEHOLDER} />
                  </View>
                )}
                {!!listNumber && (
                  <View style={styles.listBadge}>
                    <Text style={styles.listBadgeText}>{listNumber}</Text>
                  </View>
                )}
              </View>
              <View style={styles.flex}>
                <Text style={styles.personName}>{excuse.student?.fullName || "—"}</Text>
                {!!studentCode && <Text style={styles.muted}>Mat. {studentCode}</Text>}
                {!!courseName && <Text style={styles.muted}>Aula: {courseName}</Text>}
                {!!studentPhone && <Text style={styles.muted}>Tel. {studentPhone}</Text>}
              </View>
            </View>

            <View style={styles.tagFields}>
              {!!excuse.typeTag?.name && (
                <View style={styles.tagField}>
                  <Text style={styles.tagFieldLabel}>Tipo</Text>
                  <View style={[styles.select, styles.selectDisabled]}>
                    <TagDot color={excuse.typeTag?.color} styles={styles} />
                    <Text style={styles.selectText} numberOfLines={1}>
                      {excuse.typeTag.name}
                    </Text>
                  </View>
                </View>
              )}
              <View style={styles.tagField}>
                <Text style={styles.tagFieldLabel}>Estado</Text>
                {editing ? (
                  <TouchableOpacity
                    style={styles.select}
                    onPress={() => setStateSheetOpen(true)}
                    disabled={stateOptions.length === 0 || saving}
                    activeOpacity={0.75}
                  >
                    <TagDot color={stateDotColor} styles={styles} />
                    <Text style={styles.selectText} numberOfLines={1}>{stateName}</Text>
                    <Ionicons name="chevron-down" size={16} color={TEXT_PLACEHOLDER} />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.select, styles.selectDisabled]}>
                    <TagDot color={stateDotColor} styles={styles} />
                    <Text style={styles.selectText} numberOfLines={1}>{stateName}</Text>
                  </View>
                )}
              </View>
            </View>
            {editing && isRejection && (
              <Text style={styles.helper}>
                Para rechazar o cancelar es obligatorio un comentario o un adjunto.
              </Text>
            )}
          </View>

          {/* ── 2. Detalles ── */}
          <CollapsibleCard icon="information-circle-outline" tone="violet" title="Detalles" styles={styles}>
            <Text style={styles.label}>Asunto</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={subject}
                onChangeText={setSubject}
                maxLength={255}
                editable={!saving}
                placeholder="—"
                placeholderTextColor={TEXT_PLACEHOLDER}
              />
            ) : (
              <View style={[styles.input, styles.inputReadonly]}>
                <Text style={styles.inputReadonlyText}>{text(excuse.subject) || "—"}</Text>
              </View>
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
                placeholderTextColor={TEXT_PLACEHOLDER}
              />
            ) : (
              <View style={[styles.input, styles.textarea, styles.inputReadonly]}>
                <Text style={styles.inputReadonlyText}>{text(excuse.description) || "—"}</Text>
              </View>
            )}
          </CollapsibleCard>

          {/* ── 3. Quién Reporta ── */}
          <CollapsibleCard icon="person-outline" tone="blue" title="Quién Reporta" styles={styles}>
            <View style={styles.reporterBox}>
              <Text style={styles.personName}>{reporterLine}</Text>
              {!!requestedAt && <Text style={styles.muted}>Solicitado: {requestedAt}</Text>}
              {!!parentPhone && <Text style={styles.muted}>Tel. {parentPhone}</Text>}
              <View
                style={[
                  styles.stateChip,
                  styles.reporterChip,
                  { backgroundColor: persistedChip.backgroundColor },
                ]}
              >
                <Text style={[styles.stateChipText, { color: persistedChip.color }]}>
                  {persistedStateName}
                </Text>
              </View>
              {!!auditLabel && (
                <Text style={styles.auditLine}>
                  {auditLabel} <Text style={styles.auditName}>{auditName}</Text>
                </Text>
              )}
            </View>
          </CollapsibleCard>

          {/* ── 4. Comentarios / Adjuntos Admin: SOLO en rechazo/cancelación
              (showAdminCommentsSection del webapp), en watch y en edit ── */}
          {isRejection && (
            <CollapsibleCard
              icon="chatbox-ellipses-outline"
              tone="violet"
              title={
                editing ? (
                  <>
                    Comentarios / Adjuntos Admin{" "}
                    <Text style={styles.required}>(Requerido)</Text>
                  </>
                ) : (
                  "Comentarios / Adjuntos Admin"
                )
              }
              styles={styles}
            >
              <Text style={styles.label}>Comentario</Text>
              {editing ? (
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
                  placeholderTextColor={TEXT_PLACEHOLDER}
                />
              ) : (
                <View style={[styles.input, styles.textarea, styles.inputReadonly]}>
                  <Text style={styles.inputReadonlyText}>{text(comment) || "—"}</Text>
                </View>
              )}
              {showErrors && !!justificationError && (
                <Text style={styles.fieldError}>{justificationError}</Text>
              )}

              <Text style={[styles.label, styles.labelSpaced]}>Adjuntos Admin</Text>
              <View style={styles.adminFiles}>
                {snapshot.attachmentsAdm.map((path, index) =>
                  editing ? (
                    <View key={`adm-${path}-${index}`} style={styles.fileRow}>
                      <Ionicons name="document-attach-outline" size={16} color={PRIMARY_COLOR} />
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
                      <Ionicons name={attachmentIcon(path)} size={18} color={TEXT_MUTED} />
                      <Text style={styles.attachmentName} numberOfLines={1}>
                        {attachmentFileName(path)}
                      </Text>
                      <Ionicons name="open-outline" size={16} color={TEXT_PLACEHOLDER} />
                    </TouchableOpacity>
                  ),
                )}

                {newFiles.map((file) => (
                  <View key={file.id} style={[styles.fileRow, styles.fileRowNew]}>
                    <Ionicons name={getFileIcon(file.mimeType)} size={16} color={SUCCESS_COLOR} />
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
                        <Ionicons name="close-circle" size={18} color={TEXT_PLACEHOLDER} />
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
                        <ActivityIndicator size="small" color={PRIMARY_COLOR} />
                      ) : (
                        <Ionicons name="cloud-upload-outline" size={18} color={PRIMARY_COLOR} />
                      )}
                      <Text style={styles.addFileText}>
                        {pickingFiles ? "Procesando archivos…" : "Agregar archivos"}
                      </Text>
                    </TouchableOpacity>
                    {!!fileNotice && <Text style={styles.helper}>{fileNotice}</Text>}
                  </>
                )}
                {!editing && snapshot.attachmentsAdm.length === 0 && (
                  <Text style={styles.emptyHint}>Sin adjuntos</Text>
                )}
              </View>
            </CollapsibleCard>
          )}

          {/* ── 5. Ausencia: se queda como está, solo pasa al final (orden
              del webapp apilado) ── */}
          {/* ── Día/s de ausencia ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <SectionIcon tone="teal">
                <Ionicons name="calendar-outline" size={18} color={SECTION_ICON_COLOR} />
              </SectionIcon>
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

          {/* ── 6. Adjuntos del solicitante: cerrada si no hay archivos ── */}
          <CollapsibleCard
            icon="attach-outline"
            tone="amber"
            title="Adjuntos"
            defaultOpen={studentAttachments.length > 0}
            styles={styles}
          >
            {studentAttachments.length === 0 ? (
              <Text style={styles.emptyHint}>Sin adjuntos</Text>
            ) : (
              <View style={styles.thumbGrid}>
                {studentAttachments.map((path, index) => {
                  const uri = buildAttachmentUri(urlColegio, path);
                  return (
                    <TouchableOpacity
                      key={`std-${path}-${index}`}
                      style={styles.thumbTile}
                      onPress={() => openAttachment(path)}
                      activeOpacity={0.75}
                    >
                      {isImageAttachment(path) && uri ? (
                        <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.thumbIconBox}>
                          <Ionicons name={attachmentIcon(path)} size={26} color={TEXT_MUTED} />
                          <Text style={styles.thumbName} numberOfLines={1}>
                            {attachmentFileName(path)}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </CollapsibleCard>

          {!!submitError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={18} color={ERROR_TEXT} />
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
                    <Ionicons name="create-outline" size={18} color={ON_PRIMARY} />
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
                  <ActivityIndicator size="small" color={ON_PRIMARY} />
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
    screen: { flex: 1, backgroundColor: APP_BACKGROUND_V2 },
    topBar: {
      ...MODAL_TOPBAR,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(48),
      paddingBottom: verticalScale(14),
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_MD,
      backgroundColor: HEADER_BUTTON_BACKGROUND,
    },
    topBarAction: {
      width: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
    },
    topBarTitle: { fontSize: font(17), fontWeight: "700", color: HEADER_TEXT },
    stateBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: verticalScale(10),
      padding: scale(24),
    },
    stateText: { fontSize: font(13), color: TEXT_MUTED },
    stateTitle: {
      fontSize: font(15),
      fontWeight: "700",
      color: TEXT_SECONDARY,
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
      ...CARD_FORM,
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(14),
      paddingBottom: verticalScale(16),
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      marginBottom: verticalScale(10),
    },
    cardTitle: { fontSize: font(15), fontWeight: "700", color: TEXT_PRIMARY },
    cardHeaderCollapsed: { marginBottom: verticalScale(0) },
    chevron: { marginLeft: "auto" },
    studentRow: { flexDirection: "row", alignItems: "center", gap: scale(14) },
    avatarWrap: { position: "relative" },
    avatar: {
      width: scale(64),
      height: scale(64),
      borderRadius: scale(32),
      backgroundColor: CARD_BORDER,
    },
    avatarFallback: { alignItems: "center", justifyContent: "center" },
    listBadge: {
      position: "absolute",
      top: -scale(2),
      left: -scale(2),
      minWidth: scale(22),
      height: scale(22),
      borderRadius: scale(11),
      paddingHorizontal: scale(4),
      backgroundColor: ONLINE_DOT,
      borderWidth: 2,
      borderColor: CARD_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
    },
    listBadgeText: { fontSize: font(11), fontWeight: "700", color: ON_PRIMARY },
    tagFields: {
      flexDirection: "row",
      gap: scale(10),
      marginTop: verticalScale(14),
    },
    tagField: { flex: 1 },
    tagFieldLabel: {
      fontSize: font(11),
      fontWeight: "600",
      color: TEXT_SECONDARY,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: verticalScale(6),
    },
    selectDisabled: { opacity: 0.8 },
    selectText: { flex: 1, fontSize: font(14), fontWeight: "500", color: TEXT_PRIMARY },
    tagDot: {
      width: 12,
      height: 12,
      borderRadius: RADIUS_PILL,
      borderWidth: 1,
      borderColor: "rgba(0,0,0,0.1)",
    },
    inputReadonly: { ...FIELD_DISABLED },
    inputReadonlyText: { fontSize: font(14), color: TEXT_PRIMARY, lineHeight: font(20) },
    reporterBox: {
      borderWidth: 1,
      borderColor: FOOTER_BORDER,
      borderRadius: RADIUS_LG,
      padding: scale(14),
      backgroundColor: CARD_BACKGROUND,
    },
    reporterChip: { marginTop: verticalScale(10) },
    auditLine: {
      fontSize: font(12),
      color: TEXT_MUTED,
      marginTop: verticalScale(8),
      textAlign: "right",
    },
    auditName: { fontWeight: "700", color: TEXT_PRIMARY },
    emptyHint: { fontSize: font(13), color: TEXT_PLACEHOLDER, fontStyle: "italic" },
    thumbGrid: { flexDirection: "row", flexWrap: "wrap", gap: scale(8) },
    thumbTile: {
      ...THUMB_TILE,
      width: "31%",
      aspectRatio: 1,
      overflow: "hidden",
    },
    thumbImage: { width: "100%", height: "100%" },
    thumbIconBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: scale(6),
      gap: verticalScale(4),
    },
    thumbName: { fontSize: font(10), color: TEXT_SECONDARY, textAlign: "center" },
    adminFiles: { marginTop: verticalScale(6) },
    personName: { fontSize: font(16), fontWeight: "700", color: TEXT_PRIMARY },
    muted: { fontSize: font(12), color: TEXT_MUTED, marginTop: verticalScale(4) },
    label: { fontSize: font(12), fontWeight: "600", color: TEXT_SECONDARY },
    labelSpaced: { marginTop: verticalScale(12) },
    required: { color: ERROR_COLOR, fontWeight: "700" },
    helper: {
      fontSize: font(12),
      color: WARNING_TEXT_STRONG,
      marginTop: verticalScale(8),
      marginBottom: verticalScale(4),
    },
    select: {
      ...FIELD_SURFACE,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    stateChip: {
      alignSelf: "flex-start",
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(4),
    },
    stateChipText: { fontSize: font(12), fontWeight: "700" },
    input: {
      ...FIELD_SURFACE,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      fontSize: font(14),
      color: TEXT_PRIMARY,
      marginTop: verticalScale(6),
    },
    textarea: { minHeight: verticalScale(96) },
    inputInvalid: { borderColor: ERROR_COLOR },
    fieldError: { fontSize: font(12), color: ERROR_COLOR, marginTop: verticalScale(4) },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: scale(12),
      paddingVertical: verticalScale(7),
      borderBottomWidth: 1,
      borderBottomColor: FOOTER_BORDER,
    },
    infoLabel: { fontSize: font(12), color: TEXT_MUTED, fontWeight: "600" },
    infoValue: { flex: 1, fontSize: font(13), color: TEXT_PRIMARY, textAlign: "right" },
    attachment: {
      ...FILE_ROW,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(9),
      marginBottom: verticalScale(8),
    },
    attachmentName: {
      flex: 1,
      fontSize: font(13),
      color: TEXT_SECONDARY,
      fontWeight: "500",
    },
    fileRow: {
      ...FILE_ROW,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(9),
      marginBottom: verticalScale(8),
    },
    fileRowNew: { backgroundColor: SUCCESS_TINT_50, borderColor: SUCCESS_TINT_BORDER },
    fileName: { flex: 1, fontSize: font(13), color: TEXT_SECONDARY },
    fileSize: { fontSize: font(11), color: TEXT_MUTED },
    addFileBtn: {
      ...ADD_FILE_BTN,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      paddingVertical: verticalScale(12),
      marginTop: verticalScale(4),
    },
    addFileText: { fontSize: font(13), fontWeight: "700", color: PRIMARY_COLOR },
    errorBanner: {
      ...ALERT_BANNER,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    errorBannerText: { flex: 1, fontSize: font(13), color: ERROR_TEXT },
    footer: {
      ...FOOTER_BAR,
      flexDirection: "row",
      gap: scale(10),
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(12),
      paddingBottom: verticalScale(28),
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
    cancelBtn: { ...FOOTER_BTN_CANCEL },
    cancelText: { fontSize: font(14), fontWeight: "700", color: TEXT_SECONDARY },
    saveBtn: { ...FOOTER_BTN_SAVE },
    saveBtnBusy: { opacity: 0.7 },
    saveText: { fontSize: font(14), fontWeight: "700", color: ON_PRIMARY },
    discardOverlay: {
      ...DIALOG_OVERLAY,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: scale(20),
    },
    discardBox: {
      ...DIALOG_BOX,
      width: "100%",
      maxWidth: scale(360),
      padding: scale(20),
    },
    discardTitle: { fontSize: font(17), fontWeight: "700", color: HEADER_NAVY },
    discardMessage: {
      fontSize: font(14),
      color: TEXT_BODY,
      lineHeight: font(20),
      marginTop: verticalScale(8),
    },
    discardButtons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: scale(18),
      marginTop: verticalScale(16),
    },
    discardCancel: { fontSize: font(14), fontWeight: "700", color: TEXT_SECONDARY },
    discardConfirm: { fontSize: font(14), fontWeight: "700", color: ERROR_COLOR },
    previewOverlay: {
      flex: 1,
      backgroundColor: OVERLAY_VIEWER,
      alignItems: "center",
      justifyContent: "center",
      padding: scale(12),
    },
    previewImage: { width: "100%", height: "100%", borderRadius: RADIUS_LG },
  });
}