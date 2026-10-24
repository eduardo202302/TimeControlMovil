/**
 * Puente de Tasker con FaceClass/Taskr. Reportar: lo que llega de
 * chooseschool, el catálogo de averías (GET /taskr/actions) y la tarea nueva
 * (POST /taskr/tasks). Seguimiento: la lista (GET /taskr/tasks), el detalle
 * (GET /taskr/tasks/{id}) y los comentarios (PATCH /taskr/tasks/{id}). Las
 * funciones de mapeo y armado son puras; los servicios de red nunca lanzan y
 * devuelven { ok, ..., message }.
 *
 * Imports relativos (no "@/"): tsconfig.jest.json no declara el alias.
 */

import axios from "axios";
import type {
  TaskerActivity,
  TaskerAddress,
  TaskerClient,
  TaskerClientAddress,
  TaskerComment,
  TaskerCommentDraft,
  TaskerCompanyConfig,
  TaskerFaultAction,
  TaskerPriority,
  TaskerSession,
  TaskerState,
  TaskerTag,
  TaskerTask,
  TaskerTaskSummary,
  TaskerUserClient,
  TaskerUserRef,
  TaskrCommentBody,
  TaskrTaskAddress,
  TaskrTaskBody,
  TaskrTaskComment,
} from "../../types/typesTasker/TaskerTypes";
import {
  buildTaskrFileUrl,
  getTaskerCommentAuthorName,
  isTaskrTaskGoneMessage,
} from "./taskerFollowUpRules";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function textOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Número finito (o texto numérico) → número; cualquier otra cosa → null. */
function toCoordinate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** latitude/longitude de la dirección o, si faltan, su `location`. */
function readCoordinates(raw: Record<string, unknown>): { lat: number; lng: number } | null {
  const lat = toCoordinate(raw.latitude);
  const lng = toCoordinate(raw.longitude);
  if (lat !== null && lng !== null) return { lat, lng };
  const location = isRecord(raw.location) ? raw.location : null;
  const locLat = toCoordinate(location?.lat);
  const locLng = toCoordinate(location?.lng);
  return locLat !== null && locLng !== null ? { lat: locLat, lng: locLng } : null;
}

// ─── chooseschool → sesión ──────────────────────────────────────────────────

/** Escuela no conectada (o sin datos de chooseschool): Reportar se oculta. */
export const TASKER_DISCONNECTED_CONFIG: TaskerCompanyConfig = {
  connected: false,
  appliesFault: false,
  failureReportMenuLabel: null,
  failureReportLabel: null,
  clientLabel: null,
};

/** `data.taskrCompany` → config. null (o forma rara) → no conectada. */
export function mapTaskerCompanyConfig(taskrCompany: unknown): TaskerCompanyConfig {
  if (!isRecord(taskrCompany)) return { ...TASKER_DISCONNECTED_CONFIG };
  const settings = isRecord(taskrCompany.settings) ? taskrCompany.settings : {};
  return {
    connected: true,
    appliesFault: settings.isFailureReport === true,
    failureReportMenuLabel: textOrNull(settings.failureReportMenuLabel),
    failureReportLabel: textOrNull(settings.failureReportLabel),
    clientLabel: textOrNull(settings.clientLabel),
  };
}

/** Campos de texto de nuestra dirección; los que no vienen quedan en "". */
const CLIENT_ADDRESS_TEXT_FIELDS = [
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
  "formattedAddress",
  "address",
] as const;

/**
 * Dirección de Taskr → nuestro tipo, solo con los campos que usamos (el id,
 * order y selected de Taskr se descartan: los ids se asignan acá). Sin
 * coordenadas válidas → latitude/longitude null y sin `location`.
 */
export function normalizeTaskerClientAddress(
  raw: Record<string, unknown>,
  id: number,
  isDefault: boolean,
): TaskerClientAddress {
  const address = { id, isDefault } as TaskerClientAddress;
  for (const key of CLIENT_ADDRESS_TEXT_FIELDS) address[key] = textOrEmpty(raw[key]);
  const point = readCoordinates(raw);
  address.latitude = point?.lat ?? null;
  address.longitude = point?.lng ?? null;
  if (point) address.location = { lat: point.lat, lng: point.lng };
  return address;
}

