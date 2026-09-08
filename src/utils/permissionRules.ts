/**
 * Reglas y acceso a datos de "Mis Permisos" (webapp: /adm/mypermissions).
 *
 * Mismo criterio que punchRules.ts / adminPunchRules.ts: vive fuera de
 * `src/app/` porque todo lo que cuelga del app root de expo-router se registra
 * como ruta, y porque al no importar react-native ni expo-* se testea con jest
 * sin emulador. Las funciones de red también viven acá (axios sí es importable
 * en node), igual que fetchOpenWorkdaysAdmin/searchEmployees en
 * adminPunchRules.ts: la pantalla queda solo con estado y render.
 *
 * La pantalla lee de DOS tablas con el mismo shape:
 *   - `userdaypermissions`  → permisos vigentes ("Local")
 *   - `userdaypermissionsh` → permisos archivados ("Histórico")
 *
 * No hay endpoint unificado, así que la mezcla es client-side y cada item
 * carga de qué tabla salió: sin ese dato no se sabe a qué ruta pedirle el
 * detalle después.
 */

import axios from "axios";
import { extractTableRows } from "./adminPunchRules";

// ─── Fuentes ─────────────────────────────────────────────────────────────────

/** De qué tabla salió un permiso. Determina la ruta de su detalle. */
export type PermissionSource = "local" | "historico";

/** Ruta de cada tabla, sin barra inicial — se concatena a `urlColegio`. */
export const PERMISSION_ROUTES: Record<PermissionSource, string> = {
  local: "userdaypermissions",
  historico: "userdaypermissionsh",
};

/**
 * El único filtro de la pantalla. El webapp no tiene selectores de Estado ni
 * de Tipo acá — tiene este, con estas tres opciones y "Todos" por defecto.
 */
export type PermissionScope = "todos" | "local" | "historico";

export const PERMISSION_SCOPES: PermissionScope[] = ["todos", "local", "historico"];

export const PERMISSION_SCOPE_LABELS: Record<PermissionScope, string> = {
  todos: "Todos",
  local: "Local",
  historico: "Histórico",
};

/** Clave con la que se persiste el filtro (mismo espíritu que el localStorage
 * del webapp; acá el mecanismo establecido es src/utils/storage.ts). */
export const PERMISSION_SCOPE_STORAGE_KEY = "mypermissions.scope";

/** Valida lo que vuelve del storage antes de usarlo como estado. */
export function parsePermissionScope(raw: string | null | undefined): PermissionScope {
  return PERMISSION_SCOPES.includes(raw as PermissionScope)
    ? (raw as PermissionScope)
    : "todos";
}

/** Qué tablas participan en cada modo del filtro. */
export function sourcesForScope(scope: PermissionScope): PermissionSource[] {
  if (scope === "local") return ["local"];
  if (scope === "historico") return ["historico"];
  return ["local", "historico"];
}

// ─── Params del listado ──────────────────────────────────────────────────────

/**
 * Columnas sobre las que el motor genérico de tabla aplicaría el filtro libre
 * `all` — NO es una proyección del SELECT ni un término de búsqueda (mismo
 * mecanismo ya documentado en EMPLOYEE_SEARCH_FIELDS de adminPunchRules.ts:
 * `fields` solo alimenta el WHERE del filtro `all`, y sin `all` no filtra
 * nada; las columnas devueltas las decide el withGraphFetched del handler).
 *
 * Se manda igual porque es el `apiConfig.fields` literal de la pantalla del
 * webapp y así queda lista si algún día se agrega el buscador.
 *
 * ⚠️ NO NORMALIZAR la mezcla de puntos y dos puntos: son cosas distintas.
 * El PUNTO separa alias de columna; los DOS PUNTOS son parte del ALIAS con
 * que Objection nombra un join ANIDADO. Por eso `stateTag.name` (relación de
 * primer nivel) convive con `schoolUser:user.phone` (`user` colgando de
 * `schoolUser`). Aplanarlo a `schoolUser.user.phone` o a `schoolUser:user:phone`
 * produce el 500 de "Unknown column '...undefined'".
 *
 * Ojo: NO incluye `schoolUser:user.fullName`. El nombre del solicitante no se
 * pide en el listado y no se asume poblado — "Mis Permisos" es siempre sobre
 * uno mismo, así que la card usa el nombre del usuario logueado.
 */
