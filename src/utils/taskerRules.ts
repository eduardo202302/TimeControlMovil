/**
 * Reglas de presentación de Tasker (Reportar y Seguimiento), calcadas del
 * producto original. Funciones puras: no importan react-native ni expo-*,
 * así que se testean con jest sin emulador.
 *
 * Los imports son relativos (no `@/`) porque jest no resuelve ese alias.
 */

import type {
  TaskerActivity,
  TaskerAddress,
  TaskerAttachment,
  TaskerAddressConfig,
  TaskerAddressDraft,
  TaskerClientAddress,
  TaskerComment,
  TaskerCommentAuthor,
  TaskerCommentDraft,
  TaskerCommentPayload,
  TaskerCompanyConfig,
  TaskerFaultAction,
  TaskerFormRules,
  TaskerReportAddress,
  TaskerReportErrors,
  TaskerTask,
  TaskerUserClient,
} from "../../types/typesTasker/TaskerTypes";
import type { MenuTree } from "../../utils/resolveRoute";
import {
  ACCENT_VIOLET,
  DANGER_TINT_BACKGROUND,
  ERROR_TEXT,
  INDIGO_TEXT,
  INDIGO_TINT_BACKGROUND,
  PRIMARY_700,
  PRIMARY_TINT_BACKGROUND,
  SUCCESS_COLOR,
  SUCCESS_TINT_BACKGROUND,
  VIOLET_TINT_BACKGROUND,
  WARNING_TEXT_STRONG,
  WARNING_TINT_BACKGROUND,
} from "../constants/colors";
import {
  TASKER_STATE_CANCELLED,
  TASKER_STATE_COMPLETED,
} from "../constants/taskerMock";
import { geocodeLocation, type GeocodeResult, type LatLng } from "./addressRules";

const pad2 = (n: number) => String(n).padStart(2, "0");

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * "DD/MM/YYYY hh:mm:ss A" en hora local. Las fechas de Tasker vienen sin zona
 * ("2026-10-06T09:58:11"), que el motor JS interpreta como hora local.
 * Vacía o inválida → "".
 */
export function formatTaskerDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  const hours = date.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return (
    `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad2(hour12)}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())} ` +
    (hours < 12 ? "AM" : "PM")
  );
}

/** Tiempo transcurrido: "Xs" | "Xm Ys" | "Xh Ym Zs" | "Xd Xh Ym Zs". */
export function formatElapsed(fromMs: number, nowMs: number): string {
  const total = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Solo los cambios de estado, del más reciente al más viejo (id descendente). */
export function getStateActivities(activities: TaskerActivity[]): TaskerActivity[] {
  return activities.filter((a) => a.type === "state").sort((a, b) => b.id - a.id);
}

/**
 * Duración a mostrar en una fila del historial. `stateId` es el estado ACTUAL
 * del ticket: si ya terminó, una actividad sin `time` no se pinta.
 */
export function getActivityTime(
  activity: TaskerActivity,
  stateId: number,
  nowMs: number,
): string | null {
  if (activity.time) return activity.time;
  if (stateId !== TASKER_STATE_COMPLETED && stateId !== TASKER_STATE_CANCELLED) {
    const begin = toDate(activity.beginDate);
    return begin ? formatElapsed(begin.getTime(), nowMs) : null;
  }
  return null;
}

/** "inicio" o "inicio - fin" si la actividad ya cerró. */
export function formatActivityRange(activity: TaskerActivity): string {
  const begin = formatTaskerDate(activity.beginDate);
  return activity.endDate ? `${begin} - ${formatTaskerDate(activity.endDate)}` : begin;
}

export type CommentOrder = "desc" | "asc";

/** Copia ordenada por createdDate. Por defecto, el más reciente primero. */
export function sortComments(
  comments: TaskerComment[],
  order: CommentOrder = "desc",
): TaskerComment[] {
  const time = (c: TaskerComment) => toDate(c.createdDate)?.getTime() ?? 0;
  return [...comments].sort((a, b) =>
    order === "desc" ? time(b) - time(a) : time(a) - time(b),
  );
}

// ─── Comentarios de Seguimiento ─────────────────────────────────────────────

/** "Agregar" del formulario: con texto (sin contar espacios) o con adjuntos. */
export function canSubmitComment(text: string, attachments: TaskerAttachment[]): boolean {
  return text.trim().length > 0 || attachments.length > 0;
}

/** "YYYY-MM-DDTHH:mm:ss" en hora local, el mismo formato sin zona de Tasker. */
function toTaskerLocalIso(date: Date): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  );
}

/**
 * Comentario que se pinta al momento, sin esperar al servidor. Como Tasker,
 * el autor es task.addUser (el solicitante), no quien escribe. El id es
 * negativo para no chocar con los del servidor. Va marcado isLocal: es lo que
 * lo deja editar y borrar (ver canEditTaskerComment).
 */
