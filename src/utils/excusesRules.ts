/**
 * Reglas y acceso a datos de "Excusas" (admin)
 * (webapp: src/Features/Excuses/index.jsx + Modals/ExcusesCrud/index.jsx).
 *
 * Mismo criterio que adminPermissionRules.ts: vive fuera de `src/app/` para
 * no registrarse como ruta, y al no importar react-native ni expo-* se testea
 * con jest sin emulador.
 *
 * Esta pantalla lista todas las excusas de la escuela desde la tabla única
 * `excuses` (no hay toggle Histórico: `/excusesh` queda fuera, igual que en
 * el webapp). El aislamiento por escuela lo aplica el backend con el
 * `schoolId` del JWT vía `where('student.schoolId', ...)`, no con un param
 * del cliente. La paginación es la simple (page/rows).
 *
 * En la misma tabla viven "Mis Excusas" (fetchMyExcusesPage): la vista que
 * combina `excuses` + `excusesh` con paginación cruzada, réplica del
 * handlerData de Features/MyExcuses del webapp (ver su doc inline).
 *
 * El PATCH del backend NO borra adjuntos: los `attachments`/`attachmentsAdm`
 * que superan 100 chars son data-URIs nuevas y se ANEXAN a las existentes;
 * una ruta corta (ya guardada) se ignora en silencio (Excuses/handlers.js:
 * patchExcuse). Por eso el modal de edición solo AGREGA y el diff
 * `attachmentsAdm` lleva únicamente las data-URIs nuevas.
 *
 * `delet` es el nombre real de la columna en el backend (Tags.js:26) — un
 * typo de origen, NO "delete". Escribirlo bien deja el botón Eliminar
 * invisible para siempre y sin error visible.
 */

import axios from "axios";
import { extractTableRows } from "./adminPunchRules";
import { readCategoryId } from "./adminPermissionRules";
import { type PermissionTagRef } from "./permissionRules";
import { normalizePermissionName } from "./punchRules";

// ─── Params del listado ──────────────────────────────────────────────────────

/**
 * Copia literal del `TABLE_FIELDS` del webapp (Excuses/index.jsx:61).
 *
 * ⚠️ NO NORMALIZAR la mezcla de puntos y dos puntos — misma advertencia que
 * ADMIN_PERMISSION_FIELDS: el PUNTO separa alias de columna y los DOS PUNTOS
 * son parte del ALIAS de un join ANIDADO (`enrollment:course.fullName`).
 *
 * Como ya documenta adminPermissionRules.ts, `fields` alimenta el WHERE del
 * filtro libre `all` y NO es la proyección del SELECT: las columnas que
 * vuelven las decide el withGraphFetched del handler (que trae la fila
 * completa, incl. `absentDays`, `attachments`, `comment`). Se copia exacta
 * del webapp en vez de "completarla".
 */
export const EXCUSE_FIELDS =
  "id,createdDate,stateTag.id,stateTag.name,stateTag.color,stateTag.fontColor,stateTag.edit,stateTag.readonly,typeTag.name,typeTag.color,typeTag.fontColor,student.fullName,enrollment:course.fullName,parent.fullName,parent.phone,parent.email,modifiedByUser:user.fullName,createdByUser:user.fullName,description";

/** Filas por página, igual que el webapp (defaultParams.rows = 15). */
export const EXCUSES_ROWS = 15;

/**
 * Los params del listado, en el orden en que viajan. Se extrae del fetch para
 * poder fijar el query string exacto en un test — el modo de fallo típico acá
 * es un param faltante, que es invisible desde la firma de la función.
 *
 * `all` es el filtro de texto libre del motor genérico de tabla y solo viaja
 * cuando hay búsqueda: mandarlo vacío filtraría contra la cadena vacía.
 *
 * `stateTag.id` es un filtro de columna propio (el `fieldQueries` del handler
 * es todo lo que no sea rows/page/orderKey/orderDir/fields) que se usa para
 * "mostrar solo las de un estado". `schoolUsersId` es otro filtro de columna:
 * acota a la persona que solicitó, y por cómo arma `getTableQuery` el backend
 * llega como `LIKE '%<id>%'` (filtro laxo, igual que manda el webapp).
 */