export const MY_PERMISSIONS_FIELDS =
  "id,permissionDate,fromTime,toTime,groupWeekDays,stateTag.id,stateTag.name,stateTag.color,stateTag.fontColor,typeTag.name,typeTag.color,typeTag.fontColor,actionTag.name,actionTag.color,actionTag.fontColor,subject,description,schoolUser:user.phone,schoolUser:user.email,adminUser:user.fullName";

/** Filas por página, igual que el webapp. */
export const MY_PERMISSIONS_ROWS = 15;

/**
 * Los params del listado, en el orden en que viajan. Se extrae del fetch para
 * poder fijar el query string exacto en un test — el modo de fallo típico acá
 * es un param faltante, que es invisible desde la firma de la función.
 *
 * `schoolUserId` es lo que acota la lista al usuario logueado. Sale del claim
 * `schoolUsersId` del JWT (ver readSchoolUsersId), no de un .find() sobre el
 * store: es el mismo mecanismo que ya usa getStudents.ts con `parentId`.
 *
 * `orderKey: "id"` / `orderDir: "desc"` — más reciente primero. Es el orden
 * del webapp; no se reordena por permissionDate del lado del cliente.
 */
export function buildMyPermissionsParams({
  schoolUserId,
  page = 1,
  rows = MY_PERMISSIONS_ROWS,
  fields = MY_PERMISSIONS_FIELDS,
}: {
  schoolUserId: number;
  page?: number;
  rows?: number;
  fields?: string;
}): Record<string, string | number> {
  return {
    page,
    orderKey: "id",
    orderDir: "desc",
    rows,
    schoolUserId,
    fields,
  };
}

/** El query string tal cual sale al cable — el que hay que pegar al diagnosticar. */
export function buildMyPermissionsQueryString(
  params: Record<string, string | number>,
): string {
  return new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
}

/**
 * El `schoolUsersId` del JWT, o null.
 *
 * El webapp lo resuelve con un `.find()` sobre los schoolUsers del usuario y
 * sin fallback, así que puede quedar `undefined` y listar permisos ajenos.
 * Acá se lee del propio token: es el valor que el backend ya autorizó, no
 * depende del store y no puede quedar a medias.
 */
export function readSchoolUsersId(payload: Record<string, any> | null | undefined): number | null {
  const raw = payload?.schoolUsersId;
  const parsed = typeof raw === "string" ? Number(raw) : raw;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
}

// ─── Shape de un permiso ─────────────────────────────────────────────────────

/** Tag anidado — ya trae nombre y colores, no hace falta cruzar con /tags/all. */
export interface PermissionTagRef {
  id?: number;
  name?: string | null;
  color?: string | null;
  fontColor?: string | null;
}

/** schoolUser anidado (schoolUser / requestedSchoolUser / adminUser). */
export interface PermissionUserRef {
  id?: number;
  user?: {
    fullName?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  [key: string]: unknown;
}

/**
 * Un permiso, más `source`.
 *
 * Casi todo es opcional porque el LISTADO y el DETALLE no traen lo mismo: el
 * listado viene recortado por el handler (sin adjuntos, sin fechas de grupo,
 * sin createdDate) y el detalle trae el grafo completo. Un campo ausente acá
 * significa "esta vista no lo pidió", no "el permiso no lo tiene".
 */
export interface MyPermission {
  id: number;
  /** De cuál de las dos tablas salió. Interno de mobile, no viene del backend. */
  source: PermissionSource;

  subject?: string | null;
  description?: string | null;

  /** "YYYY-MM-DD", o ISO completo — siempre se lee solo la parte de fecha. */
  permissionDate?: string | null;
  /** "HH:mm". */
  fromTime?: string | null;
  toTime?: string | null;

  stateTag?: PermissionTagRef | null;
  typeTag?: PermissionTagRef | null;
  actionTag?: PermissionTagRef | null;

  /** Solo listado + detalle de permisos de grupo. */
  groupWeekDays?: string[] | null;

  /** Solo detalle. */
  groupDates?: string[] | null;
  permissionGroupId?: number | string | null;
  attachments?: string[] | null;
  createdDate?: string | null;
  reviewDate?: string | null;

  /** Dueño del permiso. El detalle puede traer uno, el otro, o los dos. */
  schoolUserId?: number | null;
  schoolUser?: PermissionUserRef | null;
  requestedSchoolUserId?: number | null;
  requestedSchoolUser?: PermissionUserRef | null;