export function buildLocalComment({
  text,
  attachments,
  task,
  now,
}: {
  text: string;
  attachments: TaskerAttachment[];
  task: Pick<TaskerTask, "addUser">;
  now: Date;
}): TaskerComment {
  return {
    id: -now.getTime(),
    addUser: { name: task.addUser.name },
    createdDate: toTaskerLocalIso(now),
    comment: text.trim(),
    images: attachments.map((a) => a.dataUri),
    isLocal: true,
  };
}

/** Tope del texto de un comentario (maxLength del campo y validación). */
export const TASKER_COMMENT_MAX_LENGTH = 1000;

/** Texto recortado dentro del tope. */
export function isTaskerCommentTextValid(text: string): boolean {
  return text.trim().length <= TASKER_COMMENT_MAX_LENGTH;
}

/** "Guardar" de la ventana: canSubmitComment y texto dentro del tope. */
export function canSaveTaskerComment(draft: TaskerCommentDraft): boolean {
  return canSubmitComment(draft.text, draft.attachments) && isTaskerCommentTextValid(draft.text);
}

/**
 * Adjuntos que ya tenía un comentario, como TaskerAttachment para que la
 * ventana los muestre y quite igual que los nuevos. `dataUri` guarda el valor
 * tal cual (data-URI local o ruta del servidor) y es lo que vuelve a `images`.
 */
export function commentImagesToAttachments(images: string[]): TaskerAttachment[] {
  return images.map((value, index) => {
    const mime = /^data:([^;,]+)/i.exec(value)?.[1] ?? "";
    return {
      id: `existente-${index}`,
      name: `adjunto ${index + 1}`,
      mimeType: mime,
      dataUri: value,
    };
  });
}

/** Borrador inicial de la ventana: vacío (agregar) o el del comentario (editar). */
export function taskerCommentDraftFrom(comment: TaskerComment | null): TaskerCommentDraft {
  return comment
    ? { text: comment.comment, attachments: commentImagesToAttachments(comment.images) }
    : { text: "", attachments: [] };
}

/** ¿Cambió algo respecto del borrador inicial? (pide confirmar al cerrar). */
export function isTaskerCommentDraftChanged(
  initial: TaskerCommentDraft,
  current: TaskerCommentDraft,
): boolean {
  if (initial.text !== current.text) return true;
  if (initial.attachments.length !== current.attachments.length) return true;
  return initial.attachments.some((a, index) => a.dataUri !== current.attachments[index].dataUri);
}

/** Qué formulario de comentario está abierto en la tarjeta. null = ninguno. */
export type CommentComposerTarget = { mode: "add" } | { mode: "edit"; id: number } | null;

function isSameComposerTarget(a: CommentComposerTarget, b: CommentComposerTarget): boolean {
  if (a === null || b === null) return a === b;
  if (a.mode === "add" || b.mode === "add") return a.mode === b.mode;
  return a.id === b.id;
}

/**
 * Pasar de un formulario a otro (o cerrarlo): "none" si ya es ese, "confirm"
 * si el abierto tiene cambios sin guardar ("¿Descartar cambios?"), si no "apply".
 */
export function getCommentComposerTransition(
  current: CommentComposerTarget,
  next: CommentComposerTarget,
  currentChanged: boolean,
): "none" | "apply" | "confirm" {
  if (isSameComposerTarget(current, next)) return "none";
  return current !== null && currentChanged ? "confirm" : "apply";
}

/**
 * Agrega al final con el usuario en sesión como autor (Reportar Avería).
 * EXCEPCIÓN E1, como en las direcciones: id = el mayor + 1 (lista vacía → 1).
 * Un borrador que no se puede guardar deja la lista igual.
 */
export function addTaskerComment(
  list: TaskerComment[],
  draft: TaskerCommentDraft,
  author: TaskerCommentAuthor,
  now: Date,
): TaskerComment[] {
  if (!canSaveTaskerComment(draft)) return list;
  const id = list.reduce((max, c) => Math.max(max, c.id), 0) + 1;
  return [
    ...list,
    {
      id,
      addUser: { ...author },
      createdDate: toTaskerLocalIso(now),
      comment: draft.text.trim(),
      images: draft.attachments.map((a) => a.dataUri),
      isLocal: true,
    },
  ];
}

/**
 * Cambia texto y adjuntos; autor, fecha de creación e id quedan. Id
 * inexistente o borrador que no se puede guardar → lista igual.
 */
export function updateTaskerComment(
  list: TaskerComment[],
  id: number,
  draft: TaskerCommentDraft,
): TaskerComment[] {
  if (!canSaveTaskerComment(draft) || !list.some((c) => c.id === id)) return list;
  return list.map((c) =>
    c.id === id
      ? { ...c, comment: draft.text.trim(), images: draft.attachments.map((a) => a.dataUri) }
      : c,
  );
}

export function removeTaskerComment(list: TaskerComment[], id: number): TaskerComment[] {
  return list.filter((c) => c.id !== id);
}

/**
 * Lo que pesan los adjuntos de los comentarios (largo de cada valor de
 * `images`, mismo criterio que pickAttachments). `excludeId`: el comentario
 * que se está editando, cuyos adjuntos ya cuenta la ventana.
 */
