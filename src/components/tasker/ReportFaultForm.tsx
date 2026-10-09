import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
  ICON_VIEW,
  ON_PRIMARY,
  PRIMARY_700,
  PRIMARY_COLOR,
  PRIMARY_TINT_50,
  PRIMARY_TINT_BACKGROUND,
  PRIMARY_TINT_BORDER,
  SECTION_ICON_COLOR,
  TAG_DOT_FALLBACK,
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
import { getTaskerReportContext, getTaskerTypeTags } from "@/constants/taskerMock";
import ImageViewerModal from "@/components/ui/ImageViewerModal";
import SectionIcon from "@/components/ui/SectionIcon";
import TagOptionSheet from "@/components/permissions/TagOptionSheet";
import {
  ADD_FILE_BTN,
  CARD_FORM,
  FIELD_SURFACE,
  FILE_ROW,
  FOOTER_BAR,
  FOOTER_BTN_CANCEL,
  FOOTER_BTN_SAVE,
  ROW_ACTION_BTN,
  THUMB_TILE,
} from "@/styles/surfaces";
import {
  addTaskerAddress,
  buildMapsUrl,
  getTagChipTone,
  removeTaskerAddress,
  resolveTaskerReportConfig,
  toggleTaskerAddressSelected,
  updateTaskerAddress,
  validateReport,
} from "../../utils/taskerRules";
import { useSchoolStore } from "../../../store/useSchoolStore";
import type {
  TaskerAddress,
  TaskerAttachment,
  TaskerReportAddress,
  TaskerReportErrors,
} from "../../../types/typesTasker/TaskerTypes";
import { showPendingAction } from "./pendingAction";
import TaskerAddressModal from "./TaskerAddressModal";
import { useTaskerAttachmentPicker } from "./useTaskerAttachmentPicker";

type Styles = ReturnType<typeof createStyles>;

/**
 * Reportar Avería (Tasker) — FASE B: con los datos fijos de taskerMock.ts.
 * Adjuntos y direcciones se agregan, editan, borran y marcan en local; solo
 * el envío final llama a showPendingAction().
 */
