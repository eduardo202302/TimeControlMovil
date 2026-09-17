import axios from "axios";

/**
 * Reglas de "Tardanzas" (Face Class) — la pantalla del móvil que registra la
 * entrada tardía de un estudiante.
 *
 * Mismo reparto que adminPunchRules.ts: la lógica de negocio y de red vive
 * fuera de `src/app/` (expo-router registra como ruta cualquier .ts bajo el
 * app root) y, al no importar react-native ni expo-*, las funciones puras se
 * testean con jest sin emulador.
 *
 * Contratos del backend (face-class-api, plugins/endpoints/StudentTardiness):
 *   - POST /tardiness/student/face — { photo: [base64] } → { recognitionData,
 *     student } (identifica, NO crea la tardanza).
 *   - GET  /tardiness/student/{id}  → { student } con `tardiness` (activas).
 *   - POST /tardiness              — { studentId, date: "YYYY-MM-DD HH:mm:ss",
 *     time?: "HH:mm" } → la tardanza creada.
 *   - GET  /tardiness/{id}         → una tardanza + su grupo (modo reporte).
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Curso de una matrícula (`course` es ManyToMany en Students). */
export interface StudentCourse {
  fullName?: string | null;
  listNumber?: number | null;
  [key: string]: unknown;
}

/** Contacto/representante del estudiante — `parents` viene directo del backend. */
export interface StudentParent {
  fullName?: string | null;
  parentRelationship?: string | null;
  phone?: string | null;
  [key: string]: unknown;
}

/** Fila normalizada de GET /students (buscador, paralelo a EmployeeOption). */
export interface StudentOption {
  id: number;
  fullName: string;
  code: string | null;
  photourl: string | null;
  course?: StudentCourse[];
  parents: StudentParent[];
}

/** Una tardanza activa tal cual la envuelve el backend en `student.tardiness`. */
export interface StudentTardiness {
  id?: number;
  date?: string | null;
  time?: string | null;
  tardinessTime?: string | null;
  isNew?: boolean;
  [key: string]: unknown;
}

/** Estudiante con su historial de tardanzas activas (los dos endpoints student). */
export interface StudentDetail extends StudentOption {
  tardiness: StudentTardiness[];
  tardinessCount: number;
}

export interface FaceRecognitionData {
  studentId: number;
  similarity: number;
  faceId: string;
  [key: string]: unknown;
}

export interface StudentFaceIdentification {
  recognitionData?: FaceRecognitionData | null;
  student: StudentDetail;
}

/** Resultado de identifyStudentByFace — los errores reales del backend se
 * exponen como mensaje para mostrarlos tal cual ("La imagen es requerida",
 * "No se reconoció ningún estudiante en la imagen", etc.). */
export type IdentifyStudentResult =
  | { ok: true; data: StudentFaceIdentification }
  | { ok: false; message: string };

// ─── Normalización ────────────────────────────────────────────────────────────

function readText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Foto de perfil con respaldo a s3Photo — mismo orden que adminPunchRules. */
function readPhoto(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const photo = row.photourl ?? row.s3Photo;
  return readText(photo);
}

function toCourse(raw: unknown): StudentCourse {
  if (!raw || typeof raw !== "object") return {};
  const row = raw as Record<string, unknown>;
  return {
    fullName: readText(row.fullName),
    listNumber: typeof row.listNumber === "number" ? row.listNumber : null,
  };
}

/** `course` puede venir como arreglo (matrículas) o como objeto suelto. */
function normalizeCourse(raw: unknown): StudentCourse[] {
  if (Array.isArray(raw)) return raw.map(toCourse);
  if (raw && typeof raw === "object") return [toCourse(raw)];
  return [];
}

/** Un contacto puede mandar nombre/relación/teléfono con nombres alternos. */
function toParent(raw: unknown): StudentParent {
  if (!raw || typeof raw !== "object") return {};
  const row = raw as Record<string, unknown>;
  return {
    fullName: readText(row.fullName) ?? readText(row.name) ?? null,
    parentRelationship:
      readText(row.parentRelationship) ?? readText(row.relationship) ?? null,
    phone: readText(row.phone) ?? readText(row.telephone) ?? null,
  };
}

function normalizeParents(raw: unknown): StudentParent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(toParent);
}

