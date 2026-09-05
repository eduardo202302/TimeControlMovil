/**
 * Rutas reales de `src/app/(app)/` (sin el grupo). `role.defaultMenu.path`
 * viene del backend y puede apuntar a una ruta solo-webapp (p. ej. "/users")
 * o venir vacío — cualquiera de esos casos produciría "Unmatched Route" si
 * se navegara tal cual.
 */
export const VALID_MOBILE_PATHS: Set<string> = new Set([
  "/home",
  "/dashboard",
  "/attendancetaking",
  "/tardiness",
  "/punchinout",
  "/timeoffscreen",
  "/mypermissions",
  "/parentsexcusesscreen",
  "/timeoff",
  "/adminpunchinout",
]);

export const DEFAULT_MOBILE_PATH = "/punchinout";

/** `defaultMenu.path` del backend → ruta mobile válida, o el fallback. */
export function resolveMobilePath(defaultMenuPath?: string | null): string {
  if (defaultMenuPath && VALID_MOBILE_PATHS.has(defaultMenuPath)) {
    return defaultMenuPath;
  }
  return DEFAULT_MOBILE_PATH;
}
