/**
 * Regla "Reportar solo con jornada abierta HOY". Funciones puras (sin
 * react-native ni red): se testean con jest.
 *
 * Imports relativos (no "@/"): tsconfig.jest.json no declara el alias.
 */

import type { TaskerCompanyConfig } from "../../types/typesTasker/TaskerTypes";
import type { MenuItem } from "../../types/typesMenu/MenuTypes";
import {
  getOpenJornadaStartPunch,
  getPendingOpenDayDate,
  parseBackendDate,
  toRDDateString,
  type PunchEvent,
} from "./punchRules";
import { isTaskerEnabled } from "./taskerRules";

/** Ruta del ponchador ("Registrar Acceso"). */
export const PUNCHINOUT_PATH = "/punchinout";

/**
 * ¿Aplica la regla? Solo con Tasker conectado Y el ponchador en el menú del
 * usuario (los ítems que su rol permite, `allowedMenuItems` del store). Si
 * no, Reportar y la ruta de inicio quedan como siempre.
 */
export function userRequiresJornadaForReport(
  menuItems: readonly Pick<MenuItem, "path">[] | null | undefined,
  taskerConfig: TaskerCompanyConfig | null | undefined,
): boolean {
  if (!isTaskerEnabled(taskerConfig)) return false;
  return (menuItems ?? []).some((item) => item?.path === PUNCHINOUT_PATH);
}

/**
 * ¿Hay jornada abierta HOY? El inicio abierto (getOpenJornadaStartPunch: base,
 * Adicional o FH, válido y sin un fin posterior) debe ser de hoy en hora RD.
 * La jornada pendiente de un día anterior (`pendingOpenDay`, la del modal
 * "Jornada Incompleta") cuenta como NO abierta: si el inicio abierto es ese
 * mismo ponche (por id) o de ese mismo día, → false.
 */
export function hasOpenJornadaToday(
  punches: PunchEvent[],
  pendingOpenDay: PunchEvent | null | undefined,
  now: Date = new Date(),
): boolean {
  const open = getOpenJornadaStartPunch(punches);
  if (!open) return false;
  const startedAt = parseBackendDate(String(open.createdDate ?? ""));
  if (!startedAt || toRDDateString(startedAt) !== toRDDateString(now)) return false;
  if (pendingOpenDay) {
    if (pendingOpenDay.id != null && pendingOpenDay.id === open.id) return false;
    const pendingDate = getPendingOpenDayDate(pendingOpenDay);
    if (pendingDate && toRDDateString(pendingDate) === toRDDateString(startedAt)) return false;
  }
  return true;
}
