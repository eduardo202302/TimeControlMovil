import { StyleSheet } from "react-native";
import {
  APP_BACKGROUND_V2,
  CARD_BACKGROUND,
  CARD_BORDER,
  ERROR_COLOR,
  ERROR_TEXT,
  ERROR_TINT_BACKGROUND,
  FIELD_BACKGROUND,
  FIELD_DISABLED_BACKGROUND,
  FOOTER_BORDER,
  HEADER_BUTTON_BACKGROUND,
  HEADER_TEXT,
  ON_PRIMARY,
  PRIMARY_700,
  PRIMARY_COLOR,
  PRIMARY_TINT_50,
  PRIMARY_TINT_BORDER,
  SUCCESS_ACCENT,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";
import {
  MAX_CONTENT_WIDTH,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  RADIUS_SM,
} from "@/constants/responsive";
import { SHADOW_SM } from "@/constants/shadows";
import {
  CARD_FORM,
  CARD_ROW,
  FOOTER_BTN_SAVE,
  MODAL_TOPBAR,
  SEGMENTED_SURFACE,
  SEGMENT_ACTIVE,
} from "@/styles/surfaces";
import { TASKER_LAYOUT as L, TASKER_TOUCH_MIN, taskerTitleMetrics } from "./taskerCompact";

/** Alto de cada pestaña (Ticket / Dirección / Acciones), antes de verticalScale. */
export const SEGMENT_HEIGHT = 34;

/**
 * Área táctil de las pestañas: SEGMENT_HEIGHT + 5 arriba y abajo = 44. Solo
 * vertical (a los lados están las otras pestañas).
 */
export const SEGMENT_HIT_SLOP = { top: 5, bottom: 5, left: 0, right: 0 };

/** Ícono de las pestañas (un punto menos que el de las tarjetas). */
export const SEGMENT_ICON_SIZE = 15;

/**
 * Un solo createStyles para Seguimiento: FollowUpView lo memoiza y lo pasa
 * por prop a las tres pestañas (ninguna llama useResponsive()). Tarjetas,
 * títulos y áreas táctiles con las medidas compactas de Reportar
 * (taskerCompact.ts).
 */
export function createFollowUpStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  const title = taskerTitleMetrics(font);
  const touchMin = Math.max(TASKER_TOUCH_MIN, verticalScale(44));
  /** Pestañas: más bajas que touchMin; el resto del área táctil lo pone SEGMENT_HIT_SLOP. */
  const segmentHeight = verticalScale(SEGMENT_HEIGHT);

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: APP_BACKGROUND_V2 },
    flex: { flex: 1 },
    contentTablet: {
      maxWidth: MAX_CONTENT_WIDTH,
      alignSelf: "center",
      width: "100%",
    },
    content: {
      paddingHorizontal: scale(L.screenPadding),
      paddingBottom: verticalScale(L.screenPaddingBottom),
      gap: verticalScale(L.cardGap),
    },

    /* ── Pestañas segmentadas (fijas arriba) ── */
    // Debajo, la misma separación que entre tarjetas.
    tabsWrap: {
      paddingHorizontal: scale(L.screenPadding),
      paddingTop: verticalScale(L.screenPadding),
      paddingBottom: verticalScale(L.cardGap),
    },
    segmented: {
      ...SEGMENTED_SURFACE,
      flexDirection: "row",
      padding: scale(2),
      gap: scale(2),
    },
    // Ícono, texto y badge siempre en una fila: el texto se encoge (una
    // línea, adjustsFontSizeToFit); ícono y badge no.
    segment: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(5),
      minHeight: segmentHeight,
      paddingHorizontal: scale(6),
      borderRadius: RADIUS_SM,
    },
    segmentActive: { ...SEGMENT_ACTIVE },
    segmentText: { flexShrink: 1, fontSize: font(12), fontWeight: "600", color: TEXT_MUTED },
    segmentTextActive: { color: ON_PRIMARY, fontWeight: "700" },
    segmentBadge: {
      flexShrink: 0,
      minWidth: scale(18),
      paddingHorizontal: scale(5),
      borderRadius: RADIUS_PILL,
      backgroundColor: FOOTER_BORDER,
      alignItems: "center",
    },
    segmentBadgeActive: { backgroundColor: CARD_BACKGROUND },
    segmentBadgeText: {
      fontSize: font(11),
      lineHeight: font(18),
      fontWeight: "700",
      color: TEXT_SECONDARY,
    },
    segmentBadgeTextActive: { color: PRIMARY_700 },

    /* ── Tarjetas ── */
    card: {
      ...CARD_FORM,
      paddingHorizontal: scale(L.cardPaddingH),
      paddingTop: verticalScale(L.cardPaddingTop),
      paddingBottom: verticalScale(L.cardPaddingBottom),
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(L.headerGap),
      marginBottom: verticalScale(L.headerMarginBottom),
    },
    // lineHeight = lado del ícono (taskerTitleMetrics): quedan a la misma altura.
    cardTitle: {
      flex: 1,
      fontSize: title.fontSize,
      lineHeight: title.lineHeight,
      fontWeight: "700",
      color: TEXT_PRIMARY,
    },

    /* ── Estados de una pestaña (cargando, vacío, error, sin selección) ── */
    notice: {
      alignItems: "center",
      gap: verticalScale(12),
      paddingVertical: verticalScale(24),
    },
    noticeText: {
      fontSize: font(14),
      lineHeight: font(20),
      color: TEXT_SECONDARY,
      textAlign: "center",
    },
    noticeBtn: {
      ...FOOTER_BTN_SAVE,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      minHeight: touchMin,
      paddingHorizontal: scale(20),
    },
    noticeBtnText: { fontSize: font(14), fontWeight: "700", color: ON_PRIMARY },

    /* ── Lista de tickets (padding 16 y gap 12, como Home.js de etaskr-mobile) ── */
    listContent: {
      flexGrow: 1,
      padding: scale(16),
      gap: verticalScale(12),
    },
    listTitle: {
      fontSize: font(15),
      fontWeight: "700",
      color: TEXT_PRIMARY,
    },
    // Tarjeta calcada de TaskCard.js: cabecera (#id + estado), campos, divisor,
    // descripción y pie (vencimiento + prioridad).
    ticketCard: {
      ...CARD_ROW,
      gap: verticalScale(8),
      padding: scale(16),
    },
    ticketHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: scale(8),
    },
    ticketId: {
      flexShrink: 0,
      fontSize: font(17),
      fontWeight: "700",
      color: TEXT_PRIMARY,
      fontVariant: ["tabular-nums"],
    },
    // Label macizo (estado, prioridad): colores en línea con getSolidLabelColors.
    solidLabel: {
      flexShrink: 1,
      justifyContent: "center",
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(3),
      borderRadius: RADIUS_PILL,
    },
    solidLabelText: { fontSize: font(11), fontWeight: "700" },
    ticketField: { flexDirection: "row", alignItems: "center" },
    ticketFieldLabel: {
      width: scale(82),
      fontSize: font(12),
      fontWeight: "400",
      color: TEXT_MUTED,
    },
    ticketFieldValue: { flex: 1, fontSize: font(12), fontWeight: "700", color: TEXT_PRIMARY },
    // Divisor: 1 de alto fijo.
    ticketDivider: { height: 1, backgroundColor: FOOTER_BORDER },
    ticketAction: {
      fontSize: font(13),
      lineHeight: font(18),
      fontWeight: "600",
      color: TEXT_PRIMARY,
    },
    ticketActionEmpty: { fontWeight: "400", color: TEXT_MUTED },
    ticketFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: scale(8),
    },
    ticketDate: { flexDirection: "row", alignItems: "center", gap: scale(4), flexShrink: 1 },
    // Color en línea: TEXT_SECONDARY, o ERROR_TEXT si venció.
    ticketDateText: {
      flexShrink: 1,
      fontSize: font(11),
      fontVariant: ["tabular-nums"],
    },
    ticketDateExpired: { fontWeight: "700" },

    /* ── Modal del detalle (patrón de los modales a pantalla completa) ── */
    modalTopBar: {
      ...MODAL_TOPBAR,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(12),
      paddingHorizontal: scale(16),
      // El Modal cubre la SafeAreaView del layout: reserva la status bar.
      paddingTop: verticalScale(48),
      paddingBottom: verticalScale(14),
    },
    /** Tamaño fijo: botón de ícono, mismo criterio que PermissionDetailView. */
    modalBackBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_MD,
      backgroundColor: HEADER_BUTTON_BACKGROUND,
    },
    modalTitle: {
      flex: 1,
      fontSize: font(17),
      fontWeight: "700",
      color: HEADER_TEXT,
      fontVariant: ["tabular-nums"],
    },
    modalState: { flexShrink: 1, maxWidth: "45%" },

    /* ── Chip de estado (colores en línea desde getStateChipColors) ── */
    stateChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(4),
      borderRadius: RADIUS_PILL,
    },
    // Punto del chip: 8×8 fijo.
    stateDot: { width: 8, height: 8, borderRadius: RADIUS_PILL },
    stateText: { flexShrink: 1, fontSize: font(12), fontWeight: "700", color: TEXT_PRIMARY },

    /* ── Franja compacta (Dirección / Acciones) ── */
    strip: {
      ...CARD_ROW,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingHorizontal: scale(L.cardPaddingH),
      paddingVertical: verticalScale(12),
    },
    stripBody: { flex: 1 },
    stripTitle: { fontSize: font(14), fontWeight: "700", color: TEXT_PRIMARY },
    stripClient: { fontSize: font(13), color: TEXT_MUTED },

    /* ── Pestaña Ticket ── */
    clientRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: scale(8),
    },
    clientName: { flexShrink: 1, fontSize: font(16), fontWeight: "700", color: TEXT_PRIMARY },
    tagChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      gap: scale(4),
    },
    tagChip: {
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(3),
      borderRadius: RADIUS_PILL,
    },
    tagChipText: { fontSize: font(11), fontWeight: "700" },
    phoneRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      marginTop: verticalScale(6),
    },
    phoneText: { fontSize: font(13), color: TEXT_MUTED, fontVariant: ["tabular-nums"] },
    infoList: { gap: verticalScale(6), marginTop: verticalScale(10) },
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(6),
      borderRadius: RADIUS_LG,
      backgroundColor: FIELD_BACKGROUND,
    },
    infoRowHighlight: {
      backgroundColor: PRIMARY_TINT_50,
      borderWidth: 1,
      borderColor: PRIMARY_TINT_BORDER,
    },
    // Círculo del ícono de cada fila (compacto).
    infoIcon: {
      width: scale(30),
      height: scale(30),
      borderRadius: RADIUS_PILL,
      backgroundColor: CARD_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
    },
    infoBody: { flex: 1 },
    infoLabel: { fontSize: font(11), fontWeight: "600", color: TEXT_MUTED, marginBottom: -2 },
    infoLabelHighlight: { color: PRIMARY_700 },
    infoValue: { fontSize: font(14), fontWeight: "600", color: TEXT_PRIMARY },
    infoValueStrong: { fontWeight: "700", fontVariant: ["tabular-nums"] },
    descriptionBox: {
      padding: scale(12),
      borderRadius: RADIUS_LG,
      backgroundColor: FIELD_DISABLED_BACKGROUND,
    },
    descriptionText: { fontSize: font(14), lineHeight: font(20), color: TEXT_SECONDARY },
    faultList: { gap: verticalScale(8) },
    // Avance de las acciones: texto + barra (relleno con el % en línea).
    progress: { gap: verticalScale(6), marginBottom: verticalScale(12) },
    progressText: {
      fontSize: font(12),
      fontWeight: "600",
      color: TEXT_SECONDARY,
      fontVariant: ["tabular-nums"],
    },
    // Barra: 6 de alto fijo.
    progressTrack: {
      height: 6,
      overflow: "hidden",
      borderRadius: RADIUS_PILL,
      backgroundColor: PRIMARY_TINT_50,
    },
    progressFill: { height: "100%", borderRadius: RADIUS_PILL, backgroundColor: PRIMARY_COLOR },
    faultRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: scale(10),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      borderRadius: RADIUS_LG,
      backgroundColor: FIELD_BACKGROUND,
    },
    // Marcada en rojo (indeterminate): fondo y texto de error.
    faultRowDanger: { backgroundColor: ERROR_TINT_BACKGROUND },
    faultBody: { flex: 1 },
    faultText: { fontSize: font(14), lineHeight: font(20), color: TEXT_PRIMARY },
    faultTextDanger: { color: ERROR_TEXT },
    // Título de grupo (isDisabled): sin fondo de fila ni ícono.
    faultTitleRow: { paddingHorizontal: scale(4), paddingTop: verticalScale(4) },
    faultTitleText: {
      fontSize: font(14),
      lineHeight: font(20),
      fontWeight: "700",
      color: TEXT_SECONDARY,
    },
    faultDate: {
      marginTop: verticalScale(2),
      fontSize: font(12),
      color: TEXT_MUTED,
      fontVariant: ["tabular-nums"],
    },
    // Evaluación de la acción: chip neutro bajo el texto. Borde para que se
    // distinga sobre la fila, que tiene el mismo FIELD_BACKGROUND.
    evalChip: {
      alignSelf: "flex-start",
      marginTop: verticalScale(6),
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(3),
      borderRadius: RADIUS_PILL,
      borderWidth: 1,
      borderColor: CARD_BORDER,
      backgroundColor: FIELD_BACKGROUND,
    },
    evalChipText: { fontSize: font(12), fontWeight: "600", color: TEXT_SECONDARY },
    // Botón "Evaluar" (36×36 + hitSlop = 44 de área táctil).
    evalBtn: {
      width: scale(36),
      height: scale(36),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_LG,
      borderWidth: 1,
      borderColor: PRIMARY_TINT_BORDER,
      backgroundColor: CARD_BACKGROUND,
    },
    evalBtnDisabled: { opacity: 0.5 },

    /* ── Revisión: Completada / Incompleta ── */
    reviewText: { fontSize: font(13), lineHeight: font(18), color: TEXT_SECONDARY },
    reviewButtons: { flexDirection: "row", gap: scale(10), marginTop: verticalScale(12) },
    reviewBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      minHeight: touchMin,
      paddingHorizontal: scale(12),
      borderRadius: RADIUS_LG,
    },
    reviewBtnSuccess: { backgroundColor: SUCCESS_ACCENT },
    reviewBtnError: { backgroundColor: ERROR_COLOR },
    reviewBtnDisabled: { opacity: 0.5 },
    reviewBtnText: { flexShrink: 1, fontSize: font(14), fontWeight: "700", color: ON_PRIMARY },
    /* ── Pestaña Dirección ── */
    addressGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: verticalScale(12),
      padding: scale(12),
      borderRadius: RADIUS_LG,
      backgroundColor: FIELD_BACKGROUND,
    },
    addressCellFull: { width: "100%" },
    // Dos columnas: 48% cada una, space-between deja el hueco.
    addressCellHalf: { width: "48%" },
    addressTail: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
    },
    addressTailFields: { flex: 1, gap: verticalScale(12) },
    fieldLabel: { fontSize: font(11), fontWeight: "600", color: TEXT_MUTED },
    fieldValue: { fontSize: font(14), fontWeight: "600", color: TEXT_PRIMARY },
    mapBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      minHeight: touchMin,
      paddingHorizontal: scale(14),
      borderWidth: 1,
      borderColor: PRIMARY_TINT_BORDER,
      borderRadius: RADIUS_LG,
      backgroundColor: CARD_BACKGROUND,
    },
    mapBtnText: { fontSize: font(13), fontWeight: "700", color: PRIMARY_700 },
    addressSummary: { marginTop: verticalScale(12) },

    /* ── Pestaña Acciones (línea de tiempo) ── */
    timelineRow: { flexDirection: "row", gap: scale(10) },
    // Riel de la línea de tiempo: ancho fijo = diámetro del nodo grande.
    rail: { width: 28, alignItems: "center" },
    // Nodo del estado actual: 28×28 fijo con aro de 5.
    nodeCurrent: {
      width: 28,
      height: 28,
      marginTop: verticalScale(12),
      borderRadius: RADIUS_PILL,
      borderWidth: 5,
      borderColor: PRIMARY_TINT_BORDER,
      backgroundColor: PRIMARY_COLOR,
      alignItems: "center",
      justifyContent: "center",
    },
    // Centro blanco del nodo actual: 8×8 fijo.
    nodeCurrentDot: {
      width: 8,
      height: 8,
      borderRadius: RADIUS_PILL,
      backgroundColor: ON_PRIMARY,
    },
    // Nodo de estados anteriores: 12×12 fijo.
    node: {
      width: 12,
      height: 12,
      marginTop: verticalScale(3),
      borderRadius: RADIUS_PILL,
      borderWidth: 2,
      borderColor: TEXT_PLACEHOLDER,
      backgroundColor: CARD_BACKGROUND,
    },
    // Trazo vertical: 2 de ancho fijo.
    railLine: { flex: 1, width: 2, marginTop: verticalScale(4), backgroundColor: CARD_BORDER },
    railLineCurrent: { backgroundColor: PRIMARY_TINT_BORDER },
    currentCard: {
      ...SHADOW_SM,
      flex: 1,
      marginBottom: verticalScale(18),
      padding: scale(14),
      borderRadius: RADIUS_LG,
      borderWidth: 1,
      borderColor: PRIMARY_TINT_BORDER,
      backgroundColor: PRIMARY_TINT_50,
    },
    currentBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(3),
      borderRadius: RADIUS_PILL,
      backgroundColor: PRIMARY_700,
    },
    currentBadgeText: {
      fontSize: font(11),
      fontWeight: "700",
      letterSpacing: 0.3,
      color: ON_PRIMARY,
    },
    currentTitle: {
      marginTop: verticalScale(8),
      fontSize: font(20),
      lineHeight: font(24),
      fontWeight: "800",
      color: TEXT_PRIMARY,
    },
    currentMessage: { fontSize: font(14), fontWeight: "400", color: TEXT_SECONDARY },
    currentRange: {
      marginTop: verticalScale(4),
      fontSize: font(13),
      lineHeight: font(18),
      fontWeight: "600",
      color: TEXT_SECONDARY,
      fontVariant: ["tabular-nums"],
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: scale(8),
    },
    currentMetaRow: { marginTop: verticalScale(10) },
    currentBy: { flexShrink: 1, fontSize: font(12), color: TEXT_SECONDARY },
    currentByName: { fontWeight: "700", color: TEXT_PRIMARY },
    currentTime: {
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(2),
      borderRadius: RADIUS_SM,
      borderWidth: 1,
      borderColor: PRIMARY_TINT_BORDER,
      backgroundColor: CARD_BACKGROUND,
    },
    currentTimeText: {
      fontSize: font(12),
      fontWeight: "700",
      color: TEXT_PRIMARY,
      fontVariant: ["tabular-nums"],
    },
    coordsRow: {
      marginTop: verticalScale(10),
      paddingTop: verticalScale(10),
      borderTopWidth: 1,
      borderTopColor: PRIMARY_TINT_BORDER,
    },
    coordsRowPast: { borderTopColor: CARD_BORDER },
    coordsText: {
      flexShrink: 1,
      fontSize: font(12),
      color: TEXT_SECONDARY,
      fontVariant: ["tabular-nums"],
    },
    smallMapBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      minHeight: touchMin,
      paddingHorizontal: scale(12),
      borderWidth: 1,
      borderColor: PRIMARY_TINT_BORDER,
      borderRadius: RADIUS_LG,
      backgroundColor: CARD_BACKGROUND,
    },
    smallMapBtnText: { fontSize: font(12), fontWeight: "700", color: PRIMARY_700 },
    pastBody: { flex: 1 },
    pastBodySpaced: { paddingBottom: verticalScale(18) },
    pastTitle: { fontSize: font(14), lineHeight: font(18), color: TEXT_SECONDARY },
    pastAction: { fontWeight: "700" },
    pastRange: {
      marginTop: verticalScale(4),
      fontSize: font(12),
      lineHeight: font(17),
      color: TEXT_MUTED,
      fontVariant: ["tabular-nums"],
    },
    pastMetaRow: { marginTop: verticalScale(6) },
    pastBy: { flexShrink: 1, fontSize: font(12), color: TEXT_MUTED },
    pastByName: { fontWeight: "600", color: TEXT_SECONDARY },
    pastTime: {
      fontSize: font(12),
      fontWeight: "600",
      color: TEXT_SECONDARY,
      fontVariant: ["tabular-nums"],
    },
  });
}

export type FollowUpStyles = ReturnType<typeof createFollowUpStyles>;
