// Imports relativos (no "@/"): tsconfig.jest.json no declara el alias.
import { useSchoolStore } from "../../store/useSchoolStore";
import type { User } from "../../types/typeStore/SchoolStoreType";
import { resolveMobilePath } from "../constants/mobileRoutes";
import { userValidatesLocation } from "./punchLocation";
import { fetchPunchesToday } from "./punchesTodayApi";
import type { PunchEvent } from "./punchRules";
import { hasOpenJornadaToday, userRequiresJornadaForReport } from "./reportJornadaRules";
import * as Storage from "./storage";
import { TASKER_REPORT_PATH } from "./taskerRules";

/**
 * Lo que necesita red de la regla "Reportar solo con jornada abierta HOY":
 * consultar la jornada de la sesión actual y elegir la ruta de inicio. Las
 * reglas puras están en reportJornadaRules.ts.
 */

/** Tope de la consulta al elegir la ruta de inicio: si tarda más, la ruta de siempre. */
export const LANDING_JORNADA_TIMEOUT_MS = 3_000;
/** Tope de la consulta de la puerta de Reportar (con indicador a la vista). */
export const REPORT_JORNADA_TIMEOUT_MS = 15_000;
export const RECENT_JORNADA_CHECK_MAX_AGE_MS = 10_000;

export type OpenJornadaCheck = { ok: true; open: boolean } | { ok: false };

export function recordJornadaCheck(punches: PunchEvent[], sessionUser: User | null): boolean {
  const state = useSchoolStore.getState();
  const open = hasOpenJornadaToday(punches, state.pendingOpenDay);
  if (state.user === sessionUser) state.setLastJornadaCheck({ open, at: Date.now() });
  return open;
}

export function getRecentJornadaCheck(nowMs: number = Date.now()): OpenJornadaCheck | null {
  const last = useSchoolStore.getState().lastJornadaCheck;
  return last && nowMs - last.at < RECENT_JORNADA_CHECK_MAX_AGE_MS ? { ok: true, open: last.open } : null;
}

/** ¿Aplica la regla a la sesión actual (store)? */
export function sessionRequiresJornadaForReport(): boolean {
  const { allowedMenuItems, taskerConfig } = useSchoolStore.getState();
  return userRequiresJornadaForReport(allowedMenuItems, taskerConfig);
}

/**
 * GET /punches/today con la sesión actual → ¿jornada abierta hoy? Sin
 * urlColegio o token, o si la consulta falla → `{ ok: false }`. Nunca lanza.
 * El token sale del store o, si no está (login de una sola empresa), de
 * SecureStore, como el ponchador.
 */
export async function checkOpenJornadaToday(timeoutMs: number): Promise<OpenJornadaCheck> {
  try {
    const { urlColegio, token: storeToken, user } = useSchoolStore.getState();
    const token = storeToken ?? (await Storage.getItemAsync("token"));
    if (!urlColegio || !token) return { ok: false };
    const result = await fetchPunchesToday({ urlColegio, token, timeoutMs });
    if (!result.ok) return { ok: false };
    return { ok: true, open: recordJornadaCheck(result.punches, user) };
  } catch {
    return { ok: false };
  }
}

/**
 * Pantalla de inicio de la sesión ya armada en el store (login, sesión
 * restaurada, Cambiar Empresa): con la regla y la jornada abierta hoy →
 * Reportar; si no (regla que no aplica, jornada cerrada, red caída o más de
 * LANDING_JORNADA_TIMEOUT_MS) → resolveMobilePath(role.defaultMenu), como
 * siempre. Nunca lanza.
 */
export async function resolveLandingPath(): Promise<string> {
  const fallback = resolveMobilePath(useSchoolStore.getState().role?.defaultMenu?.path);
  if (!sessionRequiresJornadaForReport() || !userValidatesLocation(useSchoolStore.getState().user)) {
    return fallback;
  }
  const check = await checkOpenJornadaToday(LANDING_JORNADA_TIMEOUT_MS);
  return check.ok && check.open ? TASKER_REPORT_PATH : fallback;
}