/**
 * Row de GET /students (motor genérico de tabla) → StudentOption. Refleja el
 * `withGraphFetched('course')` del handler: `course` llega como arreglo.
 * Sin `id` numérico no hay a quién registrar la tardanza — null.
 */
export function toStudentOption(raw: unknown): StudentOption | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, any>;
  if (typeof row.id !== "number") return null;
  return {
    id: row.id,
    fullName: readText(row.fullName) ?? "Sin nombre",
    code: readText(row.code),
    photourl: readPhoto(row),
    course: normalizeCourse(row.course),
    parents: normalizeParents(row.parents),
  };
}

/**
 * `student` de GET /tardiness/student/{id} y POST /tardiness/student/face →
 * StudentDetail. `tardinessCount` puede venir o no; si no viene se deriva de
 * la lista.
 */
export function toStudentDetail(raw: unknown): StudentDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, any>;
  if (typeof row.id !== "number") return null;
  const tardiness: StudentTardiness[] = Array.isArray(row.tardiness)
    ? row.tardiness
    : [];
  const tardinessCount =
    typeof row.tardinessCount === "number" ? row.tardinessCount : tardiness.length;
  return {
    id: row.id,
    fullName: readText(row.fullName) ?? "Sin nombre",
    code: readText(row.code),
    photourl: readPhoto(row),
    course: normalizeCourse(row.course),
    parents: normalizeParents(row.parents),
    tardiness,
    tardinessCount,
  };
}

/** El motor de tabla responde como arreglo directo o envuelto en una clave. */
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

// ─── Semáforo (replica exacta de TrafficLight del webapp) ─────────────────────

/** Hex de cada estado del semáforo — misma paleta que el semáforo del webapp. */
export const TARDINESS_LIGHT_HEX: Record<string, string> = {
  blue: "#2563EB",
  green: "#16A34A",
  yellow: "#EAB308",
  red: "#DC2626",
};

/**
 * Orden de colores del semáforo. Hardcodeado contra 4 (NO contra el default):
 * el webapp compara `daysLateAbsence === 4` para pasar de 3 a 4 luces — si el
 * colegio no lo configura, la UI trabaja con 3 (default de lectura del webapp)
 * y el backend decide su propio default (4) al guardar. Se replican ambos tal
 * cual, sin duplicar el default del backend en el cliente.
 */
export function tardinessLightOrder(daysLateAbsence: number): string[] {
  return daysLateAbsence === 4
    ? ["blue", "green", "yellow", "red"]
    : ["green", "yellow", "red"];
}

/** Color de la tardanza N (0-indexada). Los registros que sobran del orden
 * quedan en el último color (rojo) — sin ciclo, sin separador. */
export function tardinessColorAt(index: number, daysLateAbsence: number): string {
  const order = tardinessLightOrder(daysLateAbsence);
  return TARDINESS_LIGHT_HEX[order[index] ?? "red"];
}

// ─── Payload del ponche ───────────────────────────────────────────────────────

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * "YYYY-MM-DD HH:mm:ss" — replica el armado de `dateTime` del webapp
 * (TardinessCrud/handlerSaved): year-month-day hours:minutes:seconds con
 * padStart(2,"0") en cada parte, hora local del dispositivo.
 */
export function buildTardinessDateTime(date: Date): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  );
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
 * Columnas del filtro libre `all` del buscador de estudiantes — mismo criterio
 * que la config `apiConfig.fields` del webapp (StudentsSelector).
 */
export const STUDENT_SEARCH_FIELDS =
  "fullName,code,id,course.fullName";

export function buildStudentSearchParams({
  query,
  page = 1,
  rows = 10,
}: {
  query: string;
  page?: number;
  rows?: number;
}): Record<string, string | number> {
  return {
    all: query,
    fields: STUDENT_SEARCH_FIELDS,
    rows,
    page,
    orderKey: "fullName",
  };
}

/**
 * Búsqueda por el motor genérico de tabla. Nunca lanza — un fallo deja la
 * lista vacía (mismo patrón que searchEmployees en adminPunchRules.ts).
 */