/** null, no-objeto o sin ningún texto ni coordenadas → vacía. */
function isEmptyAddress(raw: unknown): boolean {
  if (!isRecord(raw)) return true;
  const hasText = CLIENT_ADDRESS_TEXT_FIELDS.some(
    (key) => typeof raw[key] === "string" && (raw[key] as string).trim() !== "",
  );
  return !hasText && readCoordinates(raw) === null;
}

/** Misma dirección salvo id/isDefault (defaultAddress o una de addresses repetida). */
function isSameAddress(a: TaskerClientAddress, b: TaskerClientAddress): boolean {
  return (
    CLIENT_ADDRESS_TEXT_FIELDS.every((key) => a[key] === b[key]) &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude
  );
}

/** Mismo punto: lat/lng iguales redondeados a 5 decimales (~1 m). Sin coordenadas → no. */
function isSameSpot(a: TaskerClientAddress, b: TaskerClientAddress): boolean {
  const round = (value: unknown) => {
    const n = toCoordinate(value);
    return n === null ? null : n.toFixed(5);
  };
  const [aLat, aLng, bLat, bLng] = [a.latitude, a.longitude, b.latitude, b.longitude].map(round);
  return aLat !== null && aLng !== null && aLat === bLat && aLng === bLng;
}

/** `base` con los textos que le faltan tomados de `other`. */
function fillMissingTexts(base: TaskerClientAddress, other: TaskerClientAddress): TaskerClientAddress {
  const merged = { ...base };
  for (const key of CLIENT_ADDRESS_TEXT_FIELDS) {
    const own = merged[key];
    const theirs = other[key];
    const ownEmpty = typeof own !== "string" || own.trim() === "";
    if (ownEmpty && typeof theirs === "string" && theirs.trim() !== "") merged[key] = theirs;
  }
  return merged;
}

/**
 * La predeterminada y otra del mismo cliente en el mismo punto (lat/lng a 5
 * decimales) → UNA sola: queda la predeterminada (su id, isDefault y
 * coordenadas) con los textos que le falten tomados de la otra. Sin
 * duplicados → el mismo cliente.
 */
export function mergeDefaultAddressDuplicates(client: TaskerUserClient): TaskerUserClient {
  const defaultAddress = client.addresses.find((a) => a.isDefault) ?? client.addresses[0];
  if (!defaultAddress) return client;
  const duplicates = client.addresses.filter(
    (a) => a !== defaultAddress && isSameSpot(defaultAddress, a),
  );
  if (duplicates.length === 0) return client;
  const merged = duplicates.reduce(fillMissingTexts, defaultAddress);
  return {
    ...client,
    defaultAddress: merged,
    addresses: client.addresses.flatMap((a) =>
      a === defaultAddress ? [merged] : duplicates.includes(a) ? [] : [a],
    ),
  };
}

/**
 * Un cliente de `data.taskrClients` → { id, name, defaultAddress, addresses }.
 * La predeterminada es defaultAddress; si viene null o vacía, la primera de
 * addresses. Va primera en `addresses` con `isDefault: true`, seguida de TODAS
 * las de addresses; una repetida (la predeterminada u otra) no se duplica, y
 * una en el mismo punto que la predeterminada se fusiona con ella
 * (mergeDefaultAddressDuplicates). Sin id numérico → null.
 */
