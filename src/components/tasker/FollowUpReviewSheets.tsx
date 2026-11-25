import { Ionicons } from "@expo/vector-icons";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CARD_BACKGROUND,
  CARD_BORDER,
  DANGER_ICON,
  ERROR_COLOR,
  ON_PRIMARY,
  PRIMARY_700,
  PRIMARY_COLOR,
  PRIMARY_TINT_50,
  PRIMARY_TINT_BORDER,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";
import { RADIUS_LG, RADIUS_PILL, useResponsive } from "@/constants/responsive";
import ImageViewerModal from "@/components/ui/ImageViewerModal";
import {
  ADD_FILE_BTN,
  BOTTOM_SHEET_CARD,
  DIALOG_OVERLAY,
  FIELD_SURFACE,
  FOOTER_BTN_CANCEL,
  FOOTER_BTN_SAVE,
} from "@/styles/surfaces";
import { formatTaskerVideoProgress, TASKER_COMMENT_MAX_LENGTH } from "../../utils/taskerRules";
import { canSaveEvaluation, evaluationRequirements } from "../../utils/taskerFollowUpRules";
import { scrollIntoView } from "./scrollIntoView";
import type {
  TaskerAttachment,
  TaskerTaskListItem,
  TaskerTaskState,
} from "../../../types/typesTasker/TaskerTypes";
import TaskerAttachmentSheet from "./TaskerAttachmentSheet";
import TaskerCommentThumb from "./TaskerCommentThumb";
import { taskerMultilineStyle } from "./taskerCompact";
import { useTaskerAttachmentPicker } from "./useTaskerAttachmentPicker";

/** Catálogo de evaluaciones (GET /taskr/taskStates), cargado una vez por pantalla. */
export type TaskStatesCatalog =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; taskStates: TaskerTaskState[] };

/** El botón de quitar mide 24×24: hitSlop 10 lo lleva a 44 de área táctil. */
const REMOVE_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

type Styles = ReturnType<typeof createStyles>;

/** ScrollView del cuerpo de la hoja abierta: el campo de comentario se lleva a la vista. */
const SheetScrollContext = createContext<RefObject<ScrollView | null> | null>(null);

function useSheetStyles(): Styles {
  const { scale, verticalScale, font } = useResponsive();
  return useMemo(() => createStyles(scale, verticalScale, font), [scale, verticalScale, font]);
}

interface ShellProps {
  visible: boolean;
  title: string;
  subtitle: string;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  onClose: () => void;
  /** iOS: la hoja terminó de cerrarse (recién ahí se puede abrir otro Modal). */
  onDismiss?: () => void;
  styles: Styles;
  children: ReactNode;
}

/**
 * Hoja que sube desde abajo (BOTTOM_SHEET_CARD), con título, subtítulo, "×",
 * cuerpo con scroll y "Atrás" / "Guardar". Enviando: nada se cierra ni se
 * edita y "Guardar" muestra el indicador. Con el teclado abierto la hoja
 * entera sube sobre él (KAV "padding" en las dos plataformas, patrón de
 * login): el cuerpo se achica y el pie con los botones queda a la vista.
 */
