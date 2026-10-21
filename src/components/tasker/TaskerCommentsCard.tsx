import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { Alert, type ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  CARD_BACKGROUND,
  DANGER_ICON,
  FIELD_BACKGROUND,
  ICON_EDIT,
  PRIMARY_700,
  PRIMARY_TINT_50,
  PRIMARY_TINT_BACKGROUND,
  PRIMARY_TINT_BORDER,
  SECTION_ICON_COLOR,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";
import { RADIUS_LG, RADIUS_PILL, RADIUS_SM, useResponsive } from "@/constants/responsive";
import ImageViewerModal from "@/components/ui/ImageViewerModal";
import SectionIcon from "@/components/ui/SectionIcon";
import { CARD_FORM, ROW_ACTION_BTN } from "@/styles/surfaces";
import {
  formatTaskerDate,
  getCommentComposerTransition,
  resolveCommentComposer,
  getInitials,
  getTaskerCommentsAttachmentBytes,
  TASKER_REPORT_ATTACHMENTS_MAX_BYTES,
  sortComments,
  taskerCommentDraftFrom,
  type CommentComposerTarget,
  type CommentOrder,
} from "../../utils/taskerRules";
import type {
  TaskerComment,
  TaskerCommentDraft,
} from "../../../types/typesTasker/TaskerTypes";
import { REPORT_LAYOUT as L, REPORT_TOUCH_MIN, reportTitleMetrics } from "./reportCompact";
import TaskerCommentComposer from "./TaskerCommentComposer";
import TaskerCommentThumb from "./TaskerCommentThumb";

type Styles = ReturnType<typeof createStyles>;

/** Separación extra para que los botones de 36×36 lleguen a 44 de área táctil. */
const ROW_BTN_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

const EMPTY_DRAFT: TaskerCommentDraft = { text: "", attachments: [] };

interface TaskerCommentsCardProps {
  comments: TaskerComment[];
  /** Muestra lápiz y papelera en ese comentario. */
  canEdit: (comment: TaskerComment) => boolean;
  onAdd: (draft: TaskerCommentDraft) => void;
  onEdit: (id: number, draft: TaskerCommentDraft) => void;
  /** Ya confirmado ("¿Eliminar comentario?"). */
  onDelete: (id: number) => void;
  /**
   * Orden controlado desde afuera (Seguimiento lo conserva al cambiar de
   * pestaña). Sin estas dos props, la tarjeta lo guarda ella misma.
   */
  order?: CommentOrder;
  onOrderChange?: (order: CommentOrder) => void;
  /**
   * Todos los comentarios van en un solo envío (Reportar Avería): tope de 7 MB
   * de archivos reales (TASKER_REPORT_ATTACHMENTS_MAX_BYTES) sumando los de
   * los demás comentarios.
   */
  sharedAttachmentLimit?: boolean;
  /** ScrollView de la pantalla, para llevar el formulario a la vista. */
  scrollRef?: RefObject<ScrollView | null>;
  /**
   * Al cambiar, cierra el formulario abierto (agregar o editar) y descarta su
   * borrador sin preguntar. Reportar lo sube tras un envío exitoso; sin él
   * (Seguimiento) nunca cambia.
   */
  resetKey?: number;
  /**
   * Reportar: tarjeta compacta (menos aire, ícono del título a la altura del
   * texto, texto del comentario de 2 líneas) y "Agregar" como botón circular
   * "+" / "×". Sin él (Seguimiento), la tarjeta de siempre.
   */
  compact?: boolean;
}

/**
 * Tarjeta "Comentarios (n)" de Reportar Avería y Seguimiento. Como en Tasker,
 * las imágenes y PDF siempre viven dentro de un comentario (texto, adjuntos o
 * ambos). La lista vive en la pantalla; la tarjeta guarda el orden, el visor
 * y qué formulario está abierto (ninguno, agregar o editar uno), de a uno.
 */
export default function TaskerCommentsCard({
  comments,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
  order: controlledOrder,
  onOrderChange,
  sharedAttachmentLimit = false,
  scrollRef,
  resetKey = 0,
  compact = false,
}: TaskerCommentsCardProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const [ownOrder, setOwnOrder] = useState<CommentOrder>("desc");
  const order = controlledOrder ?? ownOrder;
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [openTarget, setOpenTarget] = useState<CommentComposerTarget>(null);
  /** Último resetKey aplicado: si cambia, el formulario se cierra en este mismo render. */
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  /** Lo avisa el formulario abierto; decide si se pide "¿Descartar cambios?". */
  const changedRef = useRef(false);

  if (resetKey !== seenResetKey) {
    // Ajuste de estado durante el render (sin efecto): el composer se
    // desmonta ya, con su texto y adjuntos.
    setSeenResetKey(resetKey);
    setOpenTarget(null);
  }

  const sorted = useMemo(() => sortComments(comments, order), [comments, order]);
  // Reiniciada, o el comentario en edición dejó de existir → formulario cerrado.
  const composer = resolveCommentComposer(
    openTarget,
    comments.map((c) => c.id),
    { key: resetKey, seenKey: seenResetKey },
  );
  const isAdding = composer?.mode === "add";
  const editingId = composer?.mode === "edit" ? composer.id : null;

  const openComposer = useCallback((next: CommentComposerTarget) => {
    changedRef.current = false;
    setOpenTarget(next);
  }, []);

  const requestComposer = (next: CommentComposerTarget) => {
    const transition = getCommentComposerTransition(composer, next, changedRef.current);
    if (transition === "apply") openComposer(next);
    else if (transition === "confirm") {
      Alert.alert("¿Descartar cambios?", "Lo que escribiste en este comentario se perderá.", [
        { text: "Seguir editando", style: "cancel" },
        { text: "Descartar", style: "destructive", onPress: () => openComposer(next) },
      ]);
    }
  };

  const handleChangedChange = useCallback((changed: boolean) => {
    changedRef.current = changed;
  }, []);

  const handleSave = (draft: TaskerCommentDraft) => {
    if (composer?.mode === "edit") onEdit(composer.id, draft);
    else onAdd(draft);
    openComposer(null);
  };

  const handleDelete = (comment: TaskerComment) => {
    Alert.alert("¿Eliminar comentario?", undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => onDelete(comment.id) },
    ]);
  };

  const toggleOrder = () => {
    const next: CommentOrder = order === "desc" ? "asc" : "desc";
    if (onOrderChange) onOrderChange(next);
    else setOwnOrder(next);
  };

  const renderComposer = (mode: "add" | "edit", initialDraft: TaskerCommentDraft) => (
    <TaskerCommentComposer
      mode={mode}
      initialDraft={initialDraft}
      onSave={handleSave}
      onCancel={() => requestComposer(null)}
      onChangedChange={handleChangedChange}
      attachmentLimit={
        sharedAttachmentLimit
          ? {
              maxBytes: TASKER_REPORT_ATTACHMENTS_MAX_BYTES,
              usedElsewhere: getTaskerCommentsAttachmentBytes(comments, editingId ?? undefined),
            }
          : undefined
      }
      onOpenImage={setViewerUri}
      scrollRef={scrollRef}
      compact={compact}
    />
  );

  const titleIcon = compact ? reportTitleMetrics(font) : null;
  const toggleAdding = () => requestComposer(isAdding ? null : { mode: "add" });

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={[styles.cardHeader, compact && styles.cardHeaderCompact]}>
        <SectionIcon tone="blue" size={titleIcon?.side} radius={titleIcon?.radius}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={titleIcon?.glyph ?? 18}
            color={SECTION_ICON_COLOR}
          />
        </SectionIcon>
        <Text
          style={[
            styles.cardTitle,
            titleIcon && { fontSize: titleIcon.fontSize, lineHeight: titleIcon.lineHeight },
          ]}
        >
          {`Comentarios (${comments.length})`}
        </Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={toggleOrder}
          accessibilityLabel={
            order === "desc"
              ? "Ordenar comentarios del más antiguo al más reciente"
              : "Ordenar comentarios del más reciente al más antiguo"
          }
          activeOpacity={0.75}
        >
          <Ionicons name="swap-vertical-outline" size={18} color={TEXT_MUTED} />
        </TouchableOpacity>
        {compact ? (
          <TouchableOpacity
            style={styles.addCommentRoundBtn}
            onPress={toggleAdding}
            accessibilityRole="button"
            accessibilityLabel={isAdding ? "Cerrar comentario" : "Agregar comentario"}
            accessibilityState={{ expanded: isAdding }}
            activeOpacity={0.75}
          >
            <Ionicons name={isAdding ? "close" : "add"} size={22} color={PRIMARY_700} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.addCommentBtn}
            onPress={toggleAdding}
            accessibilityState={{ expanded: isAdding }}
            activeOpacity={0.75}
          >
            <Ionicons
              name={isAdding ? "remove-circle-outline" : "add-circle-outline"}
              size={16}
              color={PRIMARY_700}
            />
            <Text style={styles.addCommentText}>{isAdding ? "Ocultar" : "Agregar"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {isAdding && (
        <View style={[styles.addComposer, compact && styles.addComposerCompact]}>
          {renderComposer("add", EMPTY_DRAFT)}
        </View>
      )}

      {sorted.length === 0 ? (
        !isAdding && (
          <Text style={styles.emptyText}>Agrega un comentario, una imagen o un PDF.</Text>
        )
      ) : (
        <View style={[styles.commentList, compact && styles.commentListCompact]}>
          {sorted.map((comment) =>
            comment.id === editingId ? (
              <React.Fragment key={comment.id}>
                {renderComposer("edit", taskerCommentDraftFrom(comment))}
              </React.Fragment>
            ) : (
              <CommentItem
                key={comment.id}
                comment={comment}
                editable={canEdit(comment)}
                styles={styles}
                compact={compact}
                onEdit={() => requestComposer({ mode: "edit", id: comment.id })}
                onDelete={() => handleDelete(comment)}
                onOpenImage={setViewerUri}
              />
            ),
          )}
        </View>
      )}

      <ImageViewerModal uri={viewerUri} onClose={() => setViewerUri(null)} />
    </View>
  );
}

