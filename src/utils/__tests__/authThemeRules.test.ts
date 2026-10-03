// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import {
  contrastRatio,
  DEFAULT_AUTH_THEME,
  isHexColor,
  resolveAuthTheme,
} from "../authThemeRules";
import type { SchoolColors } from "../../../types/typeStore/SchoolStoreType";

const withColors = (colors: SchoolColors | undefined) => ({
  settings: { colors },
});

describe("defaults", () => {
  it("son los valores actuales del login", () => {
    expect(DEFAULT_AUTH_THEME).toEqual({
      buttonBackground: "#2563EB",
      buttonText: "#FFFFFF",
      titleColor: "#333333",
      buttonShadowColor: "#2563EB",
    });
  });

  it("school null / undefined devuelve los defaults", () => {
    expect(resolveAuthTheme(null)).toEqual(DEFAULT_AUTH_THEME);
    expect(resolveAuthTheme(undefined)).toEqual(DEFAULT_AUTH_THEME);
  });

  it("sin settings o sin settings.colors devuelve los defaults", () => {
    expect(resolveAuthTheme({})).toEqual(DEFAULT_AUTH_THEME);
    expect(resolveAuthTheme({ settings: null })).toEqual(DEFAULT_AUTH_THEME);
    expect(resolveAuthTheme({ settings: {} })).toEqual(DEFAULT_AUTH_THEME);
    expect(resolveAuthTheme(withColors(undefined))).toEqual(DEFAULT_AUTH_THEME);
  });

  it("colors vacío devuelve los defaults", () => {
    expect(resolveAuthTheme(withColors({}))).toEqual(DEFAULT_AUTH_THEME);
  });
});

describe("isHexColor", () => {
  it.each(["#fff", "#FFF", "#2f3293", "#2F3293", "#001e4C"])(
    "acepta %s",
    (value) => expect(isHexColor(value)).toBe(true),
  );

  it.each([
    "undefined",
    "",
    "red",
    "#ff",
    "#ffff",
    "#fffff",
    "#fffffff",
    "2f3293",
    "#gggggg",
    " #fff",
    null,
    undefined,
    123,
  ])("rechaza %p", (value) => expect(isHexColor(value)).toBe(false));
});

describe("hex válidos", () => {
  it("usa la paleta por defecto del webapp tal cual", () => {
    // Valores de DEFAULT_COMPANY_COLORS en face-class-web.
    const theme = resolveAuthTheme(
      withColors({
        logoPrimary: "#2f3293",
        logoPrimaryText: "#ffffff",
        headerModal: "#001e4c",
      }),
    );
    expect(theme).toEqual({
      buttonBackground: "#2f3293",
      buttonText: "#ffffff",
      titleColor: "#001e4c",
      buttonShadowColor: "#2f3293",
    });
  });

  it("acepta la forma corta #RGB y mayúsculas", () => {
    const theme = resolveAuthTheme(
      withColors({ logoPrimary: "#FC0", logoPrimaryText: "#000", headerModal: "#A00" }),
    );
    expect(theme.buttonBackground).toBe("#FC0");
    expect(theme.buttonText).toBe("#000");
    expect(theme.buttonShadowColor).toBe("#FC0");
    expect(theme.titleColor).toBe("#A00");
  });

  it("ignora las claves que no usa", () => {
    const theme = resolveAuthTheme(
      withColors({ button: "#ff0000", header: "#00ff00", panel: "#0000ff" }),
    );
    expect(theme).toEqual(DEFAULT_AUTH_THEME);
  });
});

