import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { APP_BACKGROUND } from "@/constants/colors";
import {
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  RADIUS_2XL,
  useResponsive,
} from "@/constants/responsive";
import {
  attachmentFileName,
  buildAttachmentUri,
  getPermissionDayRange,
  getPermissionReporter,
  isImageAttachment,
  permissionDateKey,
  type MyPermission,
  type PermissionTagRef,
} from "../../utils/permissionRules";
import { normalizePermissionName } from "../../utils/punchRules";
import { formatDisplayDate, formatDisplayTime } from "./RevisionFinalModal";

/** Nombre de la acción que el backend trata como día completo (00:00–23:59) —
 * mismo criterio que SolicitarPermisoForm al armar la solicitud. */
const AUSENCIA_ACTION_NAME = "ausencia";

interface PermissionDetailViewProps {
  visible: boolean;
  /** null mientras carga, o cuando el permiso no es del usuario (ver `error`). */
  permission: MyPermission | null;
  loading: boolean;
  /** Mensaje genérico. Un permiso ajeno llega acá como "no encontrado". */
  error: string | null;
  urlColegio: string | null;
  /**
   * Nombre del usuario logueado. El listado no pide
   * `schoolUser:user.fullName`, así que si el detalle tampoco expandiera el
   * grafo del solicitante se muestra este — "Mis Permisos" es siempre sobre
   * uno mismo.
   */
  fallbackFullName?: string;
  onClose: () => void;
}

/** Colores por defecto de un chip cuando el tag no trae los suyos. */
const CHIP_FALLBACK = { background: "#E5E7EB", text: "#374151" };

function chipColors(tag: PermissionTagRef | null | undefined) {
  return {
    backgroundColor: tag?.color || CHIP_FALLBACK.background,
    color: tag?.fontColor || CHIP_FALLBACK.text,
  };
}

