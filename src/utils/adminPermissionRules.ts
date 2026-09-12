/**
 * Reglas y acceso a datos de "Consultar Permisos/Ausencias"
 * (webapp: src/Features/Permissions/index.jsx).
 *
 * Mismo criterio que permissionRules.ts, del que reutiliza rutas, shape del
 * permiso y helpers de fecha: vive fuera de `src/app/` porque todo lo que
 * cuelga del app root de expo-router se registra como ruta, y porque al no
 * importar react-native ni expo-* se testea con jest sin emulador.
 *
 * La diferencia con "Mis Permisos" no es cosmética:
 *
 *   - NO se manda `schoolUserId`. Esta pantalla lista a TODOS los empleados de
 *     la escuela; el aislamiento por escuela lo aplica el backend con el
 *     `schoolId` del JWT, no un param del cliente.
 *   - Las dos tablas NO se mezclan. El toggle Local/Histórico cambia de
 *     endpoint completo, así que cada listado sale de una sola tabla y la
 *     paginación es la simple (page/rows), sin el buffer de permissionRules.
 *   - `userdaypermissionsh` solo expone GET: no hay PATCH ni DELETE de un
 *     archivado. Por eso el modo Histórico es de solo lectura y las reglas de
 *     visibilidad de botones lo cortan antes de llegar a la red.
 */

import axios from "axios";
import { extractTableRows } from "./adminPunchRules";
import {
  PERMISSION_ROUTES,
  permissionDateKey,
  type MyPermission,
  type PermissionSource,
  type PermissionTagRef,
} from "./permissionRules";
import { normalizePermissionName, toRD } from "./punchRules";

// ─── Params del listado ──────────────────────────────────────────────────────

/**
 * Copia literal del `TABLE_FIELDS` del webapp (Permissions/index.jsx:64).
 *
 * ⚠️ NO NORMALIZAR la mezcla de puntos y dos puntos — misma advertencia que
 * MY_PERMISSIONS_FIELDS en permissionRules.ts: el PUNTO separa alias de
 * columna y los DOS PUNTOS son parte del ALIAS de un join ANIDADO. Un join de
 * primer nivel va con punto (`stateTag.name`); uno de dos o más niveles lleva
 * dos puntos entre relaciones y punto antes de la columna
 * (`schoolUser:user.fullName`). Aplanarlo a `schoolUser.user.fullName` produce
 * el 500 de "Unknown column '...undefined'".
 *
 * A diferencia de "Mis Permisos", acá SÍ entra `schoolUser:user.fullName`: la
 * lista es de toda la escuela y el nombre del solicitante es la columna
 * "Solicitado por", no se puede suplir con el usuario logueado.
 *
 * Como ya documenta permissionRules.ts, `fields` alimenta el WHERE del filtro
 * libre `all` y NO es la proyección del SELECT: las columnas que vuelven las
 * decide el withGraphFetched del handler. Por eso la lista no incluye
 * `groupWeekDays` ni `stateTag.delet` aunque la pantalla los use — se copia
 * exacta del webapp en vez de "completarla".
 */
export const ADMIN_PERMISSION_FIELDS =
  "id,permissionDate,fromTime,toTime,schoolUser:user.fullName,schoolUser:user.phone,schoolUser:user.email,stateTag.id,stateTag.name,stateTag.color,stateTag.fontColor,stateTag.edit,stateTag.readonly,typeTag.name,typeTag.color,typeTag.fontColor,actionTag.name,actionTag.color,actionTag.fontColor,adminUser:user.fullName";

/** Filas por página, igual que el webapp. */
export const ADMIN_PERMISSION_ROWS = 15;

export const ADMIN_PERMISSION_SOURCE_LABELS: Record<PermissionSource, string> = {
  local: "Local",
  historico: "Histórico",
};

