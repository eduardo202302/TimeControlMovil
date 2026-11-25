/**
 * Reglas de Seguimiento (tickets de Tasker con datos reales). Funciones puras:
 * no importan react-native ni expo-*, así que se testean con jest.
 *
 * Imports relativos (no "@/"): tsconfig.jest.json no declara el alias.
 */

import type {
  TaskerActivity,
  TaskerClient,
  TaskerState,
  TaskerReviewStateId,
  TaskerTask,
  TaskerTaskListItem,
  TaskerTaskState,
  TaskerTaskSummary,
} from "../../types/typesTasker/TaskerTypes";
import { ON_PRIMARY, TEXT_PLACEHOLDER, TEXT_PRIMARY } from "../constants/colors";
import { contrastRatio, isHexColor } from "./authThemeRules";
import { toRD } from "./punchRules";

/** Primer estado de Taskr ("Pendiente"); la app lo muestra como "Reportado". */
export const TASKER_STATE_PENDING = 1;
/** Estados terminales de Tasker: sin comentarios nuevos ni tiempo en vivo. */
export const TASKER_STATE_COMPLETED = 5;
export const TASKER_STATE_CANCELLED = 6;
/** El técnico terminó: la app evalúa las acciones y decide Completada o Incompleta. */
export const TASKER_STATE_REVISION = 7;
/** Devuelta al técnico desde Revisión: sigue abierta (se puede comentar). */
export const TASKER_STATE_INCOMPLETE = 9;

/** Cada cuánto se recargan lista y detalle mientras Seguimiento está a la vista. */
export const SEGUIMIENTO_REFRESH_MS = 30_000;

/** Texto exacto con el que Taskr rechaza una tarea borrada o ajena. */
export const TASKR_TASK_GONE_MESSAGE = "La tarea ya no está disponible.";

export const TASKER_NO_TICKETS_MESSAGE = "No tienes tickets reportados.";
export const TASKER_NO_CLIENT_LABEL = "Sin cliente";
export const TASKER_UNASSIGNED_LABEL = "Sin asignar";
/** Autor sin nombre en ningún lado (ni addUser ni externalUserName). */
export const TASKER_UNKNOWN_AUTHOR = "Sin nombre";
/** "Por:" de los cambios automáticos que hizo la cuenta del puente. */
export const TASKER_SYSTEM_ACTOR = "Sistema";

const TASKER_PENDING_NAME = "Pendiente";
const TASKER_REPORTED_LABEL = "Reportado";

/** Participio en masculino ("el ticket fue …") de los estados cerrados. */
const CLOSED_STATE_WORDS: Record<number, string> = {
  [TASKER_STATE_COMPLETED]: "completado",
  [TASKER_STATE_CANCELLED]: "cancelado",
};

/** Cerrado por un estado que no es 5/6 (no debería pasar): palabra neutra. */
const closedWord = (stateId: number) => CLOSED_STATE_WORDS[stateId] ?? "cerrado";

/** Se puede comentar salvo en Completada (5) y Cancelada (6); Incompleta (9) sigue abierta. */
export function canCommentOnTask(stateId: number): boolean {
  return stateId !== TASKER_STATE_COMPLETED && stateId !== TASKER_STATE_CANCELLED;
}

/** Texto de la tarjeta de comentarios de un ticket cerrado ("Ticket completado: …"). */
export function getClosedTaskNotice(stateId: number): string {
  return `Ticket ${closedWord(stateId)}: ya no admite comentarios.`;
}

/** Aviso al cerrar el formulario abierto porque el ticket se cerró. */
export function getCommentDiscardedNotice(stateId: number): string {
  return `El ticket fue ${closedWord(stateId)}; tu comentario no se envió.`;
}

/** Aviso cuando el ticket elegido ya no viene en la lista. */
export function getTicketGoneNotice(id: number): string {
  return `El ticket #${id} ya no está disponible.`;
}

