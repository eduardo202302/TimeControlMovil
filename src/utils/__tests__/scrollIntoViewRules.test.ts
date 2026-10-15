import { getScrollIntoViewDelta, getVisibleViewport } from "../scrollIntoViewRules";

describe("getVisibleViewport", () => {
  it("sin teclado → el marco del ScrollView", () => {
    expect(getVisibleViewport(100, 600, null)).toEqual({ top: 100, bottom: 700 });
  });
  it("teclado por encima del borde inferior → recorta hasta el teclado", () => {
    expect(getVisibleViewport(100, 600, 450)).toEqual({ top: 100, bottom: 450 });
  });
  it("teclado por debajo del ScrollView (ya achicado por KeyboardAvoidingView) → sin recorte", () => {
    expect(getVisibleViewport(100, 300, 450)).toEqual({ top: 100, bottom: 400 });
  });
});

describe("getScrollIntoViewDelta", () => {
  const viewport = { top: 100, bottom: 500 };
  const margin = 16;

  it("ya visible con su margen → 0", () => {
    expect(getScrollIntoViewDelta({ top: 200, bottom: 300 }, viewport, margin)).toBe(0);
  });
  it("tapado por abajo (p. ej. el teclado) → baja lo justo", () => {
    expect(getScrollIntoViewDelta({ top: 450, bottom: 550 }, viewport, margin)).toBe(66);
  });
  it("tapado por arriba → sube lo justo (negativo)", () => {
    expect(getScrollIntoViewDelta({ top: 60, bottom: 160 }, viewport, margin)).toBe(-56);
  });
  it("más alto que el hueco → alinea su borde superior", () => {
    expect(getScrollIntoViewDelta({ top: 300, bottom: 900 }, viewport, margin)).toBe(184);
    expect(getScrollIntoViewDelta({ top: 20, bottom: 700 }, viewport, margin)).toBe(-96);
  });
  it("justo en el borde con margen → 0", () => {
    expect(getScrollIntoViewDelta({ top: 116, bottom: 484 }, viewport, margin)).toBe(0);
  });
});
