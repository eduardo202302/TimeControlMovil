import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { APP_BACKGROUND } from "@/constants/colors";
import {
  RADIUS_2XL,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  useResponsive,
} from "@/constants/responsive";
import {
  attachmentFileName,
  buildAttachmentUri,
  getPermissionDayRange,
  isImageAttachment,
  permissionDateKey,
  type MyPermission,
  type PermissionTagRef,
} from "../../utils/permissionRules";
import { readOverTime } from "../../utils/adminPermissionRules";
import { normalizePermissionName, toRD } from "../../utils/punchRules";
import { formatDisplayDate, formatDisplayTime } from "../timeoff/RevisionFinalModal";

const AUSENCIA_ACTION_NAME = "ausencia";
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

/**
 * Sello de auditoría (createdDate / updatedDate) → "DD/MM/AAAA h:mm a.m." en
 * hora RD. A diferencia de `permissionDate`, estos SÍ son instantes (ISO con
 * zona), así que se convierten con toRD en vez de cortar el string.
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

interface AdminPermissionDetailModalProps {
  visible: boolean;
  permission: MyPermission | null;
  loading: boolean;
  error: string | null;
  urlColegio: string | null;
  isHistorical: boolean;
  expired: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

type DetailStyles = ReturnType<typeof createStyles>;

function InfoRow({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: DetailStyles;
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

/**
 * Detalle administrativo: todo lo que la card no muestra (ID, auditoría,
 * contacto, canal) más las acciones que permita la fila.
 */