  adminUser?: PermissionUserRef | null;

  [key: string]: unknown;
}

// ─── Quién solicita ──────────────────────────────────────────────────────────

/**
 * El solicitante que muestra el detalle. La prioridad es EXACTA y viene del
 * webapp: `requestedSchoolUser` primero y `schoolUser` como respaldo. En un
 * permiso pedido por el propio empleado los dos apuntan al mismo registro;
 * en uno cargado por un admin a nombre de otro, solo el primero es el
 * solicitante real.
 */
export function getPermissionReporter(
  permission: Pick<MyPermission, "requestedSchoolUser" | "schoolUser"> | null | undefined,
): PermissionUserRef | null {
  return permission?.requestedSchoolUser ?? permission?.schoolUser ?? null;
}

/** El id del solicitante, con la misma prioridad que getPermissionReporter y
 * cayendo a los ids planos cuando el grafo no vino expandido. */
export function getPermissionReporterId(
  permission: MyPermission | null | undefined,
): number | null {
  const raw =
    permission?.requestedSchoolUser?.id ??
    permission?.requestedSchoolUserId ??
    permission?.schoolUser?.id ??
    permission?.schoolUserId;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Guard de pertenencia del DETALLE.
 *
 * El listado ya viene acotado por el param `schoolUserId`, pero
 * `GET /userdaypermissions/{id}` no filtra por usuario: acepta cualquier id.
 * Antes de renderizar se comprueba que el permiso sea del usuario logueado, y
 * si no lo es se trata como inexistente. Un permiso sin dueño legible también
 * se rechaza: ante la duda, no se muestra.
 */
export function isOwnPermission(
  permission: MyPermission | null | undefined,
  schoolUsersId: number | null | undefined,
): boolean {
  if (!permission || schoolUsersId == null) return false;
  const owner = getPermissionReporterId(permission);
  return owner != null && owner === Number(schoolUsersId);
}

// ─── Fechas ──────────────────────────────────────────────────────────────────

/**
 * La parte de calendario de una fecha del backend:
 * "2026-08-29T00:00:00.000Z" → "2026-08-29".
 *
 * `permissionDate` es un DÍA, no un instante: convertirlo a Date para
 * mostrarlo lo correría al día anterior en cualquier runtime al este de RD
 * (el mismo bug que documenta getPendingOpenDayDate en punchRules.ts). Como
 * "YYYY-MM-DD" ya ordena lexicográficamente igual que cronológicamente, se
 * trabaja con el string y no hay zona horaria involucrada.
 */
export function permissionDateKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).trim().split("T")[0];
}

/** Rango de días de un permiso. Solo el DETALLE trae `groupDates`. */
export interface PermissionDayRange {
  /** "YYYY-MM-DD" — el primer día. "" si no hay fecha alguna. */
  from: string;
  /** "YYYY-MM-DD" — el último día. Igual a `from` si es de un solo día. */
  to: string;
  /** Días DISTINTOS cubiertos. 0 si no hay fecha alguna. */
  totalDays: number;
  /** true solo si el permiso es de grupo y abarca más de un día. */
  isRange: boolean;
}

/**
 * Rango de días de un permiso.
 *
 * Sin `permissionGroupId` el permiso es de un solo día y manda
 * `permissionDate` — aunque venga con groupDates residuales, que es lo que
 * devuelve el backend para filas viejas.
 *
 * Con `permissionGroupId` el rango sale de `groupDates`: min y max de las
 * fechas. El total cuenta días DISTINTOS y no la longitud del arreglo, porque
 * un grupo generado desde weekDays puede repetir una fecha. Si el grupo no
 * trajo fechas se cae a `permissionDate`, que siempre está.
 */
export function getPermissionDayRange(
  permission: Pick<MyPermission, "permissionDate" | "permissionGroupId" | "groupDates">,
): PermissionDayRange {
  const single = permissionDateKey(permission.permissionDate);
  const hasGroup =
    permission.permissionGroupId != null && permission.permissionGroupId !== "";

  const groupDays = hasGroup
    ? Array.from(
        new Set(
          (permission.groupDates ?? [])
            .map(permissionDateKey)
            .filter((day) => day !== ""),
        ),
      ).sort()
    : [];

  if (groupDays.length === 0) {
    return { from: single, to: single, totalDays: single ? 1 : 0, isRange: false };
  }

  const from = groupDays[0];
  const to = groupDays[groupDays.length - 1];
  return { from, to, totalDays: groupDays.length, isRange: from !== to };
}

