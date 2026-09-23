import axios from "axios";
import type { TeacherAttendanceToday } from "../../types/typeStore/SchoolStoreType";

/**
 * Reglas de "Asistencia Adm." (Face Class, menú id:25 `/adminattendancetaking`).
 *
 * Mismo reparto que tardinessRules.ts / adminPunchRules.ts: la lógica de red
 * y de negocio vive fuera de `src/app/` (expo-router registra como ruta
 * cualquier .ts bajo el app root) y, al no importar react-native ni expo-*,
 * las funciones puras se testean con jest sin emulador.
 *
 * Contratos del backend (face-class-api, plugins/endpoints/Attendance):
 *   - GET  /attendance/course/{courseId} → la clase del curso con
 *     `startTime <= ahora < endTime`. Fuera de esa ventana responde
 *     `{ success: false, data: { ..., attendanceFound: false } }`.
 *   - POST /attendance/{id} — `{ photos?, students?, late? }`. Si `photos`
 *     trae ≥1 elemento, `students` se ignora completo. Solo se procesan las
 *     fotos que empiezan con "data:image/" (las rutas ya guardadas se
 *     descartan en silencio y NO se pueden borrar).
 *   - GET  /attendance/teacher/{subjectId} → la clase del docente logueado
 *     (teacherId sale del token) para esa materia, con `weekday` = hoy y
 *     `startTime <= ahora < endTime`. Mismo contrato de respuesta que
 *     /attendance/course/{courseId}, incluido `attendanceFound: false`.
 *   - GET  /courses — buscador genérico de tabla (ver buildCourseSearchParams).
 *
 * TODOS los errores del módulo responden HTTP 200: se mira siempre `success`,
 * nunca el status code.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AttendanceStatus = "presente" | "ausente" | "tardanza";
export type AttendanceRecorded = "manual" | "auto" | "unrecorded";

/** Conteos que calcula el backend. `excusa` ⊂ `ausente`, `TardanzaEntrada` ⊂ `tardanza`. */
export interface AttendanceStatistics {
  presente: number;
  tardanza: number;
  ausente: number;
  excusa: number;
  total: number;
  TardanzaEntrada: number;
}

/** Foto ya guardada. `path` es relativa (`school_X/attendance/...`). */
export interface AttendancePhoto {
  path: string;
  markedAs: "presente" | "tardanza";
  studentsMarked: number;
}

export interface AttendanceStudent {
  id: number;
  schoolId?: number;
  firstName?: string | null;
  lastName?: string | null;
  photourl?: string | null;
  BirthDate?: string | null;
  code?: string | null;
  fullName: string;
  /** Solo si el backend lo agrega (addListNumbersToStudents). */
  listNumber?: number | null;
  [key: string]: unknown;
}

export interface AttendanceDetail {
  id: number;
  attendanceId: number;
  studentId: number;
  enrollmentId?: number | null;
  status: AttendanceStatus;
  recorded: AttendanceRecorded;
  recordedAt?: string | null;
  createdDate?: string | null;
  notes?: string | null;
  /** String, no booleano. */
  haveExcuse: "si" | "no";
  excuseId?: number | null;
  tardinessId?: number | null;
  hasManualEntryTime?: boolean;
  /** Ya formateado por el backend (ej. "5m"), no numérico. */
  tardinessTime?: string | null;
  student: AttendanceStudent;
  /** Relaciones completas — se tipan abiertas a propósito. */
  excuse?: Record<string, unknown> | null;
  tardiness?: Record<string, unknown> | null;
}

export interface AttendanceTeacher {
  id?: number;
  fullName?: string | null;
  /** 'manual' | 'foto' | 'manualFoto' (default 'foto' en el backend). */
  typeList?: string | null;
  [key: string]: unknown;
}

/**
 * Solo lo que la pantalla muestra de `schedule`. `schedule.school` viaja
 * completo en la respuesta del POST (token/settings del colegio) — se
 * descarta en normalizeAttendanceData y nunca se persiste ni se loguea.
 */