export default function ReportFaultForm() {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  // Config de la compañía (school.settings); sin las claves, los respaldos.
  const companySettings = useSchoolStore((state) => state.companySettings);
  const config = useMemo(() => resolveTaskerReportConfig(companySettings), [companySettings]);
  // Fijos durante la vida de la pantalla: hoy vienen del mock.
  const typeTags = useMemo(() => getTaskerTypeTags(), []);
  const context = useMemo(() => getTaskerReportContext(), []);

  const [typeId, setTypeId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<TaskerAttachment[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [errors, setErrors] = useState<TaskerReportErrors>({});
  const [typeSheetVisible, setTypeSheetVisible] = useState(false);
  const [addresses, setAddresses] = useState<TaskerReportAddress[]>(context.addresses);
  /** null = ventana cerrada; target null = dirección nueva. */
  const [addressEditor, setAddressEditor] = useState<{
    target: TaskerReportAddress | null;
  } | null>(null);

  const selectedType = typeTags.find((t) => t.id === typeId) ?? null;

  const handleDescriptionChange = useCallback((text: string) => {
    setDescription(text);
    setErrors((prev) => (prev.description ? { ...prev, description: undefined } : prev));
  }, []);

  const handleAddAttachments = useCallback((added: TaskerAttachment[]) => {
    setAttachments((prev) => [...prev, ...added]);
  }, []);
  const picker = useTaskerAttachmentPicker(attachments, handleAddAttachments);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

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
            })
          : addTaskerAddress(prev, built),
      );
      setAddressEditor(null);
    },
    [addressEditor],
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

  const handleToggleAddress = useCallback((id: number) => {
    setAddresses((prev) => toggleTaskerAddressSelected(prev, id));
  }, []);

  const handleCancel = useCallback(() => {
    setTypeId(null);
    setDescription("");
    setAttachments([]);
    setAddresses(context.addresses);
    setErrors({});
  }, [context.addresses]);

  const handleSubmit = useCallback(() => {
    const result = validateReport({ typeId, description }, config);
    setErrors(result);
    // TODO(puente): enviar el reporte (tipo, descripción, adjuntos y direcciones).
    if (Object.keys(result).length === 0) showPendingAction();
  }, [typeId, description, config]);

  const clientTone = getTagChipTone(0);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Servicio ── */}
        <View style={styles.card}>
          <CardHeader
            styles={styles}
            tone="violet"
            icon="construct-outline"
            title={config.serviceNameLabel}
          />
          <Text style={styles.label}>
            Tipo <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={[styles.select, !!errors.typeId && styles.fieldInvalid]}
            onPress={() => setTypeSheetVisible(true)}
            activeOpacity={0.75}
          >
            {selectedType && (
              <View
                style={[
                  styles.typeDot,
                  { backgroundColor: selectedType.color || TAG_DOT_FALLBACK },
                ]}
              />
            )}
            <Text
              style={selectedType ? styles.selectValue : styles.selectPlaceholder}
              numberOfLines={1}
            >
              {selectedType?.name ?? "Seleccione un tipo"}
            </Text>
            <Ionicons name="chevron-down" size={16} color={TEXT_PLACEHOLDER} />
          </TouchableOpacity>
          {!!errors.typeId && <Text style={styles.fieldError}>{errors.typeId}</Text>}
        </View>

        {/* ── Descripción ── */}
        <View style={styles.card}>
          <CardHeader
            styles={styles}
            tone="blue"
            icon="document-text-outline"
            title="Descripción"
          />
          <Text style={styles.label}>
            Descripción
            {config.isDescriptionRequired && <Text style={styles.required}> *</Text>}
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

        {/* ── Imágenes ── */}
        <View style={styles.card}>
          <CardHeader styles={styles} tone="amber" icon="images-outline" title="Imágenes">
            {attachments.length > 0 && (
              <View style={styles.countChip}>
                <Text style={styles.countChipText}>
                  {attachments.length} {attachments.length === 1 ? "archivo" : "archivos"}
                </Text>
              </View>
            )}
          </CardHeader>
          {attachments.length > 0 && (
            <View style={styles.thumbGrid}>
              {attachments.map((file) => (
                <AttachmentTile
                  key={file.id}
                  file={file}
                  styles={styles}
                  onOpen={setViewerUri}
                  onRemove={handleRemoveAttachment}
                />
              ))}
            </View>
          )}
          <TouchableOpacity
            style={[styles.addBtn, attachments.length > 0 && styles.addBtnSpaced]}
            onPress={picker.openPicker}
            disabled={picker.busy}
            activeOpacity={0.75}
          >
            {picker.busy ? (
              <ActivityIndicator size="small" color={PRIMARY_700} />
            ) : (
              <Ionicons name="camera-outline" size={18} color={PRIMARY_700} />
            )}
            <Text style={styles.addBtnText}>Tomar foto o adjuntar archivo</Text>
          </TouchableOpacity>
          <Text style={styles.helper}>Imágenes o PDF.</Text>
        </View>

        {/* ── Cliente (solo lectura) ── */}
        <View style={styles.card}>
          <CardHeader styles={styles} tone="blue" icon="business-outline" title="Cliente" />
          <View style={styles.clientRow}>
            <Text style={styles.clientName}>{context.client.name}</Text>
            <View style={[styles.tagChip, { backgroundColor: clientTone.background }]}>
              <Text style={[styles.tagChipText, { color: clientTone.text }]}>
                {context.client.typeName}
              </Text>
            </View>
          </View>
          <View style={styles.reporterRow}>
            <Ionicons name="person-outline" size={14} color={TEXT_MUTED} />
            <Text style={styles.reporterText}>
              Reporta: <Text style={styles.reporterName}>{context.reporter.name}</Text>
            </Text>
          </View>
        </View>

        {/* ── Direcciones ── */}
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
              styles={styles}
              onEdit={() => setAddressEditor({ target: address })}
              onRemove={() => handleRemoveAddress(address)}
              onToggleSelected={() => handleToggleAddress(address.id)}
            />
          ))}
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

      <TagOptionSheet
        visible={typeSheetVisible}
        title="Tipo"
        options={typeTags}
        selectedId={typeId}
        onSelect={(tag) => {
          setTypeId(tag.id ?? null);
          setErrors((prev) => (prev.typeId ? { ...prev, typeId: undefined } : prev));
          setTypeSheetVisible(false);
        }}
        onClose={() => setTypeSheetVisible(false)}
      />

      <TaskerAddressModal
        visible={addressEditor !== null}
        address={addressEditor?.target ?? null}
        onClose={() => setAddressEditor(null)}
        onSelect={handleAddressSelected}
      />

      <ImageViewerModal uri={viewerUri} onClose={() => setViewerUri(null)} />
    </KeyboardAvoidingView>
  );
}