describe("hex inválidos caen al default de cada clave", () => {
  it.each(["undefined", "", "red", "#12345", "#1234567"])(
    "logoPrimary %p → botón por defecto",
    (bad) => {
      const theme = resolveAuthTheme(
        withColors({ logoPrimary: bad, logoPrimaryText: "#000000" }),
      );
      expect(theme.buttonBackground).toBe(DEFAULT_AUTH_THEME.buttonBackground);
      expect(theme.buttonText).toBe(DEFAULT_AUTH_THEME.buttonText);
      expect(theme.buttonShadowColor).toBe(
        DEFAULT_AUTH_THEME.buttonShadowColor,
      );
    },
  );

  it.each(["undefined", "", "red", "#12"])(
    "headerModal %p → título por defecto",
    (bad) => {
      const theme = resolveAuthTheme(withColors({ headerModal: bad }));
      expect(theme.titleColor).toBe(DEFAULT_AUTH_THEME.titleColor);
    },
  );

  it("un inválido no arrastra a los válidos", () => {
    const theme = resolveAuthTheme(
      withColors({ logoPrimary: "red", headerModal: "#001e4c" }),
    );
    expect(theme.buttonBackground).toBe(DEFAULT_AUTH_THEME.buttonBackground);
    expect(theme.titleColor).toBe("#001e4c");
  });

  it("tolera valores que no son string en runtime", () => {
    const colors = { logoPrimary: null, headerModal: 42 } as unknown as SchoolColors;
    expect(resolveAuthTheme(withColors(colors))).toEqual(DEFAULT_AUTH_THEME);
  });
});

describe("solo uno de los dos colores del botón", () => {
  it("logoPrimary oscuro sin logoPrimaryText → texto blanco", () => {
    const theme = resolveAuthTheme(withColors({ logoPrimary: "#2f3293" }));
    expect(theme.buttonBackground).toBe("#2f3293");
    expect(theme.buttonText).toBe("#FFFFFF");
    expect(theme.buttonShadowColor).toBe("#2f3293");
  });

  it("logoPrimary claro sin logoPrimaryText → texto negro", () => {
    const theme = resolveAuthTheme(withColors({ logoPrimary: "#ffd400" }));
    expect(theme.buttonBackground).toBe("#ffd400");
    expect(theme.buttonText).toBe("#000000");
  });

  it("logoPrimaryText inválido se trata como ausente", () => {
    const theme = resolveAuthTheme(
      withColors({ logoPrimary: "#ffd400", logoPrimaryText: "undefined" }),
    );
    expect(theme.buttonText).toBe("#000000");
  });

  it("solo logoPrimaryText → botón por defecto completo", () => {
    const theme = resolveAuthTheme(withColors({ logoPrimaryText: "#000000" }));
    expect(theme.buttonBackground).toBe(DEFAULT_AUTH_THEME.buttonBackground);
    expect(theme.buttonText).toBe(DEFAULT_AUTH_THEME.buttonText);
  });
});

describe("bajo contraste", () => {
  it("botón: mantiene el fondo y elige blanco/negro por luminancia", () => {
    // Blanco sobre amarillo ≈ 1.4:1.
    const light = resolveAuthTheme(
      withColors({ logoPrimary: "#ffd400", logoPrimaryText: "#ffffff" }),
    );
    expect(light.buttonBackground).toBe("#ffd400");
    expect(light.buttonText).toBe("#000000");

    // Azul marino sobre azul marino.
    const dark = resolveAuthTheme(
      withColors({ logoPrimary: "#001e4c", logoPrimaryText: "#2c315b" }),
    );
    expect(dark.buttonBackground).toBe("#001e4c");
    expect(dark.buttonText).toBe("#FFFFFF");
  });

  it("botón: un par justo en 3:1 o más se respeta", () => {
    const bg = "#767676";
    expect(contrastRatio(bg, "#000000")).toBeGreaterThanOrEqual(3);
    const theme = resolveAuthTheme(
      withColors({ logoPrimary: bg, logoPrimaryText: "#000000" }),
    );
    expect(theme.buttonText).toBe("#000000");
  });

  it("título: headerModal claro contra la tarjeta blanca → default", () => {
    const theme = resolveAuthTheme(withColors({ headerModal: "#c9cbe4" }));
    expect(theme.titleColor).toBe(DEFAULT_AUTH_THEME.titleColor);
  });
});

describe("contrastRatio", () => {
  it("blanco vs negro = 21, mismo color = 1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#2563EB", "#2563eb")).toBeCloseTo(1, 5);
  });

  it("es simétrico", () => {
    expect(contrastRatio("#2f3293", "#fff")).toBeCloseTo(
      contrastRatio("#fff", "#2f3293"),
      10,
    );
  });
});