export async function searchStudents(
  query: string,
  { token, urlColegio }: AuthArgs,
  page = 1,
  rows = 10,
): Promise<StudentOption[]> {
  const params = buildStudentSearchParams({ query, page, rows });
  try {
    const response = await axios.get(`${urlColegio}/students`, {
      ...authHeaders(token),
      params,
    });
    if (!response.data?.success) return [];
    return extractTableRows(response.data.data)
      .map(toStudentOption)
      .filter((option): option is StudentOption => option !== null);
  } catch (error: any) {
    logFailure("searchStudents:", error);
    return [];
  }
}

/**
 * Reconocimiento facial: la foto se manda en base64 dentro de un arreglo, tal
 * cual lo espera el handler de face-class-api. NO crea la tardanza — solo
 * identifica. Devuelve el estudiante completo (con sus tardanzas activas) o el
 * mensaje de error REAL del backend para mostrarlo tal cual.
 */
export async function identifyStudentByFace(
  photoBase64: string,
  { token, urlColegio }: AuthArgs,
): Promise<IdentifyStudentResult> {
  try {
    const response = await axios.post(
      `${urlColegio}/tardiness/student/face`,
      { photo: [photoBase64] },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.data?.success) {
      return {
        ok: false,
        message:
          readText(response.data?.message) ??
          "No se pudo identificar al estudiante.",
      };
    }
    const data = response.data?.data;
    const student = toStudentDetail(data?.student);
    if (!student) {
      return {
        ok: false,
        message:
          readText(response.data?.message) ??
          "No se pudo identificar al estudiante.",
      };
    }
    return {
      ok: true,
      data: {
        recognitionData: data?.recognitionData ?? null,
        student,
      },
    };
  } catch (error: any) {
    const fallback =
      readText(error?.response?.data?.message) ?? "Error de conexión.";
    return { ok: false, message: fallback ?? "Error de conexión." };
  }
}

/**
 * Mismo shape de `student` que face, pero para el flujo manual (búsqueda por
 * texto): devuelve el estudiante con sus tardanzas activas o null.
 */
export async function getStudentTardiness(
  studentId: number,
  { token, urlColegio }: AuthArgs,
): Promise<StudentDetail | null> {
  try {
    const response = await axios.get(
      `${urlColegio}/tardiness/student/${studentId}`,
      authHeaders(token),
    );
    if (!response.data?.success) return null;
    return toStudentDetail(response.data?.data?.student);
  } catch (error: any) {
    logFailure("getStudentTardiness:", error);
    return null;
  }
}

/** Resultado de createTardiness. */
export interface CreateTardinessResult {
  ok: boolean;
  message: string | null;
}

/**
 * Crea la tardanza. `date` SIEMPRE se manda con la hora actual del dispositivo
 * (formato exacto del webapp). `time` SOLO viaja en modo Manual con hora
 * escrita — mismo condicional que handlerSaved: `tardinessMode === "Manual"`.
 */
export async function createTardiness(
  {
    studentId,
    tardinessMode,
    time,
  }: {
    studentId: number;
    tardinessMode: string;
    time?: string;
  },
  { token, urlColegio }: AuthArgs,
): Promise<CreateTardinessResult> {
  const body: Record<string, unknown> = {
    studentId,
    date: buildTardinessDateTime(new Date()),
  };
  if (tardinessMode === "Manual" && time) {
    body.time = time;
  }
  try {
    const response = await axios.post(
      `${urlColegio}/tardiness`,
      body,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
    );
    return {
      ok: response.data?.success === true,
      message: readText(response.data?.message),
    };
  } catch (error: any) {
    logFailure("createTardiness:", error);
    return {
      ok: false,
      // El backend puede rechazar con mensaje real (p. ej. entryTime) — se
      // propaga tal cual. Sin response body es un error técnico: genérico.
      message:
        readText(error?.response?.data?.message) ?? "Error de conexión.",
    };
  }
}

/**
 * GET /tardiness/{id} — una tardanza con su grupo (modo reporte). Se deja
 * suelto (unknown) porque la UI de reporte es opcional y no consume el shape
 * completo todavía.
 */
export async function getTardinessReport(
  id: number,
  { token, urlColegio }: AuthArgs,
): Promise<unknown | null> {
  try {
    const response = await axios.get(
      `${urlColegio}/tardiness/${id}`,
      authHeaders(token),
    );
    if (!response.data?.success) return null;
    return response.data?.data ?? null;
  } catch (error: any) {
    logFailure("getTardinessReport:", error);
    return null;
  }
}