function ReviewSheetShell({
  visible,
  title,
  subtitle,
  saving,
  canSave,
  onSave,
  onClose,
  onDismiss,
  styles,
  children,
}: ShellProps) {
  const insets = useSafeAreaInsets();
  const { verticalScale } = useResponsive();
  const close = () => {
    if (!saving) onClose();
  };
  const disabled = !canSave || saving;
  const scrollRef = useRef<ScrollView>(null);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      onDismiss={onDismiss}
    >
      <KeyboardAvoidingView style={styles.overlay} behavior="padding" keyboardVerticalOffset={0}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={close}
          accessibilityLabel="Cerrar"
        />
        <View style={[styles.sheet, { paddingBottom: verticalScale(12) + insets.bottom }]}>
          <View style={styles.header}>
            <View style={styles.headerBody}>
              <Text style={styles.title}>{title}</Text>
              {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            <TouchableOpacity
              onPress={close}
              disabled={saving}
              hitSlop={8}
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={20} color={TEXT_MUTED} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <SheetScrollContext.Provider value={scrollRef}>{children}</SheetScrollContext.Provider>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.footerBtn, styles.cancelBtn]}
              onPress={close}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelText}>Atrás</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, styles.saveBtn, disabled && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={disabled}
              accessibilityState={{ disabled, busy: saving }}
              activeOpacity={0.8}
            >
              {saving && <ActivityIndicator size="small" color={ON_PRIMARY} />}
              <Text style={styles.saveText}>{saving ? "Guardando…" : "Guardar"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * "Comentario" multilínea con el contador; asterisco si es obligatorio. Al
 * enfocarlo (o al terminar de abrir el teclado) el cuerpo de la hoja se
 * desplaza hasta verlo entero; "Atrás" / "Guardar" van en el pie fijo.
 */
function CommentField({
  value,
  onChange,
  required,
  editable,
  styles,
}: {
  value: string;
  onChange: (text: string) => void;
  required: boolean;
  editable: boolean;
  styles: Styles;
}) {
  const scrollRef = useContext(SheetScrollContext);
  const fieldRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);

  const reveal = useCallback(() => {
    void scrollIntoView(scrollRef?.current, fieldRef.current);
  }, [scrollRef]);

  // keyboardDidShow: el teclado terminó de abrir y la hoja ya subió (KAV).
  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      if (inputRef.current?.isFocused()) reveal();
    });
    return () => subscription.remove();
  }, [reveal]);

  return (
    <View ref={fieldRef} style={styles.field}>
      <Text style={styles.label}>
        Comentario{required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={value}
        onChangeText={onChange}
        // Teclado ya abierto (venía de otro campo): no habrá keyboardDidShow.
        onFocus={() => {
          if (Keyboard.isVisible()) reveal();
        }}
        editable={editable}
        placeholder="Escriba un comentario"
        placeholderTextColor={TEXT_PLACEHOLDER}
        maxLength={TASKER_COMMENT_MAX_LENGTH}
        multiline
        textAlignVertical="top"
        accessibilityLabel={required ? "Comentario, obligatorio" : "Comentario"}
      />
      <Text style={styles.counter}>
        {value.length}/{TASKER_COMMENT_MAX_LENGTH}
      </Text>
    </View>
  );
}

// ─── Evaluación de una acción ───────────────────────────────────────────────

interface EvaluationSheetProps {
  visible: boolean;
  /** Acción a evaluar (con id: canEvaluateItem). */
  item: TaskerTaskListItem | null;
  catalog: TaskStatesCatalog;
  onRetryCatalog: () => void;
  saving: boolean;
  onSave: (taskState: TaskerTaskState, comment: string, images: string[]) => void;
  onClose: () => void;
  onDismiss?: () => void;
}

/**
 * Hoja "Evaluación" (calca modals/Evaluation.js de etaskr-mobile): las
 * evaluaciones como opciones de selección única (preseleccionada la actual o
 * ninguna), "Comentario" (obligatorio —o una imagen— si requiresComment) e
 * "Imágenes" si suggestImage, con el mismo selector de adjuntos que los
 * comentarios. Quien la abre la remonta (key) para empezar de cero.
 */