/**
 * Los params del listado, en el orden en que viajan. Se extrae del fetch para
 * poder fijar el query string exacto en un test — el modo de fallo típico acá
 * es un param faltante, que es invisible desde la firma de la función.
 *
 * `all` es el filtro de texto libre del motor genérico de tabla y solo viaja
 * cuando hay búsqueda: mandarlo vacío filtraría contra la cadena vacía.
 *
 * NO lleva `schoolUserId` — ver la nota de arriba del módulo.
 *
 * El orden difiere por `source`: Local ordena por `permissionDate` ascendente
 * (la más cercana primero) porque `userdaypermissions.permissionDate` es
 * columna real de la tabla base y el handler no exige whitelist ni join para
 * ordenar por ella. Histórico se queda en `id` descendente — `userdaypermissionsh`
 * es de solo lectura y no hay pedido de cambiarlo.
 */
export function buildAdminPermissionsParams({
  source,
  page = 1,
  rows = ADMIN_PERMISSION_ROWS,
  search = "",
  fields = ADMIN_PERMISSION_FIELDS,
}: {
  source: PermissionSource;
  page?: number;
  rows?: number;
  search?: string;
  fields?: string;
}): Record<string, string | number> {
  const isLocal = source === "local";
  const params: Record<string, string | number> = {
    page,
    orderKey: isLocal ? "permissionDate" : "id",
    orderDir: isLocal ? "asc" : "desc",
    rows,
  };
  const term = search.trim();
  if (term) params.all = term;
  params.fields = fields;
  return params;
}

/** El query string tal cual sale al cable — el que hay que pegar al diagnosticar. */
export function buildAdminPermissionsQueryString(
  params: Record<string, string | number>,
): string {
  return new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
}

// ─── Catálogo de tags ────────────────────────────────────────────────────────

/**
 * Un tag del catálogo de la escuela, con los campos que el listado NO trae.
 *
 * `delet` es el nombre real de la columna en el backend (Tags.js:26) — un typo
 * de origen, NO "delete". Escribirlo bien deja el botón Eliminar invisible
 * para siempre y sin error visible.
 *
 * `gotoTags` son las transiciones válidas y llegan como Tag COMPLETOS, no como
 * una lista de ids: `/tags/all` los trae con withGraphFetched ya ordenados.
 */
export interface PermissionCatalogTag extends PermissionTagRef {
  categoryId?: number | null;
  category?: { id?: number; name?: string } | null;
  edit?: boolean | null;
  delet?: boolean | null;
  readonly?: boolean | null;
  gotoTags?: PermissionCatalogTag[] | null;
}

/**
 * Los 3 IDs de categoría son configurables por escuela — nunca hardcodearlos.
 * Llegan como `{ label, value }` con el id en string dentro de `value`, así
 * que se tipan `unknown` para obligar a pasarlos por readCategoryId.
 */
export interface CategoryDefaultIds {
  catPermissionActionsId?: unknown;
  catPermTypeId?: unknown;
  catPermStatedId?: unknown;
}

/**
 * Normaliza un id de `categoryDefaultIds` a número, aceptando las tres formas
 * vistas en el campo: número suelto, string ("25") y `{ label, value }`.
 *
 * Es un duplicado deliberado del helper homónimo de SolicitarPermisoForm.tsx:
 * ese vive dentro de un componente que importa react-native, y este módulo se
 * testea en node. Copiar seis líneas cuesta menos que arrastrar el runtime de
 * RN a jest.
 */
export function readCategoryId(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return raw || undefined;
  if (typeof raw === "string") return Number(raw) || undefined;
  const value = (raw as { value?: unknown }).value;
  return value == null ? undefined : Number(value) || undefined;
}

function tagCategoryId(tag: PermissionCatalogTag): number | undefined {
  return tag.categoryId ?? tag.category?.id ?? undefined;
}

/** Orden alfabético con acentos y ñ donde corresponde. */
function byNameEs(a: PermissionCatalogTag, b: PermissionCatalogTag): number {
  return String(a.name ?? "").localeCompare(String(b.name ?? ""), "es");
}

export interface PermissionCatalog {
  /** Acciones (Ausencia, Horas Extras, …). */
  actionTags: PermissionCatalogTag[];
  /** Estados, con `edit`/`delet`/`readonly`/`gotoTags` completos. */
  stateTags: PermissionCatalogTag[];
  /** Categoría de los Tipos — los tipos salen de `action.gotoTags`. */
  typeCategoryId: number | null;
}