/**
 * ¿Hay que cerrar el formulario de comentario? Solo cuando el ticket pasa de
 * admitir comentarios a no admitirlos (no si ya estaba cerrado).
 */
export function shouldDiscardOpenComment(prevStateId: number, nextStateId: number): boolean {
  return canCommentOnTask(prevStateId) && !canCommentOnTask(nextStateId);
}

export function isTaskrTaskGoneMessage(message: string): boolean {
  return message.trim() === TASKR_TASK_GONE_MESSAGE;
}

/** Nombre del cliente de la tarjeta o del ticket; sin cliente o sin nombre → "Sin cliente". */
export function getTaskerClientName(client: Pick<TaskerClient, "name"> | null): string {
  return client?.name.trim() || TASKER_NO_CLIENT_LABEL;
}

/**
 * Nombre a mostrar de un estado en todo Seguimiento (tarjetas, detalle e
 * historial): el "Pendiente" de Taskr (stateId 1) se llama "Reportado". Las
 * actividades no traen el id: ahí basta el nombre.
 */
export function getTaskerStateLabel(state: Pick<TaskerState, "name"> & { id?: number }): string {
  const isPending = state.id === TASKER_STATE_PENDING || state.name.trim() === TASKER_PENDING_NAME;
  return isPending ? TASKER_REPORTED_LABEL : state.name;
}

/**
 * "Por:" de una fila del historial. La cuenta del puente (user.id ===
 * task.addUserId) o un user null nunca se muestran: el reporte ("Pendiente"
 * / "Reportado") es del empleado que reportó (externalUserName); cualquier
 * otro cambio suyo (p. ej. la asignación automática al representante) es
 * "Sistema". Si no, el nombre del usuario (técnico u oficina).
 */
export function getActivityActorName(
  activity: Pick<TaskerActivity, "action" | "user">,
  task: Pick<TaskerTask, "addUserId" | "externalUserName">,
): string {
  const { user } = activity;
  const isBridge = !user || (user.id != null && user.id === task.addUserId);
  if (!isBridge) return user.name.trim() || "—";
  const isReport = getTaskerStateLabel({ name: activity.action }) === TASKER_REPORTED_LABEL;
  if (!isReport) return TASKER_SYSTEM_ACTOR;
  return task.externalUserName.trim() || TASKER_UNKNOWN_AUTHOR;
}

/**
 * Título de una fila del historial: el estado (getTaskerStateLabel) y, si
 * viene, activities.message ("Asignada" + "a Usuario Representante 1").
 */
export function getStateActivityTitle(
  activity: Pick<TaskerActivity, "action" | "message">,
): { state: string; message: string } {
  return { state: getTaskerStateLabel({ name: activity.action }), message: activity.message.trim() };
}

/**
 * Autor de un comentario (regla acordada con el backend): si lo escribió la
 * cuenta que creó la tarea desde la app (addUser.id === task.addUserId) o
 * no trae addUser → task.externalUserName; si no → addUser.name.
 */
export function getTaskerCommentAuthorName(
  addUser: { id: number | null; name: string } | null,
  task: Pick<TaskerTask, "addUserId" | "externalUserName">,
): string {
  const external = task.externalUserName.trim();
  const isOwner = addUser?.id != null && addUser.id === task.addUserId;
  const name = !addUser || isOwner ? external : addUser.name.trim() || external;
  return name || TASKER_UNKNOWN_AUTHOR;
}

/**
 * URL de un adjunto. Ya absoluta (http/https) → tal cual; relativa → pasa
 * por FaceClass: `${urlColegio}/taskr/downloads/${ruta}` (sin barras
 * dobles). Vacía → "". La ruta es pública (auth: false), como /downloads:
 * las imágenes se piden sin token.
 */
