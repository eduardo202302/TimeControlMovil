import {
  getCenteredScrollOffset,
  getScrollIntoViewDelta,
  getVisibleViewport,
} from "../scrollIntoViewRules";

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

describe("getCenteredScrollOffset (tarjeta pedida en la fila horizontal)", () => {
  // Viewport 360, tarjetas de 156 con 10 de gap y 16 de padding inicial.
  it("tarjeta en el medio → queda centrada", () => {
    expect(getCenteredScrollOffset(514, 156, 360, 1500)).toBe(412);
  });
  it("primera tarjeta → no baja de 0", () => {
    expect(getCenteredScrollOffset(16, 156, 360, 1500)).toBe(0);
  });
  it("última tarjeta → no pasa del final del contenido", () => {
    expect(getCenteredScrollOffset(1328, 156, 360, 1500)).toBe(1140);
  });
  it("contenido más angosto que el viewport → 0", () => {
    expect(getCenteredScrollOffset(182, 156, 360, 340)).toBe(0);
  });
});
