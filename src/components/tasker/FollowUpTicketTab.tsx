import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  type ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ERROR_COLOR,
  ON_PRIMARY,
  PRIMARY_700,
  PRIMARY_COLOR,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
} from "@/constants/colors";
import ResultDialog, { type ResultDialogTone } from "@/components/ui/ResultDialog";
import {
  formatElapsed,
  formatPhone,
  formatReportSentAt,
  formatTaskerDate,
  getTagChipTone,
  getTaskerFaultLabel,
  type CommentOrder,
} from "../../utils/taskerRules";
import {
  canCommentOnTask,
  canEvaluateItem,
  canEvaluateTask,
  countUnevaluated,
  formatTaskListProgress,
  getClosedTaskNotice,
  getCompleteConfirmMessage,
  getReviewClosedNotice,
  getReviewStateName,
  getStateChangeSuccessTitle,
  getTaskerClientName,
  getTaskListProgress,
  getTaskListStateName,
  shouldCloseReviewSheet,
  TASKER_REVIEW_CLOSED_TITLE,
  TASKER_STATE_COMPLETED,
  TASKER_STATE_INCOMPLETE,
  TASKER_UNASSIGNED_LABEL,
  type ReviewSheetKind,
} from "../../utils/taskerFollowUpRules";
import type { PatchTaskerTaskResult } from "../../utils/taskerApi";
import { useSchoolStore } from "../../../store/useSchoolStore";
import type {
  TaskerCheckState,
  TaskerCommentDraft,
  TaskerReviewStateId,
  TaskerState,
  TaskerTask,
  TaskerTaskListItem,
  TaskerTaskState,
} from "../../../types/typesTasker/TaskerTypes";
import { FollowUpCardHeader, StateChip } from "./FollowUpParts";
import {
  TaskerEvaluationSheet,
  TaskerIncompleteSheet,
  type TaskStatesCatalog,
} from "./FollowUpReviewSheets";
import type { FollowUpStyles } from "./followUpStyles";
import TaskerCommentsCard, { type TaskerCommentsCardHandle } from "./TaskerCommentsCard";
import { useNowMs } from "./useNowMs";

/** iOS: si la hoja no avisa onDismiss, lo pendiente se muestra igual pasado este tiempo. */
const SHEET_DISMISS_FALLBACK_MS = 700;

/** El botón de evaluar mide 36×36: hitSlop 4 lo lleva a 44 de área táctil. */
const EVAL_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

interface ReviewResult {
  tone: ResultDialogTone;
  title: string;
  message?: string;
}

interface FollowUpTicketTabProps {
  task: TaskerTask;
  styles: FollowUpStyles;
  /** Seguimiento a la vista y app en primer plano: "Transcurrido" corre. */
  live: boolean;
  commentOrder: CommentOrder;
  onCommentOrderChange: (order: CommentOrder) => void;
  /** Envía el comentario; true = enviado (el formulario se cierra). */
  onAddComment: (draft: TaskerCommentDraft) => Promise<boolean>;
  /** Seguimiento consulta si hay un formulario abierto cuando el ticket se cierra. */
  commentsCardRef: RefObject<TaskerCommentsCardHandle | null>;
  /** Al cambiar, cierra el formulario de comentario sin preguntar. */
  commentsResetKey: number;
  /** ScrollView de Seguimiento: la tarjeta lleva su formulario a la vista. */
  scrollRef: RefObject<ScrollView | null>;
  /** Evaluaciones (GET /taskr/taskStates) para la hoja y el nombre del chip. */
  taskStates: TaskStatesCatalog;
  /** Estados de la tarea (GET /taskr/states): nombres de Completada / Incompleta. */
  states: TaskerState[];
  onRetryTaskStates: () => void;
  /**
   * Guarda la evaluación y recarga el detalle. "Ticket no disponible"
   * (gone) lo avisa Seguimiento; el resto de los errores, esta pestaña.
   */
  onEvaluate: (
    item: { id: number; text: string },
    taskState: TaskerTaskState,
    comment: string,
    images: string[],
  ) => Promise<PatchTaskerTaskResult>;
  /** Completada / Incompleta y recarga el detalle (gone, igual que onEvaluate). */
  onChangeState: (
    stateId: TaskerReviewStateId,
    comment?: string,
  ) => Promise<PatchTaskerTaskResult>;
}