export function buildTaskrFileUrl(path: string, urlColegio: string): string {
  const value = path.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${urlColegio.trim().replace(/\/+$/, "")}/taskr/downloads/${value.replace(/^\/+/, "")}`;
}

/** ¿El ticket sigue en la lista? */
export function isTaskInList(tasks: Pick<TaskerTaskSummary, "id">[], id: number): boolean {
  return tasks.some((t) => t.id === id);
}

/** Parámetro de /followup con el ticket a abrir (desde "Ver seguimiento"). */
export const FOLLOWUP_TICKET_PARAM = "ticket";

/**
 * Valor del parámetro `ticket` → id, o null si falta o no es un entero
 * positivo. expo-router puede entregarlo como arreglo: se usa el primero.
 */
export function parseFollowUpTicketParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) return null;
  const id = Number(raw.trim());
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Ticket a elegir al llegar con uno pedido: el pedido si está en la lista;
 * si no (o no se pidió ninguno), null = ninguno elegido, como siempre.
 */
export function resolveRequestedTicket(
  tasks: Pick<TaskerTaskSummary, "id">[],
  requestedId: number | null,
): number | null {
  return requestedId !== null && isTaskInList(tasks, requestedId) ? requestedId : null;
}

export interface ExclusiveRunner {
  /** Si la anterior no terminó, la nueva se descarta (false). */
  (task: () => Promise<void>): Promise<boolean>;
  /**
   * Espera su turno y corre: si hay una en curso, arranca al terminar ella
   * (antes que cualquier otra descartable). Para la recarga tras un cambio
   * propio, que no puede perderse ni usar datos pedidos antes del cambio.
   */
  queue: (task: () => Promise<void>) => Promise<void>;
}

/**
 * Corre una tarea a la vez. Así la recarga automática nunca se encima con
 * otra recarga (la de 30 s, la de deslizar o la que sigue a un cambio).
 */
export function createExclusiveRunner(): ExclusiveRunner {
  let running: Promise<void> | null = null;
  const start = (task: () => Promise<void>): Promise<void> => {
    const current = (async () => {
      try {
        await task();
      } finally {
        running = null;
      }
    })();
    running = current;
    return current;
  };
  const run = (async (task: () => Promise<void>) => {
    if (running) return false;
    await start(task);
    return true;
  }) as ExclusiveRunner;
  run.queue = async (task) => {
    // Bucle: al liberarse el turno puede tomarlo otra tarea en cola.
    while (running) await running.catch(() => undefined);
    await start(task);
  };
  return run;
}

// ─── Tarjetas de la lista de tickets ────────────────────────────────────────

/** Encabezado de la lista: "Tickets (3)". */
export function getTicketsTitle(count: number): string {
  return `Tickets (${count})`;
}

const NAIVE_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const ZONED_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Instante (ms) de una fecha de Taskr. Sin zona ("2026-11-05 15:07:00") es
 * hora RD (UTC-4 fijo); con zona ("…Z", "…-04:00") se respeta. Vacía o
 * inválida → null.
 */
export function parseTaskerInstant(value: string | null | undefined): number | null {
  const text = value?.trim() ?? "";
  const naive = NAIVE_DATE_TIME.exec(text);
  if (naive) {
    const [year, month, day, hours, minutes, seconds = "0"] = naive.slice(1);
    return Date.UTC(+year, +month - 1, +day, +hours + 4, +minutes, +seconds);
  }
  if (!ZONED_DATE_TIME.test(text)) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : ms;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "D/M/YY h:mm A" en hora RD (formato de TaskCard de etaskr-mobile): "5/11/26 3:07 PM". Inválida → "". */
export function formatTicketCardDate(value: string | null | undefined): string {
  const ms = parseTaskerInstant(value);
  if (ms === null) return "";
  const { year, month, day, hours, minutes } = toRD(new Date(ms));
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${day}/${month + 1}/${pad2(year % 100)} ${hour12}:${pad2(minutes)} ${hours < 12 ? "AM" : "PM"}`;
}