export function getTaskerCommentsAttachmentBytes(
  comments: TaskerComment[],
  excludeId?: number,
): number {
  return comments.reduce(
    (sum, c) =>
      c.id === excludeId ? sum : sum + c.images.reduce((acc, value) => acc + value.length, 0),
    0,
  );
}

/**
 * Reportar Avería manda todos los comentarios en un solo cuerpo: la suma de
 * sus adjuntos no puede pasar `maxBytes` (MAX_PAYLOAD_BYTES de pickAttachments).
 */
export function isTaskerCommentsOverPayloadLimit(
  comments: TaskerComment[],
  maxBytes: number,
): boolean {
  return getTaskerCommentsAttachmentBytes(comments) > maxBytes;
}

/**
 * ¿Lo escribió quien está en sesión? Con id del autor, se compara por id; sin
 * él (Tasker hoy no lo devuelve), solo los creados en este dispositivo.
 * TODO(puente): cuando Tasker devuelva addUserId en los comentarios, llenar
 * addUser.id con él y comparar siempre por id.
 */
export function canEditTaskerComment(
  comment: TaskerComment,
  currentUser: TaskerCommentAuthor | null,
): boolean {
  const authorId = comment.addUser.id;
  if (authorId != null) return currentUser?.id != null && authorId === currentUser.id;
  return comment.isLocal === true;
}

/** Cuerpo que Tasker manda al agregar un comentario. */
export function buildCommentPayload(
  text: string,
  attachments: TaskerAttachment[],
): TaskerCommentPayload {
  return {
    taskComments: [
      {
        comment: text.trim(),
        images: attachments.map((a) => a.dataUri),
        localAttachments: [],
      },
    ],
  };
}

/**
 * Qué es un adjunto de comentario: data-URI de imagen (se abre en el visor),
 * data-URI de otro tipo (PDF, no se abre) o ruta guardada en el servidor.
 */
