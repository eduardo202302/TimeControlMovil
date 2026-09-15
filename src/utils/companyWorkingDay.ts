/**
 * Portado de `face-class-web/src/Utils/companyWorkingDay.js` — misma lógica,
 * mismo criterio de días hábiles, para que un rango de ausencia se valide
 * igual en mobile que en el webapp.
 *
 * Sin react-native ni expo-* a propósito (mismo criterio que punchRules.ts):
 * así se testea con jest puro, sin emulador.
 */

/** Fila de `company.settings.schedulesAdd` — JSON libre, se tipa lo mínimo. */
export interface CompanyScheduleRow {
  weekDay: string;
  workEntryTime?: string | null;
  workExitTime?: string | null;
  [key: string]: unknown;
}

const SPANISH_WEEKDAY_BY_JS_GETDAY = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

function normalizeTime(time: unknown): string {
  if (time == null || time === "") return "";
  return String(time).slice(0, 5);
}

/**
 * ¿La sede labora este día? Prioriza el horario por día de `schedulesAdd`
 * (una fila por weekDay); si no hay filas configuradas, cae a
 * `entryTime`/`exitTime` sueltos como horario general de la sede.
 *
 * `companySchedulesRows` puede no venir garantizado (settings es JSON libre
 * de la escuela, sin schema estricto) — se normaliza a `[]` en vez de
 * asumir que siempre es un array.
 */
export function isCompanyWorkingDate(
  date: Date,
  companySchedulesRows?: CompanyScheduleRow[] | null,
  companyEntryTime?: string | null,
  companyExitTime?: string | null,
): boolean {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) {
    return false;
  }
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const weekDayName = SPANISH_WEEKDAY_BY_JS_GETDAY[d.getDay()];
  const globalEntry = normalizeTime(companyEntryTime);
  const globalExit = normalizeTime(companyExitTime);

  const rows = Array.isArray(companySchedulesRows) ? companySchedulesRows : [];
  if (rows.length === 0) {
    return Boolean(globalEntry && globalExit);
  }

  const row = rows.find((r) => r && r.weekDay === weekDayName);
  if (!row) return false;
  const specEntry = normalizeTime(row.workEntryTime);
  const specExit = normalizeTime(row.workExitTime);
  if (!specEntry && !specExit) return false;
  return true;
}

/**
 * ¿Todos los días entre `start` y `end` (inclusive, sin importar el orden)
 * son hábiles para la sede? `start`/`end` ausentes se consideran válidos —
 * mismo criterio que el webapp: no hay rango que objetar todavía.
 */
export function isAbsenceRangeOnlyCompanyWorkingDays(
  start: Date | null | undefined,
  end: Date | null | undefined,
  companySchedulesRows?: CompanyScheduleRow[] | null,
  companyEntryTime?: string | null,
  companyExitTime?: string | null,
): boolean {
  if (!start || !end) return true;

  const isOk = (dt: Date) =>
    isCompanyWorkingDate(dt, companySchedulesRows, companyEntryTime, companyExitTime);

  const t0 = Math.min(start.getTime(), end.getTime());
  const t1 = Math.max(start.getTime(), end.getTime());
  const cur = new Date(t0);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(t1);
  last.setHours(0, 0, 0, 0);

  while (cur.getTime() <= last.getTime()) {
    if (!isOk(new Date(cur))) return false;
    cur.setDate(cur.getDate() + 1);
  }
  return true;
}
