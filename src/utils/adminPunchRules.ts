import axios from "axios";
import type { UserSchedule } from "../../types/typeStore/SchoolStoreType";
import {
  findOpenDayPunchForUser,
  RD_UTC_OFFSET,
  toRD,
  toRDDateString,
  type PunchEvent,
  type Tag,
} from "./punchRules";

/**
 * Reglas del "Ponche ADM" — el ponchador que un administrador usa para
 * registrar la entrada/salida de OTRO empleado (webapp: /adm/adminpunchinout).
 *
 * Mismo criterio que punchRules.ts: vive fuera de `src/app/` porque todo lo
 * que está bajo el app root de expo-router se registra como ruta, y porque al
 * no importar react-native ni expo-* las funciones puras se testean con jest
 * sin emulador.
 *
 * Las funciones de red viven aquí también (axios sí es importable en node) para
 * que la pantalla quede solo con estado y render — el mismo reparto que ya
 * usan fetchTodayPermissions/fetchOpenDayPunch en punchinout.tsx.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Las dos únicas pestañas del ponchador admin (el webapp no expone Almuerzo). */
export type AdminCategory = "Jornada" | "Break";

export const ADMIN_PUNCH_TYPE_MAP: Record<
  AdminCategory,
  { inicio: string; fin: string }
> = {
  Jornada: { inicio: "InicioJornada", fin: "FinJornada" },
  Break: { inicio: "InicioBreak", fin: "FinBreak" },
};

/**
 * Estados que el backend asigna a un intento rechazado. Un punch con uno de
 * estos NO cambia el estado de la jornada — misma lista que ya filtra
 * getNextPunchType en punchinout.tsx.
 */
export const REJECTED_PUNCH_STATUSES: ReadonlySet<string> = new Set([
  "Error de Imagen",
  "Fuera de área",
]);

/** Contadores de ponches hechos por un admin, tal cual los expone el backend. */
export interface AdminPunchCount {
  admInitJornada?: number | string | null;
  admFinJornada?: number | string | null;
  [key: string]: unknown;
}

/** `schoolUser` embebido en /punches/opendays y en /punches/admin/user/{id}. */
export interface AdminSchoolUser {
  id: number;
  code?: string | null;
  photourl?: string | null;
  s3Photo?: string | null;
  user?: {
    id?: number;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    [key: string]: unknown;
  } | null;
  role?: { id?: number; name?: string | null; [key: string]: unknown } | null;
  adminPunchCount?: AdminPunchCount | null;
  [key: string]: unknown;
}

/**
 * Fila cruda de GET /punches/opendays — es el punch real de la BD (un
 * InicioJornada sin cerrar) con su dueño y su admin embebidos.
 */
export interface AdminOpenDayPunch extends PunchEvent {
  schoolUser?: AdminSchoolUser | null;
  adminUser?: AdminSchoolUser | null;
  tag?: Tag | null;
  permission?: {
    typeTag?: Tag | null;
    stateTag?: Tag | null;
    [key: string]: unknown;
  } | null;
}

/** Fila ya normalizada para la lista "No finalizaron Jornada". */
export interface OpenWorkdayRow {
  punchId: number;
  schoolUserId: number;
  fullName: string;
  roleName: string;
  code: string | null;
  photourl: string | null;
  email: string | null;
  phone: string | null;
  createdDate: string;
  /**
   * Contadores tal cual los muestra el webapp. Solo cuentan ponches hechos
   * por un admin (admInitJornada/admFinJornada), no la jornada completa del
   * empleado — se replican igual a propósito para no divergir de la pantalla
   * que el usuario ya conoce.
   */
  entradas: number;
  salidas: number;
  tagName: string | null;
  permissionType: string | null;
  permissionState: string | null;
}

/** Empleado elegible como objetivo del ponche. */
export interface EmployeeOption {
  /** El id que POST /punches necesita en `schoolUserId` — nunca el userId. */
  schoolUserId: number;
  fullName: string;
  roleName: string;
  code: string | null;
  photourl: string | null;
  /** Datos de contacto — solo para desambiguar homónimos en el selector. */
  email: string | null;
  phone: string | null;
}