export function buildExcusesParams({
  page = 1,
  rows = EXCUSES_ROWS,
  search = "",
  stateTagId,
  schoolUsersId,
  fields = EXCUSE_FIELDS,
}: {
  page?: number;
  rows?: number;
  search?: string;
  stateTagId?: number | null;
  schoolUsersId?: number | null;
  fields?: string;
}): Record<string, string | number> {
  const params: Record<string, string | number> = {
    page,
    orderKey: "id",
    orderDir: "desc",
    rows,
  };
  const term = search.trim();
  if (term) params.all = term;
  if (stateTagId != null && Number.isFinite(stateTagId)) {
    params["stateTag.id"] = stateTagId;
  }
  if (schoolUsersId != null && Number.isFinite(schoolUsersId)) {
    params.schoolUsersId = schoolUsersId;
  }
  params.fields = fields;
  return params;
}

/** El query string tal cual sale al cable — el que hay que pegar al diagnosticar. */
export function buildExcusesQueryString(
  params: Record<string, string | number>,
): string {
  return new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
}

// ─── Catálogo de tags ────────────────────────────────────────────────────────

/**
 * Un tag del catálogo de estados de excusa, con los campos que el listado NO
 * trae (`edit`/`delet`/`readonly`/`gotoTags`). Estructuralmente compatible con
 * `Tag` de src/api/getTags.ts (lo que devuelve useTagsByCategory), así que
 * ambas cosas pueden alimentar el catálogo sin conversión.
 *
 * `gotoTags` son las transiciones válidas y llegan como Tag COMPLETOS, no como
 * una lista de ids: `/tags/all` los trae con withGraphFetched ya ordenados.
 */
export interface ExcuseTag extends PermissionTagRef {
  categoryId?: number | null;
  category?: { id?: number; name?: string } | null;
  add?: boolean | null;
  edit?: boolean | null;
  delet?: boolean | null;
  readonly?: boolean | null;
  gotoTags?: ExcuseTag[] | null;
}

/**
 * Los 2 IDs de categoría de excusas son configurables por escuela — nunca
 * hardcodearlos. Llegan como `{ label, value }` con el id en string dentro de
 * `value`, así que se tipan `unknown` para obligar a pasarlos por readCategoryId.
 */
export interface ExcuseCategoryIds {
  catExcusesId?: unknown;
  catExcuseStatedId?: unknown;
}

/** Tipos y estados de la excusa, agrupados para el detalle/edición. */
export interface ExcuseCatalog {
  stateTags: ExcuseTag[];
  typeTags: ExcuseTag[];
}

// ─── Shape de una excusa ─────────────────────────────────────────────────────

interface ExcuseUserRef {
  id?: number | null;
  user?: { id?: number | null; fullName?: string | null } | null;
}

/**
 * Una excusa, tal cual la devuelve GET /excuses (lista y detalle usan el
 * mismo withGraphFetched). Casi todo es opcional porque el listado y el
 * detalle no traen lo mismo en el grafo (el detalle siempre trae el row
 * completo, pero la fila del listado puede venir con relaciones nulas).
 *
 * `absentDays` y `attachments`/`attachmentsAdm` llegan como ARRAYS: la columna
 * es `json` en MySQL y mysql2 los auto-parsea. En el histórico es string, pero
 * esa tabla no se usa acá.
 */
export interface Excuse {
  id: number;

  subject?: string | null;
  description?: string | null;
  comment?: string | null;
  status?: string | null;
  valid?: string | null;

  /** ["YYYY-MM-DD", "YYYY-MM-DD"], o el string sin parsear en datos raros. */
  absentDays?: string[] | string | null;
  /** Rutas relativas de los adjuntos del solicitante. */
  attachments?: string[] | null;
  /** Rutas relativas de los adjuntos ADMINISTRATIVOS. */
  attachmentsAdm?: string[] | null;

  createdDate?: string | null;
  updatedAt?: string | null;

  stateTag?: ExcuseTag | null;
  typeTag?: PermissionTagRef | null;

  student?: {
    id?: number;
    fullName?: string | null;
    photourl?: string | null;
    s3Photo?: string | null;
    phone?: string | null;
    code?: string | null;
  } | null;
  enrollment?: {
    id?: number | null;
    /** Nº de lista real (el webapp lee enrollment.listNumber, no course). */
    listNumber?: number | string | null;
    course?: { id?: number | null; fullName?: string | null; listNumber?: number | null } | null;
  } | null;
  parent?: {
    id?: number | null;
    fullName?: string | null;
    relationship?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  modifiedByUser?: ExcuseUserRef | null;
  createdByUser?: ExcuseUserRef | null;

  stateTagId?: number | null;
  typeTagId?: number | null;

  [key: string]: unknown;
}

// ─── Fechas ──────────────────────────────────────────────────────────────────

/** "2026-04-20" a un Date en UTC — evita el corrimiento por zona horaria. */
function utcDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y || 0, (m || 1) - 1, d || 1));
}