export function getCommentAttachmentKind(value: string): "image" | "file" | "server" {
  if (/^data:image\//i.test(value)) return "image";
  if (/^data:/i.test(value)) return "file";
  return "server";
}

export interface AddressField {
  key: keyof TaskerAddress;
  label: string;
  value: string;
}

const ADDRESS_FIELDS: { key: keyof TaskerAddress; label: string }[] = [
  { key: "title", label: "Título" },
  { key: "province", label: "Provincia" },
  { key: "city", label: "Ciudad" },
  { key: "sector", label: "Sector" },
  { key: "zone", label: "Zona" },
  { key: "street", label: "Calle" },
  { key: "streetNumber", label: "Número" },
  { key: "building", label: "Edificio" },
  { key: "apartmentNumber", label: "N° de Apartamento" },
  { key: "latitude", label: "Latitud" },
  { key: "longitude", label: "Longitud" },
  { key: "referenceToArrive", label: "Referencias para llegar" },
  { key: "whoReceives", label: "Quién recibe" },
  { key: "restrictions", label: "Restricciones" },
];

/** Campos de la dirección en orden de Tasker, sin los vacíos. */
export function getAddressFields(address: TaskerAddress | null): AddressField[] {
  if (!address) return [];
  return ADDRESS_FIELDS.flatMap(({ key, label }) => {
    const raw = address[key];
    const value = raw == null ? "" : String(raw).trim();
    return value ? [{ key, label, value }] : [];
  });
}

export interface TaskerAddressLines {
  title: string;
  /** "Calle #Número" sin los vacíos. */
  streetLine: string;
  /** "Sector, Ciudad, Provincia" sin los vacíos. */
  areaLine: string;
}

/** Textos del resumen de una dirección (fila de Reportar Avería y pestaña Dirección). */
export function getTaskerAddressLines(
  address: Pick<TaskerAddress, "title" | "street" | "streetNumber" | "sector" | "city" | "province">,
): TaskerAddressLines {
  return {
    title: address.title,
    streetLine: [address.street, address.streetNumber && `#${address.streetNumber}`]
      .filter(Boolean)
      .join(" "),
    areaLine: [address.sector, address.city, address.province].filter(Boolean).join(", "),
  };
}

export interface ChipTone {
  background: string;
  text: string;
}

/** Paleta fija de chips de tag: se elige por posición, no por el color del tag. */
const TAG_CHIP_TONES: ChipTone[] = [
  { background: DANGER_TINT_BACKGROUND, text: ERROR_TEXT },
  { background: PRIMARY_TINT_BACKGROUND, text: PRIMARY_700 },
  { background: SUCCESS_TINT_BACKGROUND, text: SUCCESS_COLOR },
  { background: VIOLET_TINT_BACKGROUND, text: ACCENT_VIOLET },
  { background: WARNING_TINT_BACKGROUND, text: WARNING_TEXT_STRONG },
  { background: INDIGO_TINT_BACKGROUND, text: INDIGO_TEXT },
];

export function getTagChipTone(position: number): ChipTone {
  const n = TAG_CHIP_TONES.length;
  return TAG_CHIP_TONES[((position % n) + n) % n];
}

/** Respaldo de Tasker cuando el estado no trae un color válido. */
export const TASKER_STATE_COLOR_FALLBACK = "#ccc";
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** Opacidad del fondo del chip de estado ("muy atenuado"). */
const STATE_CHIP_ALPHA = 0.14;

/** Punto y fondo del chip de estado a partir de state.color. */
export function getStateChipColors(color: string | null | undefined): {
  dot: string;
  background: string;
} {
  const dot = color && HEX_COLOR.test(color) ? color : TASKER_STATE_COLOR_FALLBACK;
  // "#ccc" se expande a 6 dígitos para poder leer los canales.
  const hex = dot === TASKER_STATE_COLOR_FALLBACK ? "cccccc" : dot.slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return { dot, background: `rgba(${r},${g},${b},${STATE_CHIP_ALPHA})` };
}

/** 10 dígitos → "(809) 555-0100"; cualquier otra cosa, sin cambios. */
export function formatPhone(value: string | null | undefined): string {
  if (value == null) return "";
  const match = /^(\d{3})(\d{3})(\d{4})$/.exec(value);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : value;
}

export function buildMapsUrl(lat: number | string, lng: number | string): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** Iniciales para el avatar de un comentario ("Jeremy Domínguez" → "JD"). */
export function getInitials(name: string | null | undefined): string {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

// ─── Compañía conectada, títulos y reglas del formulario de Reportar ────────

/** Ruta de Reportar (encabezado y menú la reconocen por esta ruta). */
export const TASKER_REPORT_PATH = "/reportfault";
/** Ruta de Seguimiento. */
export const TASKER_FOLLOWUP_PATH = "/followup";
const TASKER_PATHS = [TASKER_REPORT_PATH, TASKER_FOLLOWUP_PATH];

export const TASKER_REPORT_TITLE_FALLBACK = "Reportar Servicio";
export const TASKER_FAULT_LABEL_FALLBACK = "Averías";
export const TASKER_CLIENT_LABEL_FALLBACK = "Cliente";

/** Textos de los estados de pantalla completa de Reportar. */
export const TASKER_UNAVAILABLE_MESSAGE = "No disponible para su compañía";
export const TASKER_NO_CLIENTS_MESSAGE =
  "No es posible generar el reporte, el usuario no tiene clientes asignados, por favor comuníquese con administración.";
export const TASKER_NO_LOCATION_MESSAGE =
  "Active la ubicación de su teléfono e intente nuevamente, si el problema persiste contacte a tecnología.";

/** ¿La compañía activa está conectada a Tasker? Sin config → no. */
export function isTaskerEnabled(config: TaskerCompanyConfig | null | undefined): boolean {
  return config?.connected === true;
}

export function isTaskerPath(path: string | null | undefined): boolean {
  return path != null && TASKER_PATHS.includes(path);
}

/**
 * Menú sin Reportar ni Seguimiento cuando la compañía no está conectada:
 * quita padres e hijos con esas rutas, y el grupo que se queda sin hijos.
 * Conectada → el árbol tal cual.
 */
export function filterTaskerMenu(menuTree: MenuTree[], enabled: boolean): MenuTree[] {
  if (enabled) return menuTree;
  return menuTree.flatMap((section) => {
    if (isTaskerPath(section.parent.path)) return [];
    const children = section.children.filter((child) => !isTaskerPath(child.path));
    if (section.children.length > 0 && children.length === 0) return [];
    return [children.length === section.children.length ? section : { ...section, children }];
  });
}

function trimmedLabel(value: string | null | undefined, fallback: string): string {
  const label = typeof value === "string" ? value.trim() : "";
  return label || fallback;
}

/** Título de Reportar en el menú y el encabezado: failureReportMenuLabel o "Reportar Servicio". */
export function getTaskerReportTitle(config: TaskerCompanyConfig | null | undefined): string {
  return trimmedLabel(config?.failureReportMenuLabel, TASKER_REPORT_TITLE_FALLBACK);
}

/** Título del bloque de averías: failureReportLabel o "Averías". */
export function getTaskerFaultLabel(config: TaskerCompanyConfig | null | undefined): string {
  return trimmedLabel(config?.failureReportLabel, TASKER_FAULT_LABEL_FALLBACK);
}

/** Título de la tarjeta del cliente (provisional): clientLabel o "Cliente". */
export function getTaskerClientLabel(config: TaskerCompanyConfig | null | undefined): string {
  return trimmedLabel(config?.clientLabel, TASKER_CLIENT_LABEL_FALLBACK);
}

/**
 * Resumen del campo de averías ya cerrado, en el orden en que se eligieron:
 * 1 o 2 → los nombres con coma; 3 o más → "A, B y N más". Ninguna → null
 * (el campo muestra el placeholder).
 */
export function formatSelectedFaultsSummary(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length <= 2) return names.join(", ");
  return `${names[0]}, ${names[1]} y ${names.length - 2} más`;
}

/** Nombres de las averías elegidas, en el orden de selección (ids sin catálogo se omiten). */
export function getSelectedFaultNames(
  selectedIds: number[],
  actions: TaskerFaultAction[],
): string[] {
  const byId = new Map(actions.map((a) => [a.id, a.name]));
  return selectedIds.flatMap((id) => {
    const name = byId.get(id);
    return name ? [name] : [];
  });
}

/**
 * Con averías, estas son obligatorias y la descripción opcional; sin averías,
 * la descripción pasa a ser obligatoria. Sin config se trata como sin averías.
 */
export function getTaskerFormRules(config: TaskerCompanyConfig | null | undefined): TaskerFormRules {
  const appliesFault = config?.appliesFault === true;
  return {
    showFaults: appliesFault,
    faultsRequired: appliesFault,
    descriptionRequired: !appliesFault,
  };
}

/**
 * Averías que puede elegir el cliente: las de su categoría y las sin
 * categoría. Cliente sin categoría (o sin cliente) → todas.
 */
export function filterFaultActionsForClient(
  actions: TaskerFaultAction[],
  client: Pick<TaskerUserClient, "categoryId"> | null | undefined,
): TaskerFaultAction[] {
  const categoryId = client?.categoryId;
  if (categoryId == null) return actions;
  return actions.filter((a) => a.categoryId == null || a.categoryId === categoryId);
}

/** Deja solo las averías elegidas que siguen en `available` (al cambiar de cliente). */
export function pruneSelectedFaults(
  selectedIds: number[],
  available: TaskerFaultAction[],
): number[] {
  const allowed = new Set(available.map((a) => a.id));
  return selectedIds.filter((id) => allowed.has(id));
}

/**
 * Aviso debajo de las averías cuando un cambio de cliente quitó algunas ya
 * marcadas. 0 (o menos) → null, sin aviso.
 */
export function getRemovedFaultsNotice(count: number): string | null {
  if (!(count > 0)) return null;
  return count === 1
    ? "Se quitó 1 avería que no aplica al cliente seleccionado."
    : `Se quitaron ${count} averías que no aplican al cliente seleccionado.`;
}

/** Marca o desmarca una avería (selección múltiple). */
export function toggleFaultSelection(selectedIds: number[], id: number): number[] {
  return selectedIds.includes(id)
    ? selectedIds.filter((x) => x !== id)
    : [...selectedIds, id];
}

// ─── Dirección más cercana ──────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000;

/** Distancia en metros entre dos puntos (haversine). */
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** lat/lng de una dirección si son números válidos (o texto numérico) y en rango. */
function addressPoint(
  address: Pick<TaskerAddress, "latitude" | "longitude">,
): { latitude: number; longitude: number } | null {
  const latitude = toCoordinate(address.latitude);
  const longitude = toCoordinate(address.longitude);
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export interface NearestClientAddress {
  clientId: number;
  /** null solo si el cliente elegido no tiene ninguna dirección. */
  addressId: number | null;
  /** null = ninguna dirección tenía coordenadas (no hay "Más cercana"). */
  distanceMeters: number | null;
}

/**
 * Dirección más cercana a `coords` entre todas las de todos los clientes. En
 * empate gana la primera (orden de clientes y de direcciones). Si ninguna
 * tiene coordenadas (o no hay coords) → primer cliente y su primera dirección,
 * sin distancia. Sin clientes → null.
 */
export function pickNearestClientAddress(
  clients: TaskerUserClient[],
  coords: { latitude: number; longitude: number } | null | undefined,
): NearestClientAddress | null {
  if (clients.length === 0) return null;
  let best: NearestClientAddress | null = null;
  if (coords) {
    for (const client of clients) {
      for (const address of client.addresses) {
        const point = addressPoint(address);
        if (!point) continue;
        const distanceMeters = haversineMeters(coords, point);
        if (best === null || distanceMeters < (best.distanceMeters as number)) {
          best = { clientId: client.id, addressId: address.id, distanceMeters };
        }
      }
    }
  }
  if (best) return best;
  const first = clients[0];
  return { clientId: first.id, addressId: first.addresses[0]?.id ?? null, distanceMeters: null };
}

/**
 * Distancia para la línea bajo el cliente: menos de 1 km → "a 350 m" (metros
 * redondeados); desde 1 km → "a 1.2 km" (un decimal). Inválida → null.
 */
export function formatDistanceAway(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return null;
  const rounded = Math.round(meters);
  if (rounded < 1000) return `a ${rounded} m`;
  return `a ${(meters / 1000).toFixed(1)} km`;
}

export interface ClientAddressHint {
  /** "Más cercana" si la elegida es la recomendada (con distancia); si no, "Dirección seleccionada". */
  caption: "Más cercana" | "Dirección seleccionada";
  address: TaskerReportAddress;
  /** null si la dirección no tiene coordenadas o no hay posición. */
  distanceLabel: string | null;
}

/**
 * Línea bajo el cliente: la dirección marcada en la tarjeta Direcciones (al
 * abrir y al cambiar de cliente es la recomendada por pickNearestClientAddress
 * para ese cliente), con su distancia al teléfono. Sin ninguna marcada → null.
 */
export function getClientAddressHint(
  addresses: TaskerReportAddress[],
  recommended: NearestClientAddress | null,
  coords: { latitude: number; longitude: number } | null | undefined,
): ClientAddressHint | null {
  const address = getSelectedTaskerAddress(addresses);
  if (!address) return null;
  const point = addressPoint(address);
  const distanceLabel = coords && point ? formatDistanceAway(haversineMeters(coords, point)) : null;
  const isRecommended =
    address.fromClient &&
    recommended?.distanceMeters != null &&
    recommended.addressId === address.id;
  return {
    caption: isRecommended ? "Más cercana" : "Dirección seleccionada",
    address,
    distanceLabel,
  };
}

// ─── Orden de arranque de Reportar ──────────────────────────────────────────

/** Estado de la búsqueda de la posición del teléfono. */
export type ReportLocationState =
  | { status: "pending" }
  | { status: "failed"; canAskAgain: boolean }
  | { status: "ok"; coords: { latitude: number; longitude: number } };

export type ReportGate = "unavailable" | "noClients" | "locating" | "noLocation" | "ready";

/**
 * Qué muestra Reportar, en este orden estricto: compañía no conectada →
 * usuario sin clientes → buscando la posición → sin posición → formulario.
 */
export function getReportGate({
  config,
  clients,
  location,
}: {
  config: TaskerCompanyConfig | null | undefined;
  clients: TaskerUserClient[];
  location: ReportLocationState;
}): ReportGate {
  if (!isTaskerEnabled(config)) return "unavailable";
  if (clients.length === 0) return "noClients";
  if (location.status === "pending") return "locating";
  if (location.status === "failed") return "noLocation";
  return "ready";
}

// ─── Validación de "Guardar y enviar" ───────────────────────────────────────

export const TASKER_FAULTS_REQUIRED_ERROR = "Seleccione al menos una avería";
export const TASKER_DESCRIPTION_REQUIRED_ERROR = "La descripción es un campo requerido";
export const TASKER_ADDRESS_REQUIRED_ERROR = "Seleccione una dirección";

export function validateReport(
  values: {
    faultIds: number[];
    description: string;
    addresses: TaskerReportAddress[];
  },
  rules: TaskerFormRules,
): TaskerReportErrors {
  const errors: TaskerReportErrors = {};
  if (rules.faultsRequired && values.faultIds.length === 0) {
    errors.faults = TASKER_FAULTS_REQUIRED_ERROR;
  }
  if (rules.descriptionRequired && !values.description.trim()) {
    errors.description = TASKER_DESCRIPTION_REQUIRED_ERROR;
  }
  if (!getSelectedTaskerAddress(values.addresses)) {
    errors.address = TASKER_ADDRESS_REQUIRED_ERROR;
  }
  return errors;
}

// ─── Lectura de lo guardado en el teléfono (arranque en frío) ───────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseJson(raw: string | null | undefined): unknown {
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const STORED_CONFIG_LABELS = ["failureReportMenuLabel", "failureReportLabel", "clientLabel"] as const;

/**
 * Config guardada; ausente, JSON inválido o forma rara → null (se recarga).
 * Cada label tiene que estar presente (texto o null): lo guardado con nombres
 * viejos (serviceLabel / faultLabel) o sin alguna clave se descarta.
 */
export function parseStoredTaskerConfig(raw: string | null | undefined): TaskerCompanyConfig | null {
  const value = parseJson(raw);
  if (!isRecord(value)) return null;
  if (typeof value.connected !== "boolean" || typeof value.appliesFault !== "boolean") return null;
  const labelsOk = STORED_CONFIG_LABELS.every(
    (key) => key in value && (value[key] === null || typeof value[key] === "string"),
  );
  if (!labelsOk) return null;
  return {
    connected: value.connected,
    appliesFault: value.appliesFault,
    failureReportMenuLabel: value.failureReportMenuLabel as string | null,
    failureReportLabel: value.failureReportLabel as string | null,
    clientLabel: value.clientLabel as string | null,
  };
}

function isStoredClient(value: unknown): value is TaskerUserClient {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.name === "string" &&
    (value.categoryId === null || typeof value.categoryId === "number") &&
    Array.isArray(value.addresses) &&
    value.addresses.every((a) => isRecord(a) && typeof a.id === "number")
  );
}

/**
 * Clientes guardados; ausente, JSON inválido o algún cliente con forma rara →
 * null (se recarga). `[]` guardado es válido: el usuario no tiene clientes.
 */
export function parseStoredTaskerClients(raw: string | null | undefined): TaskerUserClient[] | null {
  const value = parseJson(raw);
  if (!Array.isArray(value) || !value.every(isStoredClient)) return null;
  return value;
}

// ─── Direcciones de Reportar Avería (MapAddressSelector de Tasker) ──────────
// Calcado de Tasker, rarezas incluidas, salvo las excepciones E1–E4 marcadas.

/** Campos del borrador, en el orden de la ventana (postalCode sin input). */
export const TASKER_ADDRESS_DRAFT_FIELDS: (keyof TaskerAddressDraft)[] = [
  "title",
  "province",
  "city",
  "sector",
  "zone",
  "street",
  "streetNumber",
  "building",
  "apartmentNumber",
  "referenceToArrive",
  "whoReceives",
  "restrictions",
  "postalCode",
];

/** Los que deshabilitan "Seleccionar" mientras falten. */
export const TASKER_REQUIRED_ADDRESS_FIELDS: (keyof TaskerAddressDraft)[] = [
  "province",
  "city",
  "sector",
  "street",
  "streetNumber",
];

export function emptyTaskerAddressDraft(): TaskerAddressDraft {
  return TASKER_ADDRESS_DRAFT_FIELDS.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {} as TaskerAddressDraft);
}

