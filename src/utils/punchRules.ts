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
  hasOpenDay?: boolean | string;
  openDayDate?: string;
  date?: string;
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

export function timeStrToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
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
  // Los intentos rechazados por imagen no cuentan como jornada iniciada
  const lastJornada = [...punches]
    .reverse()
    .find(
      (p) =>
        (p.type === "InicioJornada" || p.type === "FinJornada") &&
        p.status !== "Error de Imagen" &&
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
    // Permiso de entrada tardía -> bloquear aunque esté en horario normal
    if (getApprovedPermission(permissions, PERMISSION_ACTION.ENTRADA, now)) {
      return false;
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
