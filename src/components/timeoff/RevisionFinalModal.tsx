import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
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
  RADIUS_2XL,
  useResponsive,
} from "@/constants/responsive";

/** Archivo ya convertido a data-URI base64, listo para el POST. */
export interface PermissionAttachment {
  /** Clave estable para la lista — el nombre puede repetirse. */
  id: string;
  name: string;
  size?: number;
  mimeType: string;
  /** "data:<mime>;base64,...." — el backend exige > 100 chars. */
  dataUri: string;
}

/** Snapshot del formulario que se muestra en la revisión previa al envío. */
export interface PermissionReview {
  actionName: string;
  typeName: string;
  /** "YYYY-MM-DD" */
  fromDate: string;
  toDate: string;
  /** "HH:mm" — vacío cuando la acción es Ausencia (todo el día). */
  fromTime: string;
  toTime: string;
  /** Ausencia: el backend fuerza 00:00–23:59, no se muestran horas. */
  isFullDay: boolean;
  subject: string;
  description: string;
  attachments: PermissionAttachment[];
}

interface RevisionFinalModalProps {
  visible: boolean;
  review: PermissionReview | null;
  submitting: boolean;
  onEdit: () => void;
  onConfirm: () => void;
}

export function getFileIcon(mimeType: string): keyof typeof Ionicons.glyphMap {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image-outline";
  if (mime.includes("pdf")) return "document-text-outline";
  if (mime.includes("word") || mime.includes("document"))
    return "document-outline";
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv"))
    return "grid-outline";
  return "document-attach-outline";
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "YYYY-MM-DD" → "DD/MM/AAAA" */
export function formatDisplayDate(isoDate: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

/** "YYYY-MM-DD" → "DD/MM" (para el rango compacto "Del … al …") */
export function formatShortDate(isoDate: string): string {
  if (!isoDate) return "";
  const [, m, d] = isoDate.split("-");
  if (!m || !d) return isoDate;
  return `${d}/${m}`;
}

/** "HH:mm" → "h:mm a.m./p.m." — mismo formato de hora que usa el ponchador. */
export function formatDisplayTime(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "a.m." : "p.m.";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function RevisionFinalModal({
  visible,
  review,
  submitting,
  onEdit,
  onConfirm,
}: RevisionFinalModalProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  if (!review) return null;

  const isSingleDay = review.fromDate === review.toDate;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={submitting ? undefined : onEdit}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="checkmark-circle" size={24} color="#2563EB" />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>Resumen</Text>
              <Text style={styles.headerSubtitle}>
                Verifica los datos antes de enviar tu solicitud
              </Text>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Información General ── */}
            <Text style={styles.sectionTitle}>Información General</Text>
            <View style={styles.twoCols}>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>Acción</Text>
                <Text style={styles.fieldValue}>{review.actionName}</Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>Tipo</Text>
                <Text style={styles.fieldValue}>{review.typeName}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* ── Fecha y Hora ── */}
            <Text style={styles.sectionTitle}>Fecha y Hora</Text>
            <View style={styles.twoCols}>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>
                  {isSingleDay ? "Fecha" : "Rango"}
                </Text>
                <Text style={styles.fieldValue}>
                  {isSingleDay
                    ? formatDisplayDate(review.fromDate)
                    : `Del ${formatShortDate(review.fromDate)} al ${formatShortDate(
                        review.toDate,
                      )}`}
                </Text>
              </View>
              {!review.isFullDay && (
                <View style={styles.col}>
                  <Text style={styles.fieldLabel}>Inicio / Fin</Text>
                  <Text style={styles.fieldValue}>
                    {formatDisplayTime(review.fromTime)} –{" "}
                    {formatDisplayTime(review.toTime)}
                  </Text>
                </View>
              )}
            </View>
            {review.isFullDay && (
              <View style={styles.fullDayNote}>
                <Ionicons name="moon-outline" size={14} color="#1D4ED8" />
                <Text style={styles.fullDayNoteText}>
                  Ausencia: se registrará el día completo.
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            {/* ── Detalles del Motivo ── */}
            <Text style={styles.sectionTitle}>Detalles del Motivo</Text>
            <Text style={styles.subject}>{review.subject}</Text>
            <View style={styles.descriptionBlock}>
              <Text style={styles.descriptionText}>{review.description}</Text>
            </View>

            {/* ── Archivos Adjuntos ── */}
            {review.attachments.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>
                  Archivos Adjuntos ({review.attachments.length})
                </Text>
                <View style={styles.chipList}>
                  {review.attachments.map((file) => (
                    <View key={file.id} style={styles.chip}>
                      <Ionicons
                        name={getFileIcon(file.mimeType)}
                        size={16}
                        color="#2563EB"
                      />
                      <Text style={styles.chipName} numberOfLines={1}>
                        {file.name}
                      </Text>
                      {!!formatFileSize(file.size) && (
                        <Text style={styles.chipSize}>
                          {formatFileSize(file.size)}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>

          {/* ── Acciones ── */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={onEdit}
              disabled={submitting}
              activeOpacity={0.75}
            >
              <Ionicons name="create-outline" size={17} color="#374151" />
              <Text style={styles.btnGhostText}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                styles.btnPrimary,
                submitting && styles.btnDisabled,
              ]}
              onPress={onConfirm}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="send-outline" size={17} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Confirmar y Enviar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: scale(20),
    },
    card: {
      width: "100%",
      // maxWidth ya existente — se deja literal, no se tokeniza.
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
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(12),
      paddingBottom: verticalScale(14),
      borderBottomWidth: 1,
      borderBottomColor: "#F3F4F6",
    },
    /** Ícono de cabecera: tamaño fijo, mismo criterio que avatarContainer en DrawerMenu.tsx. */
    headerIconWrap: {
      width: 42,
      height: 42,
      borderRadius: RADIUS_LG,
      backgroundColor: "#EFF6FF",
      alignItems: "center",
      justifyContent: "center",
    },
    headerTextWrap: { flex: 1 },
    headerTitle: { fontSize: font(18), fontWeight: "700", color: "#111827" },
    headerSubtitle: {
      fontSize: font(12),
      color: "#6B7280",
      marginTop: verticalScale(2),
    },
    scroll: { flexGrow: 0 },
    scrollContent: {
      paddingTop: verticalScale(16),
      paddingBottom: verticalScale(4),
    },
    sectionTitle: {
      fontSize: font(11),
      fontWeight: "700",
      color: "#2563EB",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      marginBottom: verticalScale(10),
    },
    twoCols: { flexDirection: "row", gap: scale(12) },
    col: { flex: 1, gap: verticalScale(3) },
    fieldLabel: { fontSize: font(11), color: "#9CA3AF", fontWeight: "600" },
    fieldValue: { fontSize: font(14), color: "#111827", fontWeight: "600" },
    divider: {
      height: 1,
      backgroundColor: "#F3F4F6",
      marginVertical: verticalScale(16),
    },
    fullDayNote: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      backgroundColor: "#EFF6FF",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(9),
      marginTop: verticalScale(10),
    },
    fullDayNoteText: { flex: 1, fontSize: font(12), color: "#1D4ED8" },
    subject: { fontSize: font(15), fontWeight: "700", color: "#111827" },
    descriptionBlock: {
      marginTop: verticalScale(8),
      borderLeftWidth: 3,
      borderLeftColor: "#3B82F6",
      backgroundColor: APP_BACKGROUND,
      borderTopRightRadius: RADIUS_MD,
      borderBottomRightRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    descriptionText: { fontSize: font(13), color: "#4B5563", lineHeight: 20 },
    chipList: { gap: verticalScale(8) },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      backgroundColor: APP_BACKGROUND,
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    chipName: { flex: 1, fontSize: font(13), color: "#374151", fontWeight: "500" },
    chipSize: { fontSize: font(11), color: "#9CA3AF" },
    actions: {
      flexDirection: "row",
      gap: scale(10),
      marginTop: verticalScale(16),
      paddingTop: verticalScale(14),
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
    },
    btn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(7),
      borderRadius: RADIUS_LG,
      paddingVertical: verticalScale(14),
    },
    btnGhost: {
      backgroundColor: "#F3F4F6",
      borderWidth: 1,
      borderColor: "#E5E7EB",
    },
    btnGhostText: { fontSize: font(14), fontWeight: "700", color: "#374151" },
    btnPrimary: { backgroundColor: "#2563EB", flex: 1.4 },
    btnPrimaryText: { fontSize: font(14), fontWeight: "700", color: "#fff" },
    btnDisabled: { opacity: 0.6 },
  });
}