interface CardHeaderProps {
  styles: Styles;
  tone: React.ComponentProps<typeof SectionIcon>["tone"];
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Contenido a la derecha del título (chip, botones). */
  children?: React.ReactNode;
}

function CardHeader({ styles, tone, icon, title, children }: CardHeaderProps) {
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

interface AttachmentTileProps {
  file: TaskerAttachment;
  styles: Styles;
  /** Abre la imagen en el visor (los PDF no se abren). */
  onOpen: (uri: string) => void;
  onRemove: (id: string) => void;
}

function AttachmentTile({ file, styles, onOpen, onRemove }: AttachmentTileProps) {
  const isImage = file.mimeType.startsWith("image/");
  return (
    <View style={styles.thumbTile}>
      {isImage ? (
        <TouchableOpacity
          style={styles.thumbPreview}
          onPress={() => onOpen(file.dataUri)}
          accessibilityLabel={`Ver ${file.name}`}
          activeOpacity={0.8}
        >
          <Image source={{ uri: file.dataUri }} style={styles.thumbImage} resizeMode="cover" />
        </TouchableOpacity>
      ) : (
        <View style={styles.thumbPreview}>
          <Ionicons name="document-outline" size={26} color={PRIMARY_700} />
          <Text style={styles.thumbLabel}>PDF</Text>
        </View>
      )}
      <View style={styles.thumbFooter}>
        <Text style={styles.thumbName} numberOfLines={1}>
          {file.name}
        </Text>
        <TouchableOpacity
          style={styles.thumbRemove}
          onPress={() => onRemove(file.id)}
          accessibilityLabel={`Quitar ${file.name}`}
          activeOpacity={0.75}
        >
          <Ionicons name="trash-outline" size={16} color={DANGER_ICON} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface AddressRowProps {
  address: TaskerReportAddress;
  styles: Styles;
  onEdit: () => void;
  onRemove: () => void;
  onToggleSelected: () => void;
}

function AddressRow({ address, styles, onEdit, onRemove, onToggleSelected }: AddressRowProps) {
  const streetLine = [address.street, address.streetNumber && `#${address.streetNumber}`]
    .filter(Boolean)
    .join(" ");
  const areaLine = [address.sector, address.city, address.province].filter(Boolean).join(", ");
  const hasCoords =
    address.latitude != null &&
    address.latitude !== "" &&
    address.longitude != null &&
    address.longitude !== "";

  const openMap = () => {
    if (!hasCoords) return;
    Linking.openURL(buildMapsUrl(address.latitude!, address.longitude!)).catch(
      () => undefined,
    );
  };

  return (
    <View style={styles.addressRow}>
      <View style={styles.addressBody}>
        <Text style={styles.addressTitle}>{address.title}</Text>
        {!!streetLine && <Text style={styles.addressStreet}>{streetLine}</Text>}
        {!!areaLine && <Text style={styles.addressArea}>{areaLine}</Text>}
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
      </View>
      <View style={styles.addressActions}>
        {/* Sin coordenadas no hay qué abrir: deshabilitado y atenuado (no es una acción pendiente). */}
        <TouchableOpacity
          style={[styles.addressBtn, !hasCoords && styles.addressBtnDisabled]}
          onPress={openMap}
          disabled={!hasCoords}
          accessibilityLabel="Ver dirección en el mapa"
          accessibilityState={{ disabled: !hasCoords }}
          activeOpacity={0.75}
        >
          <Ionicons name="map-outline" size={18} color={ICON_VIEW} />
        </TouchableOpacity>
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
      </View>
    </View>
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
    // Punto de color del tipo: 10×10 fijo, igual que en el mockup.
    typeDot: { width: 10, height: 10, borderRadius: RADIUS_PILL },
    selectValue: { flex: 1, fontSize: font(14), color: TEXT_PRIMARY },
    selectPlaceholder: { flex: 1, fontSize: font(14), color: TEXT_PLACEHOLDER },
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
    countChip: {
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(3),
      borderRadius: RADIUS_PILL,
      backgroundColor: WARNING_TINT_BACKGROUND,
    },
    countChipText: { fontSize: font(11), fontWeight: "700", color: WARNING_TEXT_STRONG },
    // Dos columnas: cada tile ocupa 48% y space-between deja el hueco.
    thumbGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: verticalScale(10),
    },
    thumbTile: { ...THUMB_TILE, width: "48%", padding: scale(6) },
    thumbPreview: {
      height: verticalScale(104),
      borderRadius: RADIUS_SM,
      backgroundColor: PRIMARY_TINT_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
      gap: verticalScale(4),
    },
    thumbImage: { width: "100%", height: "100%", borderRadius: RADIUS_SM },
    thumbLabel: { fontSize: font(11), fontWeight: "600", color: PRIMARY_700 },
    thumbFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(4),
      marginTop: verticalScale(6),
    },
    thumbName: { flex: 1, fontSize: font(12), fontWeight: "600", color: TEXT_SECONDARY },
    // Botón de ícono cuadrado: 32×32 fijo (área táctil del ícono).
    thumbRemove: {
      ...ROW_ACTION_BTN,
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },
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
    helper: { fontSize: font(12), color: TEXT_MUTED, marginTop: verticalScale(8) },
    clientRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: scale(8),
    },
    clientName: { flexShrink: 1, fontSize: font(16), fontWeight: "700", color: TEXT_PRIMARY },
    tagChip: {
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(3),
      borderRadius: RADIUS_PILL,
    },
    tagChipText: { fontSize: font(11), fontWeight: "700" },
    reporterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      marginTop: verticalScale(8),
    },
    reporterText: { fontSize: font(13), color: TEXT_MUTED },
    reporterName: { fontWeight: "600", color: TEXT_SECONDARY },
    addressRow: {
      ...FILE_ROW,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: scale(10),
      padding: scale(12),
      marginBottom: verticalScale(8),
    },
    addressBody: { flex: 1 },
    addressTitle: { fontSize: font(14), fontWeight: "700", color: TEXT_PRIMARY },
    addressStreet: {
      marginTop: verticalScale(2),
      fontSize: font(13),
      lineHeight: font(18),
      color: TEXT_SECONDARY,
    },
    addressArea: { fontSize: font(13), lineHeight: font(18), color: TEXT_MUTED },
    selectAddressBtn: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: scale(6),
      marginTop: verticalScale(10),
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
    addressActions: { flexDirection: "row", gap: scale(6) },
    // Botón de ícono cuadrado: 36×36 fijo (área táctil del ícono).
    addressBtn: {
      width: 36,
      height: 36,
      borderRadius: RADIUS_SM,
      backgroundColor: CARD_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
    },
    addressBtnDisabled: { opacity: 0.4 },
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