export interface AttendanceSchedule {
  id?: number;
  startTime?: string | null;
  endTime?: string | null;
  subject?: { id?: number; name?: string | null } | null;
  course?: { id?: number; name?: string | null; section?: string | null } | null;
  teacher?: AttendanceTeacher | null;
}

export interface AttendanceData {
  id: number;
  scheduleId: number;
  date: string;
  notes?: string | null;
  createdDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  status?: string | null;
  statistics: AttendanceStatistics;
  photos: AttendancePhoto[];
  schedule: AttendanceSchedule | null;
  attendanceDetails: AttendanceDetail[];
}

/** Curso de GET /courses (`courses.*` + `studentCount` + `schedules`). */
export interface CourseOption {
  id: number;
  name: string;
  section?: string | null;
  fullName?: string | null;
  studentCount?: number | null;
  [key: string]: unknown;
}

interface AuthArgs {
  token: string;
  urlColegio: string;
}

/**
 * `notFound` es un estado explícito (no hay clase en curso para ese curso),
 * no un error: el caller lo pinta como estado vacío con el mensaje real.
 */
export type FetchAttendanceResult =
  | { status: "found"; data: AttendanceData }
  | { status: "notFound"; message: string }
  | { status: "error"; message: string };

/**
 * El cliente NO lee `data` del POST para actualizar estado (igual que el
 * webapp): refresca con un GET nuevo. Por eso aquí no se devuelve `data`
 * (que además trae `schedule.school` completo).
 */
export type SubmitAttendanceResult =
  | { ok: true; message: string; failedPhotos: string[] }
  | { ok: false; message: string };

/** Item de `students` en el POST manual. */
export interface ManualStudentPayload {
  id: number;
  status: AttendanceStatus;
  tardinessEntryTime?: string;
}

/**
 * Fila de estado local de la Lista (Parte 2/2) — mismo mapeo que
 * `setUpFetchData` del webapp: `updated` marca lo que se envía al guardar y
 * `actionsDisabled` bloquea lo que ya estaba registrado.
 */
export interface AttendanceListRow extends AttendanceDetail {
  updated: boolean;
  actionsDisabled: boolean;
  tardinessEntryTime?: string | null;
  tardinessEntryTimeCustomized?: boolean;
}

// ─── Normalización ────────────────────────────────────────────────────────────

const EMPTY_STATISTICS: AttendanceStatistics = {
  presente: 0,
  tardanza: 0,
  ausente: 0,
  excusa: 0,
  total: 0,
  TardanzaEntrada: 0,
};

function readText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function readNumber(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

/** `photos`/`statistics` son columnas JSON: el driver las entrega parseadas,
 * pero si alguna vez llegan como string se parsean aquí. */
function parseJsonColumn(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toStatistics(raw: unknown): AttendanceStatistics {
  const parsed = parseJsonColumn(raw);
  if (!parsed || typeof parsed !== "object") return { ...EMPTY_STATISTICS };
  const obj = parsed as Record<string, unknown>;
  return {
    presente: readNumber(obj.presente),
    tardanza: readNumber(obj.tardanza),
    ausente: readNumber(obj.ausente),
    excusa: readNumber(obj.excusa),
    total: readNumber(obj.total),
    TardanzaEntrada: readNumber(obj.TardanzaEntrada),
  };
}

function toPhotos(raw: unknown): AttendancePhoto[] {
  const parsed = parseJsonColumn(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      path: typeof p.path === "string" ? p.path : "",
      markedAs: p.markedAs === "tardanza" ? "tardanza" : "presente",
      studentsMarked: readNumber(p.studentsMarked),
    }));
}

