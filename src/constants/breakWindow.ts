// Temporal (8-oct): valores fijos hasta que el backend exponga la
// configuración por compañía. Al llegar esa config, leerla de companySettings
// y dejar estas como respaldo.
//
// Ventanas de visibilidad de la pestaña Break, en minutos, relativas a las
// horas del horario (no a los ponches reales). Las usa isBreakVisible
// (src/utils/punchRules.ts) a través de getBreakWindowConfig().

/** Aparece 1 h después de workEntryTime. */
export const BREAK_START_AFTER_ENTRY_MIN = 60;
/** Se oculta 1 h antes de lunchEntryTime. */
export const BREAK_END_BEFORE_LUNCH_MIN = 60;
/** Reaparece 1 h después de lunchExitTime. */
export const BREAK_START_AFTER_LUNCH_MIN = 60;
/** Se oculta 1 h antes de workExitTime. */
export const BREAK_END_BEFORE_EXIT_MIN = 60;

export interface BreakWindowConfig {
  startAfterEntry: number;
  endBeforeLunch: number;
  startAfterLunch: number;
  endBeforeExit: number;
}

/**
 * Único punto a cambiar cuando llegue la configuración por compañía (leer de
 * companySettings con estas constantes como respaldo).
 */
export function getBreakWindowConfig(): BreakWindowConfig {
  return {
    startAfterEntry: BREAK_START_AFTER_ENTRY_MIN,
    endBeforeLunch: BREAK_END_BEFORE_LUNCH_MIN,
    startAfterLunch: BREAK_START_AFTER_LUNCH_MIN,
    endBeforeExit: BREAK_END_BEFORE_EXIT_MIN,
  };
}