/** Los tipos de permiso de una acción: sus gotoTags de la categoría de tipos. */
export function typeTagsForAction(
  action: PermissionCatalogTag | null | undefined,
  typeCategoryId: number | null,
): PermissionCatalogTag[] {
  if (!action || typeCategoryId == null) return [];
  return (action.gotoTags ?? [])
    .filter((tag) => tagCategoryId(tag) === typeCategoryId)
    .sort(byNameEs);
}

// ─── Vencimiento ─────────────────────────────────────────────────────────────

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * "Ahora" en hora RD como "YYYY-MM-DD HH:mm:ss".
 *
 * Se compara como STRING a propósito: `permissionDate` es un DÍA y `toTime`
 * una hora de pared, las dos sin zona. Construir un Date con ellas las movería
 * al offset del dispositivo (el mismo bug que documenta permissionDateKey), y
 * en este formato el orden lexicográfico ya coincide con el cronológico.
 */
export function nowStampRD(now: Date = new Date()): string {
  const rd = toRD(now);
  return `${rd.year}-${pad(rd.month + 1)}-${pad(rd.day)} ${pad(rd.hours)}:${pad(rd.minutes)}:${pad(rd.seconds)}`;
}

/** El instante en que el permiso deja de estar vigente, o "" si no aplica. */
export function permissionExpiryStamp(
  permission: Pick<MyPermission, "permissionDate" | "toTime">,
): string {
  const day = permissionDateKey(permission.permissionDate);
  const time = String(permission.toTime ?? "").trim();
  if (!day || !time) return "";
  return `${day} ${time.length === 5 ? `${time}:00` : time}`;
}

/**
 * ¿El permiso ya venció? Sin fecha o sin hora de fin no vence — es el mismo
 * criterio del webapp (isPermissionExpired), que ante datos incompletos deja
 * la fila operable en vez de bloquearla.
 */
export function isPermissionExpired(
  permission: Pick<MyPermission, "permissionDate" | "toTime">,
  now: Date = new Date(),
): boolean {
  const stamp = permissionExpiryStamp(permission);
  if (!stamp) return false;
  return stamp < nowStampRD(now);
}

// ─── Estados y transiciones ──────────────────────────────────────────────────

