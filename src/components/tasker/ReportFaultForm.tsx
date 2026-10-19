import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  APP_BACKGROUND_V2,
  CARD_BACKGROUND,
  DANGER_ICON,
  ERROR_COLOR,
  ICON_EDIT,
  INDIGO_TEXT,
  INDIGO_TINT_BACKGROUND,
  ON_PRIMARY,
  PRIMARY_700,
  PRIMARY_COLOR,
  PRIMARY_TINT_50,
  PRIMARY_TINT_BORDER,
  SECTION_ICON_COLOR,
  SUCCESS_COLOR,
  SUCCESS_TINT_BACKGROUND,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WARNING_TEXT_STRONG,
  WARNING_TINT_BACKGROUND,
} from "@/constants/colors";
import {
  MAX_CONTENT_WIDTH,
  RADIUS_PILL,
  RADIUS_SM,
  useResponsive,
} from "@/constants/responsive";
import { getTaskerFaultActions } from "@/constants/taskerMock";
import SectionIcon from "@/components/ui/SectionIcon";
import TagOptionSheet from "@/components/permissions/TagOptionSheet";
import TagMultiSelectSheet from "@/components/users/TagMultiSelectSheet";
import { MAX_PAYLOAD_BYTES } from "@/components/permissions/pickAttachments";
import {
  ADD_FILE_BTN,
  CARD_FORM,
  FIELD_SURFACE,
  FOOTER_BAR,
  FOOTER_BTN_CANCEL,
  FOOTER_BTN_SAVE,
} from "@/styles/surfaces";
import {
  addTaskerAddress,
  addTaskerComment,
  buildReportAddresses,
  filterFaultActionsForClient,
  formatSelectedFaultsSummary,
  getClientAddressHint,
  getRemovedFaultsNotice,
  getSelectedFaultNames,
  getTaskerAddressLines,
  getTaskerClientLabel,
  getTaskerFaultLabel,
  getTaskerFormRules,
  isTaskerCommentsOverPayloadLimit,
  pickNearestClientAddress,
  pruneSelectedFaults,
  removeTaskerAddress,
  removeTaskerComment,
  toggleTaskerAddressSelected,
  updateTaskerAddress,
  updateTaskerComment,
  validateReport,
} from "../../utils/taskerRules";
import { useSchoolStore } from "../../../store/useSchoolStore";
import type {
  TaskerAddress,
  TaskerComment,
  TaskerCommentAuthor,
  TaskerCommentDraft,
  TaskerCompanyConfig,
  TaskerReportAddress,
  TaskerReportErrors,
  TaskerUserClient,
} from "../../../types/typesTasker/TaskerTypes";
import { showPendingAction } from "./pendingAction";
import TaskerAddressModal from "./TaskerAddressModal";
import TaskerAddressSummary from "./TaskerAddressSummary";
import TaskerCommentsCard from "./TaskerCommentsCard";

type Styles = ReturnType<typeof createStyles>;

interface ReportFaultFormProps {
  config: TaskerCompanyConfig;
  /** Nunca vacío: ReportFaultGate no monta el formulario sin clientes. */
  clients: TaskerUserClient[];
  /** Posición del teléfono al abrir (decide la dirección más cercana). */
  coords: { latitude: number; longitude: number };
}

/** Cliente, dirección marcada y "Más cercana" de arranque (o tras Cancelar). */
function initialSelection(
  clients: TaskerUserClient[],
  coords: ReportFaultFormProps["coords"],
) {
  const nearest = pickNearestClientAddress(clients, coords);
  const client = clients.find((c) => c.id === nearest?.clientId) ?? clients[0];
  return { client, addresses: buildReportAddresses(client, [], nearest?.addressId ?? null) };
}

/**
 * Reportar (Tasker) — FASE B: con los datos de prueba de taskerMock.ts. Solo
 * se monta con la compañía conectada, clientes y la posición del teléfono
 * (ver ReportFaultGate). Comentarios (con sus imágenes y PDF) y direcciones
 * se agregan, editan, borran y marcan en local; solo el envío final llama a
 * showPendingAction().
 */