export function TaskerEvaluationSheet({
  visible,
  item,
  catalog,
  onRetryCatalog,
  saving,
  onSave,
  onClose,
  onDismiss,
}: EvaluationSheetProps) {
  const styles = useSheetStyles();
  const [selectedId, setSelectedId] = useState<number | null>(item?.taskStateId ?? null);
  const [comment, setComment] = useState("");
  const [attachments, setAttachments] = useState<TaskerAttachment[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const handleAddAttachments = useCallback((added: TaskerAttachment[]) => {
    setAttachments((prev) => [...prev, ...added]);
  }, []);
  const picker = useTaskerAttachmentPicker(attachments, handleAddAttachments);

  const options = catalog.status === "ready" ? catalog.taskStates : [];
  const selected = options.find((option) => option.id === selectedId) ?? null;
  const { commentRequired, showImages } = evaluationRequirements(selected);
  const canSave =
    canSaveEvaluation(selected, comment, attachments.length) && !picker.busy && !!item;

  const handleSave = () => {
    if (!canSave || saving || !selected) return;
    onSave(
      selected,
      comment,
      attachments.map((a) => a.dataUri),
    );
  };

  const renderOptions = () => {
    if (catalog.status === "loading") {
      return (
        <View style={styles.catalogNotice}>
          <ActivityIndicator color={PRIMARY_COLOR} />
          <Text style={styles.catalogText}>Cargando evaluaciones…</Text>
        </View>
      );
    }
    if (catalog.status === "error") {
      return (
        <View style={styles.catalogNotice} accessibilityLiveRegion="polite">
          <Text style={[styles.catalogText, styles.catalogError]}>{catalog.message}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRetryCatalog} activeOpacity={0.8}>
            <Ionicons name="refresh" size={16} color={ON_PRIMARY} />
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (options.length === 0) {
      return (
        <View style={styles.catalogNotice}>
          <Text style={styles.catalogText}>No hay evaluaciones configuradas.</Text>
        </View>
      );
    }
    return (
      <View style={styles.options} accessibilityRole="radiogroup">
        {options.map((option) => {
          const active = option.id === selectedId;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => setSelectedId(option.id)}
              disabled={saving}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, disabled: saving }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={active ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={active ? PRIMARY_COLOR : TEXT_PLACEHOLDER}
              />
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {option.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <ReviewSheetShell
      visible={visible}
      title="Evaluación"
      subtitle={item?.text ?? ""}
      saving={saving}
      canSave={canSave}
      onSave={handleSave}
      onClose={onClose}
      onDismiss={onDismiss}
      styles={styles}
    >
      {renderOptions()}

      <CommentField
        value={comment}
        onChange={setComment}
        required={commentRequired}
        editable={!saving}
        styles={styles}
      />

      {showImages && (
        <View style={styles.field}>
          <Text style={styles.label}>Imágenes</Text>
          {attachments.length > 0 && (
            <View style={styles.thumbs}>
              {attachments.map((file) => (
                <View key={file.id} style={styles.thumbWrap}>
                  <TaskerCommentThumb uri={file.dataUri} name={file.name} onOpen={setViewerUri} />
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
          {picker.progress != null && (
            <Text style={styles.progress} accessibilityLiveRegion="polite">
              {formatTaskerVideoProgress(picker.progress)}
            </Text>
          )}
        </View>
      )}

      {/* Dentro de la hoja: en iOS un Modal solo se presenta encima de otro si es hijo suyo. */}
      <TaskerAttachmentSheet {...picker.sheet} />
      <ImageViewerModal uri={viewerUri} onClose={() => setViewerUri(null)} />
    </ReviewSheetShell>
  );
}

// ─── Incompleta ─────────────────────────────────────────────────────────────

interface IncompleteSheetProps {
  visible: boolean;
  /** Nombre del estado (GET /taskr/states o "Incompleta"). */
  title: string;
  subtitle: string;
  saving: boolean;
  onSave: (comment: string) => void;
  onClose: () => void;
  onDismiss?: () => void;
}

/** Hoja de Incompleta: comentario obligatorio (trim), mismo estilo que la evaluación. */
export function TaskerIncompleteSheet({
  visible,
  title,
  subtitle,
  saving,
  onSave,
  onClose,
  onDismiss,
}: IncompleteSheetProps) {
  const styles = useSheetStyles();
  const [comment, setComment] = useState("");
  const canSave = comment.trim() !== "";

  return (
    <ReviewSheetShell
      visible={visible}
      title={title}
      subtitle={subtitle}
      saving={saving}
      canSave={canSave}
      onSave={() => {
        if (canSave && !saving) onSave(comment);
      }}
      onClose={onClose}
      onDismiss={onDismiss}
      styles={styles}
    >
      <Text style={styles.hint}>Explica qué falta: el ticket vuelve al técnico.</Text>
      <CommentField
        value={comment}
        onChange={setComment}
        required
        editable={!saving}
        styles={styles}
      />
    </ReviewSheetShell>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    overlay: { ...DIALOG_OVERLAY, flex: 1, justifyContent: "flex-end" },
    backdrop: { flex: 1 },
    sheet: {
      ...BOTTOM_SHEET_CARD,
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(16),
      width: "100%",
      maxWidth: 520,
      maxHeight: "90%",
      alignSelf: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: scale(12),
      marginBottom: verticalScale(12),
    },
    headerBody: { flex: 1, gap: verticalScale(2) },
    title: { fontSize: font(16), fontWeight: "700", color: TEXT_PRIMARY },
    subtitle: { fontSize: font(14), fontWeight: "600", color: TEXT_SECONDARY },
    // Se achica (con scroll) cuando el teclado sube la hoja: el pie no se sale.
    body: { flexGrow: 0, flexShrink: 1 },
    bodyContent: { gap: verticalScale(14), paddingBottom: verticalScale(4) },
    hint: { fontSize: font(13), lineHeight: font(18), color: TEXT_MUTED },
    catalogNotice: {
      alignItems: "center",
      gap: verticalScale(10),
      paddingVertical: verticalScale(16),
    },
    catalogText: { fontSize: font(14), color: TEXT_SECONDARY, textAlign: "center" },
    catalogError: { color: ERROR_COLOR },
    retryBtn: {
      ...FOOTER_BTN_SAVE,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      minHeight: 44,
      paddingHorizontal: scale(20),
    },
    retryText: { fontSize: font(14), fontWeight: "700", color: ON_PRIMARY },
    options: { gap: verticalScale(8) },
    option: {
      ...FIELD_SURFACE,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      minHeight: 44,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    optionActive: { borderColor: PRIMARY_TINT_BORDER, backgroundColor: PRIMARY_TINT_50 },
    optionText: { flex: 1, fontSize: font(14), color: TEXT_PRIMARY },
    optionTextActive: { fontWeight: "700", color: PRIMARY_700 },
    field: { gap: verticalScale(6) },
    label: { fontSize: font(12), fontWeight: "600", color: TEXT_SECONDARY },
    required: { color: ERROR_COLOR, fontWeight: "700" },
    input: {
      ...FIELD_SURFACE,
      ...taskerMultilineStyle(scale, font),
      paddingHorizontal: scale(12),
      fontSize: font(14),
      color: TEXT_PRIMARY,
    },
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
    addBtn: {
      ...ADD_FILE_BTN,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      minHeight: verticalScale(48),
    },
    addBtnText: { fontSize: font(14), fontWeight: "600", color: PRIMARY_700 },
    progress: {
      fontSize: font(12),
      fontWeight: "600",
      color: PRIMARY_700,
      fontVariant: ["tabular-nums"],
    },
    footer: {
      flexDirection: "row",
      gap: scale(10),
      marginTop: verticalScale(14),
    },
    footerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      minHeight: verticalScale(44),
      borderRadius: RADIUS_LG,
    },
    cancelBtn: { ...FOOTER_BTN_CANCEL, flex: 1 },
    cancelText: { fontSize: font(14), fontWeight: "600", color: TEXT_SECONDARY },
    saveBtn: { ...FOOTER_BTN_SAVE, flex: 2 },
    // Sin sombra mientras está translúcido: en Android la elevation se ve a través del botón.
    saveBtnDisabled: { opacity: 0.5, shadowColor: "transparent", elevation: 0 },
    saveText: { fontSize: font(14), fontWeight: "700", color: ON_PRIMARY },
  });
}