interface CommentItemProps {
  comment: TaskerComment;
  editable: boolean;
  styles: Styles;
  compact: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenImage: (uri: string) => void;
}

function CommentItem({
  comment,
  editable,
  styles,
  compact,
  onEdit,
  onDelete,
  onOpenImage,
}: CommentItemProps) {
  return (
    <View style={[styles.comment, compact && styles.commentCompact]}>
      <View style={styles.commentHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(comment.addUser.name)}</Text>
        </View>
        <View style={styles.commentMeta}>
          <Text style={styles.commentAuthor}>{comment.addUser.name}</Text>
          <Text style={styles.commentDate}>{formatTaskerDate(comment.createdDate)}</Text>
        </View>
        {editable && (
          <View style={styles.rowActions}>
            <TouchableOpacity
              style={styles.rowBtn}
              onPress={onEdit}
              hitSlop={ROW_BTN_HIT_SLOP}
              accessibilityLabel="Editar comentario"
              activeOpacity={0.75}
            >
              <Ionicons name="create-outline" size={18} color={ICON_EDIT} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rowBtn}
              onPress={onDelete}
              hitSlop={ROW_BTN_HIT_SLOP}
              accessibilityLabel="Eliminar comentario"
              activeOpacity={0.75}
            >
              <Ionicons name="trash-outline" size={18} color={DANGER_ICON} />
            </TouchableOpacity>
          </View>
        )}
      </View>
      {/* Comentario de solo adjuntos (como Tasker): sin línea de texto vacía. */}
      {!!comment.comment.trim() && <Text style={styles.commentText}>{comment.comment}</Text>}
      {comment.images.length > 0 && (
        <View style={styles.commentImages}>
          {comment.images.map((path, index) => (
            <TaskerCommentThumb
              key={`${path}-${index}`}
              uri={path}
              name={`adjunto ${index + 1} del comentario`}
              onOpen={onOpenImage}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
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
    // Botón de ícono cuadrado: 40×40 fijo (área táctil).
    iconBtn: {
      ...ROW_ACTION_BTN,
      width: 40,
      height: 40,
      borderRadius: RADIUS_LG,
      alignItems: "center",
      justifyContent: "center",
    },
    addCommentBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      minHeight: verticalScale(40),
      paddingHorizontal: scale(12),
      borderWidth: 1,
      borderColor: PRIMARY_TINT_BORDER,
      borderRadius: RADIUS_LG,
      backgroundColor: PRIMARY_TINT_50,
    },
    addCommentText: { fontSize: font(13), fontWeight: "700", color: PRIMARY_700 },
    // Botón circular "+" / "×" de Reportar: 44×44 fijo (área táctil), mismo acento.
    addCommentRoundBtn: {
      width: REPORT_TOUCH_MIN,
      height: REPORT_TOUCH_MIN,
      borderWidth: 1,
      borderColor: PRIMARY_TINT_BORDER,
      borderRadius: RADIUS_PILL,
      backgroundColor: PRIMARY_TINT_50,
      alignItems: "center",
      justifyContent: "center",
    },
    // Reportar compacto: medidas en reportCompact.ts.
    cardCompact: {
      paddingHorizontal: scale(L.cardPaddingH),
      paddingTop: verticalScale(L.cardPaddingTop),
      paddingBottom: verticalScale(L.cardPaddingBottom),
    },
    cardHeaderCompact: {
      gap: scale(L.headerGap),
      marginBottom: verticalScale(L.headerMarginBottom),
    },
    addComposerCompact: { marginBottom: verticalScale(L.addComposerMarginBottom) },
    commentListCompact: { gap: verticalScale(L.commentListGap) },
    commentCompact: { padding: scale(L.commentPadding) },
    commentList: { gap: verticalScale(8) },
    comment: {
      padding: scale(12),
      borderRadius: RADIUS_LG,
      backgroundColor: FIELD_BACKGROUND,
    },
    commentHeader: { flexDirection: "row", alignItems: "center", gap: scale(10) },
    // Avatar circular de iniciales: 32×32 fijo.
    avatar: {
      width: 32,
      height: 32,
      borderRadius: RADIUS_PILL,
      backgroundColor: PRIMARY_TINT_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: font(12), fontWeight: "700", color: PRIMARY_700 },
    commentMeta: { flex: 1 },
    commentAuthor: { fontSize: font(14), fontWeight: "700", color: TEXT_PRIMARY },
    commentDate: { fontSize: font(12), color: TEXT_MUTED, fontVariant: ["tabular-nums"] },
    // gap ≥ 8: los hitSlop de 4 de cada botón no se pisan.
    rowActions: { flexDirection: "row", alignItems: "center", gap: scale(8) },
    // Botón de ícono cuadrado: 36×36 fijo (+ hitSlop 4 = 44 de área táctil).
    rowBtn: {
      width: 36,
      height: 36,
      borderRadius: RADIUS_SM,
      backgroundColor: CARD_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
    },
    commentText: {
      marginTop: verticalScale(8),
      fontSize: font(14),
      lineHeight: font(20),
      color: TEXT_SECONDARY,
    },
    addComposer: { marginBottom: verticalScale(12) },
    commentImages: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: scale(8),
      marginTop: verticalScale(10),
    },
    emptyText: { fontSize: font(13), color: TEXT_PLACEHOLDER, fontStyle: "italic" },
  });
}
