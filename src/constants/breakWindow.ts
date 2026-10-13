// Ventanas de visibilidad de la pestaña Break, en minutos, relativas a las
// horas del horario (no a los ponches reales). Las usa isBreakVisible
// (src/utils/punchRules.ts) a través de getBreakWindowConfig().
//
// La configuración es por compañía (school.settings, Compañía → Configuración
// → Break en el webapp). Estas constantes son el respaldo cuando la compañía
// no configuró el valor.
//
// Todo en 0 = sin restricción de horario.

/** Aparece 1 h después de workEntryTime. */
export const BREAK_START_AFTER_ENTRY_MIN = 60;
/**
 * 8-oct: desactivado por pedido (el Break se ve hasta la hora de inicio
 * del almuerzo).
 */
export const BREAK_END_BEFORE_LUNCH_MIN = 0;
/** Reaparece 1 h después de lunchExitTime. */
export const BREAK_START_AFTER_LUNCH_MIN = 60;
/** Se oculta 1 h antes de workExitTime. */
export const BREAK_END_BEFORE_EXIT_MIN = 60;
/** Minutos de espera tras terminar un break antes de poder iniciar otro. */
export const BREAK_COOLDOWN_MIN = 30;

/** Claves de school.settings que guarda el webapp (minutos, enteros). */
export const BREAK_SHOW_AFTER_ENTRY_KEY = "breakShowAfterEntryMinutes";
export const BREAK_HIDE_BEFORE_LUNCH_KEY = "breakHideBeforeLunchMinutes";
export const BREAK_SHOW_AFTER_LUNCH_EXIT_KEY = "breakShowAfterLunchExitMinutes";
export const BREAK_HIDE_BEFORE_EXIT_KEY = "breakHideBeforeExitMinutes";
export const BREAK_COOLDOWN_KEY = "breakCooldownMinutes";

export interface BreakWindowConfig {
  startAfterEntry: number;
  endBeforeLunch: number;
  startAfterLunch: number;
  endBeforeExit: number;
  cooldownAfterBreak: number;
}

/**
 * Minutos válidos: entero >= 0, como número o como string numérico ("45").
 * Cualquier otra cosa (undefined, null, "", NaN, negativos, decimales, texto)
 * → undefined, para que se use el respaldo.
 */
function readMinutes(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return Number.isSafeInteger(raw) && raw >= 0 ? raw : undefined;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    return readMinutes(Number(raw.trim()));
  }
  return undefined;
}

/**
 * Config de las ventanas del Break a partir de school.settings. Cada clave se
 * lee por separado: si falta o es inválida se usa la constante de esa clave y
 * las demás se siguen leyendo. Las compañías que nunca guardaron la config no
 * traen las claves → todo respaldo.
 */
export function getBreakWindowConfig(settings?: unknown): BreakWindowConfig {
  const s: Record<string, unknown> =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>)
      : {};
  return {
    startAfterEntry:
      readMinutes(s[BREAK_SHOW_AFTER_ENTRY_KEY]) ?? BREAK_START_AFTER_ENTRY_MIN,
    endBeforeLunch:
      readMinutes(s[BREAK_HIDE_BEFORE_LUNCH_KEY]) ?? BREAK_END_BEFORE_LUNCH_MIN,
    startAfterLunch:
      readMinutes(s[BREAK_SHOW_AFTER_LUNCH_EXIT_KEY]) ??
      BREAK_START_AFTER_LUNCH_MIN,
    endBeforeExit:
      readMinutes(s[BREAK_HIDE_BEFORE_EXIT_KEY]) ?? BREAK_END_BEFORE_EXIT_MIN,
    cooldownAfterBreak:
      readMinutes(s[BREAK_COOLDOWN_KEY]) ?? BREAK_COOLDOWN_MIN,
  };
}