// ─── Adjuntos ────────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic"]);

/**
 * URI absoluta de un adjunto. El backend guarda rutas relativas y las sirve
 * desde `GET /downloads/{path}`, que es público (auth:false) — el mismo patrón
 * que ya usa el resto de la app para fotos, así que la URI va directa a
 * `<Image source={{ uri }}>` sin header Authorization.
 *
 * (El blob/createObjectURL del webapp es específico del browser y no aplica
 * en React Native.)
 */
export function buildAttachmentUri(
  urlColegio: string | null | undefined,
  relativePath: string | null | undefined,
): string {
  const base = (urlColegio ?? "").replace(/\/+$/, "");
  const path = String(relativePath ?? "").replace(/^\/+/, "");
  if (!base || !path) return "";
  return `${base}/downloads/${path}`;
}

/** Último segmento de la ruta — es el único nombre que trae el backend. */
export function attachmentFileName(relativePath: string): string {
  const clean = String(relativePath ?? "").split("?")[0];
  const segments = clean.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? clean;
}

/** Si conviene mostrarlo con <Image> o abrirlo con Linking. */
export function isImageAttachment(relativePath: string): boolean {
  const name = attachmentFileName(relativePath).toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.has(name.slice(dot + 1));
}

// ─── Paginación mezclando las dos tablas ─────────────────────────────────────

/**
 * Posición de la lectura en cada tabla. Va y vuelve por el llamador (la
 * pantalla lo guarda en un ref) para que "traer la página siguiente" no
 * dependa de estado interno del módulo.
 *
 * `buffer` es la clave de la mezcla: cuando la página local se queda corta se
 * completa con histórico, y el histórico se pide siempre de a `rows` filas —
 * lo que sobra queda acá para la próxima página, en vez de re-pedirlo con un
 * offset que el backend no acepta.
 */
export interface PermissionCursor {
  localPage: number;
  localDone: boolean;
  historyPage: number;
  historyDone: boolean;
  buffer: MyPermission[];
}

export function initialPermissionCursor(): PermissionCursor {
  return {
    localPage: 1,
    localDone: false,
    historyPage: 1,
    historyDone: false,
    buffer: [],
  };
}

export interface MyPermissionsPage {
  items: MyPermission[];
  cursor: PermissionCursor;
  hasMore: boolean;
}

interface AuthArgs {
  token: string;
  urlColegio: string;
}

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

function logFailure(label: string, error: any): void {
  console.error(label, error?.response?.data?.message ?? error?.message);
}

/** Filas + total de una tabla, ya marcadas con su `source`. */
interface SourcePage {
  items: MyPermission[];
  count: number | null;
}

/**
 * Una página de UNA tabla. `extractTableRows` (de adminPunchRules.ts) absorbe
 * las tres formas de respuesta que devuelve el motor genérico de tabla según
 * el recurso — `data` como arreglo, como `{ items }` o como `{ rows }`.
 */
async function fetchSourcePage(
  source: PermissionSource,
  { token, urlColegio, schoolUserId, page, rows }: AuthArgs & {
    schoolUserId: number;
    page: number;
    rows: number;
  },
): Promise<SourcePage> {
  const response = await axios.get(
    `${urlColegio}/${PERMISSION_ROUTES[source]}`,
    {
      ...authHeaders(token),
      params: buildMyPermissionsParams({ schoolUserId, page, rows }),
    },
  );
  if (!response.data?.success) return { items: [], count: null };

  const payload = response.data.data;
  const rawCount = (payload as Record<string, unknown> | null)?.count;
  const count = typeof rawCount === "number" ? rawCount : null;

  return {
    items: extractTableRows(payload).map((raw) => ({
      ...(raw as MyPermission),
      source,
    })),
    count,
  };
}

/**
 * ¿Se agotó la tabla? Dos señales, la que dispare primero: la página vino
 * corta, o el `count` del envelope dice que ya se leyó todo. El count solo se
 * usa si vino como número — no todas las respuestas del motor de tabla lo
 * traen y asumirlo daría la lista por terminada en la primera página.
 */
