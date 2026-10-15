import { Keyboard, type HostInstance, type ScrollView } from "react-native";
import { getScrollIntoViewDelta, getVisibleViewport } from "../../utils/scrollIntoViewRules";

/** Aire entre el elemento y el borde visible (o el teclado). */
const SCROLL_MARGIN = 16;

interface WindowRect {
  y: number;
  height: number;
}

function measure(node: Pick<HostInstance, "measureInWindow">): Promise<WindowRect> {
  return new Promise((resolve) =>
    node.measureInWindow((_x, y, _width, height) => resolve({ y, height })),
  );
}

/**
 * Desplaza `scrollView` lo justo para que `target` quede a la vista, por
 * encima del teclado si está abierto. Todo se mide en la ventana: el scroll
 * actual es lo que el contenido subió respecto del marco del ScrollView, así
 * la pantalla no tiene que seguir onScroll. Sin refs montadas, no hace nada.
 */
export async function scrollIntoView(
  scrollView: ScrollView | null | undefined,
  target: Pick<HostInstance, "measureInWindow"> | null | undefined,
): Promise<void> {
  const frameNode = scrollView?.getNativeScrollRef();
  // getInnerViewRef existe en ScrollView.js (ScrollViewImperativeMethods) pero no en su .d.ts.
  const contentNode = (
    scrollView as unknown as { getInnerViewRef?: () => HostInstance | null } | null | undefined
  )?.getInnerViewRef?.();
  if (!scrollView || !frameNode || !contentNode || !target) return;

  const [frame, content, rect] = await Promise.all([
    measure(frameNode),
    measure(contentNode),
    measure(target),
  ]);
  const keyboardTop = Keyboard.isVisible() ? (Keyboard.metrics()?.screenY ?? null) : null;
  const viewport = getVisibleViewport(frame.y, frame.height, keyboardTop);
  const delta = getScrollIntoViewDelta(
    { top: rect.y, bottom: rect.y + rect.height },
    viewport,
    SCROLL_MARGIN,
  );
  if (delta === 0) return;
  const currentOffset = frame.y - content.y;
  scrollView.scrollTo({ y: Math.max(0, currentOffset + delta), animated: true });
}