/**
 * Pie "Vence:" de la tarjeta. Vencida = ahora ya pasó dueDate (regla de
 * etaskr-mobile TaskCard.js:51, `moment().isAfter(dueDate)`). Sin dueDate o
 * ilegible → null (la tarjeta muestra la fecha de creación).
 */
export function getTicketDue(
  dueDate: string | null | undefined,
  nowMs: number,
): { text: string; expired: boolean } | null {
  const ms = parseTaskerInstant(dueDate);
  if (ms === null) return null;
  return { text: formatTicketCardDate(dueDate), expired: nowMs > ms };
}

/**
 * Label macizo (estado y prioridad de la tarjeta): fondo = `color` de Tasker
 * (hex válido; si no, TEXT_PLACEHOLDER) y texto blanco u oscuro, el que más
 * contraste tenga (contrastRatio, el mismo cálculo que el tema del login).
 */
export function getSolidLabelColors(color: string | null | undefined): {
  background: string;
  text: string;
} {
  const background = isHexColor(color) ? color : TEXT_PLACEHOLDER;
  const text =
    contrastRatio(background, ON_PRIMARY) >= contrastRatio(background, TEXT_PRIMARY)
      ? ON_PRIMARY
      : TEXT_PRIMARY;
  return { background, text };
}

// ─── Acciones del ticket (taskList) ─────────────────────────────────────────

export interface TaskListProgress {
  done: number;
  total: number;
  /** 0–100, redondeado; 0 sin acciones. */
  pct: number;
}

/**
 * Avance de las acciones: "checked" e "indeterminate" cuentan como hechas y
 * los títulos de grupo (isDisabled) no cuentan ni en X ni en N (mismo
 * criterio que la app de técnicos de Tasker: Tabs/Actions.js:35-37 con
 * getCountedActions / countsAsAction de constants/Utils.js:475-477).
 */
export function getTaskListProgress(
  items: Pick<TaskerTaskListItem, "isChecked" | "isDisabled">[],
): TaskListProgress {
  const actions = items.filter((item) => !item.isDisabled);
  const total = actions.length;
  const done = actions.filter((item) => item.isChecked !== "unchecked").length;
  return { done, total, pct: total ? Math.round((done * 100) / total) : 0 };
}

/** "2 de 3 · 67%". */
export function formatTaskListProgress({ done, total, pct }: TaskListProgress): string {
  return `${done} de ${total} · ${pct}%`;
}

// ─── Revisión: evaluación de acciones y Completada / Incompleta ─────────────

/** Solo en Revisión (7) se evalúan acciones y se decide Completada o Incompleta. */
export function canEvaluateTask(stateId: number): boolean {
  return stateId === TASKER_STATE_REVISION;
}

/**
 * ¿La acción admite evaluación? No es título de grupo, el técnico ya la marcó
 * (hecha o en rojo) y tiene id (va en list[].id del PATCH). etaskr-mobile
 * solo deja evaluar las "checked" (Tabs/Actions.js:158); acá también las rojas.
 */
export function canEvaluateItem(
  item: Pick<TaskerTaskListItem, "id" | "isDisabled" | "isChecked">,
): boolean {
  return !item.isDisabled && item.isChecked !== "unchecked" && item.id !== null;
}

export interface EvaluationRequirements {
  /** Asterisco en "Comentario": hace falta comentario o imagen. */
  commentRequired: boolean;
  /** Bloque "Imágenes"; sin él no se envían adjuntos. */
  showImages: boolean;
}

/** Qué pide la evaluación elegida (modals/Evaluation.js:93 y :97). Sin elegir → nada. */
export function evaluationRequirements(
  taskState: Pick<TaskerTaskState, "requiresComment" | "suggestImage"> | null,
): EvaluationRequirements {
  return {
    commentRequired: taskState?.requiresComment === true,
    showImages: taskState?.suggestImage === true,
  };
}