/** Extrae solo lo que se muestra de `schedule` — descarta `school` y demás. */
function toSchedule(raw: unknown): AttendanceSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, any>;
  const teacher = s.teacher && typeof s.teacher === "object" ? s.teacher : null;
  return {
    id: s.id,
    startTime: s.startTime ?? null,
    endTime: s.endTime ?? null,
    subject: s.subject ? { id: s.subject.id, name: s.subject.name ?? null } : null,
    course: s.course
      ? { id: s.course.id, name: s.course.name ?? null, section: s.course.section ?? null }
      : null,
    teacher: teacher
      ? { id: teacher.id, fullName: teacher.fullName ?? null, typeList: teacher.typeList ?? null }
      : null,
  };
}

export function normalizeAttendanceData(raw: unknown): AttendanceData | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, any>;
  if (typeof d.id !== "number") return null;
  return {
    id: d.id,
    scheduleId: d.scheduleId,
    date: d.date,
    notes: d.notes ?? null,
    createdDate: d.createdDate ?? null,
    startTime: d.startTime ?? null,
    endTime: d.endTime ?? null,
    status: d.status ?? null,
    statistics: toStatistics(d.statistics),
    photos: toPhotos(d.photos),
    schedule: toSchedule(d.schedule),
    attendanceDetails: Array.isArray(d.attendanceDetails) ? d.attendanceDetails : [],
  };
}

// ─── Reglas de UI (portadas del webapp) ──────────────────────────────────────

/**
 * `handleAttendanceValidations` de AdminAttendanceForm (face-class-web),
 * portado tal cual:
 *   - "Manual"  → cantAuto=true,  cantManual=false
 *   - "Docente" → según `typeList`: "manual" → (true, false);
 *                 "foto" → (false, true); cualquier otro → (false, false)
 *   - otro / sin configurar → (false, false)
 * OJO: en el webapp `typeList` sale de `user.teacher` (el usuario logueado),
 * no de `schedule.teacher` de la clase.
 */
export function resolveAttendanceGating(
  attendanceMode: string | null | undefined,
  typeList: string | null | undefined,
): { cantAuto: boolean; cantManual: boolean } {
  switch (attendanceMode) {
    case "Manual":
      return { cantAuto: true, cantManual: false };
    case "Docente":
      switch (typeList) {
        case "manual":
          return { cantAuto: true, cantManual: false };
        case "foto":
          return { cantAuto: false, cantManual: true };
        default:
          return { cantAuto: false, cantManual: false };
      }
    default:
      return { cantAuto: false, cantManual: false };
  }
}

/**
 * `typeList` del usuario LOGUEADO (`user.user.teacher` del store, que viene
 * de /login) — misma fuente que `get(user, "teacher.typeList")` del webapp.
 * Un admin sin ficha de docente devuelve null.
 */
export function readUserTeacherTypeList(user: unknown): string | null {
  const teacher = (user as { user?: { teacher?: { typeList?: unknown } | null } } | null)?.user
    ?.teacher;
  return typeof teacher?.typeList === "string" ? teacher.typeList : null;
}

