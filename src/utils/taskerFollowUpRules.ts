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
  TaskerTask,
  TaskerTaskSummary,
} from "../../types/typesTasker/TaskerTypes";

/** Primer estado de Taskr ("Pendiente"); la app lo muestra como "Reportado". */
export const TASKER_STATE_PENDING = 1;
/** Estados terminales de Tasker: sin comentarios nuevos ni tiempo en vivo. */
export const TASKER_STATE_COMPLETED = 5;
export const TASKER_STATE_CANCELLED = 6;

/** Cada cuánto se recargan lista y detalle mientras Seguimiento está a la vista. */
export const SEGUIMIENTO_REFRESH_MS = 30_000;

/** Texto exacto con el que Taskr rechaza una tarea borrada o ajena. */
export const TASKR_TASK_GONE_MESSAGE = "La tarea ya no está disponible.";

export const TASKER_NO_TICKETS_MESSAGE = "No tienes tickets reportados.";
export const TASKER_SELECT_TICKET_MESSAGE = "Selecciona un ticket para ver el detalle.";
export const TASKER_SELECT_TICKET_TAB_MESSAGE = "Selecciona un ticket en la pestaña Ticket.";
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

/** Se puede comentar salvo en Completada (5) y Cancelada (6). */
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

/**
 * Corre una tarea a la vez: si la anterior no terminó, la nueva se descarta
 * (devuelve false). Así la recarga automática nunca se encima.
 */
export function createExclusiveRunner(): (task: () => Promise<void>) => Promise<boolean> {
  let running = false;
  return async (task) => {
    if (running) return false;
    running = true;
    try {
      await task();
      return true;
    } finally {
      running = false;
    }
  };
}
