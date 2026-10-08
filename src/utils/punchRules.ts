import type {
  TodayHoliday,
  UserSchedule,
} from "../../types/typeStore/SchoolStoreType";
import { buildAttachmentUri } from "./permissionRules";

/**
 * Reglas puras del ponchador: horas en zona RD, permisos del día y
 * visibilidad de los botones de Jornada/Almuerzo.
 *
 * Vive fuera de `src/app/` a propósito: todo lo que está bajo el app root de
 * expo-router se registra como ruta y se empaqueta en el bundle. Además, al no
 * importar react-native ni expo-*, estas funciones se pueden testear con jest
 * sin emulador ni mocks.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Tag {
  id: number;
  name: string;
  category?: { id?: number; name?: string } | null;
  /** Texto genérico del tag (mismo campo que expone /tags/all) */
  description?: string | null;
}

export interface PunchEvent {
  id: number;
  type: string;
  status: string;
  createdDate: string;
  lateEntry?: boolean;
  earlyExit?: boolean;
  overtime?: number | string;
  toleranceMinutes?: number | null;
  permissionId?: number | null;
  hasOpenDay?: boolean | string;
  openDayDate?: string;
  date?: string;
  /**
   * Confirmado contra respuestas reales de POST /punches (mismo recurso
   * "punch" que devuelve GET /punches/opendays): todo punch trae su dueño.
   */
  schoolUserId?: number;
  tagId?: number;
  tag?: {
    id: number;
    name: string;
    categoryId: number;
    category?: { id: number; name: string };
  };
  /**
   * Foto tomada al ponchar. El backend la guarda como ruta relativa servida
   * por `/downloads/`, pero puede llegar ya absoluta (http/data:) o como array.
   */
  photourl?: string | string[] | null;
}

/**
 * Permiso del día devuelto por GET /userdaypermissions/today/{schoolUserId}.
 * Los tags vienen anidados con su nombre — no hace falta cruzar con /tags/all.
 */
export interface UserDayPermission {
  id: number;
  schoolId: number;
  schoolUserId: number;
  permissionDate: string;
  /** "HH:mm:ss", relativo al día de hoy */
  fromTime: string;
  /** "HH:mm:ss", relativo al día de hoy */
  toTime: string;
  stateTagId: number;
  typeTagId: number;
  actionTagId: number;
  typeTag?: Tag | null;
  stateTag?: Tag | null;
  actionTag?: Tag | null;
  [key: string]: unknown;
}

/** Acciones de permiso — se comparan siempre normalizadas (trim + lowercase) */
export const PERMISSION_ACTION = {
  AUSENCIA: "Ausencia",
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  ALMUERZO: "Almuerzo",
  FUERA_DE_HORARIO: "Fuera de Horario",
  HORAS_EXTRAS: "Horas Extras",
} as const;

export const PERMISSION_STATE_APPROVED = "aprobado";

// ─── Tiempo en zona RD (UTC-4 fijo, sin horario de verano) ────────────────────

export function toRD(date: Date) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const rd = new Date(utc - 4 * 60 * 60 * 1000);

  return {
    year: rd.getFullYear(),
    month: rd.getMonth(),
    day: rd.getDate(),
    hours: rd.getHours(),
    minutes: rd.getMinutes(),
    seconds: rd.getSeconds(),
    weekDay: rd.getDay(),
  };
}

/** Minutos desde medianoche  */
export function getRDMinutes(date: Date): number {
  const { hours, minutes } = toRD(date);
  return hours * 60 + minutes;
}

/** Día de la semana en RD */
export function getRDDayIndex(date: Date): number {
  return toRD(date).weekDay;
}

/** Offset fijo de RD (UTC-4, sin horario de verano) al serializar un ponche */
export const RD_UTC_OFFSET = "-04:00";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HAS_TZ_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parsea una fecha del backend al instante correcto, según lo que traiga:
 * - "2026-08-29"               → día de calendario RD. Se ancla al mediodía RD
 *                                porque `new Date("2026-08-29")` sería medianoche
 *                                UTC, que en RD ya es el día anterior a las 20:00.
 * - "2026-08-29T14:51:16.716Z" → instante UTC explícito, se respeta tal cual.
 * - "2026-08-29T10:51:16"      → sin zona: el backend habla en hora RD.
 */
function parseBackendDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = DATE_ONLY_RE.test(s)
    ? `${s}T12:00:00${RD_UTC_OFFSET}`
    : HAS_TZ_RE.test(s)
      ? s
      : `${s}${RD_UTC_OFFSET}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "yyyy-mm-dd" del día en RD — el formato de fecha que espera el backend */
export function toRDDateString(date: Date): string {
  const { year, month, day } = toRD(date);
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** El InicioJornada abierto sin cerrar, o null si la lista no trae ninguno */
export function findOpenDayPunch(punches: PunchEvent[]): PunchEvent | null {
  return (
    punches.find(
      (p) => p.hasOpenDay === true || (p.hasOpenDay as unknown) === "true",
    ) ?? null
  );
}

/**
 * Fecha real de la jornada abierta que cierra el modal "Jornada Incompleta".
 *
 * ÚNICA fuente para sus tres consumos: el texto del modal, la hora sugerida y
 * la fecha del payload de cierre. Antes cada uno la derivaba por su cuenta y
 * con parseos distintos (uno normalizaba a RD, otro cortaba el string crudo en
 * la "T"), y sin punch los tres adivinaban "hoy - 1 día" — el 24-ago eso mandó
 * domingo 23 para una jornada abierta el sábado 22 y el backend la rechazó con
 * "La fecha debe coincidir con el día del InicioJornada que se está cerrando".
 *
 * Devuelve null cuando no hay punch del cual leerla: la fecha NO se adivina.
 */
export function getPendingOpenDayDate(punch: PunchEvent | null): Date | null {
  const raw = punch?.openDayDate ?? punch?.createdDate ?? punch?.date;
  return raw ? parseBackendDate(String(raw)) : null;
}

/**
 * Aísla el InicioJornada abierto de un usuario dentro de la lista
 * escuela-completa que devuelve GET /punches/opendays (no filtra por usuario
 * en el backend). Se usa como respaldo cuando /punches/today no trae el
 * punch pendiente — típicamente cuando el modal "Jornada Incompleta" lo abre
 * el RECHAZO del backend ("...ya tiene un inicio de jornada activo"), en vez
 * del hasOpenDay de /punches/today.
 *
 * Cada objeto de /opendays es el punch real de la BD: no trae los campos
 * sintéticos hasOpenDay/openDayDate que sí expone /punches/today — por eso
 * findOpenDayPunch (que filtra por hasOpenDay) no sirve aquí. getPendingOpenDayDate
 * ya cae a createdDate cuando openDayDate no existe, así que no hace falta
 * ningún parseo nuevo: createdDate de un InicioJornada de /opendays YA ES la
 * fecha real que hay que enviar de vuelta al cerrar.
 *
 * Si el usuario tuviera más de un InicioJornada abierto (no debería pasar —
 * el backend ya rechaza un segundo InicioJornada mientras el primero sigue
 * abierto — pero el endpoint es de toda la escuela, no filtrado), se queda
 * con el más reciente.
 */
export function findOpenDayPunchForUser(
  punches: PunchEvent[],
  schoolUserId: number,
): PunchEvent | null {
  const mine = punches.filter(
    (p) => p.type === "InicioJornada" && p.schoolUserId === schoolUserId,
  );
  if (mine.length === 0) return null;
  return mine.reduce((latest, p) => {
    const pTime = getPendingOpenDayDate(p)?.getTime() ?? -Infinity;
    const latestTime = getPendingOpenDayDate(latest)?.getTime() ?? -Infinity;
    return pTime > latestTime ? p : latest;
  });
}

export const WEEK_DAYS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

export interface ToleranceConfig {
  workIn: number;
  workOut: number;
  lunchIn: number;
  lunchOut: number;
}

export type PunctualityStatus = "Tardanza" | "Anticipada" | "A Tiempo";

export function getScheduleForDay(
  schedules: UserSchedule[],
  date: Date,
): UserSchedule | null {
  const dayName = WEEK_DAYS[getRDDayIndex(date)];
  return schedules.find((s) => s.weekDay === dayName) ?? null;
}

/**
 * Calcula la puntualidad del ponche comparando la hora registrada (en RD)
 * contra el horario del día correspondiente. Devuelve null cuando no hay
 * horario aplicable (ej. Break, días sin schedule) para dejar que la UI
 * use el estado que devuelva el backend.
 */
export function getPunctuality(
  punch: PunchEvent,
  schedules: UserSchedule[],
  defaults: ToleranceConfig,
): PunctualityStatus | null {
  const punchDate = new Date(punch.createdDate);
  const schedule = getScheduleForDay(schedules, punchDate);
  if (!schedule) return null;

  const punchMinutes = getRDMinutes(punchDate);

  switch (punch.type) {
    case "InicioJornada": {
      // Ponche cubierto por un permiso: el backend ya resolvió el estado
      // teniendo el permiso en cuenta — no recalcular localmente.
      if (punch.permissionId != null) return null;
      const entryTime = timeStrToMinutes(schedule.workEntryTime);
      const tolerance = schedule.toleranceWorkTimeIn ?? defaults.workIn;
      if (punchMinutes > entryTime + tolerance) return "Tardanza";
      if (punchMinutes < entryTime - tolerance) return "Anticipada";
      return "A Tiempo";
    }
    case "FinJornada": {
      // Ponche cubierto por un permiso: el backend ya resolvió el estado
      // teniendo el permiso en cuenta — no recalcular localmente.
      if (punch.permissionId != null) return null;
      return punchMinutes <
        timeStrToMinutes(schedule.workExitTime) -
          (schedule.toleranceWorkTimeOut ?? defaults.workOut)
        ? "Anticipada"
        : "A Tiempo";
    }
    case "InicioAlmuerzo":
      if (!schedule.lunchEntryTime) return null;
      return punchMinutes >
        timeStrToMinutes(schedule.lunchEntryTime) +
          (schedule.toleranceLunchTimeIn ?? defaults.lunchIn)
        ? "Tardanza"
        : "A Tiempo";
    case "FinAlmuerzo":
      if (!schedule.lunchExitTime) return null;
      return punchMinutes >
        timeStrToMinutes(schedule.lunchExitTime) +
          (schedule.toleranceLunchTimeOut ?? defaults.lunchOut)
        ? "Tardanza"
        : "A Tiempo";
    default:
      return null;
  }
}

/**
 * Minutos de tardanza de un inicio de jornada, para mostrarlos junto al chip
 * "Tardanza" del historial. Propio del móvil (no existe en el webapp ni en el
 * backend). Se cuenta desde la hora de entrada del horario, NO desde el fin
 * de la tolerancia: la tolerancia solo decide SI hubo tardanza.
 *
 * null cuando no aplica: otro tipo de ponche, día sin horario, ponche
 * cubierto por un permiso, o getPunctuality no da "Tardanza".
 */
export function getLateMinutes(
  punch: PunchEvent,
  schedules: UserSchedule[],
  defaults: ToleranceConfig,
): number | null {
  if (punch.type !== "InicioJornada") return null;
  if (punch.permissionId != null) return null;
  const punchDate = new Date(punch.createdDate);
  const schedule = getScheduleForDay(schedules, punchDate);
  if (!schedule) return null;
  if (getPunctuality(punch, schedules, defaults) !== "Tardanza") return null;
  return getRDMinutes(punchDate) - timeStrToMinutes(schedule.workEntryTime);
}

/** "7 min", "1 h", "1 h 15 min". */
export function formatLateDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function timeStrToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

// ─── Presentación ─────────────────────────────────────────────────────────────

/**
 * Color del estado de un ponche. Compartida por el ponchador normal
 * (punchinout.tsx) y el Ponche ADM (adminpunchinout.tsx) para que el mismo
 * estado no se pinte distinto en cada pantalla.
 *
 * Rojo para lo que salió mal (tardanza, imagen rechazada, fuera del área),
 * ámbar para lo que se salió del horario esperado sin ser un error
 * (anticipada, fuera de horario), verde para todo lo demás — incluido el
 * status vacío, que es el caso de un ponche sin evaluar.
 */
export function getStatusColor(status: string | null | undefined): string {
  if (status === "Tardanza") return "#DC2626";
  if (status === "Anticipada") return "#D97706";
  if (status === "Fuera de Horario") return "#D97706";
  if (status === "Error de Imagen") return "#DC2626";
  if (status === "Fuera de área") return "#DC2626";
  return "#16A34A";
}

/**
 * Nombre del motivo de break a mostrar en el pill del historial (Ponche ADM).
 * `undefined` cuando el punch no trae `tag` — Jornada/Almuerzo sin motivo no
 * deben renderizar un pill vacío.
 */
export function getPunchBreakTagName(
  punch: Pick<PunchEvent, "tag">,
): string | undefined {
  return punch.tag?.name;
}

/**
 * URL de la foto del ponche para el ícono "Ver imagen" del historial —
 * calcado de Components/Timeline del webapp. null cuando no hay foto (o no se
 * puede armar la URL), y entonces no se muestra el ícono.
 *
 * Si `photourl` es un array se usa el primer elemento. Una URL ya absoluta
 * (http/https o data:) se usa tal cual; una ruta relativa se arma contra
 * `/downloads/` con el mismo helper de los adjuntos de permisos.
 */
export function getPunchPhotoUrl(
  punch: Pick<PunchEvent, "photourl">,
  baseUrl: string | null | undefined,
): string | null {
  const raw = Array.isArray(punch.photourl)
    ? punch.photourl[0]
    : punch.photourl;
  const photo = typeof raw === "string" ? raw.trim() : "";
  if (!photo) return null;
  if (/^(https?:|data:)/i.test(photo)) return photo;
  return buildAttachmentUri(baseUrl, photo) || null;
}

// ─── Tags y categorías de la escuela ─────────────────────────────────────────

/**
 * Normaliza un id de `school.settings.categoryDefaultIds`. El backend lo
 * guarda como `{ label, value }` (Schools/handlers.js:1562-1567), pero se
 * aceptan también el número suelto y el string por si alguna escuela quedó con
 * la forma vieja — la comparación contra `tag.categoryId`, que es un número
 * plano, no debe depender de eso.
 */
export function readCategoryDefaultId(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (raw && typeof raw === "object" && "value" in raw) {
    return readCategoryDefaultId((raw as { value: unknown }).value);
  }
  return undefined;
}

/**
 * Categoría de los "Motivos del break", leída de la configuración de la
 * escuela: `settings.categoryDefaultIds.catBreakTypeId.value`.
 *
 * Es la MISMA fuente que usa el backend para su propio listado de break tags
 * (Tags/handlers.js:183), y es por escuela — por eso no se hardcodea.
 *
 * El nombre "Tipos de Break" que se usaba antes es solo el `label` con el que
 * se siembra esa entrada (Schools/handlers.js:1002-1004): coincidía por
 * casualidad y se rompe apenas una escuela renombra su categoría.
 *
 * Sin fallback a `catPermTypeId` a propósito: los tipos de permiso son otra
 * categoría distinta y mezclarlas ofrecería motivos que no son de break.
 * Si no está configurada, el picker queda vacío — igual que el backend, que
 * responde "La categoria no está configurada" (Tags/handlers.js:185-189).
 */
export function getBreakTagCategoryId(settings: unknown): number | undefined {
  if (!settings || typeof settings !== "object") return undefined;
  const defaults = (settings as Record<string, any>).categoryDefaultIds;
  if (!defaults || typeof defaults !== "object") return undefined;
  return readCategoryDefaultId(defaults.catBreakTypeId);
}

/**
 * Los tags de una categoría — el picker de "Motivo del break" — ordenados
 * alfabéticamente por nombre. La comparación ignora tildes y mayúsculas
 * ("técnico" va después de "Personal"). Devuelve un array nuevo: `tags` no
 * se muta.
 */
export function tagsOfCategory(
  tags: Tag[],
  categoryId: number | null | undefined,
): Tag[] {
  if (categoryId == null) return [];
  return (tags ?? [])
    .filter(
      (tag) => (tag.category?.id ?? (tag as any).categoryId) === categoryId,
    )
    .sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? ""), "es", {
        sensitivity: "base",
      }),
    );
}

// ─── Permisos del día ─────────────────────────────────────────────────────────

export function normalizePermissionName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export const KNOWN_PERMISSION_ACTIONS = new Set(
  Object.values(PERMISSION_ACTION).map(normalizePermissionName),
);

// isJornadaVisible/isAlmuerzoVisible corren en cada tick del reloj (1s) — sin
// esta memoria un nombre inesperado inundaría el log.
export const warnedUnexpectedActions = new Set<string>();

export function warnUnexpectedActionName(raw: string | null | undefined): void {
  const key = String(raw);
  if (warnedUnexpectedActions.has(key)) return;
  warnedUnexpectedActions.add(key);
  console.warn("Permiso con actionTag.name inesperado:", raw);
}

/**
 * Permisos aprobados de una acción, sin filtrar por hora. Avisa en consola si
 * aparece una acción aprobada que no reconocemos (mismatch de casing/espacios).
 */
export function getApprovedPermissionsByAction(
  permissions: UserDayPermission[],
  actionName: string,
): UserDayPermission[] {
  const target = normalizePermissionName(actionName);
  return permissions.filter((permission) => {
    if (
      normalizePermissionName(permission.stateTag?.name) !==
      PERMISSION_STATE_APPROVED
    ) {
      return false;
    }
    const raw = permission.actionTag?.name;
    const normalized = normalizePermissionName(raw);
    if (!KNOWN_PERMISSION_ACTIONS.has(normalized)) {
      warnUnexpectedActionName(raw);
    }
    return normalized === target;
  });
}

/**
 * Todos los permisos aprobados de hoy, sin filtrar por acción ni por hora. La
 * UI lo usa para saber si mostrar el indicador de permiso del día.
 */
export function getApprovedPermissionsToday(
  permissions: UserDayPermission[],
): UserDayPermission[] {
  return permissions.filter(
    (permission) =>
      normalizePermissionName(permission.stateTag?.name) ===
      PERMISSION_STATE_APPROVED,
  );
}

/**
 * Primer permiso aprobado de `actionName` cuya ventana [fromTime, toTime]
 * contenga la hora actual (RD). null si no hay ninguno vigente.
 */
export function getApprovedPermission(
  permissions: UserDayPermission[],
  actionName: string,
  now: Date,
): UserDayPermission | null {
  const current = getRDMinutes(now);
  return (
    getApprovedPermissionsByAction(permissions, actionName).find(
      (permission) =>
        current >= timeStrToMinutes(permission.fromTime) &&
        current <= timeStrToMinutes(permission.toTime),
    ) ?? null
  );
}

// ─── Tipos de jornada: normal, Adicional y Fuera de Horario ───────────────────

export const JORNADA_START_TYPES = [
  "InicioJornada",
  "InicioJornadaAdicional",
  "InicioJornadaFH",
];
export const JORNADA_END_TYPES = [
  "FinJornada",
  "FinJornadaAdicional",
  "FinJornadaFH",
];

/** Los tipos nuevos (Adicional/FH), a los que sí se aplica "Inválido". */
const EXTENDED_JORNADA_TYPES = [
  "InicioJornadaAdicional",
  "FinJornadaAdicional",
  "InicioJornadaFH",
  "FinJornadaFH",
];

export function isJornadaStartType(type: string): boolean {
  return JORNADA_START_TYPES.includes(type);
}

export function isJornadaEndType(type: string): boolean {
  return JORNADA_END_TYPES.includes(type);
}

/**
 * Intento de jornada que no cuenta como ponche: rechazado por imagen, o fuera
 * del área permitida. "Inválido" solo se aplica a los tipos Adicional/FH — en
 * InicioJornada/FinJornada sigue contando, como hasta ahora.
 */
export function isRejectedJornadaAttempt(
  punch: Pick<PunchEvent, "type" | "status">,
): boolean {
  if (punch.status === "Error de Imagen" || punch.status === "Fuera de área") {
    return true;
  }
  return (
    punch.status === "Inválido" && EXTENDED_JORNADA_TYPES.includes(punch.type)
  );
}

/**
 * Estados que el webapp descarta del timeline. Copia EXACTA de
 * face-class-web PunchInOutForm/constants.js:37-43 (INVALID_TIMELINE_STATUSES).
 * La usan las reglas portadas del webapp para la Jornada Adicional (FinJornada
 * base, primer inicio del día, último estado válido); si una jornada está
 * abierta lo sigue decidiendo isRejectedJornadaAttempt. No es
 * REJECTED_PUNCH_STATUSES de adminPunchRules (esa además trae "Invalido" sin
 * tilde).
 */
export const INVALID_TIMELINE_STATUSES: readonly string[] = [
  "Fuera perímetro",
  "Imagen Fraudulenta",
  "Fuera de área",
  "Error de Imagen",
  "Inválido",
];

/** Ponche que el webapp sí cuenta en su timeline (helpers.js:59-64). */
function isValidTimelinePunch(punch: Pick<PunchEvent, "status">): boolean {
  return !INVALID_TIMELINE_STATUSES.includes(punch.status);
}

/**
 * Hoy ya hay un ponche de tipo EXACTO "FinJornada" válido: a partir de ahí
 * toda jornada nueva es Adicional (webapp helpers.js:707-713).
 */
export function hasValidBaseFinJornada(punches: PunchEvent[]): boolean {
  return punches.some(
    (p) => p.type === "FinJornada" && isValidTimelinePunch(p),
  );
}

/**
 * Hoy ya hubo un inicio de jornada (cualquiera de los 3 tipos) válido
 * (webapp helpers.js:366-373). Ignora el InicioJornada de un día anterior que /punches/today marca con
 * hasOpenDay.
 */
function hasJornadaStartToday(punches: PunchEvent[]): boolean {
  return punches.some(
    (p) =>
      isJornadaStartType(p.type) &&
      isValidTimelinePunch(p) &&
      !p.hasOpenDay &&
      p.hasOpenDay !== ("true" as any),
  );
}

/**
 * Último ponche válido de CUALQUIER tipo (jornada, almuerzo o break), por
 * createdDate — el "último estado válido" del webapp (helpers.js:275-300).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- la usa la regla del webapp comentada en isJornadaVisible; se guarda por si se reactiva
function getLastValidPunch(punches: PunchEvent[]): PunchEvent | null {
  return getNewestPunch(punches.filter(isValidTimelinePunch));
}

/**
 * Último ponche de jornada (inicio o fin, de cualquiera de los 3 tipos) que
 * cuenta: sin intentos rechazados ni el InicioJornada de un día anterior que
 * /punches/today marca con hasOpenDay.
 */
export function findLastJornadaPunch(
  punches: PunchEvent[],
): PunchEvent | undefined {
  return [...punches]
    .reverse()
    .find(
      (p) =>
        (isJornadaStartType(p.type) || isJornadaEndType(p.type)) &&
        !isRejectedJornadaAttempt(p) &&
        !p.hasOpenDay &&
        p.hasOpenDay !== ("true" as any),
    );
}

// ─── Feriado de hoy ───────────────────────────────────────────────────────────

/**
 * `raw` es el nodo `data` de chooseschool. Normaliza `data.todayHoliday`;
 * null si no viene o no trae holidayDate (= hoy no es feriado).
 */
export function buildTodayHoliday(raw: unknown): TodayHoliday | null {
  if (!raw || typeof raw !== "object") return null;
  const holiday = (raw as Record<string, unknown>).todayHoliday;
  if (!holiday || typeof holiday !== "object") return null;
  const h = holiday as Record<string, unknown>;
  if (h.holidayDate == null) return null;
  const holidayDate = String(h.holidayDate).trim().split("T")[0];
  if (!holidayDate) return null;
  return {
    id: Number(h.id) || 0,
    name: String(h.name ?? ""),
    holidayDate,
    working: h.working === true || h.working === 1 || h.working === "1",
  };
}

/** Hoy (RD) es el feriado indicado y NO es laborable. */
export function isNonWorkingHoliday(
  holiday: TodayHoliday | null | undefined,
  now: Date,
): boolean {
  return (
    !!holiday &&
    holiday.holidayDate === toRDDateString(now) &&
    holiday.working !== true
  );
}

// ─── Fuera de Horario (FH) ────────────────────────────────────────────────────

/**
 * Primer permiso "Fuera de Horario" aprobado, vigente ahora (misma ventana
 * [fromTime, toTime] que getApprovedPermission) y sin consumir: ningún ponche
 * de jornada lo referencia ya por permissionId.
 */
export function getUsableFhPermission(
  permissions: UserDayPermission[],
  punches: PunchEvent[],
  now: Date,
): UserDayPermission | null {
  const current = getRDMinutes(now);
  return (
    getApprovedPermissionsByAction(
      permissions,
      PERMISSION_ACTION.FUERA_DE_HORARIO,
    ).find(
      (permission) =>
        current >= timeStrToMinutes(permission.fromTime) &&
        current <= timeStrToMinutes(permission.toTime) &&
        !punches.some(
          (p) =>
            (isJornadaStartType(p.type) || isJornadaEndType(p.type)) &&
            p.permissionId === permission.id,
        ),
    ) ?? null
  );
}

/**
 * Primer permiso "Salida" aprobado, vigente ahora (misma ventana
 * [fromTime, toTime] que getApprovedPermission) y sin consumir: ningún ponche
 * de hoy lo referencia ya por permissionId. Regla propia del móvil para la
 * salida de la jornada Adicional.
 */
export function getUsableSalidaPermission(
  permissions: UserDayPermission[],
  punches: PunchEvent[],
  now: Date,
): UserDayPermission | null {
  const current = getRDMinutes(now);
  return (
    getApprovedPermissionsByAction(permissions, PERMISSION_ACTION.SALIDA).find(
      (permission) =>
        current >= timeStrToMinutes(permission.fromTime) &&
        current <= timeStrToMinutes(permission.toTime) &&
        !punches.some((p) => p.permissionId === permission.id),
    ) ?? null
  );
}

/**
 * Tipo que se envía al backend. La UI trabaja con InicioJornada/FinJornada;
 * el backend solo aplica un permiso FH si el ponche sale como
 * InicioJornadaFH/FinJornadaFH, y el cierre debe corresponder al inicio.
 *
 * Inicio: port del webapp (helpers.js:697-725) — FH vigente tiene prioridad;
 * si no, con un FinJornada base válido hoy sale como InicioJornadaAdicional.
 * Fin: regla propia del móvil — cierra con el tipo del inicio abierto.
 */
export function resolvePunchTypeForApi(
  baseType: string,
  punches: PunchEvent[],
  permissions: UserDayPermission[],
  now: Date,
): string {
  if (baseType === "InicioJornada") {
    if (getUsableFhPermission(permissions, punches, now)) {
      return "InicioJornadaFH";
    }
    return hasValidBaseFinJornada(punches)
      ? "InicioJornadaAdicional"
      : "InicioJornada";
  }
  if (baseType === "FinJornada") {
    const openType = findLastJornadaPunch(punches)?.type;
    if (openType === "InicioJornadaFH") return "FinJornadaFH";
    if (openType === "InicioJornadaAdicional") return "FinJornadaAdicional";
    return "FinJornada";
  }
  return baseType;
}

// ─── Visibilidad de botones ───────────────────────────────────────────────────

export function isJornadaVisible(
  now: Date,
  schedule: UserSchedule | null,
  isInicio: boolean,
  tolWorkIn: number,
  tolWorkOut: number,
  punches: PunchEvent[],
  permissions: UserDayPermission[],
  holiday?: TodayHoliday | null,
): boolean {
  // Ausencia aprobada -> nada disponible mientras dure el permiso
  if (getApprovedPermission(permissions, PERMISSION_ACTION.AUSENCIA, now)) {
    return false;
  }

  const current = getRDMinutes(now);
  // Los intentos rechazados (imagen, fuera del área; "Inválido" en
  // Adicional/FH) no cuentan como jornada iniciada
  const lastJornada = findLastJornadaPunch(punches);

  if (isInicio) {
    // Ya poncho entrada -> ocultar (jornada activa)
    if (lastJornada && isJornadaStartType(lastJornada.type)) return false;
    // FH vigente y sin consumir -> habilitar, aun en feriado y aun después de
    // un ciclo completo (permite una jornada FH extra)
    if (getUsableFhPermission(permissions, punches, now)) return true;
    // Feriado no laborable -> solo se entra con FH
    if (isNonWorkingHoliday(holiday, now)) return false;
    // Permiso de entrada tardía aprobado -> habilitar dentro de su ventana,
    // solo antes del primer inicio del día (webapp helpers.js:366-373)
    if (
      !hasJornadaStartToday(punches) &&
      getApprovedPermission(permissions, PERMISSION_ACTION.ENTRADA, now)
    ) {
      return true;
    }
    // Sin horario -> ocultar siempre
    if (!schedule) return false;
    // Sin ponche, o tras una salida (la siguiente es Adicional) -> visible
    // desde N min antes de entrada (Ver botón) hasta el fin exacto de la
    // jornada (workExitTime, sin tolerancia extra — la ventana completa de la
    // jornada ya es el margen). Webapp index.jsx:462-483.
    const entryStart = timeStrToMinutes(schedule.workEntryTime) - tolWorkIn;
    const entryEnd = timeStrToMinutes(schedule.workExitTime);
    return current >= entryStart && current < entryEnd;
  } else {
    // Ya salio hoy -> ocultar
    if (lastJornada && isJornadaEndType(lastJornada.type)) return false;
    // Jornada FH abierta -> siempre se puede cerrar (el feriado tampoco
    // bloquea la salida)
    if (lastJornada?.type === "InicioJornadaFH") return true;
    // Jornada Adicional abierta -> solo con la ventana de salida o un permiso
    // de Salida vigente y sin consumir. Return directo: no cae a la regla
    // normal de abajo (un permiso de Salida ya usado en la jornada base no
    // la reabre, ni un FH vigente).
    if (lastJornada?.type === "InicioJornadaAdicional") {
      // Feriado no laborable -> la salida nunca se bloquea (igual que la FH):
      // sin esta excepción quedaría atrapado hasta la ventana de salida.
      if (isNonWorkingHoliday(holiday, now)) return true;
      const inExitWindow =
        !!schedule &&
        current >= timeStrToMinutes(schedule.workExitTime) - tolWorkOut;
      return (
        inExitWindow ||
        getUsableSalidaPermission(permissions, punches, now) != null
      );
    }
    // Regla del webapp (index.jsx:343-408), desactivada el 8-oct por pedido:
    // la salida de la adicional solo con la hora de salida o un permiso de
    // Salida nuevo.
    // if (getLastValidPunch(punches)?.type === "InicioJornadaAdicional") {
    //   return true;
    // }
    // Salida anticipada aprobada -> habilitar antes de exitStart
    if (getApprovedPermission(permissions, PERMISSION_ACTION.SALIDA, now)) {
      return true;
    }
    // Fuera de Horario vigente -> habilita la salida fuera de su ventana
    if (
      getApprovedPermission(permissions, PERMISSION_ACTION.FUERA_DE_HORARIO, now)
    ) {
      return true;
    }
    // Sin horario -> ocultar siempre
    if (!schedule) return false;
    // Visible desde N min antes de salida, sin limite superior (horas extras)
    const exitStart = timeStrToMinutes(schedule.workExitTime) - tolWorkOut;
    return current >= exitStart;
  }
}

export function isAlmuerzoVisible(
  now: Date,
  schedule: UserSchedule | null,
  tolLunchIn: number,
  tolLunchOut: number,
  punches: PunchEvent[],
  permissions: UserDayPermission[],
  holiday?: TodayHoliday | null,
): boolean {
  // Ausencia aprobada -> nada disponible mientras dure el permiso
  if (getApprovedPermission(permissions, PERMISSION_ACTION.AUSENCIA, now)) {
    return false;
  }

  if (!schedule) return false;

  const lastAlmuerzo = [...punches]
    .reverse()
    .find((p) => p.type === "InicioAlmuerzo" || p.type === "FinAlmuerzo");

  if (lastAlmuerzo?.type === "InicioAlmuerzo") return true;
  // Feriado no laborable -> sin almuerzo, salvo cerrar uno ya abierto (arriba)
  if (isNonWorkingHoliday(holiday, now)) return false;
  if (lastAlmuerzo?.type === "FinAlmuerzo") return false;

  // Un permiso de almuerzo aprobado reemplaza la ventana del horario (aunque
  // ahora mismo estemos fuera de ella — solo cambia la fuente del rango)
  const [almuerzoPermission] = getApprovedPermissionsByAction(
    permissions,
    PERMISSION_ACTION.ALMUERZO,
  );

  let windowStart: number;
  let windowEnd: number;

  if (almuerzoPermission) {
    windowStart = timeStrToMinutes(almuerzoPermission.fromTime) - tolLunchIn;
    windowEnd = timeStrToMinutes(almuerzoPermission.toTime) + tolLunchOut;
  } else {
    if (!schedule.lunchEntryTime || !schedule.lunchExitTime) return false;
    windowStart = timeStrToMinutes(schedule.lunchEntryTime) - tolLunchIn;
    windowEnd = timeStrToMinutes(schedule.lunchExitTime) + tolLunchOut;
  }

  const current = getRDMinutes(now);

  return current >= windowStart && current <= windowEnd;
}

/**
 * Visibilidad de la pestaña de Break — oculta mientras haya un Almuerzo
 * activo (InicioAlmuerzo sin FinAlmuerzo), ya que no se puede estar en
 * ambas actividades a la vez.
 */
export function isBreakVisible(punches: PunchEvent[]): boolean {
  const lastAlmuerzo = [...punches]
    .reverse()
    .find((p) => p.type === "InicioAlmuerzo" || p.type === "FinAlmuerzo");
  return lastAlmuerzo?.type !== "InicioAlmuerzo";
}

/**
 * Visibilidad del BOTÓN de acción de Almuerzo (Entrada/Salida) — distinta de
 * isAlmuerzoVisible (que solo decide si la PESTAÑA "Almuerzo" aparece en el
 * selector de categorías).
 *
 * Entrada: visible desde N min antes de lunchEntryTime hasta N min después
 * de lunchExitTime — es decir, todo el bloque de almuerzo con margen en
 * ambas puntas, no una ventana angosta alrededor de la hora de entrada. Así,
 * alguien que llega tarde a marcar su entrada todavía puede tomar el resto
 * de su almuerzo, en vez de perder el acceso a los pocos minutos.
 *
 * Salida: ventana simétrica alrededor de lunchExitTime (± Ver Botón).
 *
 * La etiqueta de puntualidad (Tardanza/A Tiempo) se sigue calculando aparte
 * con Tolerancia (getPunctuality) — ensanchar esta ventana no ensancha esa
 * tolerancia.
 */
export function isAlmuerzoButtonVisible(
  now: Date,
  schedule: UserSchedule | null,
  isInicio: boolean,
  btnVisLunchIn: number,
  btnVisLunchOut: number,
  punches: PunchEvent[],
  permissions: UserDayPermission[],
  holiday?: TodayHoliday | null,
): boolean {
  // Ausencia aprobada -> nada disponible mientras dure el permiso
  if (getApprovedPermission(permissions, PERMISSION_ACTION.AUSENCIA, now)) {
    return false;
  }
  if (!schedule) return false;

  const current = getRDMinutes(now);
  const lastAlmuerzo = [...punches]
    .reverse()
    .find((p) => p.type === "InicioAlmuerzo" || p.type === "FinAlmuerzo");

  // Un permiso de almuerzo aprobado reemplaza la ventana del horario (mismo
  // criterio que ya usa isAlmuerzoVisible), con el mismo margen simétrico.
  const [almuerzoPermission] = getApprovedPermissionsByAction(
    permissions,
    PERMISSION_ACTION.ALMUERZO,
  );

  if (isInicio) {
    // Feriado no laborable -> no se inicia almuerzo
    if (isNonWorkingHoliday(holiday, now)) return false;
    // Ya entró o ya salió de almorzar hoy -> ocultar entrada
    if (lastAlmuerzo) return false;

    // El límite superior de Entrada NO es "entrada + margen" — es
    // "salida + margen de salida". Así alguien que llega tarde a marcar su
    // entrada todavía puede tomar el resto de su bloque de almuerzo, en vez
    // de quedar sin acceso apenas pasan los primeros minutos.
    const entryTime = almuerzoPermission
      ? timeStrToMinutes(almuerzoPermission.fromTime)
      : schedule.lunchEntryTime
        ? timeStrToMinutes(schedule.lunchEntryTime)
        : null;
    const exitTime = almuerzoPermission
      ? timeStrToMinutes(almuerzoPermission.toTime)
      : schedule.lunchExitTime
        ? timeStrToMinutes(schedule.lunchExitTime)
        : null;
    if (entryTime === null || exitTime === null) return false;
    return (
      current >= entryTime - btnVisLunchIn &&
      current <= exitTime + btnVisLunchOut
    );
  } else {
    // No inició almuerzo, o ya lo cerró -> ocultar salida
    if (lastAlmuerzo?.type !== "InicioAlmuerzo") return false;

    const exitTime = almuerzoPermission
      ? timeStrToMinutes(almuerzoPermission.toTime)
      : schedule.lunchExitTime
        ? timeStrToMinutes(schedule.lunchExitTime)
        : null;
    if (exitTime === null) return false;
    return (
      current >= exitTime - btnVisLunchOut &&
      current <= exitTime + btnVisLunchOut
    );
  }
}

/**
 * Categoría que debe quedar seleccionada en "Reg. Entrada / Salida" según las
 * categorías visibles: se conserva la seleccionada si sigue visible; si no,
 * se pasa a la primera visible (con una sola, es la única acción posible y la
 * fila de categorías se oculta). Sin ninguna visible no hay a dónde moverse.
 */
export function resolveSelectedCategory<T extends string>(
  selected: T,
  visible: readonly T[],
): T {
  if (visible.length === 0 || visible.includes(selected)) return selected;
  return visible[0];
}

/**
 * Ponche con el createdDate más reciente. No se asume el orden del array:
 * /punches/today inyecta el InicioJornada abierto de un día anterior
 * (hasOpenDay) en cualquier posición. Fechas no parseables se ignoran.
 */
export function getNewestPunch(punches: PunchEvent[]): PunchEvent | null {
  let newest: PunchEvent | null = null;
  let newestTime = -Infinity;
  for (const p of punches) {
    const time = parseBackendDate(String(p.createdDate ?? ""))?.getTime();
    if (time !== undefined && time > newestTime) {
      newest = p;
      newestTime = time;
    }
  }
  return newest;
}