/**
 * ¿Se puede guardar la evaluación? Con una elegida y, si pide comentario,
 * comentario (trim) o al menos una imagen. Las imágenes solo cuentan si la
 * evaluación las muestra (modals/Evaluation.js:26 y :33).
 */
export function canSaveEvaluation(
  taskState: Pick<TaskerTaskState, "requiresComment" | "suggestImage"> | null,
  comment: string,
  imageCount: number,
): boolean {
  if (!taskState) return false;
  const { commentRequired, showImages } = evaluationRequirements(taskState);
  if (!commentRequired) return true;
  return comment.trim() !== "" || (showImages && imageCount > 0);
}

/** Acciones evaluables todavía sin evaluar (aviso al marcar Completada). */
export function countUnevaluated(
  items: Pick<TaskerTaskListItem, "id" | "isDisabled" | "isChecked" | "taskStateId">[],
): number {
  return items.filter((item) => canEvaluateItem(item) && item.taskStateId === null).length;
}

/** Nombres de respaldo si GET /taskr/states falla o no los trae. */
export const TASKER_REVIEW_STATE_NAMES: Readonly<Record<TaskerReviewStateId, string>> =
  Object.freeze({ 5: "Completada", 9: "Incompleta" });

/** Nombre de Completada / Incompleta: el de GET /taskr/states o el de respaldo. */
export function getReviewStateName(
  states: Pick<TaskerState, "id" | "name">[],
  id: TaskerReviewStateId,
): string {
  return states.find((s) => s.id === id)?.name.trim() || TASKER_REVIEW_STATE_NAMES[id];
}

/**
 * Nombre de la evaluación de una acción: el que trae taskState o, si no viene,
 * el del catálogo (GET /taskr/taskStates). Sin evaluar o desconocida → "".
 */
export function getTaskListStateName(
  item: Pick<TaskerTaskListItem, "taskStateId" | "taskState">,
  catalog: Pick<TaskerTaskState, "id" | "name">[],
): string {
  if (item.taskStateId === null) return "";
  const own = item.taskState?.id === item.taskStateId ? item.taskState.name.trim() : "";
  return own || catalog.find((s) => s.id === item.taskStateId)?.name.trim() || "";
}

/** Texto del diálogo de Completada; con acciones sin evaluar, lo avisa. */
export function getCompleteConfirmMessage(unevaluated: number, completedName: string): string {
  if (unevaluated <= 0) return `¿Marcar el ticket como ${completedName}?`;
  const actions = unevaluated === 1 ? "1 acción" : `${unevaluated} acciones`;
  return `Hay ${actions} sin evaluar. ¿Marcar como ${completedName}?`;
}

/** Título del ResultDialog tras cambiar el estado. */
export function getStateChangeSuccessTitle(stateName: string): string {
  return `Ticket marcado como ${stateName}`;
}

/** Incompleta sin comentario (buildStateChangeBody). */
export const TASKER_INCOMPLETE_COMMENT_REQUIRED =
  "Escribe un comentario para marcar el ticket como Incompleta.";

export type ReviewSheetKind = "evaluation" | "complete" | "incomplete";

/**
 * ¿Cerrar la hoja o el diálogo de Revisión abierto? Cuando el ticket salió de
 * Revisión (p. ej. la recarga de 30 s) y no se está enviando: durante el envío
 * la recarga posterior al éxito también lo saca de 7, y ahí cierra quien envía.
 */
export function shouldCloseReviewSheet(stateId: number, open: boolean, sending: boolean): boolean {
  return open && !sending && !canEvaluateTask(stateId);
}

export const TASKER_REVIEW_CLOSED_TITLE = "Ticket actualizado";

/** Aviso al cerrar lo abierto porque el ticket ya no está en Revisión. */
export function getReviewClosedNotice(kind: ReviewSheetKind): string {
  const lost = kind === "evaluation" ? "tu evaluación no se guardó" : "el cambio de estado no se envió";
  return `El ticket ya no está en revisión; ${lost}.`;
}