function daysBetween(from: string, to: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 1;
  const diff = utcDate(to).getTime() - utcDate(from).getTime();
  return Math.max(1, Math.round(diff / 86_400_000) + 1);
}

export interface ExcuseDateRange {
  /** "YYYY-MM-DD" — el primer día de ausencia. "" si no hay fechas. */
  from: string;
  /** "YYYY-MM-DD" — el último día. Igual a `from` si es de un solo día. */
  to: string;
  /** Días cubiertos (>= 1). 0 si no hay fechas. */
  totalDays: number;
  /** true solo si abarca más de un día. */
  isRange: boolean;
}

/** Los días de ausencia como arreglo limpio de "YYYY-MM-DD" (o []). */
export function excuseAbsenceDays(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return excuseAbsenceDays(parsed);
    } catch {
      // string suelto que no es JSON: no es un rango útil
    }
  }
  return [];
}

/**
 * El rango de ausencia de una excusa. El backend guarda exactamente
 * [fechaInicio, fechaFin] (Excuess/handlers.js:166), así que no hay min/max
 * que calcular — se lee el par en orden.
 */
export function getExcuseDateRange(
  excuse: Pick<Excuse, "absentDays"> | null | undefined,
): ExcuseDateRange {
  const days = excuseAbsenceDays(excuse?.absentDays);
  const from = days[0] ?? "";
  const to = days[1] ?? from;
  if (!from) return { from: "", to: "", totalDays: 0, isRange: false };
  const totalDays = daysBetween(from, to);
  return { from, to, totalDays, isRange: to !== from };
}

// ─── Estados y transiciones ──────────────────────────────────────────────────

/**
 * El estado con el que nace una excusa nueva: el primero marcado `add`, o el
 * que se llama "Pendiente" — mismo criterio de ParentsExcusesScreen del
 * webapp (y de la pantalla homónima del mobile). Puede no existir, y entonces
 * el POST no manda `stateTagId` y el backend aplica su default.
 */
export function defaultExcuseStateTag(stateTags: ExcuseTag[]): ExcuseTag | null {
  return (
    stateTags.find((tag) => tag.add === true) ??
    stateTags.find((tag) => tag.name?.trim().toLowerCase() === "pendiente") ??
    null
  );
}

