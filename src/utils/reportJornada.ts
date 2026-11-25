// Imports relativos (no "@/"): tsconfig.jest.json no declara el alias.
import { useSchoolStore } from "../../store/useSchoolStore";
import { resolveMobilePath } from "../constants/mobileRoutes";
import { fetchPunchesToday } from "./punchesTodayApi";
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

export type OpenJornadaCheck = { ok: true; open: boolean } | { ok: false };

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
    const { urlColegio, token: storeToken } = useSchoolStore.getState();
    const token = storeToken ?? (await Storage.getItemAsync("token"));
    if (!urlColegio || !token) return { ok: false };
    const result = await fetchPunchesToday({ urlColegio, token, timeoutMs });
    if (!result.ok) return { ok: false };
    const { pendingOpenDay } = useSchoolStore.getState();
    return { ok: true, open: hasOpenJornadaToday(result.punches, pendingOpenDay) };
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
  if (!sessionRequiresJornadaForReport()) return fallback;
  const check = await checkOpenJornadaToday(LANDING_JORNADA_TIMEOUT_MS);
  return check.ok && check.open ? TASKER_REPORT_PATH : fallback;
}