/** `getHourLabel` del webapp: "HH:mm[:ss]" → "hh:mm AM/PM". "" si no parsea. */
export function formatHourLabel(time: string | null | undefined): string {
  const match = typeof time === "string" ? /^(\d{1,2}):(\d{2})/.exec(time.trim()) : null;
  if (!match) return "";
  const hours = Number(match[1]);
  if (hours > 23) return "";
  const suffix = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(h12).padStart(2, "0")}:${match[2]} ${suffix}`;
}

/** Mismos 4 filtros que `getStudentsByStatus` del webapp. Un ausente con
 * excusa aparece en `ausente` Y en `excusa` — no se deduplica. */
export function splitDetailsByStatus<T extends Pick<AttendanceDetail, "status" | "haveExcuse">>(
  details: T[],
): { presente: T[]; ausente: T[]; tardanza: T[]; excusa: T[] } {
  return {
    presente: details.filter((d) => d.status === "presente"),
    ausente: details.filter((d) => d.status === "ausente"),
    tardanza: details.filter((d) => d.status === "tardanza"),
    excusa: details.filter((d) => d.status === "ausente" && d.haveExcuse === "si"),
  };
}

// ─── Subtabs de la Lista (AttendanceList del webapp) ─────────────────────────

export type ListSubtab = "Todos" | "Foto" | "Verificados" | "Manual";

/** `isEmpty` de lodash para la relación `tardiness`: null/undefined/{} → vacío. */
function isEmptyRelation(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/**
 * "Manual" = PENDIENTES de marcar (no "marcados a mano": esos tienen
 * recorded 'manual' y viven en Verif.). `haveExcuse === "no"` es estricto:
 * undefined/null NO entra.
 */
export function isPendingManual(
  d: Pick<AttendanceDetail, "recorded" | "tardiness" | "haveExcuse">,
): boolean {
  return d.recorded === "unrecorded" && isEmptyRelation(d.tardiness) && d.haveExcuse === "no";
}

/** Filtros de `getFilteredStudentsByTab` del webapp. "Todos" no filtra. */
export function filterDetailsBySubtab<
  T extends Pick<AttendanceDetail, "recorded" | "tardiness" | "haveExcuse">,
>(details: T[], subtab: ListSubtab): T[] {
  switch (subtab) {
    case "Foto":
      return details.filter((d) => d.recorded === "auto");
    case "Verificados":
      return details.filter((d) => d.recorded !== "unrecorded");
    case "Manual":
      return details.filter(isPendingManual);
    default:
      return [...details];
  }
}

export interface SubtabCounts {
  todos: number;
  foto: number;
  verificados: number;
  manual: number;
}

export function countBySubtab(
  details: Pick<AttendanceDetail, "recorded" | "tardiness" | "haveExcuse">[],
): SubtabCounts {
  return {
    todos: details.length,
    foto: filterDetailsBySubtab(details, "Foto").length,
    verificados: filterDetailsBySubtab(details, "Verificados").length,
    manual: filterDetailsBySubtab(details, "Manual").length,
  };
}

/** `getTodosTabLabel`: "Todos" / "Todos(N)" / "Todos(X de N)", X = verificados. */
export function todosSubtabLabel({ todos, verificados }: SubtabCounts): string {
  if (todos <= 0) return "Todos";
  if (verificados <= 0) return `Todos(${todos})`;
  return `Todos(${verificados} de ${todos})`;
}

/** `tabsOptions` del webapp: "Foto" se oculta con cantAuto; "Verif." y
 * "Manual" con cantManual. */
export function visibleSubtabs({
  cantAuto,
  cantManual,
}: {
  cantAuto: boolean;
  cantManual: boolean;
}): ListSubtab[] {
  return [
    "Todos",
    ...(cantAuto ? [] : (["Foto"] as ListSubtab[])),
    ...(cantManual ? [] : (["Verificados", "Manual"] as ListSubtab[])),
  ];
}

/** "Reconocidos" del webapp: `studentsMarked` de cada foto unidos con " + "
 * (ej. "3 + 2"), no la suma. Vacío si no hay fotos. */
export function formatRecognizedCount(photos: AttendancePhoto[]): string {
  return photos.map((p) => p.studentsMarked).join(" + ");
}

/** Label de tab con contador: "Pre(3)", o solo "Pre" si el conteo es 0. */
export function tabLabel(base: string, count: number | null | undefined): string {
  return count ? `${base}(${count})` : base;
}

/** Mapeo de `setUpFetchData` del webapp. */
export function toListRows(details: AttendanceDetail[]): AttendanceListRow[] {
  return details.map((d) => ({
    ...d,
    updated: false,
    actionsDisabled: (d.recorded ?? false) !== "unrecorded",
  }));
}

/** `shouldSendTardinessEntryTime` del webapp (Utils/index.js). */
export function shouldSendTardinessEntryTime(row: AttendanceListRow): boolean {
  return (
    row.status === "tardanza" &&
    !!row.tardinessEntryTimeCustomized &&
    !!row.tardinessEntryTime
  );
}

/** `getUpdatedStudents` del webapp: solo las filas con `updated === true`. */
export function buildManualStudentsPayload(rows: AttendanceListRow[]): ManualStudentPayload[] {
  return rows
    .filter((row) => row.updated === true)
    .map((row) => {
      const payload: ManualStudentPayload = { id: row.student?.id, status: row.status };
      if (shouldSendTardinessEntryTime(row)) {
        payload.tardinessEntryTime = row.tardinessEntryTime as string;
      }
      return payload;
    });
}

/** Solo las fotos locales ("data:image/...") son procesables por el backend. */
export function isLocalImage(value: string): boolean {
  return value.startsWith("data:image/");
}

// ─── Clase en curso del docente (Asistencia, menú de Face Class) ─────────────

/**
 * Nombres que usa el backend en `schedule.weekday`, indexados por
 * `Date.getDay()` (0 = Domingo). Copiados tal cual del webapp
 * (`getCurrentDay` de AttendanceTaking/TeacherSchedule), tildes incluidas:
 * "Miércoles" y "Sábado" se comparan con === contra lo guardado en BD.
 */
export const SPANISH_WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

/** Meses en español, indexados por `Date.getMonth()`. */
const SPANISH_MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/**
 * `getTimeLabel(fecha, "D [de] MMMM [del] YYYY")` del webapp: "19 de
 * septiembre del 2026". Acepta un Date o el string que venga del backend
 * (`createdDate`); devuelve "" si no parsea.
 */
export function formatDayMonthYear(raw: Date | string | null | undefined): string {
  if (raw == null || raw === "") return "";
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} de ${SPANISH_MONTHS[date.getMonth()]} del ${date.getFullYear()}`;
}

