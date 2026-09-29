import type { ViewStyle } from "react-native";
import {
  CARD_BACKGROUND,
  CARD_BORDER_V2,
  FOOTER_BORDER,
  OVERLAY_BACKDROP,
  PRIMARY_COLOR,
} from "@/constants/colors";
import {
  RADIUS_2XL,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  RADIUS_XL,
} from "@/constants/responsive";
import {
  SHADOW_FAB,
  SHADOW_FOOTER,
  SHADOW_LG,
  SHADOW_PRIMARY,
  SHADOW_SM,
} from "@/constants/shadows";

/**
 * Superficies compartidas — rediseño v2, Fase 2.
 *
 * SOLO capa visual (fondo, borde, radio, sombra): objetos estáticos, sin
 * scale(), para esparcir al inicio de la clave local de cada createStyles.
 * Padding, márgenes y tamaños siguen viviendo en cada archivo:
 *
 *   card: { ...CARD_FORM, paddingHorizontal: scale(16), ... }
 *
 * Las claves de estado (cardInactive, saveBtnBusy, ...) van en el array de
 * estilos DESPUÉS de la base, así que siguen sobrescribiendo.
 *
 * Todas las que llevan SHADOW_* traen backgroundColor: en Android la
 * elevation no pinta sin fondo.
 */

/** Base de card: sin radio — lo pone cada variante. */
export const CARD_SURFACE: ViewStyle = {
  backgroundColor: CARD_BACKGROUND,
  borderWidth: 1,
  borderColor: CARD_BORDER_V2,
  ...SHADOW_SM,
};

/** Card de formulario/detalle (variante A). */
export const CARD_FORM: ViewStyle = { ...CARD_SURFACE, borderRadius: RADIUS_2XL };

/** Card de fila de lista (variantes B/B′). */
export const CARD_ROW: ViewStyle = { ...CARD_SURFACE, borderRadius: RADIUS_XL };

/** Barra inferior Cancelar/Guardar de los formularios. */
export const FOOTER_BAR: ViewStyle = {
  backgroundColor: CARD_BACKGROUND,
  borderTopWidth: 1,
  borderTopColor: FOOTER_BORDER,
  ...SHADOW_FOOTER,
};

export const FOOTER_BTN_CANCEL: ViewStyle = {
  backgroundColor: FOOTER_BORDER,
  borderRadius: RADIUS_LG,
};

export const FOOTER_BTN_SAVE: ViewStyle = {
  backgroundColor: PRIMARY_COLOR,
  borderRadius: RADIUS_LG,
  ...SHADOW_PRIMARY,
};

/** Botón flotante "+" de las listas. */
export const FAB_SURFACE: ViewStyle = {
  backgroundColor: PRIMARY_COLOR,
  borderRadius: RADIUS_PILL,
  ...SHADOW_FAB,
};

/** Contenedor del segmented de filtros (los segmentos no cambian). */
export const SEGMENTED_SURFACE: ViewStyle = {
  backgroundColor: CARD_BACKGROUND,
  borderWidth: 1,
  borderColor: CARD_BORDER_V2,
  borderRadius: RADIUS_MD,
  ...SHADOW_SM,
};

/** Diálogos de confirmación (eliminar, salir sin guardar, cerrar sesión). */
export const DIALOG_OVERLAY: ViewStyle = { backgroundColor: OVERLAY_BACKDROP };

export const DIALOG_BOX: ViewStyle = {
  backgroundColor: CARD_BACKGROUND,
  borderRadius: RADIUS_2XL,
  ...SHADOW_LG,
};

/** Popups centrados: selectores, pickers, sheets de tags, resultados. */
export const POPUP_CARD: ViewStyle = {
  backgroundColor: CARD_BACKGROUND,
  borderRadius: RADIUS_2XL,
  ...SHADOW_LG,
};

/** Picker de fecha/hora iOS que sube desde abajo. */
export const BOTTOM_SHEET_CARD: ViewStyle = {
  backgroundColor: CARD_BACKGROUND,
  borderTopLeftRadius: RADIUS_2XL,
  borderTopRightRadius: RADIUS_2XL,
  ...SHADOW_LG,
};