/** Carga de la ventana: cada campo de la dirección o "". */
export function taskerDraftFromAddress(
  address: TaskerAddress | null | undefined,
): TaskerAddressDraft {
  const draft = emptyTaskerAddressDraft();
  if (!address) return draft;
  TASKER_ADDRESS_DRAFT_FIELDS.forEach((key) => {
    const value = address[key];
    draft[key] = value == null ? "" : String(value);
  });
  return draft;
}

export function isTaskerAddressComplete(draft: TaskerAddressDraft): boolean {
  return TASKER_REQUIRED_ADDRESS_FIELDS.every((key) => draft[key].trim().length > 0);
}

function toCoordinate(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Punto inicial de la ventana: `location` de la dirección.
 * EXCEPCIÓN E2: al editar una dirección sin `location`, Tasker deja latitude y
 * longitude en undefined. Aquí, si no hay location pero sí latitude/longitude,
 * se usan esas. Sin ninguna de las dos → null.
 */
export function resolveTaskerInitialPoint(
  address: TaskerAddress | null | undefined,
): LatLng | null {
  if (!address) return null;
  const loc = address.location;
  if (typeof loc?.lat === "number" && typeof loc?.lng === "number") {
    return { lat: loc.lat, lng: loc.lng };
  }
  const lat = toCoordinate(address.latitude);
  const lng = toCoordinate(address.longitude);
  return lat !== null && lng !== null ? { lat, lng } : null;
}

/**
 * geocodeDataHandler de Tasker: SOBRESCRIBE estos 9 campos, con "" si Google
 * no trae el componente, aunque el usuario ya hubiera escrito algo. No toca
 * title, referenceToArrive, whoReceives ni restrictions.
 */
export function applyTaskerGeocode(
  draft: TaskerAddressDraft,
  result: GeocodeResult,
): TaskerAddressDraft {
  const components = Array.isArray(result.address_components) ? result.address_components : [];
  const pick = (type: string) =>
    components.find((component) => component.types?.includes(type))?.long_name ?? "";
  return {
    ...draft,
    province: pick("administrative_area_level_1"),
    city: pick("locality"),
    sector: pick("neighborhood") || pick("sublocality_level_1"),
    zone: pick("administrative_area_level_2"),
    street: pick("route"),
    streetNumber: pick("street_number"),
    postalCode: pick("postal_code"),
    building: pick("establishment"),
    apartmentNumber: pick("subpremise"),
  };
}

/** "Calle Número, Zona, Sector, Ciudad, Provincia" sin los vacíos (Zona antes que Sector, como Tasker). */
export function formatTaskerAddress(draft: TaskerAddressDraft): string {
  const streetLine = [draft.street.trim(), draft.streetNumber.trim()].filter(Boolean).join(" ");
  return [streetLine, draft.zone, draft.sector, draft.city, draft.province]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * handlerSelect de Tasker: conserva todas las claves de `previous` (al
 * editar) y pisa con el borrador, formattedAddress, address y coordenadas.
 * Las coordenadas son las del RESULTADO de Google (geometry.location), no las
 * del punto tocado; sin resultado, las del punto inicial. No se redondean.
 *
 * EXCEPCIÓN E4: una dirección nueva a la que no se le tocó el mapa ni el
 * buscador (sin resultado y sin punto inicial) se guarda SIN coordenadas
 * (latitude/longitude null). Tasker le pone las del centro de Santo Domingo;
 * aquí no, a propósito, para no guardar una ubicación falsa.
 */
export function buildTaskerAddress({
  previous,
  draft,
  geocode,
  initialPoint,
}: {
  previous: TaskerAddress | null | undefined;
  draft: TaskerAddressDraft;
  geocode: GeocodeResult | null | undefined;
  initialPoint: LatLng | null | undefined;
}): TaskerAddress {
  const { location: _previousLocation, ...rest } = previous ?? ({} as Partial<TaskerAddress>);
  const point = geocodeLocation(geocode) ?? initialPoint ?? null;
  const title = draft.title.trim() ? draft.title : draft.sector.trim() ? draft.sector : draft.city;
  return {
    ...rest,
    ...draft,
    title,
    formattedAddress: formatTaskerAddress(draft),
    address: geocode?.formatted_address || previous?.address || "",
    ...(point
      ? { location: { lat: point.lat, lng: point.lng }, latitude: point.lat, longitude: point.lng }
      : { latitude: null, longitude: null }),
  };
}

/**
 * EXCEPCIÓN E1: en Tasker toda dirección nueva recibe id 2 (error de tipeo) y
 * editar o borrar una se lleva a las demás. Aquí: lista vacía → 1; si no, el
 * id mayor + 1.
 */
export function nextTaskerAddressId(list: TaskerReportAddress[]): number {
  return list.reduce((max, a) => Math.max(max, a.id), 0) + 1;
}

/**
 * Id de la dirección predeterminada: la primera con `isDefault: true`; sin
 * ninguna marcada, la primera de la lista. Sin direcciones → null.
 */
export function getDefaultClientAddressId(addresses: TaskerClientAddress[]): number | null {
  return (addresses.find((a) => a.isDefault === true) ?? addresses[0])?.id ?? null;
}

/**
 * Las direcciones del cliente, para la lista del reporte: en su orden, sin
 * marcar y con `fromClient`. Solo la predeterminada va bloqueada (se elige,
 * no se edita ni se borra).
 */
export function clientAddressesToReport(addresses: TaskerClientAddress[]): TaskerReportAddress[] {
  const defaultId = getDefaultClientAddressId(addresses);
  return addresses.map((address, index) => ({
    ...address,
    order: index + 1,
    selected: false,
    locked: address.id === defaultId,
    fromClient: true,
  }));
}

/**
 * Lista del reporte al elegir cliente: sus direcciones tal como están en el
 * cliente (lo editado o borrado de otro cliente no se arrastra: al volver, sus
 * direcciones vuelven al original) y después las que agregó el usuario, que se
 * conservan. Las agregadas se renumeran (id y order) detrás de las del cliente
 * para no chocar con sus ids. Queda marcada `selectedId` si es del cliente (si
 * no, ninguna).
 */
export function buildReportAddresses(
  client: Pick<TaskerUserClient, "addresses"> | null | undefined,
  previous: TaskerReportAddress[],
  selectedId: number | null,
): TaskerReportAddress[] {
  const fromClient = clientAddressesToReport(client?.addresses ?? []);
  let nextId = nextTaskerAddressId(fromClient);
  const added = previous
    .filter((a) => !a.fromClient)
    .map((a, index) => ({
      ...a,
      id: nextId++,
      order: fromClient.length + index + 1,
    }));
  return [...fromClient, ...added].map((a) => ({
    ...a,
    selected: a.fromClient && a.id === selectedId,
  }));
}

/**
 * La nueva entra al final, marcada y desbloqueada (solo vive en el reporte,
 * nunca se guarda en el cliente); las demás quedan sin marcar.
 */
export function addTaskerAddress(
  list: TaskerReportAddress[],
  address: TaskerAddress,
): TaskerReportAddress[] {
  const added: TaskerReportAddress = {
    ...address,
    id: nextTaskerAddressId(list),
    order: list.length + 1,
    selected: true,
    locked: false,
    fromClient: false,
  };
  return [...list.map((a) => ({ ...a, selected: false })), added];
}

function isLockedAddress(list: TaskerReportAddress[], id: number): boolean {
  return list.some((a) => a.id === id && a.locked);
}

/**
 * Reemplaza por id y ordena por order. La predeterminada (locked) no cambia.
 * Se conserva el origen (`fromClient`) de la que estaba en la lista.
 */
export function updateTaskerAddress(
  list: TaskerReportAddress[],
  address: TaskerReportAddress,
): TaskerReportAddress[] {
  if (isLockedAddress(list, address.id)) return list;
  return list
    .map((a) =>
      a.id === address.id ? { ...address, locked: false, fromClient: a.fromClient } : a,
    )
    .sort((a, b) => a.order - b.order);
}

/**
 * Quita por id y renumera order 1..N. La predeterminada (locked) no se quita.
 * Si la quitada era la seleccionada, la selección pasa a la predeterminada
 * (sin predeterminada en la lista, no queda ninguna).
 */
export function removeTaskerAddress(
  list: TaskerReportAddress[],
  id: number,
): TaskerReportAddress[] {
  if (isLockedAddress(list, id)) return list;
  const removedSelected = list.some((a) => a.id === id && a.selected);
  return list
    .filter((a) => a.id !== id)
    .map((a, index) => ({
      ...a,
      order: index + 1,
      selected: removedSelected ? a.locked : a.selected,
    }));
}

/** Marca esa y desmarca las demás; si ya estaba marcada, no queda ninguna. */
export function toggleTaskerAddressSelected(
  list: TaskerReportAddress[],
  id: number,
): TaskerReportAddress[] {
  const wasSelected = list.some((a) => a.id === id && a.selected);
  return list.map((a) => ({ ...a, selected: !wasSelected && a.id === id }));
}

export function getSelectedTaskerAddress(
  list: TaskerReportAddress[],
): TaskerReportAddress | undefined {
  return list.find((a) => a.selected === true);
}

/**
 * Quién Recibe y Restricciones. Único punto a cambiar cuando el backend
 * exponga addressSugestion.receiver y addressSugestion.restrictions.
 */
export function resolveTaskerAddressConfig(): TaskerAddressConfig {
  return { showWhoReceives: false, showRestrictions: false };
}
