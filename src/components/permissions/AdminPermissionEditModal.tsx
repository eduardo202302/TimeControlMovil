import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  RADIUS_PILL,
  useResponsive,
} from "@/constants/responsive";
import {
  allowedStateTags,
  buildPermissionEditPayload,
  emptyPermissionEditDraft,
  isOverTimeLocked,
  isOvertimeAction,
  isPermissionExpired,
  isRejectionStateTag,
  permissionEditSnapshot,
  rejectionJustificationError,
  resolveStateTagDefinition,
  type PermissionCatalogTag,
  type PermissionEditDraft,
} from "../../utils/adminPermissionRules";
import {
  attachmentFileName,
  getPermissionDayRange,
  type MyPermission,
} from "../../utils/permissionRules";
import { normalizePermissionName } from "../../utils/punchRules";
import {
  formatDisplayDate,
  formatDisplayTime,
  formatFileSize,
  getFileIcon,
  type PermissionAttachment,
} from "../timeoff/RevisionFinalModal";
import { MAX_PAYLOAD_BYTES, pickAttachments } from "./pickAttachments";
import TagOptionSheet from "./TagOptionSheet";

const AUSENCIA_ACTION_NAME = "ausencia";

interface AdminPermissionEditModalProps {
  visible: boolean;
  /** Detalle COMPLETO (con adjuntos, comentarios y overTime), no la fila. */
  permission: MyPermission | null;
  loading: boolean;
  loadError: string | null;
  stateTags: PermissionCatalogTag[];
  /** Estado destino elegido desde el dropdown de la card (p. ej. un rechazo). */
  preselectedStateTagId: number | null;
  saving: boolean;
  /** Mensaje del backend tal cual (p. ej. el rechazo por overtime). */
  submitError: string | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}

type EditStyles = ReturnType<typeof createStyles>;