export default function ReportFaultForm({ config, clients, coords }: ReportFaultFormProps) {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const rules = useMemo(() => getTaskerFormRules(config), [config]);
  const faultLabel = getTaskerFaultLabel(config);
  // Fijo durante la vida de la pantalla: hoy viene del mock.
  const faultActions = useMemo(() => getTaskerFaultActions(), []);
  // "Reporta:" y autor de los comentarios: el usuario en sesión.
  const sessionUser = useSchoolStore((state) => state.user);
  const commentAuthor = useMemo<TaskerCommentAuthor>(
    () => ({ id: sessionUser?.user?.id ?? null, name: sessionUser?.user?.fullName ?? "Usuario" }),
    [sessionUser],
  );

  const [initial] = useState(() => initialSelection(clients, coords));
  const [clientId, setClientId] = useState<number>(initial.client.id);
  const client = clients.find((c) => c.id === clientId) ?? initial.client;
  const [faultIds, setFaultIds] = useState<number[]>([]);
  /** Averías que se quitaron en el último cambio de cliente (0 = sin aviso). */
  const [removedFaults, setRemovedFaults] = useState(0);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<TaskerReportErrors>({});
  const [clientSheetVisible, setClientSheetVisible] = useState(false);
  const [faultSheetVisible, setFaultSheetVisible] = useState(false);
  const [addresses, setAddresses] = useState<TaskerReportAddress[]>(initial.addresses);
  /** null = ventana cerrada; target null = dirección nueva. */
  const [addressEditor, setAddressEditor] = useState<{
    target: TaskerReportAddress | null;
  } | null>(null);
  const [comments, setComments] = useState<TaskerComment[]>([]);
  /** La tarjeta de comentarios lleva su formulario a la vista (y sobre el teclado). */
  const scrollRef = useRef<ScrollView>(null);

  const availableFaults = useMemo(
    () => filterFaultActionsForClient(faultActions, client),
    [faultActions, client],
  );
  const faultOptions = useMemo(
    () => availableFaults.map((a) => ({ id: a.id, name: a.name })),
    [availableFaults],
  );
  const faultsSummary = formatSelectedFaultsSummary(getSelectedFaultNames(faultIds, faultActions));
  /** Recomendada del cliente elegido según la posición del teléfono. */
  const recommended = useMemo(() => pickNearestClientAddress([client], coords), [client, coords]);
  /** "Más cercana" en Direcciones; sin coordenadas en sus direcciones, ninguna. */
  const nearestAddressId = recommended?.distanceMeters != null ? recommended.addressId : null;
  /** Línea bajo el cliente: la dirección marcada, con su distancia. */
  const addressHint = getClientAddressHint(addresses, recommended, coords);
  const addressHintLines = addressHint ? getTaskerAddressLines(addressHint.address) : null;
  const clientLabel = getTaskerClientLabel(config);
  const removedFaultsNotice = getRemovedFaultsNotice(removedFaults);
  const clientOptions = useMemo(() => clients.map((c) => ({ id: c.id, name: c.name })), [clients]);

  const clearError = useCallback((key: keyof TaskerReportErrors) => {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const handleDescriptionChange = useCallback(
    (text: string) => {
      setDescription(text);
      clearError("description");
    },
    [clearError],
  );

  /** Cada toque en la hoja se aplica al momento: cerrarla (Listo o fuera) conserva lo marcado. */
  const handleFaultsChange = useCallback(
    (ids: number[]) => {
      setFaultIds(ids);
      setRemovedFaults(0);
      clearError("faults");
    },
    [clearError],
  );

  /**
   * Otro cliente: sus direcciones con la más cercana marcada (o la primera),
   * las agregadas por el usuario se conservan y se quitan las averías que ya
   * no le aplican (con aviso de cuántas).
   */
  const handleSelectClient = useCallback(
    (nextId: number) => {
      setClientSheetVisible(false);
      if (nextId === clientId) return;
      const next = clients.find((c) => c.id === nextId);
      if (!next) return;
      const nearest = pickNearestClientAddress([next], coords);
      setClientId(next.id);
      setAddresses((prev) => buildReportAddresses(next, prev, nearest?.addressId ?? null));
      const kept = pruneSelectedFaults(faultIds, filterFaultActionsForClient(faultActions, next));
      setFaultIds(kept);
      setRemovedFaults(faultIds.length - kept.length);
      clearError("address");
    },
    [clientId, clients, coords, faultActions, faultIds, clearError],
  );

  const handleAddressSelected = useCallback(
    (built: TaskerAddress) => {
      const target = addressEditor?.target ?? null;
      setAddresses((prev) =>
        target
          ? updateTaskerAddress(prev, {
              ...built,
              id: target.id,
              order: target.order,
              selected: target.selected,
              locked: false,
              fromClient: target.fromClient,
            })
          : addTaskerAddress(prev, built),
      );
      if (!target) clearError("address");
      setAddressEditor(null);
    },
    [addressEditor, clearError],
  );

  const handleRemoveAddress = useCallback((address: TaskerReportAddress) => {
    Alert.alert("Confirmar Eliminar", `Está seguro que desea eliminar la Dirección ${address.order}`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => setAddresses((prev) => removeTaskerAddress(prev, address.id)),
      },
    ]);
  }, []);

  const handleToggleAddress = useCallback(
    (id: number) => {
      setAddresses((prev) => toggleTaskerAddressSelected(prev, id));
      clearError("address");
    },
    [clearError],
  );

  const handleAddComment = useCallback(
    (draft: TaskerCommentDraft) => {
      setComments((prev) => addTaskerComment(prev, draft, commentAuthor, new Date()));
    },
    [commentAuthor],
  );

  const handleEditComment = useCallback((id: number, draft: TaskerCommentDraft) => {
    setComments((prev) => updateTaskerComment(prev, id, draft));
  }, []);

  const handleRemoveComment = useCallback((id: number) => {
    setComments((prev) => removeTaskerComment(prev, id));
  }, []);

  const handleCancel = useCallback(() => {
    setClientId(initial.client.id);
    setFaultIds([]);
    setRemovedFaults(0);
    setDescription("");
    setComments([]);
    setAddresses(initial.addresses);
    setErrors({});
  }, [initial]);

  const handleSubmit = useCallback(() => {
    const result = validateReport({ faultIds, description, addresses }, rules);
    setErrors(result);
    if (Object.values(result).some(Boolean)) return;
    // Un solo envío: el tope suma los adjuntos de todos los comentarios.
    if (isTaskerCommentsOverPayloadLimit(comments, MAX_PAYLOAD_BYTES)) {
      Alert.alert(
        "Adjuntos",
        "Los adjuntos de los comentarios superan el límite total de 20MB. Quita alguno para enviar.",
      );
      return;
    }
    // TODO(puente): enviar el reporte a Tasker como una tarea nueva:
    //   - quién reporta: el usuario en sesión (commentAuthor.name / id);
    //   - averías elegidas (faultIds) → acciones de la tarea;
    //   - descripción → info de la tarea;
    //   - cliente elegido (client.id) y la dirección marcada
    //     (getSelectedTaskerAddress(addresses));
    //   - direcciones agregadas por el usuario (fromClient: false) y las del
    //     cliente editadas o quitadas: solo en la tarea, nunca se guardan en
    //     el cliente;
    //   - cada comentario como un elemento de taskComments ({ comment, images }),
    //     con comment "" si solo trae adjuntos.
    showPendingAction();
  }, [faultIds, description, addresses, rules, comments]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Averías (selección múltiple, filtradas por el cliente) ── */}
        {rules.showFaults && (
          <View style={styles.card}>
            <CardHeader
              styles={styles}
              tone="violet"
              icon="construct-outline"
              title={faultLabel}
              required={rules.faultsRequired}
            />
            <TouchableOpacity
              style={[styles.select, !!errors.faults && styles.fieldInvalid]}
              onPress={() => setFaultSheetVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`${faultLabel}: ${faultsSummary ?? "ninguna elegida"}`}
              activeOpacity={0.75}
            >
              <Text
                style={faultsSummary ? styles.selectValue : styles.selectPlaceholder}
                numberOfLines={2}
              >
                {faultsSummary ?? "Seleccionar averías"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={TEXT_PLACEHOLDER} />
            </TouchableOpacity>
            {!!errors.faults && <Text style={styles.fieldError}>{errors.faults}</Text>}
            {removedFaultsNotice && (
              <View style={styles.noticeRow} accessibilityLiveRegion="polite">
                <Ionicons name="information-circle-outline" size={16} color={WARNING_TEXT_STRONG} />
                <Text style={styles.noticeText}>{removedFaultsNotice}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Descripción ── */}
        <View style={styles.card}>
          <CardHeader
            styles={styles}
            tone="blue"
            icon="document-text-outline"
            title="Descripción"
          />
          <Text style={styles.label}>
            Detalle(s)
            {rules.descriptionRequired && <Text style={styles.required}> *</Text>}
          </Text>
          <TextInput
            style={[styles.textarea, !!errors.description && styles.fieldInvalid]}
            value={description}
            onChangeText={handleDescriptionChange}
            multiline
            textAlignVertical="top"
          />
          {!!errors.description && (
            <Text style={styles.fieldError}>{errors.description}</Text>
          )}
        </View>

        {/* ── Comentarios: texto, imágenes/PDF o ambos (todos del usuario en sesión: editables) ── */}
        <TaskerCommentsCard
          comments={comments}
          canEdit={() => true}
          onAdd={handleAddComment}
          onEdit={handleEditComment}
          onDelete={handleRemoveComment}
          sharedAttachmentLimit
          scrollRef={scrollRef}
        />

        {/* ── Cliente: fijo con uno solo; con 2 o más, selector ── */}
        <View style={styles.card}>
          <CardHeader styles={styles} tone="blue" icon="business-outline" title={clientLabel} />
          {clients.length > 1 ? (
            <TouchableOpacity
              style={styles.select}
              onPress={() => setClientSheetVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`${clientLabel}: ${client.name}. Cambiar`}
              activeOpacity={0.75}
            >
              <Text style={styles.selectValue} numberOfLines={1}>
                {client.name}
              </Text>
              <Ionicons name="chevron-down" size={16} color={TEXT_PLACEHOLDER} />
            </TouchableOpacity>
          ) : (
            <Text style={styles.clientName}>{client.name}</Text>
          )}
          {addressHint && addressHintLines && (
            <View style={styles.hintRow}>
              <Ionicons
                name="location-outline"
                size={18}
                color={addressHint.caption === "Más cercana" ? SUCCESS_COLOR : PRIMARY_700}
              />
              <View style={styles.hintBody}>
                <Text
                  style={[
                    styles.hintCaption,
                    addressHint.caption === "Más cercana" && styles.hintCaptionNearest,
                  ]}
                >
                  {addressHint.caption}
                </Text>
                <Text style={styles.hintTitle} numberOfLines={1}>
                  {addressHintLines.title || addressHintLines.streetLine}
                  {!!addressHint.distanceLabel && (
                    <Text style={styles.hintDistance}> · {addressHint.distanceLabel}</Text>
                  )}
                </Text>
                {!!addressHintLines.title && !!addressHintLines.streetLine && (
                  <Text style={styles.hintStreet} numberOfLines={1}>
                    {addressHintLines.streetLine}
                  </Text>
                )}
              </View>
            </View>
          )}
          <View style={styles.reporterRow}>
            <Ionicons name="person-outline" size={14} color={TEXT_MUTED} />
            <Text style={styles.reporterText}>
              Reporta: <Text style={styles.reporterName}>{commentAuthor.name}</Text>
            </Text>
          </View>
        </View>

        {/* ── Direcciones: las del cliente (la predeterminada solo se elige) + las agregadas ── */}
        <View style={styles.card}>
          <CardHeader
            styles={styles}
            tone="teal"
            icon="location-outline"
            title={`Direcciones (${addresses.length})`}
          />
          {/* EXCEPCIÓN E3: Tasker reordena arrastrando las filas; aquí no (falta la librería). */}
          {addresses.map((address) => (
            <AddressRow
              key={address.id}
              address={address}
              nearest={address.fromClient && address.id === nearestAddressId}
              styles={styles}
              onEdit={() => setAddressEditor({ target: address })}
              onRemove={() => handleRemoveAddress(address)}
              onToggleSelected={() => handleToggleAddress(address.id)}
            />
          ))}
          {!!errors.address && <Text style={styles.fieldError}>{errors.address}</Text>}
          <TouchableOpacity
            style={[styles.addBtn, addresses.length > 0 && styles.addBtnSpaced]}
            onPress={() => setAddressEditor({ target: null })}
            activeOpacity={0.75}
          >
            <Ionicons name="add-circle-outline" size={18} color={PRIMARY_700} />
            <Text style={styles.addBtnText}>Agregar dirección</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Barra inferior fija ── */}
      <View style={styles.footer}>
        <View style={[styles.footerRow, isTablet && styles.contentTablet]}>
          <TouchableOpacity
            style={[styles.footerBtn, styles.cancelBtn]}
            onPress={handleCancel}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerBtn, styles.saveBtn]}
            onPress={handleSubmit}
            activeOpacity={0.8}
          >
            <Ionicons name="send-outline" size={18} color={ON_PRIMARY} />
            <Text style={styles.saveText}>Guardar y enviar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TagMultiSelectSheet
        visible={faultSheetVisible}
        title={faultLabel}
        options={faultOptions}
        selectedIds={faultIds}
        emptyText="Sin opciones para este cliente"
        onChange={handleFaultsChange}
        onClose={() => setFaultSheetVisible(false)}
      />

      <TagOptionSheet
        visible={clientSheetVisible}
        title={clientLabel}
        options={clientOptions}
        selectedId={clientId}
        hideColorDot
        onSelect={(option) => option.id != null && handleSelectClient(option.id)}
        onClose={() => setClientSheetVisible(false)}
      />

      <TaskerAddressModal
        visible={addressEditor !== null}
        address={addressEditor?.target ?? null}
        onClose={() => setAddressEditor(null)}
        onSelect={handleAddressSelected}
      />
    </KeyboardAvoidingView>
  );
}