/** Ícono por extensión — los adjuntos solo traen la ruta, no el mimeType. */
function attachmentIcon(path: string): keyof typeof Ionicons.glyphMap {
  if (isImageAttachment(path)) return "image-outline";
  const name = attachmentFileName(path).toLowerCase();
  if (name.endsWith(".pdf")) return "document-text-outline";
  if (name.endsWith(".doc") || name.endsWith(".docx")) return "document-outline";
  if (name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv"))
    return "grid-outline";
  return "document-attach-outline";
}

/** ISO con hora → "DD/MM/AAAA h:mm a.m."; solo fecha → "DD/MM/AAAA". */
function formatStamp(raw: string | null | undefined): string {
  if (!raw) return "";
  const value = String(raw).trim();
  const date = formatDisplayDate(permissionDateKey(value));
  const timePart = value.includes("T") ? value.split("T")[1] : "";
  if (!timePart) return date;
  const time = formatDisplayTime(timePart.slice(0, 5));
  return time ? `${date} ${time}` : date;
}

export default function PermissionDetailView({
  visible,
  permission,
  loading,
  error,
  urlColegio,
  fallbackFullName = "",
  onClose,
}: PermissionDetailViewProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  /** Adjunto de imagen abierto a pantalla completa, o null. */
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const range = useMemo(
    () => (permission ? getPermissionDayRange(permission) : null),
    [permission],
  );

  /** Prioridad exacta del webapp: requestedSchoolUser y, si no, schoolUser. */
  const reporter = getPermissionReporter(permission);
  const reporterName = reporter?.user?.fullName || fallbackFullName || "—";

  const isFullDay =
    normalizePermissionName(permission?.actionTag?.name) === AUSENCIA_ACTION_NAME;

  const attachments = permission?.attachments ?? [];

  const openAttachment = (path: string) => {
    const uri = buildAttachmentUri(urlColegio, path);
    if (!uri) return;
    if (isImageAttachment(path)) {
      setPreviewUri(uri);
      return;
    }
    // No es imagen: se delega al visor del sistema. Un fallo acá (sin app
    // capaz de abrirlo) no debe tumbar la pantalla.
    Linking.openURL(uri).catch(() => undefined);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Detalle del Permiso</Text>
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
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Header: quién y qué ── */}
            <View style={styles.card}>
              <Text style={styles.personName}>{reporterName}</Text>
              <View style={styles.chipRow}>
                {[permission.actionTag, permission.typeTag, permission.stateTag]
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
            </View>

            {/* ── Detalle ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="document-text-outline" size={18} color="#2563EB" />
                <Text style={styles.cardTitle}>Detalle</Text>
              </View>
              <Text style={styles.label}>Asunto</Text>
              <Text style={styles.value}>{permission.subject || "—"}</Text>
              <Text style={[styles.label, styles.labelSpaced]}>Motivo</Text>
              <Text style={styles.value}>{permission.description || "—"}</Text>
            </View>

            {/* ── Día/s de permiso ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="calendar-outline" size={18} color="#2563EB" />
                <Text style={styles.cardTitle}>Día/s de permiso</Text>
              </View>

              {range.isRange ? (
                <>
                  <Text style={styles.label}>Rango</Text>
                  <Text style={styles.value}>
                    {formatDisplayDate(range.from)} — {formatDisplayDate(range.to)}
                  </Text>
                  <Text style={[styles.label, styles.labelSpaced]}>Total</Text>
                  <Text style={styles.value}>
                    {range.totalDays} {range.totalDays === 1 ? "día" : "días"}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.label}>Fecha</Text>
                  <Text style={styles.value}>
                    {formatDisplayDate(range.from) || "—"}
                  </Text>
                </>
              )}

              <Text style={[styles.label, styles.labelSpaced]}>Horario</Text>
              <Text style={styles.value}>
                {isFullDay
                  ? "Todo el día"
                  : permission.fromTime && permission.toTime
                    ? `${formatDisplayTime(permission.fromTime)} — ${formatDisplayTime(permission.toTime)}`
                    : "—"}
              </Text>

              {!!permission.groupWeekDays?.length && (
                <>
                  <Text style={[styles.label, styles.labelSpaced]}>
                    Días de la semana
                  </Text>
                  <Text style={styles.value}>
                    {permission.groupWeekDays.join(", ")}
                  </Text>
                </>
              )}
            </View>

            {/* ── Quién Solicita ── */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="person-outline" size={18} color="#2563EB" />
                <Text style={styles.cardTitle}>Quién Solicita</Text>
              </View>

              <Text style={styles.value}>{reporterName}</Text>
              {!!reporter?.user?.phone && (
                <Text style={styles.muted}>{reporter.user.phone}</Text>
              )}
              {!!reporter?.user?.email && (
                <Text style={styles.muted}>{reporter.user.email}</Text>
              )}
              {!!permission.createdDate && (
                <Text style={styles.muted}>
                  Solicitado: {formatStamp(permission.createdDate)}
                </Text>
              )}

              {!!permission.stateTag?.name && (
                <View style={styles.chipRow}>
                  <View
                    style={[
                      styles.chip,
                      { backgroundColor: chipColors(permission.stateTag).backgroundColor },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: chipColors(permission.stateTag).color },
                      ]}
                    >
                      {permission.stateTag.name}
                    </Text>
                  </View>
                </View>
              )}

              {!!permission.adminUser?.user?.fullName && (
                <Text style={[styles.muted, styles.mutedSpaced]}>
                  Modificado por: {permission.adminUser.user.fullName}
                  {permission.reviewDate ? ` • ${formatStamp(permission.reviewDate)}` : ""}
                </Text>
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
        )}
      </View>

      {/* ── Visor de imagen ── */}
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
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
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
      // El Modal cubre la SafeAreaView del layout, así que el padding superior
      // tiene que reservar la status bar por su cuenta.
      paddingTop: verticalScale(48),
      paddingBottom: verticalScale(14),
      borderBottomWidth: 1,
      borderBottomColor: "#F3F4F6",
    },
    /** Tamaño fijo: botón de ícono, mismo criterio que menuBtn en (app)/_layout.tsx. */
    backBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_MD,
    },
    /** Spacer simétrico al backBtn — mantiene el título centrado. */
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
      marginBottom: verticalScale(12),
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

    label: { fontSize: font(11), fontWeight: "600", color: "#6B7280" },
    labelSpaced: { marginTop: verticalScale(12) },
    value: {
      fontSize: font(14),
      color: "#111827",
      marginTop: verticalScale(3),
      lineHeight: font(20),
    },
    muted: { fontSize: font(12), color: "#6B7280", marginTop: verticalScale(3) },
    mutedSpaced: { marginTop: verticalScale(10) },

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