function isSourceExhausted(page: SourcePage, pageNumber: number, rows: number): boolean {
  if (page.items.length < rows) return true;
  return page.count != null && pageNumber * rows >= page.count;
}

/**
 * La página siguiente del historial, según el filtro.
 *
 * En "Todos" se pide PRIMERO la tabla local y solo si faltan filas para
 * completar `rows` se completa con la histórica — calcado del webapp, y por
 * eso NO se reordena el resultado: el orden es "todo lo local, después lo
 * histórico", cada bloque en el `id desc` que devolvió el backend.
 *
 * Nunca lanza por una tabla caída: si una de las dos falla se devuelve lo que
 * haya traído la otra, y esa tabla queda marcada como agotada para no
 * reintentarla en cada scroll.
 */
export async function fetchMyPermissionsPage({
  token,
  urlColegio,
  schoolUserId,
  scope,
  cursor,
  rows = MY_PERMISSIONS_ROWS,
}: AuthArgs & {
  schoolUserId: number;
  scope: PermissionScope;
  cursor: PermissionCursor;
  rows?: number;
}): Promise<MyPermissionsPage> {
  const next: PermissionCursor = { ...cursor, buffer: [...cursor.buffer] };
  const items: MyPermission[] = [];

  // sourcesForScope es la única definición de qué tabla entra en cada modo:
  // duplicar el `scope !== ...` acá haría que un modo nuevo se agregara en un
  // solo lado.
  const sources = sourcesForScope(scope);
  const wantsLocal = sources.includes("local");
  const wantsHistory = sources.includes("historico");

  // ── 1. La tabla local manda ────────────────────────────────────────────────
  if (wantsLocal && !next.localDone) {
    try {
      const page = await fetchSourcePage("local", {
        token,
        urlColegio,
        schoolUserId,
        page: next.localPage,
        rows,
      });
      items.push(...page.items);
      next.localDone = isSourceExhausted(page, next.localPage, rows);
      next.localPage += 1;
    } catch (error: any) {
      logFailure("fetchMyPermissionsPage/local:", error);
      next.localDone = true;
    }
  }

  // ── 2. El histórico completa lo que falte ──────────────────────────────────
  if (wantsHistory) {
    while (items.length < rows) {
      if (next.buffer.length === 0) {
        if (next.historyDone) break;
        try {
          const page = await fetchSourcePage("historico", {
            token,
            urlColegio,
            schoolUserId,
            page: next.historyPage,
            rows,
          });
          next.historyDone = isSourceExhausted(page, next.historyPage, rows);
          next.historyPage += 1;
          if (page.items.length === 0) break;
          next.buffer.push(...page.items);
        } catch (error: any) {
          logFailure("fetchMyPermissionsPage/historico:", error);
          next.historyDone = true;
          break;
        }
      }
      // splice() saca del buffer justo lo que falta y deja el resto para la
      // próxima página — es lo que evita re-pedir el histórico con un offset.
      items.push(...next.buffer.splice(0, rows - items.length));
    }
  }

  const hasMore =
    (wantsLocal && !next.localDone) ||
    (wantsHistory && (!next.historyDone || next.buffer.length > 0));

  return { items, cursor: next, hasMore };
}

/**
 * El detalle de un permiso propio, o null.
 *
 * `GET {route}/{id}` sin params extra; la ruta sale del `source` que el item
 * guardó al listarse — el detalle de un archivado solo existe en
 * `userdaypermissionsh`.
 *
 * Devuelve null tanto si el backend no lo encontró como si lo devolvió pero
 * pertenece a otro usuario: la pantalla trata los dos casos igual, a propósito,
 * para no delatar la existencia de permisos ajenos.
 */
export async function fetchPermissionDetail({
  token,
  urlColegio,
  id,
  source,
  schoolUsersId,
}: AuthArgs & {
  id: number;
  source: PermissionSource;
  schoolUsersId: number;
}): Promise<MyPermission | null> {
  const response = await axios.get(
    `${urlColegio}/${PERMISSION_ROUTES[source]}/${id}`,
    authHeaders(token),
  );
  if (!response.data?.success || !response.data.data) return null;

  const detail: MyPermission = { ...(response.data.data as MyPermission), source };
  return isOwnPermission(detail, schoolUsersId) ? detail : null;
}
