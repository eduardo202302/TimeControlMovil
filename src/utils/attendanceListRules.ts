import type {
  AttendanceListRow,
  AttendanceStatus,
  ListSubtab,
} from "./attendanceRules";

/**
 * Reglas de fila del tab "List" de Asistencia Adm. — port de
 * `handlerAttendance` (AdminAttendanceForm) y de StudentAttendanceCard /
 * AttendanceList del webapp. Separado de attendanceRules.ts (red + filtros)
 * y sin react-native, para testearlo con jest.
 */

export type ListRowAction = AttendanceStatus | "edit" | "tardinessEntryTime";

/**
 * `handlerAttendance` del webapp, tal cual:
 *   - "edit": desbloquea la fila (actionsDisabled:false) y descarta la hora
 *     personalizada. NO marca `updated`.
 *   - "tardinessEntryTime": guarda la hora, la marca personalizada y `updated`.
 *   - estado: cambia `status`, marca `updated` (flag simple: A→P→A igual se
 *     envía) y VUELVE A BLOQUEAR la fila. Si no es tardanza, limpia la hora.
 * Las filas se identifican por `row.id` (id del attendanceDetail).
 */
export function applyListAction(
  rows: AttendanceListRow[],
  rowId: number,
  action: ListRowAction,
  value?: string,
): AttendanceListRow[] {
  return rows.map((row) => {
    if (row.id !== rowId) return row;
    if (action === "edit") {
      return { ...row, actionsDisabled: false, tardinessEntryTimeCustomized: false };
    }
    if (action === "tardinessEntryTime") {
      return {
        ...row,
        tardinessEntryTime: value ?? null,
        tardinessEntryTimeCustomized: true,
        updated: true,
      };
    }
    const next: AttendanceListRow = {
      ...row,
      status: action,
      updated: true,
      actionsDisabled: true,
      tardinessEntryTimeCustomized: false,
    };
    if (action !== "tardanza") next.tardinessEntryTime = null;
    return next;
  });
}

/**
 * Cómo se pinta cada subtab (props que AttendanceList pasa a
 * StudentsAttendanceList):
 *   - Todos / Foto: solo lectura, sin botones.
 *   - Verif.: Tard./Ause./Pres. (Exc. oculto).
 *   - Manual: Tard./Pres. (Ause. y Exc. ocultos).
 *   - Verif./Manual con fotos nuevas sin guardar (`cantUpdateManual`):
 *     solo lectura, igual que Todos.
 */
export function subtabRowConfig(
  subtab: ListSubtab,
  cantUpdateManual: boolean,
): { listDisabled: boolean; buttons: AttendanceStatus[] } {
  if (subtab === "Verificados" && !cantUpdateManual) {
    return { listDisabled: false, buttons: ["tardanza", "ausente", "presente"] };
  }
  if (subtab === "Manual" && !cantUpdateManual) {
    return { listDisabled: false, buttons: ["tardanza", "presente"] };
  }
  return { listDisabled: true, buttons: [] };
}

/** `isDisabled` de StudentAttendanceCard: lista bloqueada o fila bloqueada. */
export function isRowLocked(row: AttendanceListRow, listDisabled: boolean): boolean {
  return listDisabled || row.actionsDisabled;
}

/** Lápiz de edición: fila bloqueada dentro de una lista editable. */
export function showEditIcon(row: AttendanceListRow, listDisabled: boolean): boolean {
  return row.actionsDisabled && !listDisabled;
}

/** `shouldShowTardinessTimePicker` del webapp (showStates ≡ !listDisabled). */
export function shouldShowTardinessPicker(row: AttendanceListRow, listDisabled: boolean): boolean {
  if (listDisabled) return false;
  if (row.status !== "tardanza") return false;
  if (row.recorded === "auto") return false;
  const isManualTap = row.recorded === "unrecorded";
  const isEditMode = !isRowLocked(row, listDisabled);
  return isManualTap || isEditMode || row.updated;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * "HH:mm" de `recordedAt` en hora local (como `moment(recordedAt)` del
 * webapp). Acepta "YYYY-MM-DD HH:mm:ss" (se toma tal cual) o ISO con zona.
 */
export function hhmmFromRecordedAt(recordedAt: string | null | undefined): string {
  if (!recordedAt) return "";
  const raw = String(recordedAt).trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? "" : `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }
  const match = /[T ](\d{2}):(\d{2})/.exec(raw);
  return match ? `${match[1]}:${match[2]}` : "";
}

/**
 * Valor que muestra el selector de hora — `getTardinessEntryTimeValue` +
 * `getTardinessEntryTimeSuggestion` del webapp. Es solo lo que se VE: al
 * backend solo viaja si el usuario la eligió (`tardinessEntryTimeCustomized`).
 */
export function tardinessEntryTimeValue(
  row: AttendanceListRow,
  listDisabled: boolean,
  now: Date = new Date(),
): string {
  if (row.tardinessEntryTimeCustomized) {
    return row.tardinessEntryTime ? row.tardinessEntryTime.slice(0, 5) : "";
  }
  const fromRecordedAt = hhmmFromRecordedAt(row.recordedAt);
  const preferRecordedAt = !isRowLocked(row, listDisabled) && row.recorded !== "unrecorded";
  if (preferRecordedAt && fromRecordedAt) return fromRecordedAt;
  if (row.tardinessEntryTime) return row.tardinessEntryTime.slice(0, 5);
  if (row.recorded !== "unrecorded" && fromRecordedAt) return fromRecordedAt;
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

/** Insignia P/A/T/E — un ausente con excusa se muestra como "E". */
export function displayStatus(
  row: Pick<AttendanceListRow, "status" | "haveExcuse">,
): AttendanceStatus | "excusa" {
  return row.status === "ausente" && row.haveExcuse === "si" ? "excusa" : row.status;
}

// ─── Número de lista ─────────────────────────────────────────────────────────

/** Lo mínimo que necesitan el badge y el orden: el `student` del detalle. */
type ListNumberSubject = {
  student?: { fullName?: string | null; listNumber?: unknown } | null;
};

/**
 * Nº de lista del estudiante, o null si no tiene. Lo agrega el backend
 * (`addListNumbersToStudents`, que ya lo omite si es 0/null); acá también se
 * descarta cualquier valor no positivo para no pintar un badge "0".
 */
export function studentListNumber(subject: ListNumberSubject): number | null {
  const raw = subject.student?.listNumber;
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function byFullName(a: ListNumberSubject, b: ListNumberSubject): number {
  return (a.student?.fullName ?? "").localeCompare(b.student?.fullName ?? "");
}

/**
 * Orden de las listas de Asistencia — mismo criterio que AttendanceList del
 * webapp (`orderBy(students, ["student.listNumber"])` solo si la escuela
 * tiene `settings.showListNumber`):
 *   - con el flag: por Nº de lista ascendente; los que no tienen número van
 *     al final, por nombre (empates también por nombre);
 *   - sin el flag: por nombre, como hasta ahora.
 * Devuelve una copia; no muta el arreglo recibido.
 */
export function sortAttendanceStudents<T extends ListNumberSubject>(
  items: readonly T[],
  byListNumber: boolean,
): T[] {
  if (!byListNumber) return [...items].sort(byFullName);
  return [...items].sort((a, b) => {
    const na = studentListNumber(a);
    const nb = studentListNumber(b);
    if (na != null && nb != null && na !== nb) return na - nb;
    if (na != null && nb == null) return -1;
    if (na == null && nb != null) return 1;
    return byFullName(a, b);
  });
}