/** `getCurrentDay` del webapp. */
export function currentWeekdayName(now: Date = new Date()): string {
  return SPANISH_WEEKDAYS[now.getDay()];
}

/** "HH:MM[:SS]" → minutos desde medianoche, o null si no parsea. */
function timeToMinutes(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const [hours, minutes] = raw.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * `hasAvailableClassesToday` de AttendanceTaking (webapp): filtra por
 * `schedule.weekday === día de hoy en español` y compara la ventana REAL de
 * hoy (`startTime`/`endTime` del nivel superior, NO las del schedule
 * recurrente) en minutos contra la hora actual.
 *
 * Dos diferencias deliberadas con el webapp, ninguna de comportamiento:
 *   - devuelve el item en vez de un booleano, porque la pantalla necesita
 *     además resaltar esa fila en TeacherScheduleCard;
 *   - usa `find` en vez de `some`. Con varias clases solapadas se queda con
 *     la primera, que es la más temprana: el backend ordena la lista por
 *     `schedule.startTime asc`.
 *
 * El rango es cerrado en los dos extremos (`<= endTime`), igual que el
 * webapp. OJO: el backend es más estricto en
 * GET /attendance/teacher/{subjectId} (`endTime > ahora`), así que en el
 * minuto exacto del fin la UI puede creer que hay clase y el GET responder
 * `attendanceFound: false`. Es el comportamiento actual del webapp; el caller
 * lo pinta como estado vacío con el mensaje del backend.
 */
export function hasAvailableClassesToday(
  attendancesToday: TeacherAttendanceToday[] | null | undefined,
  now: Date = new Date(),
): TeacherAttendanceToday | null {
  if (!Array.isArray(attendancesToday) || attendancesToday.length === 0) return null;
  const currentDay = currentWeekdayName(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const found = attendancesToday
    .filter((item) => item?.schedule?.weekday === currentDay)
    .find((item) => {
      const start = timeToMinutes(item?.startTime);
      const end = timeToMinutes(item?.endTime);
      if (start === null || end === null) return false;
      return currentMinutes >= start && currentMinutes <= end;
    });
  return found ?? null;
}

/**
 * `getCurrentSubject` de AttendanceForm (webapp) — port LITERAL, bugs
 * incluidos. NO es un duplicado de `hasAvailableClassesToday`: el webapp las
 * escribió por separado, en archivos distintos, y difieren en dos cosas:
 *
 *   1. NO filtra por `schedule.weekday`. Como la lista es "asistencias de
 *      hoy", en teoría da igual… salvo que el backend arma la lista por
 *      `attendance.date` y esa fila puede traer un `schedule` de otro día de
 *      la semana. Entonces esta función devuelve una clase que NO es la de
 *      hoy.
 *   2. Compara STRINGS, no minutos: `now.toTimeString().slice(0, 8)` produce
 *      siempre "HH:MM:SS", y se compara con `>=`/`<=` contra `startTime` y
 *      `endTime` tal como llegan. Si el backend devolviera "HH:MM" (8 vs 5
 *      caracteres) la comparación lexicográfica se rompe: "09:30:00" > "09:30".
 *
 * Consecuencia real: la pantalla puede decir "no tienes clases disponibles"
 * (hasAvailableClassesToday = null) y esta, para el mismo instante, devolver
 * una clase de otro día. Se replica tal cual a propósito — corregirlo aquí
 * cambiaría qué materia se le pide al backend respecto del webapp. El
 * `attendanceFound: false` del GET es lo que hoy contiene el daño.
 *
 * Devuelve el item completo; el webapp devuelve su `.schedule` y luego lee
 * `subject.id`/`subject.name`. Misma información, un nivel más arriba.
 */
export function getCurrentSubject(
  attendancesToday: TeacherAttendanceToday[] | null | undefined,
  now: Date = new Date(),
): TeacherAttendanceToday | null {
  if (!Array.isArray(attendancesToday) || attendancesToday.length === 0) return null;
  const currentTime = now.toTimeString().slice(0, 8);
  const found = attendancesToday.find((item) => {
    const startTime = item?.startTime ?? "";
    const endTime = item?.endTime ?? "";
    if (!startTime || !endTime) return false;
    return currentTime >= startTime && currentTime <= endTime;
  });
  return found ?? null;
}

// ─── Cursos ──────────────────────────────────────────────────────────────────

/** Tamaño de página del ClientSelectorModal del webapp. */
export const COURSE_PAGE_SIZE = 12;

/**
 * Mismos params que ClientSelectorModal.jsx con `showCourseSection` y el
 * apiConfig de AttendanceBasicInfo: `fields` solo viaja junto con `all`
 * (el backend lo usa solo para ese filtro) y con "fullName" agregado.
 * `activeAttendance` es string literal: el backend compara "true"/"1".
 */
export function buildCourseSearchParams({
  query,
  page = 1,
  rows = COURSE_PAGE_SIZE,
}: {
  query: string;
  page?: number;
  rows?: number;
}): Record<string, string | number> {
  const trimmed = query.trim();
  return {
    orderKey: "name",
    orderDir: "asc",
    page,
    rows,
    isActive: 1,
    activeAttendance: "1",
    ...(trimmed ? { all: trimmed, fields: "name,section,id,fullName" } : {}),
  };
}

export function toCourseOption(raw: unknown): CourseOption | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "number") return null;
  return {
    id: c.id,
    name: readText(c.name) ?? "",
    section: readText(c.section),
    fullName: readText(c.fullName),
    studentCount: typeof c.studentCount === "number" ? c.studentCount : Number(c.studentCount) || 0,
  };
}

