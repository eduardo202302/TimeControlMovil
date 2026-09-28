import type { ViewStyle } from "react-native";
import { PRIMARY_COLOR } from "./colors";

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
