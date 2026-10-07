/// <reference types="jest" />
import { resolveSelectedCategory } from "../punchRules";

type Category = "Jornada" | "Almuerzo" | "Break";

describe("resolveSelectedCategory", () => {
  test("la seleccionada sigue visible → se mantiene", () => {
    expect(
      resolveSelectedCategory<Category>("Almuerzo", [
        "Jornada",
        "Break",
        "Almuerzo",
      ]),
    ).toBe("Almuerzo");
  });

  test("la seleccionada ya no es visible → primera visible", () => {
    expect(
      resolveSelectedCategory<Category>("Almuerzo", ["Jornada", "Break"]),
    ).toBe("Jornada");
  });

  test("única visible Break con Jornada seleccionada → Break", () => {
    // Fila de categorías oculta: sin esto el botón de Break no aparece.
    expect(resolveSelectedCategory<Category>("Jornada", ["Break"])).toBe(
      "Break",
    );
  });

  test("ninguna visible → sin cambio", () => {
    expect(resolveSelectedCategory<Category>("Break", [])).toBe("Break");
  });
});