/** Los ids válidos y sin repetidos de una lista de gotoTags. */
function uniquePositiveIds(values: unknown[]): number[] {
  const ids: number[] = [];
  for (const value of values) {
    const id = Number(value);
    if (Number.isFinite(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Los ids de destino del estado, aceptando las tres formas que manda el
 * backend (ver normalizeGotoTagIdsFromState del webapp): `gotoTags` como Tag
 * completos, o `gotoTagIds`/`gotoTagId` sueltos (número o arreglo).
 */
export function getGotoTagIds(stateTag: ExcuseTag | null | undefined): number[] {
  if (!stateTag) return [];
  const embedded = Array.isArray(stateTag.gotoTags)
    ? stateTag.gotoTags.map((tag) => tag?.id)
    : [];
  if (embedded.length > 0) return uniquePositiveIds(embedded);

  const { gotoTagIds, gotoTagId } = stateTag as {
    gotoTagIds?: unknown;
    gotoTagId?: unknown;
  };
  const raw = gotoTagIds ?? gotoTagId;
  const list = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  return uniquePositiveIds(list);
}

/**
 * La definición COMPLETA del estado de una fila.
 *
 * El listado trae el `stateTag` recortado (sin `gotoTags` ni `delet`), así que
 * la fila sola no alcanza para decidir qué botones mostrar. El catálogo manda
 * y la fila queda de respaldo para cuando el estado ya no existe en él.
 */
export function resolveStateTagDefinition(
  excuse: Pick<Excuse, "stateTag"> | null | undefined,
  catalog: ExcuseTag[],
): ExcuseTag | null {
  const rowTag = (excuse?.stateTag ?? null) as ExcuseTag | null;
  const id = Number(rowTag?.id);
  if (!Number.isFinite(id) || id <= 0) return rowTag;
  const fromCatalog = catalog.find((tag) => Number(tag.id) === id);
  return fromCatalog ? { ...rowTag, ...fromCatalog } : rowTag;
}

/**
 * Los estados a los que puede pasar una fila: el actual más sus `gotoTags`.
 * Sin transiciones definidas se ofrece el catálogo entero, igual que hace
 * getStateDropdownOptions en el webapp (Excuses/index.jsx:134).
 */
export function allowedStateTags(
  stateTag: ExcuseTag | null | undefined,
  catalog: ExcuseTag[],
): ExcuseTag[] {
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
 * la misma heurística del webapp (onStateTableDropdownChange usa
 * "rechaza"/"cancela") y es 100% client-side: el backend acepta el PATCH sin
 * comentario igual, así que si esto devuelve false por un nombre inesperado,
 * el rechazo pasa sin justificar.
 */
export function isRejectionExcuseStateName(name: string | null | undefined): boolean {
  const normalized = normalizePermissionName(name);
  return normalized.includes("rechaza") || normalized.includes("cancela");
}

export function isRejectionExcuseStateTag(
  tag: PermissionTagRef | null | undefined,
): boolean {
  return isRejectionExcuseStateName(tag?.name);
}

// ─── Visibilidad de acciones por fila ────────────────────────────────────────

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * Editar (y habilitación del chip de Estado): calcado de rowAllowsExcuseEdit
 * del webapp — `edit`, o `readonly` con transiciones. Se evalúa SOLO con el
 * `stateTag` que trae la propia fila, nunca con la definición enriquecida del
 * catálogo, igual que hace el webapp (y por eso la rama `readonly` casi nunca
 * se cumple: el listado no trae gotoTags). El catálogo sirve solo para las
 * OPCIONES del sheet, no para decidir si se abre.
 */
export function canEditExcuse(excuse: Pick<Excuse, "stateTag"> | null | undefined): boolean {
  const st = excuse?.stateTag;
  if (!st) return false;
  const gotoIds = getGotoTagIds(st);
  if (st.readonly && gotoIds.length > 0) return true;
  return Boolean(st.edit);
}

/**
 * Eliminar: `stateTag.delet` (el typo real del backend) o el "delete" como
 * respaldo — mismo `Boolean(get(st, "delet") ?? get(st, "delete"))` del
 * webapp (Excuses/index.jsx:232).
 */
export function canDeleteExcuse(excuse: Pick<Excuse, "stateTag"> | null | undefined): boolean {
  const st = excuse?.stateTag;
  return Boolean(st?.delet ?? (st as { delete?: boolean } | null)?.delete);
}

/**
 * La línea destacada del modal "Confirmar Eliminar": el nombre del estudiante
 * o el id — mismo `focus` del ConfirmModal del webapp
 * (`get(tableValue, "student.fullName") || get(tableValue, "id")`).
 */
export function excuseDeleteConfirmationLabel(
  excuse: Pick<Excuse, "id" | "student"> | null | undefined,
): string {
  const name = text(excuse?.student?.fullName);
  if (name) return name;
  const id = Number(excuse?.id);
  return Number.isFinite(id) && id > 0 ? `Excusa #${id}` : "esta excusa";
}

/** "Quién Reporta" del detalle: el padre/tutor que hizo la solicitud. Sin
 * fallback inventado: si no hay fullName queda "" (el webapp deja el campo en
 * blanco, igual que la relación con su propio fallback fijo "Madre/Padre"). */
export function excuseReporterName(
  excuse: Pick<Excuse, "parent"> | null | undefined,
): string {
  return text(excuse?.parent?.fullName);
}

/** Línea "Modificado por"/"Creado por" del detalle (igual que el webapp). */
export function excuseAdminName(excuse: Excuse | null | undefined): string {
  return text(excuse?.modifiedByUser?.user?.fullName) || text(excuse?.createdByUser?.user?.fullName);
}

// ─── Edición: diff y justificación ───────────────────────────────────────────

/**
 * Lo que toca el modal de edición. El backend acepta esas columnas (más
 * cualquier otra, pero estas son las que la pantalla admin edita): estado,
 * comentario y adjuntos ADMIN — y, a diferencia del webapp (ExcusesCrud
 * siempre las tiene disabled), en mobile asunto/motivo/días sí se pueden
 * modificar y se incluyen en el diff.
 */
export const EXCUSE_PATCH_FIELDS = [
  "stateTagId",
  "comment",
  "subject",
  "description",
  "absentDays",
  "attachmentsAdm",
] as const;

/** Lo que trajo el detalle — la base contra la que se calcula el diff. */
export interface ExcuseEditSnapshot {
  stateTagId: number | null;
  comment: string;
  subject: string;
  description: string;
  /** ["YYYY-MM-DD", "YYYY-MM-DD"], o [] si la excusa no tiene fechas. */
  absentDays: string[];
  /** Rutas relativas tal cual las devolvió el backend, en su orden original. */
  attachmentsAdm: string[];
}

/** Lo que el usuario dejó en el formulario. */
export interface ExcuseEditDraft {
  stateTagId: number | null;
  comment: string;
  subject: string;
  description: string;
  /** ["YYYY-MM-DD", "YYYY-MM-DD"], o [] si el calendario quedó sin rango. */
  absentDays: string[];
  /** Adjuntos ADMIN nuevos, como data-URI. Se AGREGAN a los que ya están. */
  newAdminAttachments: string[];
}

export function excuseEditSnapshot(excuse: Excuse | null | undefined): ExcuseEditSnapshot {
  const range = getExcuseDateRange(excuse);
  return {
    stateTagId:
      Number(excuse?.stateTag?.id) > 0
        ? Number(excuse?.stateTag?.id)
        : Number(excuse?.stateTagId) > 0
          ? Number(excuse?.stateTagId)
          : null,
    comment: String(excuse?.comment ?? ""),
    subject: String(excuse?.subject ?? ""),
    description: String(excuse?.description ?? ""),
    absentDays: range.from ? [range.from, range.to] : [],
    attachmentsAdm: Array.isArray(excuse?.attachmentsAdm)
      ? [...excuse.attachmentsAdm]
      : [],
  };
}

/**
 * El borrador inicial. `preselectedStateTagId` es el estado destino elegido
 * desde el chip de la card (p. ej. un rechazo): si viene, marca solo ese.
 */
export function emptyExcuseEditDraft(
  snapshot: ExcuseEditSnapshot,
  preselectedStateTagId: number | null,
): ExcuseEditDraft {
  return {
    stateTagId: preselectedStateTagId ?? snapshot.stateTagId,
    comment: snapshot.comment,
    subject: snapshot.subject,
    description: snapshot.description,
    absentDays: [...snapshot.absentDays],
    newAdminAttachments: [],
  };
}

export const EXCUSE_REJECTION_MESSAGE =
  "El comentario o un adjunto es obligatorio para rechazar o cancelar";

/**
 * El error de justificación, o null si el borrador está bien.
 *
 * Solo aplica cuando el estado destino es rechazo/cancelación, y se satisface
 * con un comentario O con al menos un adjunto ADMIN — contando los que ya
 * estaban guardados, no solo los nuevos (mismo criterio de
 * rejectionJustificationError en adminPermissionRules.ts).
 */
export function excuseJustificationError(
  targetStateTag: PermissionTagRef | null | undefined,
  snapshot: ExcuseEditSnapshot,
  draft: ExcuseEditDraft,
): string | null {
  if (!isRejectionExcuseStateTag(targetStateTag)) return null;
  if (draft.comment.trim() !== "") return null;
  if (snapshot.attachmentsAdm.length + draft.newAdminAttachments.length > 0) {
    return null;
  }
  return EXCUSE_REJECTION_MESSAGE;
}

/**
 * El cuerpo del PATCH: SOLO los campos que cambiaron.
 *
 * `attachmentsAdm` lleva únicamente las data-URIs nuevas: el backend las
 * ANEXA a las existentes y descarta las de <= 100 chars, así que mandar las
 * rutas viejas sería ruido (y mandar el array completo duplicaría el diff sin
 * aportar).
 *
 * `absentDays` solo viaja si el rango nuevo es válido (2 fechas) y distinto
 * del guardado — no mandamos un rango vacío por si el calendario quedó en
 * blanco.
 */
export function buildExcuseEditPayload(
  snapshot: ExcuseEditSnapshot,
  draft: ExcuseEditDraft,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (draft.stateTagId != null && draft.stateTagId !== snapshot.stateTagId) {
    payload.stateTagId = draft.stateTagId;
  }
  if (draft.comment !== snapshot.comment) payload.comment = draft.comment;
  if (draft.subject !== snapshot.subject) payload.subject = draft.subject;
  if (draft.description !== snapshot.description) payload.description = draft.description;
  if (
    draft.absentDays.length === 2 &&
    (draft.absentDays[0] !== snapshot.absentDays[0] ||
      draft.absentDays[1] !== snapshot.absentDays[1] ||
      snapshot.absentDays.length !== 2)
  ) {
    payload.absentDays = [draft.absentDays[0], draft.absentDays[1]];
  }
  if (draft.newAdminAttachments.length > 0) {
    payload.attachmentsAdm = [...draft.newAdminAttachments];
  }

  return payload;
}

// ─── Payload de creación ─────────────────────────────────────────────────────

/**
 * El POST de una excusa a nombre de UNO O MÁS estudiantes.
 *
 * Mismo cuerpo que arma parentsexcusesscreen.tsx más el estado default: el
 * webapp usa un `studentIds` (array) y deja que el backend cree una fila por
 * matrícula activa. `absentDays` va como [inicio, fin] exactos.
 */
export function buildExcuseCreatePayload(input: {
  studentIds: number[];
  subject: string;
  description: string;
  typeTagId: number;
  absentDays: string[];
  attachments?: string[];
  stateTagId?: number;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    studentIds: [...new Set(input.studentIds.map(Number).filter(Number.isFinite))],
    subject: input.subject.slice(0, 255),
    description: input.description,
    typeTagId: Number(input.typeTagId),
    absentDays: [input.absentDays[0], input.absentDays[1]],
  };
  if (input.attachments && input.attachments.length > 0) {
    payload.attachments = [...input.attachments];
  }
  if (input.stateTagId != null && Number.isFinite(Number(input.stateTagId))) {
    payload.stateTagId = Number(input.stateTagId);
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

export interface ExcusesPage {
  items: Excuse[];
  /** Total de filas de la tabla, o null si el envelope no lo trajo. */
  count: number | null;
  hasMore: boolean;
}

/** La tabla del backend a la que apunta un fetch: `excuses` o `excusesh`. */
export type ExcuseTable = "excuses" | "excusesh";

export interface ExcusesPageQuery {
  page?: number;
  rows?: number;
  search?: string;
  stateTagId?: number | null;
  schoolUsersId?: number | null;
}

/**
 * Una página de cualquiera de las dos tablas de excusas (`excuses` / `excusesh`).
 *
 * `extractTableRows` absorbe las tres formas de respuesta del motor genérico
 * de tabla (`data` como arreglo, `{ items }` o `{ rows }`), igual que en
 * adminPermissionRules.
 *
 * `schoolUsersId` filtra por la persona que solicitó (vista "Mis Excusas"):
 * viaja como columna propia y, por cómo arma `getTableQuery` el backend, se
 * aplica como `LIKE '%<id>%'` — el mismo filtro suelto que manda el webapp.
 *
 * `rows` también gobierna el `hasMore` cuando el envelope no trae `count`: una
 * página corta (menos filas que `rows`) es la última (ver hasMore).
 */
async function fetchExcusesTable(
  table: ExcuseTable,
  {
    token,
    urlColegio,
    page = 1,
    rows = EXCUSES_ROWS,
    search = "",
    stateTagId,
    schoolUsersId,
  }: AuthArgs & ExcusesPageQuery,
): Promise<ExcusesPage> {
  const response = await axios.get(`${urlColegio}/${table}`, {
    ...authHeaders(token),
    params: buildExcusesParams({ page, rows, search, stateTagId, schoolUsersId }),
  });
  if (!response.data?.success) return { items: [], count: null, hasMore: false };

  const payload = response.data.data;
  const rawCount = (payload as Record<string, unknown> | null)?.count;
  const count = typeof rawCount === "number" ? rawCount : null;
  const items = extractTableRows(payload) as Excuse[];

  // Dos señales, la que dispare primero: la página vino corta, o el `count`
  // del envelope dice que ya se leyó todo. El count solo cuenta si vino como
  // número — no todas las respuestas lo traen.
  const hasMore =
    items.length >= rows && (count == null || page * rows < count);

  return { items, count, hasMore };
}

/**
 * Una página de la tabla `excuses` (el listado administrativo completo de la
 * escuela). Ver fetchExcusesTable.
 */
export function fetchAdminExcusesPage(
  args: AuthArgs & ExcusesPageQuery,
): Promise<ExcusesPage> {
  return fetchExcusesTable("excuses", args);
}

/**
 * Una página de la tabla HISTÓRICA `excusesh` (excusas archivadas). Mismo
 * shape que fetchAdminExcusesPage pero apuntando a `GET /excusesh`. La usa
 * fetchMyExcusesPage para combinar ambas tablas en la vista "Mis Excusas".
 */
export function fetchExcusesh(
  args: AuthArgs & ExcusesPageQuery,
): Promise<ExcusesPage> {
  return fetchExcusesTable("excusesh", args);
}

/**
 * Una excusa de la vista combinada "Mis Excusas" (excuses + excusesh).
 *
 * `isHistorical` es OBLIGATORIO propagarlo hasta la pantalla: los ids se
 * repiten entre las dos tablas, y de este flag salen tanto las keys del
 * listado como la ruta del detalle (/excusesh/{id}).
 */
export type MyExcuse = Excuse & { isHistorical: boolean };

export interface MyExcusesPage {
  items: MyExcuse[];
  hasMore: boolean;
}

/**
 * Una página de la vista combinada "Excusas + Histórico", calcada del
 * handlerData de Features/MyExcuses del webapp.
 *
 * ALGORITMO (mantener sincronizado con el webapp):
 *
 * La lista combinada ordena PRIMERO todas las filas de `excuses` y LUEGO
 * todas las de `excusesh`. El backend no lo hace combinado: page/rows se
 * traducen a un offset global que cae en una de las dos tablas
 *
 *     globalOffset = (page - 1) * rows
 *
 * 1) Si `globalOffset < countNormal`: la página cae dentro de `excuses` — se
 *    pide esa misma page a `excuses`. Si queda corta (última página de la
 *    tabla normal con menos de `rows` filas), se rellena con el PRINCIPIO de
 *    `excusesh` (page 1, rows = lo que falte).
 *
 * 2) Si no: el offset global cae dentro del histórico — se calculan la página
 *    interna y el remainder, y se pide esa página con `rows + remainder` para
 *    cortar el sobrante con slice. La fórmula (histPage y remainder) se
 *    replica TAL CUAL del webapp, incluida su alineación de páginas: para
 *    histPage >= 2 el offset pedido no coincide con el offset real y la
 *    página puede salir vacía o saltada — es el comportamiento del webapp, no
 *    corregirlo sin consultar.
 *
 * El fetch a `excuses` SIEMPRE se hace primero, aún en el caso 2: el `count`
 * del envelope es el TOTAL del filtro (no el de la página), y es la única
 * forma de saber cuántas filas hay antes del histórico — tan redundante como
 * en el webapp, que conserva ese fetch a propósito.
 *
 * `count` cae a `items.length` si el envelope no lo trae (el webapp usa
 * `count || items.length`). Si tras el reparto sigue sin `countHistorical`,
 * se hace una llamada chica (page 1, rows 1) solo para conocerlo.
 *
 * `hasMore` se decide por el TOTAL combinado: `page * rows < total`.
 */
export async function fetchMyExcusesPage({
  token,
  urlColegio,
  page = 1,
  rows = EXCUSES_ROWS,
  search = "",
  schoolUsersId,
}: AuthArgs & {
  page?: number;
  rows?: number;
  search?: string;
  schoolUsersId?: number | null;
}): Promise<MyExcusesPage> {
  const globalOffset = (page - 1) * rows;

  const normal = await fetchExcusesTable("excuses", {
    token,
    urlColegio,
    page,
    rows,
    search,
    schoolUsersId,
  });
  const countNormal = normal.count ?? normal.items.length;

  let items: MyExcuse[] = [];
  let countHistorical: number | null = null;

  if (globalOffset < countNormal) {
    // Caso 1 — la página cae dentro de `excuses`.
    const normalChunk = normal.items.map(
      (item): MyExcuse => ({ ...item, isHistorical: false }),
    );
    const needed = rows - normalChunk.length;
    if (needed > 0) {
      // Última página de la tabla normal: se rellena con el inicio del
      // histórico. El `count` de esa respuesta ya es el TOTAL del histórico.
      const hist = await fetchExcusesTable("excusesh", {
        token,
        urlColegio,
        page: 1,
        rows: needed,
        search,
        schoolUsersId,
      });
      countHistorical = hist.count ?? hist.items.length;
      items = [
        ...normalChunk,
        ...hist.items.map(
          (item): MyExcuse => ({ ...item, isHistorical: true }),
        ),
      ];
    } else {
      items = normalChunk;
    }
  } else {
    // Caso 2 — el offset global cae dentro del histórico.
    const historicalOffset = globalOffset - countNormal;
    const histPage = Math.floor(historicalOffset / rows) + 1;
    const histRemainder = historicalOffset % rows;
    const hist = await fetchExcusesTable("excusesh", {
      token,
      urlColegio,
      page: histPage,
      rows: rows + histRemainder,
      search,
      schoolUsersId,
    });
    countHistorical = hist.count ?? hist.items.length;
    items = hist.items
      .slice(histRemainder, histRemainder + rows)
      .map((item): MyExcuse => ({ ...item, isHistorical: true }));
  }

  if (countHistorical == null) {
    // Ninguna respuesta del histórico vino con `count`: una llamada chica
    // solo para conocer el total y poder decidir hasMore. El webapp hace
    // `resHistCount.count || 0` — se replica tal cual, sin usar items.
    const countOnly = await fetchExcusesTable("excusesh", {
      token,
      urlColegio,
      page: 1,
      rows: 1,
      search,
      schoolUsersId,
    });
    countHistorical = countOnly.count ?? 0;
  }

  const total = countNormal + (countHistorical ?? 0);
  return { items, hasMore: page * rows < total };
}

/** El detalle de una excusa cualquiera de la escuela (GET /excuses/{id}). */
export async function fetchExcuseDetail({
  token,
  urlColegio,
  id,
  table = "excuses",
}: AuthArgs & {
  id: number;
  /** "{table}/{id}": `excusesh` para las filas del histórico (ids repetidos). */
  table?: ExcuseTable;
}): Promise<Excuse | null> {
  const response = await axios.get(`${urlColegio}/${table}/${id}`, authHeaders(token));
  if (!response.data?.success || !response.data.data) return null;
  return response.data.data as Excuse;
}

export interface ExcuseMutationResult {
  ok: boolean;
  message: string;
}

/**
 * Cambio de estado directo. El llamador ya descartó los estados de
 * rechazo/cancelación — esos exigen justificación y van por el modal de
 * edición, no por acá (ver excuseJustificationError).
 */
export async function updateExcuseState({
  token,
  urlColegio,
  id,
  stateTagId,
}: AuthArgs & {
  id: number;
  stateTagId: number;
}): Promise<ExcuseMutationResult> {
  try {
    const response = await axios.patch(
      `${urlColegio}/excuses/${id}`,
      { stateTagId },
      authHeaders(token),
    );
    return {
      ok: Boolean(response.data?.success),
      message: response.data?.message ?? "",
    };
  } catch (error: any) {
    logFailure("updateExcuseState:", error);
    return { ok: false, message: readErrorMessage(error) };
  }
}

export async function patchExcuse({
  token,
  urlColegio,
  id,
  body,
}: AuthArgs & {
  id: number;
  body: Record<string, unknown>;
}): Promise<ExcuseMutationResult> {
  try {
    const response = await axios.patch(
      `${urlColegio}/excuses/${id}`,
      body,
      authHeaders(token),
    );
    return {
      ok: Boolean(response.data?.success),
      message: response.data?.message ?? "",
    };
  } catch (error: any) {
    logFailure("patchExcuse:", error);
    return { ok: false, message: readErrorMessage(error) };
  }
}

export async function deleteExcuse({
  token,
  urlColegio,
  id,
}: AuthArgs & {
  id: number;
}): Promise<ExcuseMutationResult> {
  try {
    const response = await axios.delete(
      `${urlColegio}/excuses/${id}`,
      authHeaders(token),
    );
    return {
      ok: Boolean(response.data?.success),
      message: response.data?.message ?? "",
    };
  } catch (error: any) {
    logFailure("deleteExcuse:", error);
    return { ok: false, message: readErrorMessage(error) };
  }
}

export async function createExcuse({
  token,
  urlColegio,
  payload,
}: AuthArgs & {
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; message: string; data: any }> {
  try {
    const response = await axios.post(`${urlColegio}/excuses`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    // `success` puede venir en false con HTTP 200 — el status no basta.
    return {
      ok: Boolean(response.data?.success),
      message: response.data?.message ?? "",
      data: response.data?.data ?? null,
    };
  } catch (error: any) {
    logFailure("createExcuse:", error);
    return {
      ok: false,
      message: readErrorMessage(error),
      data: error?.response?.data?.data ?? null,
    };
  }
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

/**
 * Los ids de categoría de un objeto `categoryDefaultIds` (mismo contrato que
 * CategoryDefaultIds de adminPermissionRules). readCategoryId ya normaliza
 * número/string/{value}; los nombres de acá son los del settings de la
 * escuela para excusas.
 */
export function readExcuseCategoryIds(
  categoryIds: ExcuseCategoryIds | undefined,
): { typeCategoryId: number | null; stateCategoryId: number | null } {
  return {
    typeCategoryId: readCategoryId(categoryIds?.catExcusesId) ?? null,
    stateCategoryId: readCategoryId(categoryIds?.catExcuseStatedId) ?? null,
  };
}