/**
 * Respuesta de GET /punches/admin/user/{id} — un solo fetch trae todo lo que
 * la pantalla del empleado seleccionado necesita pintar.
 */
export interface AdminPunchPanel {
  schoolUser: AdminSchoolUser | null;
  userSchedules: UserSchedule[];
  punchesToday: PunchEvent[];
  openDayEvents: PunchEvent[];
}

/** Qué botón mostrar en la pestaña activa. */
export interface AdminNextAction {
  category: AdminCategory;
  kind: "inicio" | "fin";
  /** El `type` exacto que va en el payload. */
  type: string;
  /** Etiqueta del botón — "Entrada" / "Salida". */
  label: string;
  /** Solo InicioBreak necesita motivo (tagId). */
  requiresTag: boolean;
}

export interface AdminPunchPayload {
  schoolUserId: number;
  type: string;
  createdDate: string;
  tagId?: number;
}

// ─── Normalización de listados ────────────────────────────────────────────────

function readCount(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function readPhoto(su: AdminSchoolUser | null | undefined): string | null {
  return su?.s3Photo ?? su?.photourl ?? null;
}

/** Un string del backend, o null si viene vacío/en blanco. */
function readText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * /punches/opendays → filas de la lista. Descarta las que no traigan
 * `schoolUser.id`: sin él no hay a quién ponchar, y una fila que no se puede
 * seleccionar solo confundiría.
 */
export function toOpenWorkdayRows(
  punches: AdminOpenDayPunch[],
): OpenWorkdayRow[] {
  const rows: OpenWorkdayRow[] = [];
  for (const punch of punches ?? []) {
    const su = punch.schoolUser;
    const schoolUserId = su?.id ?? punch.schoolUserId;
    if (typeof schoolUserId !== "number") continue;
    rows.push({
      punchId: punch.id,
      schoolUserId,
      fullName: su?.user?.fullName ?? "Sin nombre",
      roleName: su?.role?.name ?? "",
      code: su?.code ?? null,
      photourl: readPhoto(su),
      email: readText(su?.user?.email),
      phone: readText(su?.user?.phone),
      createdDate: punch.createdDate,
      entradas: readCount(su?.adminPunchCount?.admInitJornada),
      salidas: readCount(su?.adminPunchCount?.admFinJornada),
      tagName: punch.tag?.name ?? null,
      permissionType: punch.permission?.typeTag?.name ?? null,
      permissionState: punch.permission?.stateTag?.name ?? null,
    });
  }
  return rows;
}

/**
 * Aísla la jornada abierta de un empleado dentro de la lista escuela-completa
 * de /punches/opendays. Reusa findOpenDayPunchForUser (punchRules.ts) — el
 * endpoint y el criterio son los mismos que ya usa el ponchador normal.
 */
export function findOpenWorkdayForUser(
  punches: AdminOpenDayPunch[],
  schoolUserId: number,
): AdminOpenDayPunch | null {
  return findOpenDayPunchForUser(
    punches,
    schoolUserId,
  ) as AdminOpenDayPunch | null;
}

/**
 * Una fila cualquiera de GET /users → EmployeeOption. El motor genérico de
 * tabla devuelve el registro tal cual está en la BD, así que puede venir con
 * forma de `schoolUser` (trae `user` anidado) o de `user` (trae `schoolUsers`).
 * Se soportan ambas y se devuelve null cuando no se puede determinar un
 * schoolUserId — enviar el userId como schoolUserId poncharía a otra persona.
 *
 * NOTA: no se filtra por rol a propósito (decisión confirmada) — se muestra
 * todo lo que devuelva el backend.
 */
export function toEmployeeOption(raw: unknown): EmployeeOption | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, any>;

  // Forma schoolUser: { id, code, photourl, user: {...}, role: {...} }
  if (row.user && typeof row.user === "object" && typeof row.id === "number") {
    return {
      schoolUserId: row.id,
      fullName: row.user.fullName ?? "Sin nombre",
      roleName: row.role?.name ?? "",
      code: row.code ?? null,
      photourl: readPhoto(row as AdminSchoolUser),
      email: readText(row.user.email),
      phone: readText(row.user.phone),
    };
  }

  // Forma user: { id, fullName, schoolUsers: [{ id, role, ... }] }
  const su = Array.isArray(row.schoolUsers) ? row.schoolUsers[0] : null;
  if (su && typeof su.id === "number") {
    return {
      schoolUserId: su.id,
      fullName: row.fullName ?? su.user?.fullName ?? "Sin nombre",
      roleName: su.role?.name ?? "",
      code: su.code ?? null,
      photourl: readPhoto(su),
      email: readText(row.email ?? su.user?.email),
      phone: readText(row.phone ?? su.user?.phone),
    };
  }

  // Último recurso: un schoolUserId explícito en la fila.
  if (typeof row.schoolUserId === "number") {
    return {
      schoolUserId: row.schoolUserId,
      fullName: row.fullName ?? "Sin nombre",
      roleName: row.role?.name ?? "",
      code: row.code ?? null,
      photourl: row.s3Photo ?? row.photourl ?? null,
      email: readText(row.email),
      phone: readText(row.phone),
    };
  }

  return null;
}