export default function AdminPermissionEditModal({
  visible,
  permission,
  loading,
  loadError,
  stateTags,
  preselectedStateTagId,
  saving,
  submitError,
  onClose,
  onSubmit,
}: AdminPermissionEditModalProps) {
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
          <Text style={styles.topBarTitle}>
            {permission ? `Editar Permiso #${permission.id}` : "Editar Permiso"}
          </Text>
          <View style={styles.topBarSpacer} />
        </View>

        {loading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.stateText}>Cargando permiso…</Text>
          </View>
        ) : loadError || !permission ? (
          <View style={styles.stateBox}>
            <Ionicons name="alert-circle-outline" size={34} color="#9CA3AF" />
            <Text style={styles.stateTitle}>{loadError ?? "Permiso no encontrado"}</Text>
          </View>
        ) : (
          // La key reinicia el borrador cuando cambia el permiso o el estado
          // preelegido, sin setState dentro de un efecto.
          <EditForm
            key={`${permission.source}-${permission.id}-${preselectedStateTagId ?? "none"}`}
            permission={permission}
            stateTags={stateTags}
            preselectedStateTagId={preselectedStateTagId}
            saving={saving}
            submitError={submitError}
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

interface EditFormProps {
  permission: MyPermission;
  stateTags: PermissionCatalogTag[];
  preselectedStateTagId: number | null;
  saving: boolean;
  submitError: string | null;
  isTablet: boolean;
  styles: EditStyles;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}

function EditForm({
  permission,
  stateTags,
  preselectedStateTagId,
  saving,
  submitError,
  isTablet,
  styles,
  onClose,
  onSubmit,
}: EditFormProps) {
  const snapshot = useMemo(() => permissionEditSnapshot(permission), [permission]);
  const actionName = permission.actionTag?.name;

  /**
   * Equivalente al `isWatch` del webapp (Watch || vencido || histórico). En
   * mobile el modal no se abre sobre esos casos — la card no ofrece Editar —
   * pero si llegara a abrirse queda bloqueado igual que el modo Ver.
   */
  const readOnly = permission.source === "historico" || isPermissionExpired(permission);
  const overTimeLocked = isOverTimeLocked({ actionName, readOnly });

  const [stateTagId, setStateTagId] = useState<number | null>(
    () => preselectedStateTagId ?? snapshot.stateTagId,
  );
  const [comments, setComments] = useState(snapshot.comments);
  const [overTime, setOverTime] = useState(
    () => emptyPermissionEditDraft(snapshot, { actionName }).overTime,
  );
  const [removedIndexes, setRemovedIndexes] = useState<number[]>([]);
  const [newFiles, setNewFiles] = useState<PermissionAttachment[]>([]);
  const [pickingFiles, setPickingFiles] = useState(false);
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const [stateSheetOpen, setStateSheetOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  /** El estado GUARDADO manda sobre qué transiciones se ofrecen. */
  const persistedDef = useMemo(
    () => resolveStateTagDefinition(permission, stateTags),
    [permission, stateTags],
  );
  const stateOptions = useMemo(
    () => allowedStateTags(persistedDef, stateTags),
    [persistedDef, stateTags],
  );

  const targetTag = useMemo<PermissionCatalogTag | null>(
    () =>
      stateTags.find((tag) => Number(tag.id) === Number(stateTagId)) ??
      (Number(persistedDef?.id) === Number(stateTagId) ? persistedDef : null),
    [stateTags, stateTagId, persistedDef],
  );
  const isRejection = isRejectionStateTag(targetTag);

  /**
   * Si el estado destino deja de ser rechazo/cancelación, el comentario
   * escrito para justificarlo no debe sobrevivir: se descarta volviendo al
   * valor guardado, para que no viaje en el payload con un estado al que ya
   * no aplica.
   */
  useEffect(() => {
    if (!isRejection) setComments(snapshot.comments);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr cuando isRejection cambia, no en cada tecla de `comments`
  }, [isRejection]);

  const draft = useMemo<PermissionEditDraft>(
    () => ({
      stateTagId,
      comments,
      overTime,
      newAttachments: newFiles.map((file) => file.dataUri),
      removedAttachmentIndexes: removedIndexes,
    }),
    [stateTagId, comments, overTime, newFiles, removedIndexes],
  );

  const justificationError = useMemo(
    () => rejectionJustificationError(targetTag, snapshot, draft),
    [targetTag, snapshot, draft],
  );

  const range = useMemo(() => getPermissionDayRange(permission), [permission]);
  const isFullDay = normalizePermissionName(actionName) === AUSENCIA_ACTION_NAME;
  const schedule = isFullDay
    ? "Todo el día"
    : permission.fromTime && permission.toTime
      ? `${formatDisplayTime(permission.fromTime)} — ${formatDisplayTime(permission.toTime)}`
      : "—";

  const newBytes = useMemo(
    () => newFiles.reduce((total, file) => total + file.dataUri.length, 0),
    [newFiles],
  );

  const toggleRemoved = useCallback((index: number) => {
    setRemovedIndexes((previous) =>
      previous.includes(index)
        ? previous.filter((value) => value !== index)
        : [...previous, index],
    );
  }, []);

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
      console.error("AdminPermissionEdit/pickFiles:", error?.message);
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
    const payload = buildPermissionEditPayload(snapshot, draft);
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    onSubmit(payload);
  }, [justificationError, snapshot, draft, onClose, onSubmit]);

  const stateColors = {
    backgroundColor: targetTag?.color || "#E2E8F0",
    color: targetTag?.fontColor || "#475569",
  };

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
        {/* ── Solicitante ── */}
        <View style={styles.card}>
          <Text style={styles.personName}>
            {permission.schoolUser?.user?.fullName || "—"}
          </Text>
          <Text style={styles.muted}>
            {[permission.actionTag?.name, permission.typeTag?.name]
              .filter(Boolean)
              .join(" · ") || "—"}
          </Text>
        </View>

        {/* ── Estado ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="flag-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Estado</Text>
          </View>
          <TouchableOpacity
            style={styles.select}
            onPress={() => setStateSheetOpen(true)}
            disabled={readOnly || stateOptions.length === 0}
            activeOpacity={0.75}
          >
            <View style={[styles.stateChip, { backgroundColor: stateColors.backgroundColor }]}>
              <Text style={[styles.stateChipText, { color: stateColors.color }]}>
                {targetTag?.name ?? permission.stateTag?.name ?? "—"}
              </Text>
            </View>
            <View style={styles.flex} />
            <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
          </TouchableOpacity>
          {isRejection && (
            <Text style={styles.helper}>
              Para rechazar o cancelar es obligatorio un comentario o un adjunto.
            </Text>
          )}
        </View>

        {/* ── Detalle: siempre solo lectura (el PATCH no acepta subject/description) ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Detalle</Text>
          </View>
          <Text style={styles.label}>Asunto</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={permission.subject ?? ""}
            editable={false}
            placeholder="—"
            placeholderTextColor="#9CA3AF"
          />
          <Text style={[styles.label, styles.labelSpaced]}>Motivo</Text>
          <TextInput
            style={[styles.input, styles.textarea, styles.inputDisabled]}
            value={permission.description ?? ""}
            editable={false}
            multiline
            textAlignVertical="top"
            placeholder="—"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* ── Día/s de permiso + Hr. Extras Pagas (misma tarjeta que el webapp) ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Día/s de permiso</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{range.isRange ? "Rango" : "Fecha"}</Text>
            <Text style={styles.infoValue}>
              {range.isRange
                ? `${formatDisplayDate(range.from)} — ${formatDisplayDate(range.to)}`
                : formatDisplayDate(range.from) || "—"}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Horario</Text>
            <Text style={styles.infoValue}>{schedule}</Text>
          </View>
          <View style={[styles.infoRow, styles.switchRow, styles.infoRowLast]}>
            <View style={styles.flex}>
              <Text style={styles.switchLabel}>Hr. Extras Pagas</Text>
              {isOvertimeAction(actionName) && (
                <Text style={styles.switchHint}>
                  La acción es de horas extras: siempre se pagan.
                </Text>
              )}
            </View>
            <Switch
              value={overTime}
              onValueChange={setOverTime}
              disabled={overTimeLocked || saving}
            />
          </View>
        </View>

        {/* ── Comentario: solo aplica a rechazo/cancelación ── */}
        {isRejection && (
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
                readOnly && styles.inputDisabled,
                showErrors && !!justificationError && styles.inputInvalid,
              ]}
              value={comments}
              onChangeText={setComments}
              editable={!readOnly}
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

        {/* ── Adjuntos ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="attach-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Adjuntos</Text>
          </View>

          {snapshot.attachments.map((path, index) => {
            const removed = removedIndexes.includes(index);
            return (
              <View
                key={`${path}-${index}`}
                style={[styles.fileRow, removed && styles.fileRowRemoved]}
              >
                <Ionicons
                  name="document-attach-outline"
                  size={16}
                  color={removed ? "#9CA3AF" : "#2563EB"}
                />
                <Text
                  style={[styles.fileName, removed && styles.fileNameRemoved]}
                  numberOfLines={1}
                >
                  {attachmentFileName(path)}
                </Text>
                {!readOnly && (
                  <TouchableOpacity onPress={() => toggleRemoved(index)} hitSlop={8}>
                    {removed ? (
                      <Text style={styles.undoText}>Deshacer</Text>
                    ) : (
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {newFiles.map((file) => (
            <View key={file.id} style={[styles.fileRow, styles.fileRowNew]}>
              <Ionicons name={getFileIcon(file.mimeType)} size={16} color="#15803D" />
              <Text style={styles.fileName} numberOfLines={1}>
                {file.name}
              </Text>
              {!!formatFileSize(file.size) && (
                <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
              )}
              <TouchableOpacity
                onPress={() =>
                  setNewFiles((previous) => previous.filter((item) => item.id !== file.id))
                }
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          ))}

          {!readOnly && (
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
          )}
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
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelText}>{readOnly ? "Cerrar" : "Cancelar"}</Text>
        </TouchableOpacity>
        {!readOnly && (
          <TouchableOpacity
            style={[styles.footerBtn, styles.saveBtn, saving && styles.saveBtnBusy]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveText}>Guardar</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

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
    inputDisabled: { backgroundColor: "#F3F4F6", color: "#6B7280" },
    inputInvalid: { borderColor: "#DC2626" },
    fieldError: { fontSize: font(12), color: "#DC2626", marginTop: verticalScale(4) },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: scale(12),
      paddingVertical: verticalScale(8),
      borderBottomWidth: 1,
      borderBottomColor: "#F3F4F6",
    },
    infoRowLast: { borderBottomWidth: 0 },
    infoLabel: { fontSize: font(12), color: "#6B7280", fontWeight: "600" },
    infoValue: { flex: 1, fontSize: font(13), color: "#111827", textAlign: "right" },
    switchRow: { alignItems: "center" },
    switchLabel: { fontSize: font(13), fontWeight: "700", color: "#111827" },
    switchHint: { fontSize: font(11), color: "#6B7280", marginTop: verticalScale(2) },
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
    fileRowRemoved: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
    fileRowNew: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
    fileName: { flex: 1, fontSize: font(13), color: "#374151" },
    fileNameRemoved: { color: "#9CA3AF", textDecorationLine: "line-through" },
    fileSize: { fontSize: font(11), color: "#6B7280" },
    undoText: { fontSize: font(12), fontWeight: "700", color: "#2563EB" },
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
    cancelBtn: { backgroundColor: "#F3F4F6" },
    cancelText: { fontSize: font(14), fontWeight: "700", color: "#374151" },
    saveBtn: { backgroundColor: "#2563EB" },
    saveBtnBusy: { opacity: 0.7 },
    saveText: { fontSize: font(14), fontWeight: "700", color: "#fff" },
  });
}