export function mapTaskerClient(raw: unknown): TaskerUserClient | null {
  if (!isRecord(raw) || typeof raw.id !== "number" || !Number.isFinite(raw.id)) return null;
  const rawAddresses = (Array.isArray(raw.addresses) ? raw.addresses : []).filter(
    (a): a is Record<string, unknown> => isRecord(a) && !isEmptyAddress(a),
  );
  const sources = isEmptyAddress(raw.defaultAddress)
    ? rawAddresses
    : [raw.defaultAddress as Record<string, unknown>, ...rawAddresses];

  const addresses: TaskerClientAddress[] = [];
  for (const source of sources) {
    const isDefault = addresses.length === 0;
    const address = normalizeTaskerClientAddress(source, addresses.length + 1, isDefault);
    if (addresses.some((prev) => isSameAddress(address, prev))) continue;
    addresses.push(address);
  }
  return mergeDefaultAddressDuplicates({
    id: raw.id,
    name: textOrEmpty(raw.name),
    defaultAddress: addresses[0] ?? null,
    addresses,
  });
}

/**
 * `data` de chooseschool → lo de Tasker que se guarda en la sesión. Solo
 * config y clientes mapeados: nada más de taskrCompany ni de los clientes
 * (ni token, ni faceClassUsers, ni otras settings). No conectada → sin
 * clientes.
 */
export function mapTaskerSession(data: unknown): TaskerSession {
  const source = isRecord(data) ? data : {};
  const config = mapTaskerCompanyConfig(source.taskrCompany);
  const clients =
    config.connected && Array.isArray(source.taskrClients)
      ? source.taskrClients.flatMap((c) => {
          const client = mapTaskerClient(c);
          return client ? [client] : [];
        })
      : [];
  return { config, clients };
}

// ─── Mensajes de error ──────────────────────────────────────────────────────

export const TASKER_ACTIONS_ERROR = "No se pudieron cargar las averías.";
export const TASKER_SEND_ERROR = "No se pudo enviar el reporte. Intente nuevamente.";
export const TASKER_NETWORK_ERROR = "No se pudo conectar. Revisa tu conexión.";
/** Última barrera (JSON > 9.5 MB): el tope que ve el usuario es el de 7 MB de archivos. */
export const TASKER_ATTACHMENTS_TOO_LARGE_ERROR = "Los adjuntos superan el límite de 7 MB.";

/**
 * `message` de una respuesta success:false: puede venir como texto u objeto.
 * Texto no vacío → ese texto; objeto, vacío o ausente → `fallback`.
 */
export function readTaskrMessage(message: unknown, fallback: string): string {
  return typeof message === "string" && message.trim() !== "" ? message : fallback;
}

// ─── Averías (GET /taskr/actions) ───────────────────────────────────────────

/** Parámetros fijos: nunca se pasa otro ni nada que escriba el usuario. */
export const TASKER_ACTIONS_PARAMS = Object.freeze({
  rows: 500,
  page: 1,
  orderKey: "id",
  orderDir: "asc",
});

const TASKER_FETCH_TIMEOUT_MS = 20_000;
/** El envío lleva los adjuntos (hasta ~9.5 MB): más margen. */
const TASKER_SEND_TIMEOUT_MS = 90_000;

/** `data.items[]` → { id, name: action, clientId }. Sin id o sin texto → se omite. */
export function mapTaskerFaultActions(data: unknown): TaskerFaultAction[] {
  const items = isRecord(data) && Array.isArray(data.items) ? data.items : [];
  return items.flatMap((item): TaskerFaultAction[] => {
    if (!isRecord(item) || typeof item.id !== "number") return [];
    if (typeof item.action !== "string" || item.action.trim() === "") return [];
    return [
      {
        id: item.id,
        name: item.action,
        clientId: typeof item.clientId === "number" ? item.clientId : null,
      },
    ];
  });
}

