// Imports relativos (no "@/"): tsconfig.jest.json no declara el alias.
import axios from "axios";
import type { PunchEvent } from "./punchRules";

/**
 * GET /punches/today: los ponches de HOY del usuario de la sesión (el
 * backend filtra por DATE(createdDate) = hoy, así que la jornada abierta de un
 * día anterior no viene). Lo usan el ponchador, la puerta de Reportar y la
 * ruta de inicio.
 */

export type FetchPunchesTodayResult =
  | { ok: true; punches: PunchEvent[] }
  | { ok: false; punches: [] };

/**
 * Nunca lanza: red caída, timeout, 401 o `success: false` → `{ ok: false }`.
 * `timeoutMs` opcional (sin él, el de axios: ninguno, como el ponchador).
 * Usa la instancia global de axios: el interceptor de 401 sigue aplicando.
 */
export async function fetchPunchesToday({
  urlColegio,
  token,
  timeoutMs,
}: {
  urlColegio: string;
  token: string;
  timeoutMs?: number;
}): Promise<FetchPunchesTodayResult> {
  try {
    const response = await axios.get(`${urlColegio}/punches/today`, {
      headers: { Authorization: `Bearer ${token}` },
      ...(timeoutMs !== undefined && { timeout: timeoutMs }),
    });
    // Mismo criterio que tenía el ponchador: cualquier success falsy es fallo.
    if (!response?.data?.success) return { ok: false, punches: [] };
    const data = response.data.data;
    return { ok: true, punches: Array.isArray(data) ? (data as PunchEvent[]) : [] };
  } catch (error: any) {
    console.error(
      "fetchTodayPunches:",
      error?.response?.data?.message ?? error?.message,
    );
    return { ok: false, punches: [] };
  }
}
