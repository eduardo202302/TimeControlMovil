import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Keyboard,
  type ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CARD_BACKGROUND,
  CARD_BORDER,
  DANGER_ICON,
  ON_PRIMARY,
  PRIMARY_700,
  PRIMARY_TINT_50,
  PRIMARY_TINT_BORDER,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";
import { RADIUS_LG, RADIUS_PILL, useResponsive } from "@/constants/responsive";
import {
  ADD_FILE_BTN,
  FIELD_SURFACE,
  FOOTER_BTN_CANCEL,
  FOOTER_BTN_SAVE,
} from "@/styles/surfaces";
import {
  canSaveTaskerComment,
  isTaskerCommentDraftChanged,
  TASKER_COMMENT_MAX_LENGTH,
  type TaskerAttachmentLimit,
} from "../../utils/taskerRules";
import type {
  TaskerAttachment,
  TaskerCommentDraft,
} from "../../../types/typesTasker/TaskerTypes";
import { REPORT_LAYOUT as L, reportMultilineStyle } from "./reportCompact";
import { scrollIntoView } from "./scrollIntoView";
import TaskerCommentThumb from "./TaskerCommentThumb";
import { useTaskerAttachmentPicker } from "./useTaskerAttachmentPicker";

/** El botón de quitar mide 24×24: hitSlop 10 lo lleva a 44 de área táctil. */
const REMOVE_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

interface TaskerCommentComposerProps {
  mode: "add" | "edit";
  /** Vacío al agregar; texto y adjuntos del comentario al editar. */
  initialDraft: TaskerCommentDraft;
  onSave: (draft: TaskerCommentDraft) => void;
  /** La tarjeta decide si pide "¿Descartar cambios?". */
  onCancel: () => void;
  /** Avisa a la tarjeta si hay cambios sin guardar. */
  onChangedChange?: (changed: boolean) => void;
  /** Avisa el borrador a cada cambio (Reportar lo revisa al enviar). */
  onDraftChange?: (draft: TaskerCommentDraft) => void;
  /**
   * Tope de adjuntos de todo el envío, con lo que ya pesan los OTROS
   * comentarios (Reportar Avería). Sin él, solo los topes del selector.
   */
  attachmentLimit?: TaskerAttachmentLimit;
  onOpenImage: (uri: string) => void;
  /** Enviando (Seguimiento): todo queda bloqueado y "Guardar" muestra el indicador. */
  saving?: boolean;
  /** ScrollView de la pantalla: al abrir y al enfocar el texto se desplaza hasta acá. */
  scrollRef?: RefObject<ScrollView | null>;
  /**
   * Reportar: menos aire y el texto arranca en 2 líneas (crece hasta 5 y
   * luego hace scroll interno). Sin él (Seguimiento), el formulario de siempre.
   */
  compact?: boolean;
}

/**
 * Formulario en línea "Agregar / Editar comentario" dentro de
 * TaskerCommentsCard (Reportar Avería y Seguimiento). Devuelve el borrador:
 * Reportar lo aplica en local y Seguimiento lo envía (ver `saving`).
 */