interface AuthArgs {
  token: string;
  urlColegio: string;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export type FetchTaskerFaultActionsResult =
  | { ok: true; actions: TaskerFaultAction[]; message: string }
  | { ok: false; actions: []; message: string };

export async function fetchTaskerFaultActions({
  token,
  urlColegio,
}: AuthArgs): Promise<FetchTaskerFaultActionsResult> {
  try {
    const response = await axios.get(`${urlColegio}/taskr/actions`, {
      headers: authHeaders(token),
      params: { ...TASKER_ACTIONS_PARAMS },
      timeout: TASKER_FETCH_TIMEOUT_MS,
    });
    if (response.data?.success !== true) {
      return {
        ok: false,
        actions: [],
        message: readTaskrMessage(response.data?.message, TASKER_ACTIONS_ERROR),
      };
    }
    return { ok: true, actions: mapTaskerFaultActions(response.data.data), message: "" };
  } catch (error: any) {
    console.warn("fetchTaskerFaultActions:", error?.message ?? "error desconocido");
    return { ok: false, actions: [], message: TASKER_ACTIONS_ERROR };
  }
}

// ─── Tarea nueva (POST /taskr/tasks) ────────────────────────────────────────

/** Tope del cuerpo en JSON: el servidor corta en 10 MB. */
export const TASKR_TASK_MAX_BYTES = 9.5 * 1024 * 1024;

export interface TaskrTaskForm {
  /** config.appliesFault de la compañía. */
  appliesFault: boolean;
  clientId: number;
  /** Averías elegidas, en el orden de selección. */
  faultIds: number[];
  description: string;
  /** La dirección marcada (getSelectedTaskerAddress). */
  address: TaskerAddress | null | undefined;
  comments: Pick<TaskerComment, "comment" | "images">[];
}

/** Texto de la dirección: string tal cual; cualquier otra cosa → "". */
const TASK_ADDRESS_TEXT_FIELDS = [
  "title",
  "province",
  "city",
  "zone",
  "sector",
  "street",
  "streetNumber",
  "building",
  "apartmentNumber",
  "postalCode",
  "address",
  "formattedAddress",
  "referenceToArrive",
  "whoReceives",
  "restrictions",
] as const;

/**
 * Dirección marcada → solo los campos que acepta Taskr (fuera id, order,
 * selected, locked, isDefault y cualquier otro). Sin lat/lng numéricos
 * válidos se omiten latitude, longitude y location: un null cancela la tarea.
 */
export function buildTaskrTaskAddress(address: TaskerAddress): TaskrTaskAddress {
  const raw = address as unknown as Record<string, unknown>;
  const result = {} as TaskrTaskAddress;
  for (const key of TASK_ADDRESS_TEXT_FIELDS) result[key] = textOrEmpty(raw[key]);
  const point = readCoordinates(raw);
  if (point) {
    result.latitude = point.lat;
    result.longitude = point.lng;
    result.location = { lat: point.lat, lng: point.lng };
  }
  return result;
}

/**
 * Cuerpo de POST /taskr/tasks. Con averías: actionIds en orden y la
 * descripción como action ("" si no hay). Sin averías: solo action. Un
 * elemento de taskComments por comentario, con `comment` siempre presente;
 * sin comentarios, sin la clave. Nunca lleva token.
 */
export function buildTaskrTaskBody(form: TaskrTaskForm): TaskrTaskBody {
  const body: TaskrTaskBody = { clientId: form.clientId, action: form.description.trim() };
  if (form.appliesFault) body.actionIds = [...form.faultIds];
  if (form.address) body.address = buildTaskrTaskAddress(form.address);
  if (form.comments.length > 0) {
    body.taskComments = form.comments.map(
      (c): TaskrTaskComment => ({
        comment: typeof c.comment === "string" ? c.comment.trim() : "",
        images: (c.images ?? []).filter(
          (value) => typeof value === "string" && /^data:/i.test(value),
        ),
        taskListId: null,
      }),
    );
  }
  return body;
}

/** Bytes del texto en UTF-8 (lo que viaja), sin depender de TextEncoder. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      // Par sustituto: un solo carácter de 4 bytes.
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

type SerializedBody = { ok: true; json: string; message: string } | { ok: false; message: string };

/** El JSON a enviar, o el error si pasa de TASKR_TASK_MAX_BYTES. */
function serializeWithinLimit(body: object): SerializedBody {
  const json = JSON.stringify(body);
  if (utf8ByteLength(json) > TASKR_TASK_MAX_BYTES) {
    return { ok: false, message: TASKER_ATTACHMENTS_TOO_LARGE_ERROR };
  }
  return { ok: true, json, message: "" };
}

/** El JSON a enviar, o el error si pasa de TASKR_TASK_MAX_BYTES. */
export function serializeTaskrTaskBody(body: TaskrTaskBody): SerializedBody {
  return serializeWithinLimit(body);
}

export type CreateTaskerTaskResult =
  /** `createdDate`: el de la tarea creada si la respuesta lo trae (texto no vacío); si no, null. */
  | { ok: true; id: number | null; createdDate: string | null; message: string }
  | { ok: false; message: string };

/**
 * Envía la tarea. Antes valida el tamaño (no envía si se pasa). success:false
 * → su message si es texto, si no TASKER_SEND_ERROR; sin respuesta (red o
 * timeout) → TASKER_NETWORK_ERROR.
 */
export async function createTaskerTask({
  token,
  urlColegio,
  body,
}: AuthArgs & { body: TaskrTaskBody }): Promise<CreateTaskerTaskResult> {
  const serialized = serializeTaskrTaskBody(body);
  if (!serialized.ok) return serialized;
  try {
    const response = await axios.post(`${urlColegio}/taskr/tasks`, serialized.json, {
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      timeout: TASKER_SEND_TIMEOUT_MS,
    });
    if (response.data?.success !== true) {
      return { ok: false, message: readTaskrMessage(response.data?.message, TASKER_SEND_ERROR) };
    }
    const id = response.data?.data?.id;
    const createdDate = textOrNull(response.data?.data?.createdDate)?.trim() || null;
    return { ok: true, id: typeof id === "number" ? id : null, createdDate, message: "" };
  } catch (error: any) {
    console.warn("createTaskerTask:", error?.message ?? "error desconocido");
    if (error?.response) {
      return {
        ok: false,
        message: readTaskrMessage(error.response.data?.message, TASKER_SEND_ERROR),
      };
    }
    return { ok: false, message: TASKER_NETWORK_ERROR };
  }
}

// ─── Seguimiento: mapeo ─────────────────────────────────────────────────────

function idOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** { id, name } con id numérico; cualquier otra cosa → null. */
function mapUserRef(raw: unknown): TaskerUserRef | null {
  if (!isRecord(raw)) return null;
  const id = idOrNull(raw.id);
  return id === null ? null : { id, name: textOrEmpty(raw.name) };
}

function mapTaskClient(raw: unknown): TaskerClient | null {
  if (!isRecord(raw)) return null;
  const id = idOrNull(raw.id);
  return id === null ? null : { id, name: textOrEmpty(raw.name), phone: textOrEmpty(raw.phone) };
}

function mapPriority(raw: unknown): TaskerPriority | null {
  if (!isRecord(raw)) return null;
  const id = idOrNull(raw.id);
  return id === null ? null : { id, name: textOrEmpty(raw.name), color: textOrEmpty(raw.color) };
}

/** stateId de la tarea o, si falta, el id de su `state`. Sin ninguno → 0. */
function readStateId(raw: Record<string, unknown>): number {
  return idOrNull(raw.stateId) ?? (isRecord(raw.state) ? idOrNull(raw.state.id) : null) ?? 0;
}

function mapState(raw: unknown, stateId: number): TaskerState {
  const state = isRecord(raw) ? raw : {};
  return { id: stateId, name: textOrEmpty(state.name), color: textOrEmpty(state.color) };
}

/** Una tarea de GET /taskr/tasks → tarjeta del selector. Sin id numérico → null. */
export function mapTaskrTaskSummary(raw: unknown): TaskerTaskSummary | null {
  if (!isRecord(raw)) return null;
  const id = idOrNull(raw.id);
  if (id === null) return null;
  const stateId = readStateId(raw);
  return {
    id,
    createdDate: textOrEmpty(raw.createdDate),
    stateId,
    state: mapState(raw.state, stateId),
    client: mapTaskClient(raw.client),
    assignedUser: mapUserRef(raw.assignedUser),
    priority: mapPriority(raw.priority),
  };
}

/** `data` de GET /taskr/tasks → tarjetas en el orden que vienen, y data.count. */
export function mapTaskrTasks(data: unknown): { tasks: TaskerTaskSummary[]; count: number } {
  const source = isRecord(data) ? data : {};
  const items = Array.isArray(source.items) ? source.items : [];
  const tasks = items.flatMap((item) => {
    const task = mapTaskrTaskSummary(item);
    return task ? [task] : [];
  });
  return { tasks, count: idOrNull(source.count) ?? tasks.length };
}

/** Dirección de la tarea: null si no viene o está vacía. Sin coordenadas válidas → lat/lng null. */
export function mapTaskrTaskAddress(raw: unknown): TaskerAddress | null {
  if (isEmptyAddress(raw)) return null;
  const source = raw as Record<string, unknown>;
  const address = {} as TaskerAddress;
  for (const key of CLIENT_ADDRESS_TEXT_FIELDS) address[key] = textOrEmpty(source[key]);
  const point = readCoordinates(source);
  address.latitude = point?.lat ?? null;
  address.longitude = point?.lng ?? null;
  return address;
}

function mapTags(raw: unknown): TaskerTag[] {
  return (Array.isArray(raw) ? raw : []).flatMap((tag): TaskerTag[] => {
    if (!isRecord(tag) || idOrNull(tag.id) === null) return [];
    const category = isRecord(tag.category) ? tag.category : {};
    return [
      { id: tag.id as number, name: textOrEmpty(tag.name), category: { name: textOrEmpty(category.name) } },
    ];
  });
}

/** Primer texto no vacío de un elemento de taskList. */
const TASK_LIST_TEXT_KEYS = ["action", "text", "name", "description"] as const;

/** taskList[] → textos ordenados por `order` (sin order, al final en su orden). */
export function mapTaskrTaskList(raw: unknown): string[] {
  const items = (Array.isArray(raw) ? raw : []).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const text = TASK_LIST_TEXT_KEYS.map((key) => textOrEmpty(item[key]).trim()).find(Boolean);
    if (!text) return [];
    return [{ text, order: idOrNull(item.order) ?? Number.POSITIVE_INFINITY, index }];
  });
  return items.sort((a, b) => a.order - b.order || a.index - b.index).map((item) => item.text);
}