export default function FollowUpTicketTab({
  task,
  styles,
  live,
  commentOrder,
  onCommentOrderChange,
  onAddComment,
  commentsCardRef,
  commentsResetKey,
  scrollRef,
  taskStates,
  states,
  onRetryTaskStates,
  onEvaluate,
  onChangeState,
}: FollowUpTicketTabProps) {
  const faultLabel = useSchoolStore((state) => getTaskerFaultLabel(state.taskerConfig));
  const canComment = canCommentOnTask(task.stateId);
  const canReview = canEvaluateTask(task.stateId);
  const progress = useMemo(() => getTaskListProgress(task.faults), [task.faults]);
  const catalog = taskStates.status === "ready" ? taskStates.taskStates : [];
  const completedName = getReviewStateName(states, TASKER_STATE_COMPLETED);
  const incompleteName = getReviewStateName(states, TASKER_STATE_INCOMPLETE);

  // ── Revisión: hojas, envío y resultado ──
  const [evalTarget, setEvalTarget] = useState<TaskerTaskListItem | null>(null);
  const [evalVisible, setEvalVisible] = useState(false);
  const [incompleteVisible, setIncompleteVisible] = useState(false);
  /** Remonta la hoja en cada apertura: empieza de cero. */
  const [sheetKey, setSheetKey] = useState(0);
  const [sending, setSending] = useState<ReviewSheetKind | null>(null);
  /** Bloquea el doble envío entre el toque y el siguiente render. */
  const sendingRef = useRef(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  /** Lo que la confirmación de Completada lee al tocar (el Alert guarda su closure). */
  const latestRef = useRef(task);
  useEffect(() => {
    latestRef.current = task;
  }, [task]);

  // Un Modal no se presenta en iOS mientras otro se cierra: lo que va después
  // de una hoja (resultado, aviso) espera su onDismiss, como el selector de adjuntos.
  const pendingRef = useRef<(() => void) | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushPending = useCallback(() => {
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
    fallbackRef.current = null;
    const action = pendingRef.current;
    pendingRef.current = null;
    action?.();
  }, []);
  const runAfterSheet = useCallback(
    (action: () => void) => {
      if (Platform.OS !== "ios") {
        action();
        return;
      }
      pendingRef.current = action;
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      fallbackRef.current = setTimeout(flushPending, SHEET_DISMISS_FALLBACK_MS);
    },
    [flushPending],
  );
  useEffect(
    () => () => {
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    },
    [],
  );

  const openKind: ReviewSheetKind | null = evalVisible
    ? "evaluation"
    : incompleteVisible
      ? "incomplete"
      : null;

  // La recarga de 30 s sacó el ticket de Revisión con una hoja abierta: se
  // cierra (ajuste en render: la condición deja de cumplirse al cerrarla) y,
  // ya cerrada, se avisa una vez por cierre.
  const [closedSheet, setClosedSheet] = useState<{ kind: ReviewSheetKind } | null>(null);
  if (openKind && shouldCloseReviewSheet(task.stateId, true, sending !== null)) {
    setEvalVisible(false);
    setIncompleteVisible(false);
    setClosedSheet({ kind: openKind });
  }
  useEffect(() => {
    if (!closedSheet) return;
    runAfterSheet(() =>
      Alert.alert(TASKER_REVIEW_CLOSED_TITLE, getReviewClosedNotice(closedSheet.kind)),
    );
  }, [closedSheet, runAfterSheet]);

  const beginSend = (kind: ReviewSheetKind): boolean => {
    if (sendingRef.current) return false;
    sendingRef.current = true;
    setSending(kind);
    return true;
  };
  const endSend = () => {
    sendingRef.current = false;
    setSending(null);
  };

  const openEvaluation = (item: TaskerTaskListItem) => {
    if (sendingRef.current) return;
    setEvalTarget(item);
    setSheetKey((key) => key + 1);
    setEvalVisible(true);
  };

  const handleSaveEvaluation = async (
    taskState: TaskerTaskState,
    comment: string,
    images: string[],
  ) => {
    const target = evalTarget;
    if (!target || target.id === null || !beginSend("evaluation")) return;
    const res = await onEvaluate({ id: target.id, text: target.text }, taskState, comment, images);
    endSend();
    if (res.ok) {
      setEvalVisible(false);
      return;
    }
    // gone: Seguimiento ya avisó y deseleccionó (esta pestaña se desmonta).
    if (!res.gone) Alert.alert("Evaluación no guardada", res.message);
  };

  const openIncomplete = () => {
    if (sendingRef.current) return;
    setSheetKey((key) => key + 1);
    setIncompleteVisible(true);
  };

  const handleSaveIncomplete = async (comment: string) => {
    if (!beginSend("incomplete")) return;
    const res = await onChangeState(TASKER_STATE_INCOMPLETE, comment);
    endSend();
    if (res.ok) {
      setIncompleteVisible(false);
      const title = getStateChangeSuccessTitle(incompleteName);
      runAfterSheet(() => setResult({ tone: "success", title }));
      return;
    }
    if (!res.gone) Alert.alert("Estado no cambiado", res.message);
  };

  const sendComplete = async () => {
    // Pudo cambiar mientras el diálogo estaba abierto (recarga de 30 s).
    if (!canEvaluateTask(latestRef.current.stateId)) {
      Alert.alert(TASKER_REVIEW_CLOSED_TITLE, getReviewClosedNotice("complete"));
      return;
    }
    if (!beginSend("complete")) return;
    const res = await onChangeState(TASKER_STATE_COMPLETED);
    endSend();
    if (res.ok) {
      setResult({ tone: "success", title: getStateChangeSuccessTitle(completedName) });
    } else if (!res.gone) {
      setResult({ tone: "error", title: "Estado no cambiado", message: res.message });
    }
  };

  const confirmComplete = () => {
    if (sendingRef.current) return;
    const unevaluated = countUnevaluated(latestRef.current.faults);
    Alert.alert(completedName, getCompleteConfirmMessage(unevaluated, completedName), [
      { text: "Cancelar", style: "cancel" },
      { text: completedName, onPress: () => void sendComplete() },
    ]);
  };

  return (
    <>
      {/* ── Ticket ── */}
      <View style={styles.card}>
        <FollowUpCardHeader
          styles={styles}
          tone="blue"
          icon="document-text-outline"
          title={`Ticket #${task.id}`}
        >
          <StateChip state={task.state} styles={styles} />
        </FollowUpCardHeader>

        <View style={styles.clientRow}>
          <Text style={styles.clientName}>{getTaskerClientName(task.client)}</Text>
          {task.tags.length > 0 && (
            <View style={styles.tagChips}>
              {task.tags.map((tag, index) => {
                const tone = getTagChipTone(index);
                return (
                  <View key={tag.id} style={[styles.tagChip, { backgroundColor: tone.background }]}>
                    <Text style={[styles.tagChipText, { color: tone.text }]}>{tag.name}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
        {!!task.client?.phone && (
          <View style={styles.phoneRow}>
            <Ionicons name="call-outline" size={14} color={TEXT_MUTED} />
            <Text style={styles.phoneText}>{formatPhone(task.client.phone)}</Text>
          </View>
        )}

        <View style={styles.infoList}>
          <InfoRow
            styles={styles}
            icon="person-outline"
            label="Solicitado por"
            value={task.externalUserName.trim() || "—"}
          />
          <InfoRow
            styles={styles}
            icon="construct-outline"
            label="Responsable"
            value={task.assignedUser?.name.trim() || TASKER_UNASSIGNED_LABEL}
          />
          <InfoRow
            styles={styles}
            icon="calendar-outline"
            label="Fecha"
            value={formatTaskerDate(task.createdDate)}
          />
          <ElapsedRow styles={styles} createdDate={task.createdDate} live={live} />
        </View>
      </View>

      {/* ── Descripción (solo lectura) ── */}
      <View style={styles.card}>
        <FollowUpCardHeader styles={styles} tone="violet" icon="list-outline" title="Descripción" />
        <View style={styles.descriptionBox}>
          <Text style={styles.descriptionText}>{task.action.trim() || "Sin descripción."}</Text>
        </View>
      </View>

      {/* ── Averías (taskList, ya en orden): la app no marca; en Revisión evalúa ── */}
      {task.faults.length > 0 && (
        <View style={styles.card}>
          <FollowUpCardHeader
            styles={styles}
            tone="amber"
            icon="build-outline"
            title={`${faultLabel} (${progress.total})`}
          />
          {/* Sin acciones (solo títulos) no hay avance, como Tabs/Actions.js:223 y :239. */}
          {progress.total > 0 && (
            <View style={styles.progress}>
              <Text style={styles.progressText}>{formatTaskListProgress(progress)}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress.pct}%` }]} />
              </View>
            </View>
          )}
          <View style={styles.faultList}>
            {task.faults.map((fault, index) => (
              <FaultRow
                key={fault.id ?? `i${index}`}
                fault={fault}
                stateName={getTaskListStateName(fault, catalog)}
                onEvaluate={
                  canReview && canEvaluateItem(fault) ? () => openEvaluation(fault) : undefined
                }
                disabled={sending !== null}
                styles={styles}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Comentarios: solo agregar; cerrado (5/6) → solo lectura ── */}
      <TaskerCommentsCard
        ref={commentsCardRef}
        comments={task.comments}
        onAdd={onAddComment}
        canAdd={canComment}
        closedNotice={canComment ? undefined : getClosedTaskNotice(task.stateId)}
        order={commentOrder}
        onOrderChange={onCommentOrderChange}
        resetKey={commentsResetKey}
        scrollRef={scrollRef}
        compact
      />

      {/* ── Revisión: Completada / Incompleta (solo en 7) ── */}
      {canReview && (
        <View style={styles.card}>
          <FollowUpCardHeader
            styles={styles}
            tone="teal"
            icon="clipboard-outline"
            title="Revisión"
          />
          <Text style={styles.reviewText}>
            Evalúa las acciones y elige cómo queda el ticket.
          </Text>
          <View style={styles.reviewButtons}>
            <ReviewButton
              label={completedName}
              icon="checkmark-circle-outline"
              toneStyle={styles.reviewBtnSuccess}
              busy={sending === "complete"}
              disabled={sending !== null}
              onPress={confirmComplete}
              styles={styles}
            />
            <ReviewButton
              label={incompleteName}
              icon="close-circle-outline"
              toneStyle={styles.reviewBtnError}
              busy={false}
              disabled={sending !== null}
              onPress={openIncomplete}
              styles={styles}
            />
          </View>
        </View>
      )}

      <TaskerEvaluationSheet
        key={`eval-${sheetKey}`}
        visible={evalVisible}
        item={evalTarget}
        catalog={taskStates}
        onRetryCatalog={onRetryTaskStates}
        saving={sending === "evaluation"}
        onSave={(taskState, comment, images) => void handleSaveEvaluation(taskState, comment, images)}
        onClose={() => setEvalVisible(false)}
        onDismiss={flushPending}
      />
      <TaskerIncompleteSheet
        key={`incomplete-${sheetKey}`}
        visible={incompleteVisible}
        title={incompleteName}
        subtitle={`Ticket #${task.id}`}
        saving={sending === "incomplete"}
        onSave={(comment) => void handleSaveIncomplete(comment)}
        onClose={() => setIncompleteVisible(false)}
        onDismiss={flushPending}
      />
      <ResultDialog
        visible={result !== null}
        tone={result?.tone ?? "success"}
        title={result?.title ?? ""}
        message={result?.message}
        badge={result?.tone === "success" ? `Ticket #${task.id}` : undefined}
        buttonLabel="Entendido"
        onClose={() => setResult(null)}
      />
    </>
  );
}

function ReviewButton({
  label,
  icon,
  toneStyle,
  busy,
  disabled,
  onPress,
  styles,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  toneStyle: FollowUpStyles["reviewBtnSuccess"];
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  styles: FollowUpStyles;
}) {
  return (
    <TouchableOpacity
      style={[styles.reviewBtn, toneStyle, disabled && !busy && styles.reviewBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      activeOpacity={0.85}
    >
      {busy ? (
        <ActivityIndicator size="small" color={ON_PRIMARY} />
      ) : (
        <Ionicons name={icon} size={18} color={ON_PRIMARY} />
      )}
      <Text style={styles.reviewBtnText} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** "Transcurrido" desde createdDate, en vivo: solo esta fila se repinta cada segundo. */
function ElapsedRow({
  styles,
  createdDate,
  live,
}: {
  styles: FollowUpStyles;
  createdDate: string;
  live: boolean;
}) {
  const nowMs = useNowMs(live);
  const createdMs = new Date(createdDate).getTime();
  const elapsed = Number.isNaN(createdMs) ? "" : formatElapsed(createdMs, nowMs);
  return (
    <InfoRow styles={styles} icon="stopwatch-outline" label="Transcurrido" value={elapsed} highlight />
  );
}

interface InfoRowProps {
  styles: FollowUpStyles;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  /** Fila destacada (Transcurrido). */
  highlight?: boolean;
}

function InfoRow({ styles, icon, label, value, highlight = false }: InfoRowProps) {
  return (
    <View style={[styles.infoRow, highlight && styles.infoRowHighlight]}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={highlight ? PRIMARY_700 : PRIMARY_COLOR} />
      </View>
      <View style={styles.infoBody}>
        <Text style={[styles.infoLabel, highlight && styles.infoLabelHighlight]}>{label}</Text>
        <Text style={[styles.infoValue, highlight && styles.infoValueStrong]}>{value}</Text>
      </View>
    </View>
  );
}

/** Ícono, color y texto accesible de cada marca (calca la app de técnicos). */
const CHECK_STATE_UI: Record<
  TaskerCheckState,
  { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }
> = {
  checked: { icon: "checkbox", color: PRIMARY_COLOR, label: "hecha" },
  unchecked: { icon: "square-outline", color: TEXT_PLACEHOLDER, label: "pendiente" },
  indeterminate: { icon: "remove-circle", color: ERROR_COLOR, label: "marcada en rojo" },
};

interface FaultRowProps {
  fault: TaskerTaskListItem;
  /** Nombre de su evaluación ("" sin evaluar): chip bajo el texto, en cualquier estado. */
  stateName: string;
  /** Solo en Revisión y si la acción es evaluable; sin él, sin botón. */
  onEvaluate?: () => void;
  /** Hay un envío de Revisión en curso. */
  disabled: boolean;
  styles: FollowUpStyles;
}

/**
 * Una fila de taskList. Título de grupo (isDisabled) → solo el texto, en
 * negrita y sin marca ni fecha, como etaskr-mobile (Tabs/Actions.js:165 y
 * :178-179: isTitle → sin CheckBox). Si no, ícono según isChecked, cuándo
 * (si está hecha), la evaluación y, en Revisión, el botón de evaluar con el
 * ícono de etaskr-mobile (Tabs/Actions.js:190).
 */
function FaultRow({ fault, stateName, onEvaluate, disabled, styles }: FaultRowProps) {
  if (fault.isDisabled) {
    return (
      <View style={styles.faultTitleRow} accessibilityRole="header">
        <Text style={styles.faultTitleText}>{fault.text}</Text>
      </View>
    );
  }
  const ui = CHECK_STATE_UI[fault.isChecked];
  const isDanger = fault.isChecked === "indeterminate";
  const checkedAt =
    fault.isChecked === "checked" && fault.checkedDate ? formatReportSentAt(fault.checkedDate) : "";
  const label = [fault.text, ui.label, checkedAt, stateName && `evaluación: ${stateName}`]
    .filter(Boolean)
    .join(", ");
  return (
    <View style={[styles.faultRow, isDanger && styles.faultRowDanger]}>
      <Ionicons name={ui.icon} size={20} color={ui.color} />
      <View style={styles.faultBody} accessible accessibilityLabel={label}>
        <Text style={[styles.faultText, isDanger && styles.faultTextDanger]}>{fault.text}</Text>
        {!!checkedAt && <Text style={styles.faultDate}>{checkedAt}</Text>}
        {!!stateName && (
          <View style={styles.evalChip}>
            <Text style={styles.evalChipText}>{stateName}</Text>
          </View>
        )}
      </View>
      {onEvaluate && (
        <TouchableOpacity
          style={[styles.evalBtn, disabled && styles.evalBtnDisabled]}
          onPress={onEvaluate}
          disabled={disabled}
          hitSlop={EVAL_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Evaluar ${fault.text}`}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons name="notebook-outline" size={18} color={PRIMARY_700} />
        </TouchableOpacity>
      )}
    </View>
  );
}