/**
 * Segunda línea de cada resultado del selector: "Rol • email | teléfono".
 *
 * Los separadores se arman con las partes que REALMENTE existen — un usuario
 * sin email no debe quedar con un " • " colgando, que es lo que pasaría al
 * interpolar el template directo en el JSX.
 */
export function formatEmployeeContact(option: {
  roleName?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  const head = [option.roleName, option.email]
    .map((value) => readText(value))
    .filter((value): value is string => value !== null)
    .join(" • ");
  const phone = readText(option.phone);
  if (head && phone) return `${head} | ${phone}`;
  return head || phone || "";
}

/**
 * El motor de tabla no tiene una forma única de respuesta según el recurso
 * (`data` puede ser el arreglo, o `{ rows }`, o `{ data }`). Se aceptan las
 * tres en vez de asumir una y quedarse con la lista vacía en silencio.
 */
export function extractTableRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["rows", "data", "items", "results"]) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = (value as Record<string, unknown>).rows;
      if (Array.isArray(nested)) return nested;
    }
  }
  return [];
}

// ─── Payload del ponche ───────────────────────────────────────────────────────

/**
 * El payload del ponche admin. `schoolUserId` es lo ÚNICO que activa el modo
 * admin en el backend — no hay flag explícito, así que si se perdiera, el
 * ponche se registraría a nombre del administrador. Por eso está en el tipo
 * como obligatorio y hay un test que lo fija.
 *
 * `tagId` solo viaja cuando hay motivo seleccionado: mandarlo en `undefined`
 * lo dejaría como clave presente con valor null tras el JSON.stringify de
 * algunos serializadores.
 *
 * NO existe campo de texto para motivo — el backend lo ignora, así que no se
 * envía.
 */
