/**
 * Cuánto desplazar un ScrollView para que un elemento quede a la vista.
 * Función pura (sin react-native) para testearla con jest; la medición vive
 * en src/components/tasker/scrollIntoView.ts.
 */

export interface VerticalSpan {
  /** Borde superior, en coordenadas de ventana. */
  top: number;
  /** Borde inferior, en coordenadas de ventana. */
  bottom: number;
}

/**
 * Desplazamiento vertical (positivo = bajar el contenido hacia arriba) para
 * que `target` quede dentro de `viewport` con `margin` de aire. Ya visible →
 * 0. Más alto que el hueco → se alinea su borde superior.
 */
export function getScrollIntoViewDelta(
  target: VerticalSpan,
  viewport: VerticalSpan,
  margin: number,
): number {
  const top = viewport.top + margin;
  const bottom = viewport.bottom - margin;
  if (target.bottom - target.top > bottom - top) return target.top - top;
  if (target.top < top) return target.top - top;
  if (target.bottom > bottom) return target.bottom - bottom;
  return 0;
}

/**
 * Hueco visible del ScrollView: su marco en la ventana, recortado por arriba
 * del teclado si está abierto (`keyboardTop` = screenY del teclado).
 */
export function getVisibleViewport(
  scrollTop: number,
  scrollHeight: number,
  keyboardTop: number | null,
): VerticalSpan {
  const bottom = scrollTop + scrollHeight;
  return { top: scrollTop, bottom: keyboardTop == null ? bottom : Math.min(bottom, keyboardTop) };
}