export default function TaskerCommentComposer({
  mode,
  initialDraft,
  onSave,
  onCancel,
  onChangedChange,
  onDraftChange,
  attachmentLimit,
  onOpenImage,
  saving = false,
  scrollRef,
  compact = false,
}: TaskerCommentComposerProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  // El borrador inicial es el del montaje: la tarjeta remonta al cambiar de comentario.
  const [initial] = useState(initialDraft);
  const [text, setText] = useState(initial.text);
  const [attachments, setAttachments] = useState<TaskerAttachment[]>(initial.attachments);

  const handleAddAttachments = useCallback((added: TaskerAttachment[]) => {
    setAttachments((prev) => [...prev, ...added]);
  }, []);
  const picker = useTaskerAttachmentPicker(attachments, handleAddAttachments, attachmentLimit);

  const draft: TaskerCommentDraft = { text, attachments };
  const canSave = canSaveTaskerComment(draft);
  const changed = isTaskerCommentDraftChanged(initial, draft);

  useEffect(() => {
    onChangedChange?.(changed);
  }, [changed, onChangedChange]);

  useEffect(() => {
    onDraftChange?.({ text, attachments });
  }, [text, attachments, onDraftChange]);

  // ── Desplazamiento: al abrir, todo el formulario; con teclado, el campo ──
  const containerRef = useRef<View>(null);
  const inputBlockRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const openedRef = useRef(false);

  const handleContainerLayout = () => {
    if (openedRef.current) return;
    openedRef.current = true;
    scrollIntoView(scrollRef?.current, containerRef.current);
  };

  const revealInput = useCallback(() => {
    scrollIntoView(scrollRef?.current, inputBlockRef.current);
  }, [scrollRef]);

  // keyboardDidShow: el teclado ya terminó de abrir (y KeyboardAvoidingView ya se ajustó).
  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      if (inputRef.current?.isFocused()) revealInput();
    });
    return () => subscription.remove();
  }, [revealInput]);

  const handleFocus = () => {
    // Teclado ya abierto (venía de otro campo): no habrá keyboardDidShow.
    if (Keyboard.isVisible()) revealInput();
  };

  const handleSave = () => {
    if (canSave && !saving) onSave(draft);
  };

  return (
    <View
      ref={containerRef}
      style={[styles.container, compact && styles.containerCompact]}
      onLayout={handleContainerLayout}
    >
      <View ref={inputBlockRef} style={styles.inputBlock}>
        <TextInput
          ref={inputRef}
          style={[styles.input, compact && styles.inputCompact]}
          value={text}
          onChangeText={setText}
          onFocus={handleFocus}
          editable={!saving}
          placeholder="Escriba un comentario"
          placeholderTextColor={TEXT_PLACEHOLDER}
          maxLength={TASKER_COMMENT_MAX_LENGTH}
          multiline
          textAlignVertical="top"
          accessibilityLabel={mode === "edit" ? "Editar comentario" : "Nuevo comentario"}
        />
        <Text style={styles.counter}>
          {text.length}/{TASKER_COMMENT_MAX_LENGTH}
        </Text>
      </View>

      {attachments.length > 0 && (
        <View style={styles.thumbs}>
          {attachments.map((file) => (
            <View key={file.id} style={styles.thumbWrap}>
              <TaskerCommentThumb uri={file.dataUri} name={file.name} onOpen={onOpenImage} />
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => setAttachments((prev) => prev.filter((a) => a.id !== file.id))}
                disabled={saving}
                hitSlop={REMOVE_HIT_SLOP}
                accessibilityLabel={`Quitar ${file.name}`}
                activeOpacity={0.75}
              >
                <Ionicons name="close" size={14} color={DANGER_ICON} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.attachBlock}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={picker.openPicker}
          disabled={picker.busy || saving}
          activeOpacity={0.75}
        >
          {picker.busy ? (
            <ActivityIndicator size="small" color={PRIMARY_700} />
          ) : (
            <Ionicons name="camera-outline" size={18} color={PRIMARY_700} />
          )}
          <Text style={styles.addBtnText}>Tomar foto o adjuntar archivo</Text>
        </TouchableOpacity>
        {!compact && <Text style={styles.helper}>Imágenes o PDF.</Text>}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.cancelBtn]}
          onPress={onCancel}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
          accessibilityState={{ disabled: !canSave || saving, busy: saving }}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color={ON_PRIMARY} />
          ) : (
            <Ionicons name="checkmark" size={18} color={ON_PRIMARY} />
          )}
          <Text style={styles.saveText}>{saving ? "Enviando…" : "Guardar"}</Text>
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
    container: {
      gap: verticalScale(12),
      padding: scale(12),
      borderRadius: RADIUS_LG,
      borderWidth: 1,
      borderColor: PRIMARY_TINT_BORDER,
      backgroundColor: PRIMARY_TINT_50,
    },
    inputBlock: { gap: verticalScale(4) },
    input: {
      ...FIELD_SURFACE,
      backgroundColor: CARD_BACKGROUND,
      minHeight: verticalScale(88),
      padding: scale(12),
      fontSize: font(14),
      lineHeight: font(20),
      color: TEXT_PRIMARY,
    },
    containerCompact: {
      gap: verticalScale(L.composerGap),
      padding: scale(L.composerPadding),
    },
    inputCompact: reportMultilineStyle(scale, font),
    counter: {
      alignSelf: "flex-end",
      fontSize: font(12),
      color: TEXT_MUTED,
      fontVariant: ["tabular-nums"],
    },
    thumbs: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: scale(10),
      // Aire para el botón de quitar, que sobresale 6 por arriba.
      paddingTop: verticalScale(6),
    },
    thumbWrap: { position: "relative" },
    // Botón de quitar sobre la miniatura: 24×24 fijo (+ hitSlop = 44 de área táctil).
    removeBtn: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 24,
      height: 24,
      borderWidth: 1,
      borderColor: CARD_BORDER,
      borderRadius: RADIUS_PILL,
      backgroundColor: CARD_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
    },
    attachBlock: { gap: verticalScale(6) },
    addBtn: {
      ...ADD_FILE_BTN,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      minHeight: verticalScale(48),
    },
    addBtnText: { fontSize: font(14), fontWeight: "600", color: PRIMARY_700 },
    helper: { fontSize: font(12), color: TEXT_MUTED },
    actions: { flexDirection: "row", gap: scale(10) },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      minHeight: verticalScale(44),
    },
    cancelBtn: { ...FOOTER_BTN_CANCEL, flex: 1 },
    cancelText: { fontSize: font(14), fontWeight: "600", color: TEXT_SECONDARY },
    saveBtn: { ...FOOTER_BTN_SAVE, flex: 2 },
    // Sin sombra mientras está translúcido: en Android la elevation se ve a través del botón.
    saveBtnDisabled: { opacity: 0.5, shadowColor: "transparent", elevation: 0 },
    saveText: { fontSize: font(14), fontWeight: "700", color: ON_PRIMARY },
  });
}
