import type { ViewStyle } from "react-native";
import { PRIMARY_COLOR, RIBBON_BACKGROUND } from "./colors";

/**
 * Escala de sombras — rediseño v2.
 *
 * Cada token trae las dos mitades de la sombra: iOS usa las props `shadow*`
 * y Android sólo usa `elevation` (ignora shadowOffset/Opacity/Radius). El
 * dispositivo de prueba es Android 12, así que lo que se ve en QA lo decide
 * `elevation`; los valores iOS están calibrados para verse parecido.
 *
 * Roles:
 *   SM      chips / filas
 *   MD      cards
 *   LG      modales / sheets / FAB
 *   PRIMARY botón principal (sombra teñida del azul de marca)
 *
 * Uso con spread dentro del StyleSheet: `card: { ...SHADOW_MD, borderRadius: RADIUS_XL }`.
 */

/** Gris azulado casi negro — sombra más suave que el #000 puro. */
export const SHADOW_COLOR = "#101828";

export const SHADOW_SM: ViewStyle = {
  shadowColor: SHADOW_COLOR,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 3,
  elevation: 1,
};

export const SHADOW_MD: ViewStyle = {
  shadowColor: SHADOW_COLOR,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 8,
  elevation: 3,
};

export const SHADOW_LG: ViewStyle = {
  shadowColor: SHADOW_COLOR,
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.16,
  shadowRadius: 24,
  elevation: 8,
};

export const SHADOW_PRIMARY: ViewStyle = {
  shadowColor: PRIMARY_COLOR,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
  elevation: 4,
};

/** FAB: sombra teñida del primario, más alta que la de cards para que flote. */
export const SHADOW_FAB: ViewStyle = {
  shadowColor: PRIMARY_COLOR,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.35,
  shadowRadius: 16,
  elevation: 8,
};

/** Cinta de Asistencia (docente): sombra teñida del navy de la propia cinta. */
export const SHADOW_RIBBON: ViewStyle = {
  shadowColor: RIBBON_BACKGROUND,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.35,
  shadowRadius: 9,
  elevation: 5,
};

/** Footer de formulario: sombra hacia ARRIBA (offset negativo) sobre el contenido. */
export const SHADOW_FOOTER: ViewStyle = {
  shadowColor: SHADOW_COLOR,
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 8,
};

/** Sombra corta teñida del color del elemento — la usa el chip de SectionIcon. */
export function tintedShadow(color: string): ViewStyle {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 2,
  };
}