/** Los ids de `gotoTags`, sin repetidos y sin basura. */
export function getGotoTagIds(
  stateTag: PermissionCatalogTag | null | undefined,
): number[] {
  const list = Array.isArray(stateTag?.gotoTags) ? stateTag.gotoTags : [];
  const ids: number[] = [];
  for (const tag of list) {
    const id = Number(tag?.id);
    if (Number.isFinite(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * La definición COMPLETA del estado de una fila.
 *
 * El listado trae el `stateTag` recortado (sin `gotoTags` ni `delet`), así que
 * la fila sola no alcanza para decidir qué botones mostrar. El catálogo manda
 * y la fila queda de respaldo para cuando el estado ya no existe en él.
 */
export function resolveStateTagDefinition(
  permission: Pick<MyPermission, "stateTag"> | null | undefined,
  catalog: PermissionCatalogTag[],
): PermissionCatalogTag | null {
  const rowTag = (permission?.stateTag ?? null) as PermissionCatalogTag | null;
  const id = Number(rowTag?.id);
  if (!Number.isFinite(id)) return rowTag;
  const fromCatalog = catalog.find((tag) => Number(tag.id) === id);
  return fromCatalog ? { ...rowTag, ...fromCatalog } : rowTag;
}

/**
 * Los estados a los que puede pasar una fila: el actual más sus `gotoTags`.
 * Sin transiciones definidas se ofrece el catálogo entero, igual que hace
 * getStateDropdownOptions en el webapp.
 */
export function allowedStateTags(
  stateTag: PermissionCatalogTag | null | undefined,
  catalog: PermissionCatalogTag[],
): PermissionCatalogTag[] {
  const gotoIds = getGotoTagIds(stateTag);
  if (gotoIds.length === 0) return [...catalog];
  const currentId = Number(stateTag?.id);
  return catalog.filter((tag) => {
    const id = Number(tag.id);
    return id === currentId || gotoIds.includes(id);
  });
}

/**
 * ¿Este estado destino es un rechazo o una cancelación?
 *
 * Se decide por el NOMBRE porque no hay flag en el backend que lo marque. Es
 * la misma heurística del webapp y es 100% client-side: el backend acepta el
 * PATCH sin comentario igual, así que si esto devuelve false por un nombre
 * inesperado, el rechazo pasa sin justificar.
 */
export function isRejectionStateName(name: string | null | undefined): boolean {
  const normalized = normalizePermissionName(name);
  return normalized.includes("rechaza") || normalized.includes("cancela");
}

export function isRejectionStateTag(
  tag: PermissionTagRef | null | undefined,
): boolean {
  return isRejectionStateName(tag?.name);
}

// ─── Visibilidad de acciones por fila ────────────────────────────────────────

export interface PermissionRowContext {
  /** true en modo Histórico: la tabla archivada no acepta PATCH ni DELETE. */
  isHistorical: boolean;
  now?: Date;
}

/** Eliminar: `stateTag.delet` y ni archivado ni vencido. */
export function canDeletePermission(
  permission: Pick<MyPermission, "permissionDate" | "toTime">,
  stateTag: PermissionCatalogTag | null | undefined,
  { isHistorical, now }: PermissionRowContext,
): boolean {
  if (isHistorical) return false;
  if (isPermissionExpired(permission, now)) return false;
  return Boolean(stateTag?.delet);
}

/**
 * Editar (y habilitación del dropdown de Estado): calcado de
 * rowAllowsPermissionEdit del webapp — `edit`, o `readonly` con transiciones,
 * y ni archivado ni vencido.
 *
 * Se evalúa SOLO con el `stateTag` que trae la propia fila, nunca con la
 * definición enriquecida del catálogo. El webapp hace lo mismo, y como el
 * listado solo hace join a `stateTag` sin `gotoTags` (handlers.js:33), en la
 * práctica la rama `readonly` nunca se cumple y la regla efectiva es `edit`.
 * Mezclar el catálogo (resolveStateTagDefinition) habilitaría Editar en
 * estados que el webapp muestra deshabilitados. El catálogo sirve solo para
 * las OPCIONES del dropdown (allowedStateTags), no para decidir si se abre.
 *
 * La rama `readonly` se conserva leyendo los `gotoTags` de la fila: si el
 * listado algún día los incluye, el comportamiento sigue al webapp sin tocar
 * esto.
 */
export function canEditPermission(
  permission: Pick<MyPermission, "permissionDate" | "toTime" | "stateTag">,
  { isHistorical, now }: PermissionRowContext,
): boolean {
  if (isHistorical) return false;
  if (isPermissionExpired(permission, now)) return false;
  const rowTag = permission.stateTag as PermissionCatalogTag | null | undefined;
  if (!rowTag) return false;
  if (rowTag.readonly && getGotoTagIds(rowTag).length > 0) return true;
  return Boolean(rowTag.edit);
}

/** Ver (solo lectura): únicamente en modo Histórico. */
export function canViewPermission({ isHistorical }: PermissionRowContext): boolean {
  return isHistorical;
}

// ─── Edición: diff y justificación ───────────────────────────────────────────

/**
 * Lo único que acepta el PATCH de edición (handlers.js:771-784):
 * `stateTagId`, `overTime`, `comments` más las operaciones de adjuntos
 * (`attachments` / `attachmentsD`). Cualquier otro campo el backend lo
 * descarta en silencio — y si solo viajara eso, responde success:false.
 *
 * Por eso Asunto y Motivo NO forman parte del borrador: son de solo lectura en
 * el modal, igual que en el webapp (PermissonCrud:972/986, siempre disabled),
 * y el builder de abajo no tiene de dónde sacarlos.
 */
export const PERMISSION_PATCH_FIELDS = ["stateTagId", "overTime", "comments"] as const;

/** Lo que trajo el detalle — la base contra la que se calcula el diff. */
export interface PermissionEditSnapshot {
  stateTagId: number | null;
  comments: string;
  /** "Hr. Extras Pagas". */
  overTime: boolean;
  /** Rutas relativas tal cual las devolvió el backend, en su orden original. */
  attachments: string[];
}

/** Lo que el usuario dejó en el formulario. */
export interface PermissionEditDraft {
  stateTagId: number | null;
  comments: string;
  overTime: boolean;
  /** Adjuntos nuevos, como data-URI. Se AGREGAN a los que ya están. */
  newAttachments: string[];
  /** Posiciones a borrar dentro de `snapshot.attachments`. */
  removedAttachmentIndexes: number[];
}

/**
 * "Solicitante" del detalle administrativo: quién hizo el POST del permiso
 * (`requestedSchoolUser`), NO el dueño (`schoolUser`, que ya se muestra en el
 * header). Sin fallback al dueño a propósito — en el histórico hay ~97
 * registros (createdDate entre 06-may y 08-jul-2026) con
 * requestedSchoolUserId NULL, y mostrar ahí el dueño confundiría "quién lo
 * pidió" con "de quién es".
 */
export function permissionRequesterName(
  permission: Pick<MyPermission, "requestedSchoolUser"> | null | undefined,
): string {
  const name = permission?.requestedSchoolUser?.user?.fullName;
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed || "No disponible";
}

/** El backend lo guarda como boolean o como 1 (handlers.js:913). */
export function readOverTime(raw: unknown): boolean {
  return raw === true || raw === 1;
}

/**
 * ¿La acción es de horas extras? Mismo criterio que isActionOvertime del
 * webapp (PermissonCrud:320-328): el NOMBRE contiene "horas extras".
 */
export function isOvertimeAction(actionName: string | null | undefined): boolean {
  return normalizePermissionName(actionName).includes("horas extras");
}

/**
 * El toggle "Hr. Extras Pagas" queda bloqueado en modo Ver (histórico / solo
 * lectura) o cuando la acción ya es de horas extras — mismo
 * `disabled={isWatch || isActionOvertime}` del webapp (PermissonCrud:1106).
 */
export function isOverTimeLocked({
  actionName,
  readOnly,
}: {
  actionName: string | null | undefined;
  readOnly: boolean;
}): boolean {
  return readOnly || isOvertimeAction(actionName);
}

export function permissionEditSnapshot(
  permission: MyPermission | null | undefined,
): PermissionEditSnapshot {
  return {
    stateTagId:
      permission?.stateTag?.id != null ? Number(permission.stateTag.id) : null,
    comments: String((permission?.comments as string | null) ?? ""),
    overTime: readOverTime(permission?.overTime),
    attachments: Array.isArray(permission?.attachments)
      ? [...permission.attachments]
      : [],
  };
}

/**
 * El borrador inicial. Una acción de horas extras FUERZA `overTime` a true al
 * abrir, igual que el efecto del webapp (PermissonCrud:330-334) — y como el
 * diff compara contra lo guardado, si estaba en false ese true viaja en el
 * PATCH, exactamente como en el webapp.
 */
export function emptyPermissionEditDraft(
  snapshot: PermissionEditSnapshot,
  { actionName }: { actionName?: string | null } = {},
): PermissionEditDraft {
  return {
    stateTagId: snapshot.stateTagId,
    comments: snapshot.comments,
    overTime: snapshot.overTime || isOvertimeAction(actionName),
    newAttachments: [],
    removedAttachmentIndexes: [],
  };
}

/** Los adjuntos que quedarían tras aplicar el borrado. */
export function remainingAttachments(
  snapshot: PermissionEditSnapshot,
  draft: PermissionEditDraft,
): string[] {
  const removed = new Set(draft.removedAttachmentIndexes);
  return snapshot.attachments.filter((_, index) => !removed.has(index));
}

/**
 * El cuerpo del PATCH: SOLO los campos que cambiaron.
 *
 * `attachmentsD` son ÍNDICES sobre el array actual de attachments, no ids ni
 * rutas — el backend hace `currentAttachments.splice(index, 1)` con ellos
 * (UserDayPermissions/handlers.js:890). Van ordenados y sin repetidos porque
 * un índice duplicado borraría de más.
 */
export function buildPermissionEditPayload(
  snapshot: PermissionEditSnapshot,
  draft: PermissionEditDraft,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  // Solo campos de PERMISSION_PATCH_FIELDS: nada más se lee del borrador, así
  // que ningún campo extra que traiga el objeto puede colarse al PATCH.
  if (draft.stateTagId != null && draft.stateTagId !== snapshot.stateTagId) {
    payload.stateTagId = draft.stateTagId;
  }
  if (draft.overTime !== snapshot.overTime) payload.overTime = draft.overTime;
  if (draft.comments !== snapshot.comments) payload.comments = draft.comments;
  if (draft.newAttachments.length > 0) {
    payload.attachments = [...draft.newAttachments];
  }

  const removed = Array.from(new Set(draft.removedAttachmentIndexes))
    .filter((index) => Number.isInteger(index) && index >= 0)
    .sort((a, b) => a - b);
  if (removed.length > 0) payload.attachmentsD = removed;

  return payload;
}

export const REJECTION_JUSTIFICATION_MESSAGE =
  "El comentario o un adjunto es obligatorio para rechazar o cancelar";

/**
 * El error de justificación, o null si el borrador está bien.
 *
 * Solo aplica cuando el estado destino es rechazo/cancelación, y se satisface
 * con un comentario O con al menos un adjunto — contando los que sobreviven al
 * borrado, no solo los nuevos.
 */
export function rejectionJustificationError(
  targetStateTag: PermissionTagRef | null | undefined,
  snapshot: PermissionEditSnapshot,
  draft: PermissionEditDraft,
): string | null {
  if (!isRejectionStateTag(targetStateTag)) return null;
  if (draft.comments.trim() !== "") return null;
  const attachmentCount =
    remainingAttachments(snapshot, draft).length + draft.newAttachments.length;
  if (attachmentCount > 0) return null;
  return REJECTION_JUSTIFICATION_MESSAGE;
}

// ─── Payload de creación ─────────────────────────────────────────────────────

/**
 * El POST de un permiso a nombre de OTRO empleado.
 *
 * Es el mismo cuerpo que arma SolicitarPermisoForm más `schoolUserId`, que es
 * lo único que le dice al backend a nombre de quién va — sin él el permiso
 * quedaría a nombre del administrador logueado.
 *
 * `canal` NO se manda: lo fija el backend.
 */
export function buildAdminPermissionPayload(input: {
  schoolUserId: number;
  actionTagId: number;
  typeTagId: number;
  subject: string;
  description: string;
  fromDate: string;
  toDate: string;
  fromTime?: string;
  toTime?: string;
  isFullDay: boolean;
  attachments?: string[];
  weekDays?: string[];
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    schoolUserId: input.schoolUserId,
    subject: input.subject.slice(0, 255),
    description: input.description,
    typeTagId: input.typeTagId,
    actionTagId: input.actionTagId,
    fromDate: input.fromDate,
    toDate: input.toDate,
  };
  // Ausencia: el backend fuerza 00:00–23:59, mandar horas lo rompería.
  if (!input.isFullDay) {
    payload.fromTime = input.fromTime ?? "";
    payload.toTime = input.toTime ?? "";
  }
  if (input.attachments && input.attachments.length > 0) {
    payload.attachments = [...input.attachments];
  }
  if (input.weekDays && input.weekDays.length > 0) {
    payload.weekDays = [...input.weekDays];
  }
  return payload;
}

// ─── Red ─────────────────────────────────────────────────────────────────────

interface AuthArgs {
  token: string;
  urlColegio: string;
}

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

function readErrorMessage(error: any): string {
  const raw = error?.response?.data?.message ?? error?.message;
  return typeof raw === "string" && raw.trim() !== ""
    ? raw
    : "No se pudo completar la operación.";
}

function logFailure(label: string, error: any): void {
  console.error(label, error?.response?.data?.message ?? error?.message);
}

export interface AdminPermissionsPage {
  items: MyPermission[];
  /** Total de filas de la tabla, o null si el envelope no lo trajo. */
  count: number | null;
  hasMore: boolean;
}

/**
 * Una página de UNA tabla. `extractTableRows` absorbe las tres formas de
 * respuesta del motor genérico de tabla (`data` como arreglo, `{ items }` o
 * `{ rows }`), igual que en permissionRules.
 */
export async function fetchAdminPermissionsPage({
  token,
  urlColegio,
  source,
  page = 1,
  rows = ADMIN_PERMISSION_ROWS,
  search = "",
}: AuthArgs & {
  source: PermissionSource;
  page?: number;
  rows?: number;
  search?: string;
}): Promise<AdminPermissionsPage> {
  const response = await axios.get(`${urlColegio}/${PERMISSION_ROUTES[source]}`, {
    ...authHeaders(token),
    params: buildAdminPermissionsParams({ source, page, rows, search }),
  });
  if (!response.data?.success) return { items: [], count: null, hasMore: false };

  const payload = response.data.data;
  const rawCount = (payload as Record<string, unknown> | null)?.count;
  const count = typeof rawCount === "number" ? rawCount : null;
  const items = extractTableRows(payload).map((raw) => ({
    ...(raw as MyPermission),
    source,
  }));

  // Dos señales, la que dispare primero: la página vino corta, o el `count`
  // del envelope dice que ya se leyó todo. El count solo cuenta si vino como
  // número — no todas las respuestas lo traen.
  const hasMore =
    items.length >= rows && (count == null || page * rows < count);

  return { items, count, hasMore };
}

/**
 * El detalle de un permiso cualquiera de la escuela.
 *
 * A diferencia de fetchPermissionDetail (permissionRules), acá NO hay guard de
 * pertenencia: esta pantalla es la vista administrativa y ver permisos ajenos
 * es justamente su función. El aislamiento por escuela lo aplica el backend.
 */
export async function fetchAdminPermissionDetail({
  token,
  urlColegio,
  id,
  source,
}: AuthArgs & {
  id: number;
  source: PermissionSource;
}): Promise<MyPermission | null> {
  const response = await axios.get(
    `${urlColegio}/${PERMISSION_ROUTES[source]}/${id}`,
    authHeaders(token),
  );
  if (!response.data?.success || !response.data.data) return null;
  return { ...(response.data.data as MyPermission), source };
}

export interface PermissionMutationResult {
  ok: boolean;
  message: string;
}

/**
 * Cambio de estado directo. El llamador ya descartó los estados de
 * rechazo/cancelación — esos exigen justificación y van por el modal de
 * edición, no por acá (ver rejectionJustificationError).
 */
export async function updatePermissionState({
  token,
  urlColegio,
  source,
  id,
  stateTagId,
}: AuthArgs & {
  source: PermissionSource;
  id: number;
  stateTagId: number;
}): Promise<PermissionMutationResult> {
  try {
    const response = await axios.patch(
      `${urlColegio}/${PERMISSION_ROUTES[source]}/${id}`,
      { stateTagId },
      authHeaders(token),
    );
    return {
      ok: Boolean(response.data?.success),
      message: response.data?.message ?? "",
    };
  } catch (error: any) {
    logFailure("updatePermissionState:", error);
    return { ok: false, message: readErrorMessage(error) };
  }
}

export async function patchPermission({
  token,
  urlColegio,
  source,
  id,
  body,
}: AuthArgs & {
  source: PermissionSource;
  id: number;
  body: Record<string, unknown>;
}): Promise<PermissionMutationResult> {
  try {
    const response = await axios.patch(
      `${urlColegio}/${PERMISSION_ROUTES[source]}/${id}`,
      body,
      authHeaders(token),
    );
    return {
      ok: Boolean(response.data?.success),
      message: response.data?.message ?? "",
    };
  } catch (error: any) {
    logFailure("patchPermission:", error);
    return { ok: false, message: readErrorMessage(error) };
  }
}

export async function deletePermission({
  token,
  urlColegio,
  source,
  id,
}: AuthArgs & {
  source: PermissionSource;
  id: number;
}): Promise<PermissionMutationResult> {
  try {
    const response = await axios.delete(
      `${urlColegio}/${PERMISSION_ROUTES[source]}/${id}`,
      authHeaders(token),
    );
    return {
      ok: Boolean(response.data?.success),
      message: response.data?.message ?? "",
    };
  } catch (error: any) {
    logFailure("deletePermission:", error);
    return { ok: false, message: readErrorMessage(error) };
  }
}

export async function createAdminPermission({
  token,
  urlColegio,
  payload,
}: AuthArgs & {
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; message: string; data: any }> {
  try {
    const response = await axios.post(
      `${urlColegio}/${PERMISSION_ROUTES.local}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    // `success` puede venir en false con HTTP 200 — el status no basta.
    return {
      ok: Boolean(response.data?.success),
      message: response.data?.message ?? "",
      data: response.data?.data ?? null,
    };
  } catch (error: any) {
    logFailure("createAdminPermission:", error);
    return {
      ok: false,
      message: readErrorMessage(error),
      data: error?.response?.data?.data ?? null,
    };
  }
}

/**
 * El catálogo completo en un solo request.
 *
 * Se usa `/tags/all` y no `/tags/permState`: los dos devuelven el mismo grafo
 * (con `gotoTags` embebidos), pero `/tags/permState` está montado sobre la
 * `whatsappStrategy` (API key), mientras que `/tags/all` es el que ya consume
 * el resto de la app con el Bearer del JWT.
 */
export async function fetchPermissionCatalog({
  token,
  urlColegio,
  categoryIds,
  schoolId,
}: AuthArgs & {
  /** Los ids que ya trajo el login — la semilla. */
  categoryIds: CategoryDefaultIds | undefined;
  /** Si viene, se refrescan contra /schools/{id} (mismo patrón que
   * SolicitarPermisoForm) para que un cambio de configuración se vea sin
   * re-login. Un fallo acá no bloquea: se sigue con la semilla. */
  schoolId?: number | null;
}): Promise<PermissionCatalog> {
  let ids = categoryIds;
  if (schoolId) {
    try {
      const schoolRes = await axios.get(
        `${urlColegio}/schools/${schoolId}`,
        authHeaders(token),
      );
      const fresh = schoolRes.data?.success
        ? schoolRes.data.data?.settings?.categoryDefaultIds
        : null;
      if (fresh) ids = fresh as CategoryDefaultIds;
    } catch (error: any) {
      logFailure("fetchPermissionCatalog/schools:", error);
    }
  }

  const typeCategoryId = readCategoryId(ids?.catPermTypeId) ?? null;
  // Fallback documentado: algunas escuelas no tienen catPermissionActionsId
  // configurado y las acciones viven bajo la misma categoría que los tipos.
  const actionCategoryId =
    readCategoryId(ids?.catPermissionActionsId) ?? typeCategoryId;
  const stateCategoryId = readCategoryId(ids?.catPermStatedId) ?? null;

  const response = await axios.get(`${urlColegio}/tags/all`, authHeaders(token));
  if (!response.data?.success) {
    return { actionTags: [], stateTags: [], typeCategoryId };
  }

  const allTags: PermissionCatalogTag[] = response.data.data ?? [];
  // .filter() ya devuelve un arreglo nuevo, así que ordenarlo in situ no toca
  // la respuesta original del backend.
  const ofCategory = (categoryId: number | null) =>
    categoryId == null
      ? []
      : allTags.filter((tag) => tagCategoryId(tag) === categoryId).sort(byNameEs);

  return {
    actionTags: ofCategory(actionCategoryId),
    stateTags: ofCategory(stateCategoryId),
    typeCategoryId,
  };
}
