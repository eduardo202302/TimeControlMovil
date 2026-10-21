import { RADIUS_SM } from "@/constants/responsive";

/**
 * Medidas del diseño compacto de Reportar, todas en un solo lugar. Son los
 * valores BASE: cada estilo los pasa por scale / verticalScale / font.
 */

/** Área táctil mínima de los controles que se achican en Reportar. */
export const REPORT_TOUCH_MIN = 44;

/** Cuánto del aire original queda dentro de las tarjetas (padding, título → contenido, entre elementos). */
export const REPORT_INNER_FACTOR = 1;

/** Medida original con el factor de dentro de tarjeta. */
const inner = (original: number) => original * REPORT_INNER_FACTOR;

export const REPORT_LAYOUT = {
  // Bordes de la pantalla: los originales. Entre tarjetas: original (14) + 10 %.
  screenPadding: 16,
  screenPaddingBottom: 24,
  cardGap: 14 * 1.1,

  // Padding interno de las tarjetas.
  cardPaddingH: inner(16),
  cardPaddingTop: inner(14),
  cardPaddingBottom: inner(16),

  // Título: ícono ↔ texto y título → contenido.
  headerGap: inner(8),
  headerMarginBottom: inner(14),

  // Entre elementos dentro de una tarjeta.
  noticeMarginTop: inner(8),
  noticePaddingV: inner(8),
  hintMarginTop: inner(10),
  hintPaddingH: inner(12),
  hintPaddingV: inner(6),
  hintDividerSpace: inner(6),
  reporterMarginTop: inner(8),
  addBtnMarginTop: inner(12),
  addressRowMarginBottom: inner(8),
  addressChipsMarginTop: inner(10),

  // Comentarios (tarjeta y formulario).
  addComposerMarginBottom: inner(12),
  commentListGap: inner(8),
  commentPadding: inner(12),
  composerGap: inner(12),
  composerPadding: inner(12),

  // Título: un punto más que el texto de los campos (14).
  titleFontSize: 16,
  titleIconSide: 22,
  titleIconGlyph: 14,

  // Cuadros de texto multilínea (descripción y comentario).
  multilineLineHeight: 20,
  multilinePaddingV: 10,
} as const;

/**
 * Título de tarjeta en Reportar: el cuadrito del ícono mide lo mismo que la
 * línea del título (quedan alineados) y conserva la forma de SectionIcon
 * (radio RADIUS_SM sobre 32 → ¼ del lado).
 */
export function reportTitleMetrics(font: (size: number) => number) {
  const side = font(REPORT_LAYOUT.titleIconSide);
  return {
    fontSize: font(REPORT_LAYOUT.titleFontSize),
    lineHeight: side,
    side,
    glyph: font(REPORT_LAYOUT.titleIconGlyph),
    radius: Math.round((side * RADIUS_SM) / 32),
  };
}

/**
 * Cuadro de texto multilínea compacto: arranca en 2 líneas y crece al
 * escribir hasta 5; de ahí en más hace scroll interno. El alto incluye el
 * borde de FIELD_SURFACE (1 arriba y 1 abajo).
 */
export function reportMultilineStyle(
  scale: (size: number) => number,
  font: (size: number) => number,
) {
  const lineHeight = font(REPORT_LAYOUT.multilineLineHeight);
  const paddingVertical = scale(REPORT_LAYOUT.multilinePaddingV);
  const chrome = paddingVertical * 2 + 2;
  return {
    lineHeight,
    paddingVertical,
    minHeight: lineHeight * 2 + chrome,
    maxHeight: lineHeight * 5 + chrome,
  };
}