/** Coordenadas de una actividad: `coordinates` o lat/lng sueltos. Inválidas → null. */
function mapActivityCoordinates(raw: Record<string, unknown>): TaskerActivity["coordinates"] {
  const point = (isRecord(raw.coordinates) && readCoordinates(raw.coordinates)) || readCoordinates(raw);
  return point ? { latitude: point.lat, longitude: point.lng } : null;
}

export function mapTaskrActivities(raw: unknown): TaskerActivity[] {
  return (Array.isArray(raw) ? raw : []).flatMap((item): TaskerActivity[] => {
    if (!isRecord(item)) return [];
    const id = idOrNull(item.id);
    if (id === null) return [];
    return [
      {
        id,
        type: textOrEmpty(item.type),
        action: textOrEmpty(item.action),
        message: textOrEmpty(item.message),
        beginDate: textOrEmpty(item.beginDate),
        endDate: typeof item.endDate === "string" && item.endDate !== "" ? item.endDate : null,
        user: isRecord(item.user)
          ? { id: idOrNull(item.user.id), name: textOrEmpty(item.user.name) }
          : null,
        time: typeof item.time === "string" && item.time.trim() !== "" ? item.time : null,
        coordinates: mapActivityCoordinates(item),
      },
    ];
  });
}

/**
 * comments[] → comentarios ordenados por id, con el autor ya resuelto
 * (getTaskerCommentAuthorName) y los adjuntos como URL (buildTaskrFileUrl).
 */