export default function AdminPermissionDetailModal({
  visible,
  permission,
  loading,
  error,
  urlColegio,
  isHistorical,
  expired,
  canEdit,
  canDelete,
  onClose,
  onEdit,
  onDelete,
}: AdminPermissionDetailModalProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const range = useMemo(
    () => (permission ? getPermissionDayRange(permission) : null),
    [permission],
  );

  const requester = permission?.schoolUser?.user;
  const isFullDay =
    normalizePermissionName(permission?.actionTag?.name) === AUSENCIA_ACTION_NAME;
  const attachments = permission?.attachments ?? [];
  const comments = text(permission?.comments);

  const openAttachment = (path: string) => {
    const uri = buildAttachmentUri(urlColegio, path);
    if (!uri) return;
    if (isImageAttachment(path)) {
      setPreviewUri(uri);
      return;
    }
    Linking.openURL(uri).catch(() => undefined);
  };

  const schedule = isFullDay
    ? "Todo el día"
    : permission?.fromTime && permission?.toTime
      ? `${formatDisplayTime(permission.fromTime)} — ${formatDisplayTime(permission.toTime)}`
      : "—";

  const hasActions = !isHistorical && (canEdit || canDelete);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>
            {permission ? `Permiso #${permission.id}` : "Detalle del Permiso"}
          </Text>
          <View style={styles.topBarSpacer} />
        </View>

        {loading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.stateText}>Cargando permiso…</Text>
          </View>
        ) : error || !permission || !range ? (
          <View style={styles.stateBox}>
            <Ionicons name="alert-circle-outline" size={34} color="#9CA3AF" />
            <Text style={styles.stateTitle}>{error ?? "Permiso no encontrado"}</Text>
          </View>
        ) : (
          <>
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {/* ── Encabezado ── */}
              <View style={styles.card}>
                <Text style={styles.personName}>{text(requester?.fullName) || "—"}</Text>
                <View style={styles.chipRow}>
                  {[permission.stateTag, permission.actionTag, permission.typeTag]
                    .filter((tag): tag is PermissionTagRef => !!tag?.name)
                    .map((tag, index) => {
                      const colors = chipColors(tag);
                      return (
                        <View
                          key={`${tag.id ?? tag.name}-${index}`}
                          style={[styles.chip, { backgroundColor: colors.backgroundColor }]}
                        >
                          <Text style={[styles.chipText, { color: colors.color }]}>
                            {tag.name}
                          </Text>
                        </View>
                      );
                    })}
                </View>
                {(isHistorical || expired) && (
                  <View style={styles.noticeRow}>
                    <Ionicons
                      name={isHistorical ? "archive-outline" : "alert-circle-outline"}
                      size={14}
                      color={isHistorical ? "#6B7280" : "#B91C1C"}
                    />
                    <Text style={[styles.noticeText, expired && !isHistorical && styles.noticeExpired]}>
                      {isHistorical
                        ? "Histórico · solo lectura"
                        : "Vencido · ya no admite cambios"}
                    </Text>
                  </View>
                )}
              </View>

              {/* ── Información administrativa ── */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="information-circle-outline" size={18} color="#2563EB" />
                  <Text style={styles.cardTitle}>Información</Text>
                </View>
                <InfoRow label="ID" value={String(permission.id)} styles={styles} />
                <InfoRow label="Solicitado por" value={text(requester?.fullName)} styles={styles} />
                <InfoRow label="Teléfono" value={text(requester?.phone)} styles={styles} />
                <InfoRow label="Email" value={text(requester?.email)} styles={styles} />
                <InfoRow label="Canal" value={text(permission.canal)} styles={styles} />
                <InfoRow
                  label="F. Creación"
                  value={formatAuditStamp(permission.createdDate)}
                  styles={styles}
                />
                <InfoRow
                  label="Modificado por"
                  value={text(permission.adminUser?.user?.fullName)}
                  styles={styles}
                />
                <InfoRow
                  label="Modificado"
                  value={formatAuditStamp(permission.updatedDate)}
                  styles={styles}
                />
              </View>

              {/* ── Día/s ── */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="calendar-outline" size={18} color="#2563EB" />
                  <Text style={styles.cardTitle}>Día/s de permiso</Text>
                </View>
                <InfoRow
                  label={range.isRange ? "Rango" : "Fecha"}
                  value={
                    range.isRange
                      ? `${formatDisplayDate(range.from)} — ${formatDisplayDate(range.to)}`
                      : formatDisplayDate(range.from)
                  }
                  styles={styles}
                />
                {range.isRange && (
                  <InfoRow
                    label="Total"
                    value={`${range.totalDays} ${range.totalDays === 1 ? "día" : "días"}`}
                    styles={styles}
                  />
                )}
                <InfoRow label="Horario" value={schedule} styles={styles} />
                {!!permission.groupWeekDays?.length && (
                  <InfoRow
                    label="Días"
                    value={permission.groupWeekDays.join(", ")}
                    styles={styles}
                  />
                )}
                {/* Modo Ver: el toggle se muestra siempre bloqueado, como en el webapp. */}
                <View style={[styles.infoRow, styles.switchRow]}>
                  <Text style={styles.infoLabel}>Hr. Extras Pagas</Text>
                  <Switch value={readOverTime(permission.overTime)} disabled />
                </View>
              </View>

              {/* ── Detalle ── */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="document-text-outline" size={18} color="#2563EB" />
                  <Text style={styles.cardTitle}>Detalle</Text>
                </View>
                <Text style={styles.label}>Asunto</Text>
                <Text style={styles.value}>{text(permission.subject) || "—"}</Text>
                <Text style={[styles.label, styles.labelSpaced]}>Motivo</Text>
                <Text style={styles.value}>{text(permission.description) || "—"}</Text>
                {!!comments && (
                  <>
                    <Text style={[styles.label, styles.labelSpaced]}>Comentarios</Text>
                    <Text style={styles.value}>{comments}</Text>
                  </>
                )}
              </View>

              {/* ── Adjuntos ── */}
              {attachments.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="attach-outline" size={18} color="#2563EB" />
                    <Text style={styles.cardTitle}>Adjuntos ({attachments.length})</Text>
                  </View>
                  {attachments.map((path, index) => (
                    <TouchableOpacity
                      key={`${path}-${index}`}
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
                  ))}
                </View>
              )}
            </ScrollView>

            {hasActions && (
              <View style={styles.footer}>
                {canDelete && (
                  <TouchableOpacity
                    style={[styles.footerBtn, styles.deleteBtn]}
                    onPress={onDelete}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={18} color="#B91C1C" />
                    <Text style={styles.deleteText}>Eliminar</Text>
                  </TouchableOpacity>
                )}
                {canEdit && (
                  <TouchableOpacity
                    style={[styles.footerBtn, styles.editBtn]}
                    onPress={onEdit}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={18} color="#fff" />
                    <Text style={styles.editText}>Editar</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </View>

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
    </Modal>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: APP_BACKGROUND },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: "#fff",
      paddingHorizontal: scale(16),
      // El Modal cubre la SafeAreaView del layout: reserva la status bar.
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
      paddingBottom: verticalScale(40),
    },
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
    personName: { fontSize: font(17), fontWeight: "700", color: "#111827" },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: scale(6),
      marginTop: verticalScale(10),
    },
    chip: {
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(4),
    },
    chipText: { fontSize: font(11), fontWeight: "700" },
    noticeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(5),
      marginTop: verticalScale(10),
    },
    noticeText: { fontSize: font(12), color: "#6B7280", fontWeight: "600" },
    noticeExpired: { color: "#B91C1C" },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: scale(12),
      paddingVertical: verticalScale(7),
      borderBottomWidth: 1,
      borderBottomColor: "#F3F4F6",
    },
    infoLabel: { fontSize: font(12), color: "#6B7280", fontWeight: "600" },
    switchRow: { alignItems: "center" },
    infoValue: {
      flex: 1,
      fontSize: font(13),
      color: "#111827",
      textAlign: "right",
    },
    label: { fontSize: font(11), fontWeight: "600", color: "#6B7280" },
    labelSpaced: { marginTop: verticalScale(12) },
    value: {
      fontSize: font(14),
      color: "#111827",
      marginTop: verticalScale(3),
      lineHeight: font(20),
    },
    attachment: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      backgroundColor: APP_BACKGROUND,
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      marginBottom: verticalScale(8),
    },
    attachmentName: {
      flex: 1,
      fontSize: font(13),
      color: "#374151",
      fontWeight: "500",
    },
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
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(6),
      paddingVertical: verticalScale(13),
      borderRadius: RADIUS_LG,
    },
    deleteBtn: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA" },
    deleteText: { fontSize: font(14), fontWeight: "700", color: "#B91C1C" },
    editBtn: { backgroundColor: "#2563EB" },
    editText: { fontSize: font(14), fontWeight: "700", color: "#fff" },
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