interface CardHeaderProps {
  styles: Styles;
  tone: React.ComponentProps<typeof SectionIcon>["tone"];
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Asterisco rojo después del título. */
  required?: boolean;
  /** Contenido a la derecha del título (chip, botones). */
  children?: React.ReactNode;
}

function CardHeader({ styles, tone, icon, title, required, children }: CardHeaderProps) {
  return (
    <View style={styles.cardHeader}>
      <SectionIcon tone={tone}>
        <Ionicons name={icon} size={18} color={SECTION_ICON_COLOR} />
      </SectionIcon>
      <Text style={styles.cardTitle}>
        {title}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

interface AddressRowProps {
  address: TaskerReportAddress;
  /** Etiqueta "Más cercana" (solo direcciones del cliente con coordenadas). */
  nearest: boolean;
  styles: Styles;
  onEdit: () => void;
  onRemove: () => void;
  onToggleSelected: () => void;
}

/**
 * La predeterminada del cliente (locked) solo se elige: sin lápiz ni papelera
 * y con la etiqueta "Predeterminada". Las demás del cliente y las agregadas se
 * editan y borran (solo en este reporte).
 */
function AddressRow({
  address,
  nearest,
  styles,
  onEdit,
  onRemove,
  onToggleSelected,
}: AddressRowProps) {
  return (
    <TaskerAddressSummary
      address={address}
      style={styles.addressRow}
      actions={
        address.locked ? undefined : (
          <>
            <TouchableOpacity
              style={styles.addressBtn}
              onPress={onEdit}
              accessibilityLabel="Editar dirección"
              activeOpacity={0.75}
            >
              <Ionicons name="create-outline" size={18} color={ICON_EDIT} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addressBtn}
              onPress={onRemove}
              accessibilityLabel="Eliminar dirección"
              activeOpacity={0.75}
            >
              <Ionicons name="trash-outline" size={18} color={DANGER_ICON} />
            </TouchableOpacity>
          </>
        )
      }
    >
      <View style={styles.addressChips}>
        <TouchableOpacity
          style={[styles.selectAddressBtn, address.selected && styles.selectAddressBtnActive]}
          onPress={onToggleSelected}
          accessibilityState={{ selected: address.selected }}
          activeOpacity={0.75}
        >
          <Ionicons
            name={address.selected ? "checkmark-circle" : "ellipse-outline"}
            size={16}
            color={address.selected ? ON_PRIMARY : PRIMARY_700}
          />
          <Text
            style={[
              styles.selectAddressText,
              address.selected && styles.selectAddressTextActive,
            ]}
          >
            {address.selected ? "Seleccionada" : "Seleccionar"}
          </Text>
        </TouchableOpacity>
        {address.locked && (
          <View style={styles.defaultChip}>
            <Ionicons name="lock-closed-outline" size={12} color={INDIGO_TEXT} />
            <Text style={styles.defaultChipText}>Predeterminada</Text>
          </View>
        )}
        {nearest && (
          <View style={styles.nearestChip}>
            <Ionicons name="navigate-outline" size={12} color={SUCCESS_COLOR} />
            <Text style={styles.nearestChipText}>Más cercana</Text>
          </View>
        )}
      </View>
    </TaskerAddressSummary>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: APP_BACKGROUND_V2 },
    flex: { flex: 1 },
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
      gap: scale(8),
      marginBottom: verticalScale(14),
    },
    cardTitle: { flex: 1, fontSize: font(15), fontWeight: "700", color: TEXT_PRIMARY },
    label: {
      fontSize: font(12),
      fontWeight: "600",
      color: TEXT_SECONDARY,
      marginBottom: verticalScale(6),
    },
    required: { color: ERROR_COLOR },
    select: {
      ...FIELD_SURFACE,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      minHeight: verticalScale(48),
      paddingHorizontal: scale(12),
    },
    selectValue: { flex: 1, fontSize: font(14), color: TEXT_PRIMARY },
    selectPlaceholder: { flex: 1, fontSize: font(14), color: TEXT_PLACEHOLDER },
    noticeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: scale(6),
      marginTop: verticalScale(8),
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(8),
      borderRadius: RADIUS_SM,
      backgroundColor: WARNING_TINT_BACKGROUND,
    },
    noticeText: { flex: 1, fontSize: font(12), lineHeight: font(17), color: WARNING_TEXT_STRONG },
    textarea: {
      ...FIELD_SURFACE,
      minHeight: verticalScale(96),
      padding: scale(12),
      fontSize: font(14),
      lineHeight: font(20),
      color: TEXT_PRIMARY,
    },
    fieldInvalid: { borderColor: ERROR_COLOR },
    fieldError: { fontSize: font(12), color: ERROR_COLOR, marginTop: verticalScale(4) },
    addBtn: {
      ...ADD_FILE_BTN,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      minHeight: verticalScale(48),
    },
    addBtnSpaced: { marginTop: verticalScale(12) },
    addBtnText: { fontSize: font(14), fontWeight: "600", color: PRIMARY_700 },
    clientName: { fontSize: font(16), fontWeight: "700", color: TEXT_PRIMARY },
    hintRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: scale(8),
      marginTop: verticalScale(10),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      borderRadius: RADIUS_SM,
      backgroundColor: PRIMARY_TINT_50,
    },
    hintBody: { flex: 1 },
    hintCaption: { fontSize: font(11), fontWeight: "700", color: PRIMARY_700 },
    hintCaptionNearest: { color: SUCCESS_COLOR },
    hintTitle: {
      fontSize: font(14),
      fontWeight: "600",
      color: TEXT_PRIMARY,
      marginTop: verticalScale(2),
    },
    hintDistance: { fontWeight: "400", color: TEXT_MUTED },
    hintStreet: { fontSize: font(12), color: TEXT_MUTED, marginTop: verticalScale(1) },
    reporterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      marginTop: verticalScale(8),
    },
    reporterText: { fontSize: font(13), color: TEXT_MUTED },
    reporterName: { fontWeight: "600", color: TEXT_SECONDARY },
    // El resto de la fila vive en TaskerAddressSummary.
    addressRow: { marginBottom: verticalScale(8) },
    addressChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: scale(8),
      marginTop: verticalScale(10),
    },
    selectAddressBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(6),
      borderRadius: RADIUS_PILL,
      borderWidth: 1,
      borderColor: PRIMARY_TINT_BORDER,
      backgroundColor: PRIMARY_TINT_50,
    },
    selectAddressBtnActive: { borderColor: PRIMARY_COLOR, backgroundColor: PRIMARY_COLOR },
    selectAddressText: { fontSize: font(12), fontWeight: "700", color: PRIMARY_700 },
    selectAddressTextActive: { color: ON_PRIMARY },
    nearestChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(4),
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(4),
      borderRadius: RADIUS_PILL,
      backgroundColor: SUCCESS_TINT_BACKGROUND,
    },
    defaultChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(4),
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(4),
      borderRadius: RADIUS_PILL,
      backgroundColor: INDIGO_TINT_BACKGROUND,
    },
    defaultChipText: { fontSize: font(11), fontWeight: "700", color: INDIGO_TEXT },
    nearestChipText: { fontSize: font(11), fontWeight: "700", color: SUCCESS_COLOR },
    // Botón de ícono cuadrado: 36×36 fijo (área táctil del ícono).
    addressBtn: {
      width: 36,
      height: 36,
      borderRadius: RADIUS_SM,
      backgroundColor: CARD_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
    },
    footer: {
      ...FOOTER_BAR,
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(12),
    },
    footerRow: { flexDirection: "row", gap: scale(10) },
    footerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      minHeight: verticalScale(48),
    },
    cancelBtn: { ...FOOTER_BTN_CANCEL, flex: 1 },
    cancelText: { fontSize: font(15), fontWeight: "600", color: TEXT_SECONDARY },
    saveBtn: { ...FOOTER_BTN_SAVE, flex: 2 },
    saveText: { fontSize: font(15), fontWeight: "700", color: ON_PRIMARY },
  });
}