/** Subtítulo del selector: `${section} · ${studentCount} estudiantes`. */
export function courseSubtitle(course: CourseOption): string {
  const count = course.studentCount ?? 0;
  const students = `${count} estudiante${count === 1 ? "" : "s"}`;
  return course.section ? `${course.section} · ${students}` : students;
}

// ─── Red ─────────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

function logFailure(label: string, error: any): void {
  console.error(label, error?.response?.data?.message ?? error?.message);
}

function readFailedPhotos(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const failed = (data as Record<string, unknown>).failedPhotos;
  return Array.isArray(failed) ? failed.filter((f): f is string => typeof f === "string") : [];
}

export async function fetchAdminAttendance(
  courseId: number,
  { token, urlColegio }: AuthArgs,
): Promise<FetchAttendanceResult> {
  try {
    const response = await axios.get(
      `${urlColegio}/attendance/course/${courseId}`,
      authHeaders(token),
    );
    const body = response.data;
    if (!body?.success) {
      const message = readText(body?.message) ?? "No se pudo cargar la asistencia.";
      if (body?.data?.attendanceFound === false) {
        return { status: "notFound", message };
      }
      return { status: "error", message };
    }
    const data = normalizeAttendanceData(body.data);
    if (!data) return { status: "error", message: "Respuesta de asistencia inválida." };
    return { status: "found", data };
  } catch (error: any) {
    logFailure("fetchAdminAttendance:", error);
    return {
      status: "error",
      message: readText(error?.response?.data?.message) ?? "Error de conexión.",
    };
  }
}