export function mapTaskrComments(
  raw: unknown,
  task: Pick<TaskerTask, "addUserId" | "externalUserName">,
  urlColegio: string,
): TaskerComment[] {
  const comments = (Array.isArray(raw) ? raw : []).flatMap((item): TaskerComment[] => {
    if (!isRecord(item)) return [];
    const id = idOrNull(item.id);
    if (id === null) return [];
    const author = isRecord(item.addUser)
      ? { id: idOrNull(item.addUser.id), name: textOrEmpty(item.addUser.name) }
      : null;
    const images = (Array.isArray(item.images) ? item.images : [])
      .map((path) => (typeof path === "string" ? buildTaskrFileUrl(path, urlColegio) : ""))
      .filter(Boolean);
    return [
      {
        id,
        addUser: { id: author?.id ?? null, name: getTaskerCommentAuthorName(author, task) },
        createdDate: textOrEmpty(item.createdDate),
        comment: textOrEmpty(item.comment),
        images,
      },
    ];
  });
  return comments.sort((a, b) => a.id - b.id);
}

/**
 * `data` de GET /taskr/tasks/{id} → detalle. `urlColegio` arma la URL de los
 * adjuntos (buildTaskrFileUrl). Sin id numérico → null.
 */
export function mapTaskrTaskDetail(data: unknown, urlColegio: string): TaskerTask | null {
  const summary = mapTaskrTaskSummary(data);
  if (!summary) return null;
  const raw = data as Record<string, unknown>;
  const owner = {
    addUserId: idOrNull(raw.addUserId) ?? (isRecord(raw.addUser) ? idOrNull(raw.addUser.id) : null),
    externalUserName: textOrEmpty(raw.externalUserName),
  };
  return {
    id: summary.id,
    createdDate: summary.createdDate,
    action: textOrEmpty(raw.action),
    stateId: summary.stateId,
    state: summary.state,
    ...owner,
    assignedUser: summary.assignedUser,
    client: summary.client,
    priority: summary.priority,
    tags: mapTags(raw.tags),
    address: mapTaskrTaskAddress(raw.address),
    faults: mapTaskrTaskList(raw.taskList),
    comments: mapTaskrComments(raw.comments, owner, urlColegio),
    activities: mapTaskrActivities(raw.activities),
  };
}

