import type { SwitchProps, ViewStyle } from "react-native";
import {
  ADD_FILE_BORDER,
  CARD_BACKGROUND,
  CARD_BORDER,
  CARD_BORDER_V2,
  DROPZONE_BACKGROUND,
  DROPZONE_BORDER,
  FIELD_BACKGROUND,
  FIELD_DISABLED_BACKGROUND,
  FOOTER_BORDER,
  HEADER_NAVY,
  OVERLAY_BACKDROP,
  PRIMARY_COLOR,
  PRIMARY_TINT_50,
  RIBBON_BACKGROUND,
  SURFACE_SUBTLE,
  SWITCH_TRACK_OFF,
} from "@/constants/colors";
import {
  RADIUS_2XL,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  RADIUS_SM,
  RADIUS_XL,
} from "@/constants/responsive";
import {
  SHADOW_FAB,
  SHADOW_FOOTER,
  SHADOW_LG,
  SHADOW_MD,
  SHADOW_PRIMARY,
  SHADOW_RIBBON,
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

/**
 * TopBar de los modales a pantalla completa: mismo navy + sombra que el
 * header del shell ((app)/_layout). zIndex para que la sombra caiga sobre el
 * contenido que scrollea debajo.
 */
export const MODAL_TOPBAR: ViewStyle = {
  backgroundColor: HEADER_NAVY,
  ...SHADOW_MD,
  shadowColor: HEADER_NAVY,
  zIndex: 1,
};

/**
 * Inputs, selects y textareas de formulario. Estados (inválido) pisan después.
 * `satisfies` en vez de `: ViewStyle`: se esparce tanto en <View> como en
 * <TextInput>, y el tipo completo arrastraría props (cursor/userSelect) que
 * chocan entre ViewStyle y TextStyle.
 */
export const FIELD_SURFACE = {
  backgroundColor: FIELD_BACKGROUND,
  borderWidth: 1,
  borderColor: CARD_BORDER,
  borderRadius: RADIUS_LG,
} satisfies ViewStyle;

/** Campo deshabilitado / solo lectura: va DESPUÉS de FIELD_SURFACE. */
export const FIELD_DISABLED = {
  backgroundColor: FIELD_DISABLED_BACKGROUND,
} satisfies ViewStyle;

/** Buscador de listas (sobre el fondo de pantalla, por eso lleva sombra). */
export const SEARCH_SURFACE: ViewStyle = {
  backgroundColor: CARD_BACKGROUND,
  borderWidth: 1,
  borderColor: CARD_BORDER_V2,
  borderRadius: RADIUS_MD,
  ...SHADOW_SM,
};

/** Fila de archivo adjunto (lista de adjuntos en formularios y detalles). */
export const FILE_ROW: ViewStyle = {
  backgroundColor: FIELD_BACKGROUND,
  borderWidth: 1,
  borderColor: CARD_BORDER,
  borderRadius: RADIUS_MD,
};

/** Botón punteado "agregar archivo". */
export const ADD_FILE_BTN: ViewStyle = {
  backgroundColor: CARD_BACKGROUND,
  borderWidth: 1.5,
  borderStyle: "dashed",
  borderColor: ADD_FILE_BORDER,
  borderRadius: RADIUS_LG,
};

/** Zona de soltar/seleccionar adjuntos. El estado bloqueado pisa después. */
export const DROPZONE: ViewStyle = {
  backgroundColor: DROPZONE_BACKGROUND,
  borderWidth: 1.5,
  borderStyle: "dashed",
  borderColor: DROPZONE_BORDER,
  borderRadius: RADIUS_LG,
};

/** Miniatura de adjunto (grilla de adjuntos del solicitante). */
export const THUMB_TILE: ViewStyle = {
  backgroundColor: FIELD_BACKGROUND,
  borderWidth: 1,
  borderColor: CARD_BORDER,
  borderRadius: RADIUS_MD,
};

/** Contenedor del calendario de rango (AbsenceCalendar). */
export const CALENDAR_SURFACE: ViewStyle = {
  backgroundColor: CARD_BACKGROUND,
  borderWidth: 1,
  borderColor: CARD_BORDER_V2,
  borderRadius: RADIUS_LG,
};

/** Cinta oscura de Asistencia (docente). Sin radio — lo pone el componente. */
export const RIBBON_SURFACE: ViewStyle = {
  backgroundColor: RIBBON_BACKGROUND,
  ...SHADOW_RIBBON,
};

/** Botón de ícono dentro de filas/cards (ver, editar, eliminar). */
export const ROW_ACTION_BTN: ViewStyle = {
  backgroundColor: SURFACE_SUBTLE,
  borderRadius: RADIUS_SM,
};

/** Segmento activo del segmented de filtros. */
export const SEGMENT_ACTIVE: ViewStyle = {
  backgroundColor: PRIMARY_COLOR,
  ...SHADOW_PRIMARY,
};

/**
 * Pestaña en reposo de las barras de pestañas con ícono (Jornada/Almuerzo/
 * Break de Ponche ADM, tabs del formulario de Usuarios). La activa pisa
 * después con SEGMENT_ACTIVE.
 */
export const TAB_BTN_SURFACE: ViewStyle = {
  backgroundColor: PRIMARY_TINT_50,
  borderRadius: RADIUS_LG,
};

/** Colores del <Switch> (props, no ViewStyle): <Switch {...SWITCH_COLORS} />. */
export const SWITCH_COLORS: Pick<SwitchProps, "trackColor" | "thumbColor"> = {
  trackColor: { false: SWITCH_TRACK_OFF, true: PRIMARY_COLOR },
  thumbColor: CARD_BACKGROUND,
};