/**
 * Paralelo exacto de `fetchAdminAttendance`, contra el endpoint del docente:
 * el backend resuelve el `teacherId` desde el token, así que solo viaja la
 * materia. Mismo contrato de respuesta (incluido `attendanceFound: false`
 * cuando no hay clase en curso), mismo normalizado.
 */
export async function fetchTeacherAttendance(
  subjectId: number,
  { token, urlColegio }: AuthArgs,
): Promise<FetchAttendanceResult> {
  try {
    const response = await axios.get(
      `${urlColegio}/attendance/teacher/${subjectId}`,
      authHeaders(token),
    );
    const body = response.data;
    if (!body?.success) {
      const message = readText(body?.message) ?? "No se pudo cargar la asistencia.";
      if (body?.data?.attendanceFound === false) {
        return { status: "notFound", message };
      }
      return { status: "error", message };
    }
    const data = normalizeAttendanceData(body.data);
    if (!data) return { status: "error", message: "Respuesta de asistencia inválida." };
    return { status: "found", data };
  } catch (error: any) {
    logFailure("fetchTeacherAttendance:", error);
    return {
      status: "error",
      message: readText(error?.response?.data?.message) ?? "Error de conexión.",
    };
  }
}

async function postAttendance(
  attendanceId: number,
  body: Record<string, unknown>,
  { token, urlColegio }: AuthArgs,
): Promise<SubmitAttendanceResult> {
  try {
    const response = await axios.post(`${urlColegio}/attendance/${attendanceId}`, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const res = response.data;
    if (!res?.success) {
      return {
        ok: false,
        message: readText(res?.message) ?? "No se pudo guardar la asistencia.",
      };
    }
    return {
      ok: true,
      message: readText(res?.message) ?? "Asistencia guardada.",
      failedPhotos: readFailedPhotos(res?.data),
    };
  } catch (error: any) {
    logFailure("postAttendance:", error);
    return {
      ok: false,
      message: readText(error?.response?.data?.message) ?? "Error de conexión.",
    };
  }
}

/**
 * Solo fotos NUEVAS (data URI). Las ya guardadas no se reenvían: el backend
 * las descarta y no se pueden borrar.
 */
export function submitAttendancePhotos(
  { attendanceId, photos, late }: { attendanceId: number; photos: string[]; late: boolean },
  auth: AuthArgs,
): Promise<SubmitAttendanceResult> {
  return postAttendance(attendanceId, { photos: photos.filter(isLocalImage), late }, auth);
}

/**
 * Se envía SIEMPRE, aunque `students` venga vacío — el webapp nunca previene
 * el POST (su `isEmpty(bodyRequest)` es código muerto). Con lista vacía el
 * backend responde success:false "No hay informacion nueva para actualizar
 * la asistencia", que el caller muestra tal cual.
 */
export function submitAttendanceManual(
  { attendanceId, students }: { attendanceId: number; students: ManualStudentPayload[] },
  auth: AuthArgs,
): Promise<SubmitAttendanceResult> {
  return postAttendance(attendanceId, { students }, auth);
}
