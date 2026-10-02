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
import {
  CARD_BORDER,
  FIELD_BACKGROUND,
  FIELD_DISABLED_BACKGROUND,
  FOOTER_BORDER,
  ON_PRIMARY,
  PRIMARY_500,
  PRIMARY_700,
  PRIMARY_COLOR,
  PRIMARY_TINT_50,
  SECTION_ICON_COLOR,
  TEXT_BODY,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";
import { RADIUS_LG, RADIUS_MD, useResponsive } from "@/constants/responsive";
import { DIALOG_OVERLAY, FILE_ROW, POPUP_CARD } from "@/styles/surfaces";
import { SHADOW_PRIMARY, tintedShadow } from "@/constants/shadows";

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
              <Ionicons name="checkmark-circle" size={24} color={SECTION_ICON_COLOR} />
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
                <Ionicons name="moon-outline" size={14} color={PRIMARY_700} />
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
                        color={PRIMARY_COLOR}
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
              <Ionicons name="create-outline" size={17} color={TEXT_SECONDARY} />
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
                <ActivityIndicator color={ON_PRIMARY} size="small" />
              ) : (
                <>
                  <Ionicons name="send-outline" size={17} color={ON_PRIMARY} />
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
      ...DIALOG_OVERLAY,
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: scale(20),
    },
    card: {
      ...POPUP_CARD,
      width: "100%",
      // maxWidth ya existente — se deja literal, no se tokeniza.
      maxWidth: 440,
      maxHeight: "88%",
      padding: scale(20),
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(12),
      paddingBottom: verticalScale(14),
      borderBottomWidth: 1,
      borderBottomColor: FOOTER_BORDER,
    },
    /** Ícono de cabecera: tamaño fijo, mismo criterio que avatarContainer en DrawerMenu.tsx. */
    headerIconWrap: {
      ...tintedShadow(PRIMARY_COLOR),
      width: 42,
      height: 42,
      borderRadius: RADIUS_LG,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: PRIMARY_COLOR,
    },
    headerTextWrap: { flex: 1 },
    headerTitle: { fontSize: font(18), fontWeight: "700", color: TEXT_PRIMARY },
    headerSubtitle: {
      fontSize: font(12),
      color: TEXT_MUTED,
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
      color: PRIMARY_COLOR,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      marginBottom: verticalScale(10),
    },
    twoCols: { flexDirection: "row", gap: scale(12) },
    col: { flex: 1, gap: verticalScale(3) },
    fieldLabel: { fontSize: font(11), color: TEXT_PLACEHOLDER, fontWeight: "600" },
    fieldValue: { fontSize: font(14), color: TEXT_PRIMARY, fontWeight: "600" },
    divider: {
      height: 1,
      backgroundColor: FIELD_DISABLED_BACKGROUND,
      marginVertical: verticalScale(16),
    },
    fullDayNote: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      backgroundColor: PRIMARY_TINT_50,
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(9),
      marginTop: verticalScale(10),
    },
    fullDayNoteText: { flex: 1, fontSize: font(12), color: PRIMARY_700 },
    subject: { fontSize: font(15), fontWeight: "700", color: TEXT_PRIMARY },
    descriptionBlock: {
      marginTop: verticalScale(8),
      borderLeftWidth: 3,
      borderLeftColor: PRIMARY_500,
      backgroundColor: FIELD_BACKGROUND,
      borderTopRightRadius: RADIUS_MD,
      borderBottomRightRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    descriptionText: { fontSize: font(13), color: TEXT_BODY, lineHeight: 20 },
    chipList: { gap: verticalScale(8) },
    chip: {
      ...FILE_ROW,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    chipName: { flex: 1, fontSize: font(13), color: TEXT_SECONDARY, fontWeight: "500" },
    chipSize: { fontSize: font(11), color: TEXT_PLACEHOLDER },
    actions: {
      flexDirection: "row",
      gap: scale(10),
      marginTop: verticalScale(16),
      paddingTop: verticalScale(14),
      borderTopWidth: 1,
      borderTopColor: FOOTER_BORDER,
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
      backgroundColor: FIELD_DISABLED_BACKGROUND,
      borderWidth: 1,
      borderColor: CARD_BORDER,
    },
    btnGhostText: { fontSize: font(14), fontWeight: "700", color: TEXT_SECONDARY },
    btnPrimary: { ...SHADOW_PRIMARY, backgroundColor: PRIMARY_COLOR, flex: 1.4 },
    btnPrimaryText: { fontSize: font(14), fontWeight: "700", color: ON_PRIMARY },
    btnDisabled: { opacity: 0.6 },
  });
}
