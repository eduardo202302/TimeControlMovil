import type { UserSchedule } from "../../types/typeStore/SchoolStoreType";

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

/** Los tags de una categoría — el picker de "Motivo del break". */
export function tagsOfCategory(
  tags: Tag[],
  categoryId: number | null | undefined,
): Tag[] {
  if (categoryId == null) return [];
  return (tags ?? []).filter(
    (tag) => (tag.category?.id ?? (tag as any).categoryId) === categoryId,
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

// ─── Visibilidad de botones ───────────────────────────────────────────────────

export function isJornadaVisible(
  now: Date,
  schedule: UserSchedule | null,
  isInicio: boolean,
  tolWorkIn: number,
  tolWorkOut: number,
  punches: PunchEvent[],
  permissions: UserDayPermission[],
): boolean {
  // Ausencia aprobada -> nada disponible mientras dure el permiso
  if (getApprovedPermission(permissions, PERMISSION_ACTION.AUSENCIA, now)) {
    return false;
  }

  const current = getRDMinutes(now);
  // Los intentos rechazados por imagen, o fuera del área permitida, no
  // cuentan como jornada iniciada
  const lastJornada = [...punches]
    .reverse()
    .find(
      (p) =>
        (p.type === "InicioJornada" || p.type === "FinJornada") &&
        p.status !== "Error de Imagen" &&
        p.status !== "Fuera de área" &&
        !p.hasOpenDay &&
        p.hasOpenDay !== ("true" as any),
    );

  // Habilita entrada y salida fuera de su ventana normal (incluso sin horario)
  const fueraDeHorario = getApprovedPermission(
    permissions,
    PERMISSION_ACTION.FUERA_DE_HORARIO,
    now,
  );

  if (isInicio) {
    // Ya poncho entrada -> ocultar (jornada activa)
    if (lastJornada?.type === "InicioJornada") return false;
    // Ya salio hoy -> ocultar
    if (lastJornada?.type === "FinJornada") return false;
    // Permiso de entrada tardía aprobado -> habilitar dentro de su ventana
    if (getApprovedPermission(permissions, PERMISSION_ACTION.ENTRADA, now)) {
      return true;
    }
    if (fueraDeHorario) return true;
    // Sin horario -> ocultar siempre
    if (!schedule) return false;
    // Sin ponche -> visible desde N min antes de entrada (tolerancia) hasta el
    // fin exacto de la jornada (workExitTime, sin tolerancia extra — la ventana
    // completa de la jornada ya es el margen)
    const entryStart = timeStrToMinutes(schedule.workEntryTime) - tolWorkIn;
    const entryEnd = timeStrToMinutes(schedule.workExitTime);
    return current >= entryStart && current < entryEnd;
  } else {
    // Ya salio hoy -> ocultar
    if (lastJornada?.type === "FinJornada") return false;
    // Salida anticipada aprobada -> habilitar antes de exitStart
    if (getApprovedPermission(permissions, PERMISSION_ACTION.SALIDA, now)) {
      return true;
    }
    if (fueraDeHorario) return true;
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