export function buildAdminPunchPayload(input: {
  schoolUserId: number;
  type: string;
  createdDate: string;
  tagId?: number | null;
}): AdminPunchPayload {
  const payload: AdminPunchPayload = {
    schoolUserId: input.schoolUserId,
    type: input.type,
    createdDate: input.createdDate,
  };
  if (input.tagId != null) payload.tagId = input.tagId;
  return payload;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Fecha del ponche: el DÍA sale de `day` (el día de la jornada que se está
 * registrando) y la HORA del `picked` del time picker, ambos leídos en zona RD
 * — mismo criterio que handleTimeChange/handleSubmitNextDayExit en
 * punchinout.tsx, para que el string sea el que el backend ya sabe parsear.
 */
export function buildAdminCreatedDate(day: Date, picked: Date): string {
  const { hours, minutes } = toRD(picked);
  return `${toRDDateString(day)}T${pad(hours)}:${pad(minutes)}:00${RD_UTC_OFFSET}`;
}

// ─── Salvaguarda de hora futura ───────────────────────────────────────────────

export const FUTURE_TIME_MESSAGE =
  "No puedes registrar un ponche con una hora futura.";

/**
 * Guard client-side: el backend NO valida esto hoy (su chequeo está comentado
 * "temporalmente"), así que un admin podría dejar registrada una salida que
 * todavía no ocurrió. Se bloquea acá.
 *
 * Acepta el string ya construido o un Date, para poder llamarlo tanto desde el
 * time picker (antes de aceptar la selección) como justo antes del POST.
 */
export function isFutureCreatedDate(
  createdDate: string | Date,
  now: Date,
): boolean {
  const instant =
    createdDate instanceof Date ? createdDate : new Date(createdDate);
  if (Number.isNaN(instant.getTime())) return false;
  return instant.getTime() > now.getTime();
}

/** La selección del picker, recortada a "ahora" si se fue al futuro. */
export function clampPickedTimeToNow(picked: Date, now: Date): Date {
  return picked.getTime() > now.getTime() ? now : picked;
}

// ─── Estado del empleado seleccionado ─────────────────────────────────────────

function isRejected(punch: PunchEvent): boolean {
  return REJECTED_PUNCH_STATUSES.has(punch.status);
}

/** Los ponches del panel, con los intentos rechazados ya fuera. */
function acceptedPunches(panel: AdminPunchPanel | null): PunchEvent[] {
  return (panel?.punchesToday ?? []).filter((p) => !isRejected(p));
}

/** true si el empleado arrastra un InicioJornada sin cerrar de un día previo. */
export function hasOpenWorkday(panel: AdminPunchPanel | null): boolean {
  return (panel?.openDayEvents ?? []).length > 0;
}

/**
 * Qué acción toca en cada pestaña, mirando el panel de OTRO usuario — el
 * equivalente de getNextPunchType (punchinout.tsx), que solo sabe leer los
 * ponches propios.
 *
 * Diferencia real con el ponchador normal: acá SÍ hay que mirar
 * `openDayEvents`. Una jornada abierta de un día anterior no aparece en
 * `punchesToday`, así que sin ese chequeo la pantalla ofrecería "Entrada"
 * sobre una jornada ya abierta y el backend la rechazaría.
 */
export function getNextAdminAction(
  panel: AdminPunchPanel | null,
  category: AdminCategory,
): AdminNextAction {
  const types = ADMIN_PUNCH_TYPE_MAP[category];
  const punches = acceptedPunches(panel);
  const last = [...punches]
    .reverse()
    .find((p) => p.type === types.inicio || p.type === types.fin);

  let kind: "inicio" | "fin";
  if (last) {
    kind = last.type === types.inicio ? "fin" : "inicio";
  } else if (category === "Jornada" && hasOpenWorkday(panel)) {
    // Jornada abierta de un día previo: lo único posible es cerrarla.
    kind = "fin";
  } else {
    kind = "inicio";
  }

  const type = kind === "inicio" ? types.inicio : types.fin;
  return {
    category,
    kind,
    type,
    label: kind === "inicio" ? "Entrada" : "Salida",
    requiresTag: type === ADMIN_PUNCH_TYPE_MAP.Break.inicio,
  };
}

/**
 * El Break solo tiene sentido con la jornada activa — mismo bloqueo que ya
 * aplica handleRegister en punchinout.tsx ("Debes iniciar la jornada
 * primero"), pero evaluado sobre el panel del empleado objetivo.
 */
export function isAdminBreakEnabled(panel: AdminPunchPanel | null): boolean {
  if (hasOpenWorkday(panel)) return true;
  return getNextAdminAction(panel, "Jornada").kind === "fin";
}

// ─── Red ──────────────────────────────────────────────────────────────────────

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

/**
 * Los InicioJornada sin cerrar de TODA la escuela. Mismo endpoint que ya usa
 * fetchOpenDayPunch en punchinout.tsx, pero acá se consume completo (no
 * filtrado por usuario): es la lista "No finalizaron Jornada".
 *
 * Nunca lanza — un fallo deja la lista vacía en vez de tumbar la pantalla; el
 * interceptor global de axios ya se encarga de la sesión expirada.
 */
export async function fetchOpenWorkdaysAdmin({
  token,
  urlColegio,
}: AuthArgs): Promise<OpenWorkdayRow[]> {
  try {
    const response = await axios.get(
      `${urlColegio}/punches/opendays`,
      authHeaders(token),
    );
    if (!response.data?.success) return [];
    return toOpenWorkdayRows(response.data.data ?? []);
  } catch (error: any) {
    logFailure("fetchOpenWorkdaysAdmin:", error);
    return [];
  }
}

/**
 * Búsqueda de empleados por el motor genérico de tabla. `all` es el filtro
 * libre que ya usan los demás listados; sin filtrar por rol (confirmado).
 */
/**
 * Columnas sobre las que el motor de tabla aplica el filtro libre `all`.
 *
 * `all` por sí solo NO busca en nada: es el término, y `fields` es la lista de
 * columnas donde buscarlo (getTableQuery las concatena con concat_ws para el
 * LIKE). Sin `fields`, el WHERE queda vacío y no hay coincidencias.
 *
 * FORMATO — `alias.columna`, separados por coma:
 *
 *   - El separador de la lista es la COMA (methods.js:227,
 *     `fields.split(",")`).
 *   - El separador entre alias y columna es el PUNTO (methods.js:246-249,
 *     `actualKey.split(".")` → `` `temp[0]` ``.`temp[1]`).
 *   - Los DOS PUNTOS son parte del ALIAS, no un separador: Objection nombra
 *     así los joins ANIDADOS. `leftJoinRelated('attendance.schedule')` produce
 *     el alias `attendance:schedule`, que el propio backend referencia como
 *     `attendance:schedule.schoolId` (Attendance/handlers.js:16).
 *
 * `GET /users` hace `.leftJoinRelated('[user, role, tags]')`
 * (Users/handlers.js:21), o sea relaciones de PRIMER nivel: el alias es
 * `user`, sin dos puntos. Por eso va `user.fullName` y NO `user:fullName` —
 * esta última hacía que el parser tomara todo el string como alias y le
 * agregara `.undefined`, que es el 500 de "Unknown column
 * 'user:fullName.undefined'".
 *
 * `code` no lleva alias: es columna de la tabla base (`schoolusers`), y
 * getTableQuery le antepone el baseTable solo (methods.js:250-252).
 *
 * Ojo: `fields` afecta ÚNICAMENTE el WHERE del filtro `all`. No recorta el
 * SELECT — las columnas devueltas las decide el `withGraphFetched` del
 * handler, así que email/teléfono siguen viniendo.
 */
export const EMPLOYEE_SEARCH_FIELDS =
  "user.fullName,user.nickName,user.cedula,code";

/**
 * Los params de GET /users, en el orden en que viajan. Se extrae del fetch
 * para poder fijar el query string exacto en un test: el bug anterior fue
 * justamente un param faltante, invisible desde la firma de la función.
 */
export function buildEmployeeSearchParams({
  query,
  page = 1,
  rows = 10,
  fields = EMPLOYEE_SEARCH_FIELDS,
}: {
  query: string;
  page?: number;
  rows?: number;
  fields?: string;
}): Record<string, string | number> {
  return { all: query, fields, rows, page };
}

/** El query string tal cual sale al cable — el que hay que pegar al diagnosticar. */
export function buildEmployeeSearchQueryString(
  params: Record<string, string | number>,
): string {
  return new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
}

export async function searchEmployees({
  token,
  urlColegio,
  query,
  page = 1,
  rows = 10,
  fields = EMPLOYEE_SEARCH_FIELDS,
}: AuthArgs & {
  query: string;
  page?: number;
  rows?: number;
  fields?: string;
}): Promise<EmployeeOption[]> {
  const params = buildEmployeeSearchParams({ query, page, rows, fields });
  try {
    const response = await axios.get(`${urlColegio}/users`, {
      ...authHeaders(token),
      params,
    });
    console.log("SEARCH EMPLOYEES REQUEST:", {
      url: `${urlColegio}/users?${buildEmployeeSearchQueryString(params)}`,
      status: response.status,
      success: response.data?.success,
      rawData: response.data,
    });
    if (!response.data?.success) return [];
    return extractTableRows(response.data.data)
      .map(toEmployeeOption)
      .filter((option): option is EmployeeOption => option !== null);
  } catch (error: any) {
    console.error("SEARCH EMPLOYEES FAILED:", {
      url: `${urlColegio}/users?${buildEmployeeSearchQueryString(params)}`,
      status: error?.response?.status,
      body: error?.response?.data,
    });
    return [];
  }
}

/**
 * Todo el estado del empleado objetivo en un solo fetch: perfil, horarios,
 * ponches de hoy y jornadas abiertas. Los horarios salen de `userSchedules`
 * (no de schools.settings) — son los del empleado, no los de la sede.
 */
export async function fetchEmployeePunchPanel({
  token,
  urlColegio,
  schoolUserId,
}: AuthArgs & { schoolUserId: number }): Promise<AdminPunchPanel | null> {
  try {
    const response = await axios.get(
      `${urlColegio}/punches/admin/user/${schoolUserId}`,
      authHeaders(token),
    );
    if (!response.data?.success) return null;
    return normalizeAdminPanel(response.data.data);
  } catch (error: any) {
    logFailure("fetchEmployeePunchPanel:", error);
    return null;
  }
}

/** Rellena las cuatro claves del panel aunque el backend omita alguna. */
export function normalizeAdminPanel(raw: unknown): AdminPunchPanel {
  const data = (raw ?? {}) as Record<string, any>;
  return {
    schoolUser: data.schoolUser ?? null,
    userSchedules: Array.isArray(data.userSchedules) ? data.userSchedules : [],
    punchesToday: Array.isArray(data.punchesToday) ? data.punchesToday : [],
    openDayEvents: Array.isArray(data.openDayEvents) ? data.openDayEvents : [],
  };
}

/**
 * Reconocimiento facial: la foto se manda en base64 dentro de un arreglo,
 * exactamente igual que el `photourl` del ponche normal.
 *
 * Devuelve el empleado identificado, o null si el backend no reconoció a
 * nadie. Lanza solo lo que el interceptor global maneja.
 */
export async function identifyEmployeeByPhoto({
  token,
  urlColegio,
  photoBase64,
}: AuthArgs & { photoBase64: string }): Promise<EmployeeOption | null> {
  try {
    const response = await axios.post(
      `${urlColegio}/punches/admin/user/photo`,
      { photourl: [photoBase64] },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.data?.success) return null;
    const data = response.data.data;
    // Puede venir el schoolUser suelto o envuelto en { schoolUser }.
    return toEmployeeOption(data?.schoolUser ?? data);
  } catch (error: any) {
    logFailure("identifyEmployeeByPhoto:", error);
    return null;
  }
}

export interface AdminPunchResult {
  ok: boolean;
  message: string | null;
  status: string | null;
}

/**
 * Crea el ponche a nombre del empleado objetivo. El endpoint es el mismo
 * POST /punches del ponchador normal: es `schoolUserId` en el payload lo que
 * activa el modo admin.
 */
export async function createAdminPunch({
  token,
  urlColegio,
  schoolUserId,
  type,
  createdDate,
  tagId,
}: AuthArgs & {
  schoolUserId: number;
  type: string;
  createdDate: string;
  tagId?: number | null;
}): Promise<AdminPunchResult> {
  const payload = buildAdminPunchPayload({
    schoolUserId,
    type,
    createdDate,
    tagId,
  });
  try {
    const response = await axios.post(`${urlColegio}/punches`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    return {
      ok: response.data?.success === true,
      message: response.data?.message ?? null,
      status: response.data?.status ?? null,
    };
  } catch (error: any) {
    return {
      ok: false,
      message:
        error?.response?.data?.message ?? error?.message ?? "Error de conexión.",
      status: null,
    };
  }
}