// ─── Seguimiento: comentario nuevo (PATCH /taskr/tasks/{id}) ────────────────

/**
 * Cuerpo del PATCH: un comentario con `comment` siempre presente ("" si solo
 * trae adjuntos) y los adjuntos como data URIs.
 */
export function buildTaskrCommentBody(draft: TaskerCommentDraft): TaskrCommentBody {
  return {
    taskComments: [
      {
        comment: draft.text.trim(),
        images: draft.attachments
          .map((a) => a.dataUri)
          .filter((value) => typeof value === "string" && /^data:/i.test(value)),
      },
    ],
  };
}

/** El JSON del PATCH, o el error si pasa de TASKR_TASK_MAX_BYTES (9.5 MB). */
export function serializeTaskrCommentBody(body: TaskrCommentBody): SerializedBody {
  return serializeWithinLimit(body);
}

// ─── Seguimiento: servicios ─────────────────────────────────────────────────

export const TASKER_TASKS_ERROR = "No se pudieron cargar los tickets.";
export const TASKER_TASK_ERROR = "No se pudo cargar el ticket.";
export const TASKER_COMMENT_SEND_ERROR = "No se pudo enviar el comentario. Intente nuevamente.";

/** Parámetros fijos de la lista: nunca se pasa otro ni nada que escriba el usuario. */
export const TASKR_TASKS_PARAMS = Object.freeze({
  orderKey: "createdDate",
  orderDir: "desc",
});

/** `gone`: Taskr dijo "La tarea ya no está disponible." (deseleccionar y recargar). */
export type TaskrFailure = { ok: false; message: string; gone: boolean };

/** success:false → su message (texto) o `fallback`, marcando si la tarea ya no existe. */
export function taskrFailure(message: unknown, fallback: string): TaskrFailure {
  const text = readTaskrMessage(message, fallback);
  return { ok: false, message: text, gone: isTaskrTaskGoneMessage(text) };
}

/** Error de axios: con respuesta → su message; sin respuesta (red o timeout) → TASKER_NETWORK_ERROR. */
function failureFromError(error: any, fallback: string): TaskrFailure {
  if (error?.response) return taskrFailure(error.response.data?.message, fallback);
  return { ok: false, message: TASKER_NETWORK_ERROR, gone: false };
}

/** El id va en la ruta: solo enteros positivos. */
function isTaskId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

export type FetchTaskerTasksResult =
  | { ok: true; tasks: TaskerTaskSummary[]; count: number; message: string }
  | TaskrFailure;

export async function fetchTaskerTasks({
  token,
  urlColegio,
}: AuthArgs): Promise<FetchTaskerTasksResult> {
  try {
    const response = await axios.get(`${urlColegio}/taskr/tasks`, {
      headers: authHeaders(token),
      params: { ...TASKR_TASKS_PARAMS },
      timeout: TASKER_FETCH_TIMEOUT_MS,
    });
    if (response.data?.success !== true) {
      return taskrFailure(response.data?.message, TASKER_TASKS_ERROR);
    }
    return { ok: true, ...mapTaskrTasks(response.data.data), message: "" };
  } catch (error: any) {
    console.warn("fetchTaskerTasks:", error?.message ?? "error desconocido");
    return failureFromError(error, TASKER_TASKS_ERROR);
  }
}

export type FetchTaskerTaskResult = { ok: true; task: TaskerTask; message: string } | TaskrFailure;

export async function fetchTaskerTask({
  token,
  urlColegio,
  id,
}: AuthArgs & { id: number }): Promise<FetchTaskerTaskResult> {
  if (!isTaskId(id)) return { ok: false, message: TASKER_TASK_ERROR, gone: false };
  try {
    const response = await axios.get(`${urlColegio}/taskr/tasks/${id}`, {
      headers: authHeaders(token),
      timeout: TASKER_FETCH_TIMEOUT_MS,
    });
    if (response.data?.success !== true) {
      return taskrFailure(response.data?.message, TASKER_TASK_ERROR);
    }
    const task = mapTaskrTaskDetail(response.data.data, urlColegio);
    return task
      ? { ok: true, task, message: "" }
      : { ok: false, message: TASKER_TASK_ERROR, gone: false };
  } catch (error: any) {
    console.warn("fetchTaskerTask:", error?.message ?? "error desconocido");
    return failureFromError(error, TASKER_TASK_ERROR);
  }
}

export type AddTaskerCommentResult = { ok: true; message: string } | TaskrFailure;

/**
 * Agrega un comentario. Antes valida el tamaño (no envía si se pasa). La
 * respuesta trae la tarea sin activities: quien llama vuelve a pedir el detalle.
 */
export async function addTaskerTaskComment({
  token,
  urlColegio,
  id,
  body,
}: AuthArgs & { id: number; body: TaskrCommentBody }): Promise<AddTaskerCommentResult> {
  if (!isTaskId(id)) return { ok: false, message: TASKER_COMMENT_SEND_ERROR, gone: false };
  const serialized = serializeTaskrCommentBody(body);
  if (!serialized.ok) return { ...serialized, gone: false };
  try {
    const response = await axios.patch(`${urlColegio}/taskr/tasks/${id}`, serialized.json, {
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      timeout: TASKER_SEND_TIMEOUT_MS,
    });
    if (response.data?.success !== true) {
      return taskrFailure(response.data?.message, TASKER_COMMENT_SEND_ERROR);
    }
    return { ok: true, message: "" };
  } catch (error: any) {
    console.warn("addTaskerTaskComment:", error?.message ?? "error desconocido");
    return failureFromError(error, TASKER_COMMENT_SEND_ERROR);
  }
}
