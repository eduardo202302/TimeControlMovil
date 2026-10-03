// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import {
  buildLastCompany,
  normalizeLogo,
  parseLastCompany,
  resolveLastCompany,
  serializeLastCompany,
  type LastCompany,
} from "../lastCompany";

const URL = "https://timecontrol.example.net:8600";
const OTHER_URL = "https://otro.example.net:8600";

const company: LastCompany = {
  v: 1,
  schoolId: 7,
  name: "Colegio Ejemplo",
  logo: "uploads/schools/7/logo.png",
  colors: {
    logoPrimary: "#2f3293",
    logoPrimaryText: "#ffffff",
    headerModal: "#001e4c",
  },
  urlColegio: URL,
};

const stored = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ ...company, ...overrides });

describe("roundtrip", () => {
  it("serialize → parse devuelve el mismo registro", () => {
    expect(parseLastCompany(serializeLastCompany(company))).toEqual(company);
  });

  it("serialize → resolve con el mismo urlColegio", () => {
    expect(resolveLastCompany(serializeLastCompany(company), URL)).toEqual(
      company,
    );
  });

  it("serialize no deja colar claves extra (tokens, settings…)", () => {
    const dirty = {
      ...company,
      token: "jwt.token.here",
      settings: { isImageRequired: true },
      colors: { ...company.colors, button: "#ff0000" },
    } as unknown as LastCompany;
    const json = JSON.parse(serializeLastCompany(dirty));
    expect(Object.keys(json).sort()).toEqual(
      ["colors", "logo", "name", "schoolId", "urlColegio", "v"].sort(),
    );
    expect(Object.keys(json.colors).sort()).toEqual(
      ["headerModal", "logoPrimary", "logoPrimaryText"].sort(),
    );
  });
});

describe("parseLastCompany", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["vacío", ""],
    ["JSON roto", "{not json"],
    ["array", "[]"],
    ["número", "42"],
    ["string JSON", '"hola"'],
    ["null JSON", "null"],
  ])("JSON inválido (%s) → null", (_label, raw) => {
    expect(parseLastCompany(raw as string | null | undefined)).toBeNull();
  });

  it.each([0, 2, "1", null, undefined])("versión %p → null", (v) => {
    expect(parseLastCompany(stored({ v }))).toBeNull();
  });

  it.each([undefined, null, "", "   ", 42])("name %p → null", (name) => {
    expect(parseLastCompany(stored({ name }))).toBeNull();
  });

  it("sin urlColegio → null", () => {
    expect(parseLastCompany(stored({ urlColegio: undefined }))).toBeNull();
    expect(parseLastCompany(stored({ urlColegio: "" }))).toBeNull();
  });

  it.each(["null", "undefined", "", "  ", null, 5])(
    'logo %p se normaliza a null',
    (logo) => {
      const parsed = parseLastCompany(stored({ logo }));
      expect(parsed).not.toBeNull();
      expect(parsed?.logo).toBeNull();
    },
  );

  it("colores inválidos se descartan uno a uno", () => {
    const parsed = parseLastCompany(
      stored({
        colors: {
          logoPrimary: "undefined",
          logoPrimaryText: "red",
          headerModal: "#001e4c",
        },
      }),
    );
    expect(parsed?.colors).toEqual({ headerModal: "#001e4c" });
  });

  it("colors que no es objeto → {}", () => {
    expect(parseLastCompany(stored({ colors: "nope" }))?.colors).toEqual({});
    expect(parseLastCompany(stored({ colors: null }))?.colors).toEqual({});
  });

  it("schoolId inválido → null (no descarta el registro)", () => {
    const parsed = parseLastCompany(stored({ schoolId: "7" }));
    expect(parsed?.schoolId).toBeNull();
    expect(parsed?.name).toBe("Colegio Ejemplo");
  });
});

describe("resolveLastCompany", () => {
  it("urlColegio distinto → null", () => {
    expect(resolveLastCompany(stored(), OTHER_URL)).toBeNull();
  });

  it("sin urlColegio actual → null", () => {
    expect(resolveLastCompany(stored(), null)).toBeNull();
    expect(resolveLastCompany(stored(), undefined)).toBeNull();
    expect(resolveLastCompany(stored(), "")).toBeNull();
  });

  it("tolera la barra final en cualquiera de los dos", () => {
    expect(resolveLastCompany(stored(), `${URL}/`)).not.toBeNull();
    expect(
      resolveLastCompany(stored({ urlColegio: `${URL}/` }), URL),
    ).not.toBeNull();
  });

  it("lo guardado inválido → null aunque coincida el servidor", () => {
    expect(resolveLastCompany("{roto", URL)).toBeNull();
    expect(resolveLastCompany(stored({ v: 2 }), URL)).toBeNull();
  });
});

describe("buildLastCompany", () => {
  const school = {
    id: 7,
    name: "  Colegio Ejemplo  ",
    logo: "uploads/schools/7/logo.png",
    email: null,
    settings: {
      isImageRequired: true,
      colors: {
        logoPrimary: "#2f3293",
        logoPrimaryText: "#ffffff",
        headerModal: "#001e4c",
        button: "#001e4c",
      },
    },
  };

  it("toma solo name, logo y los tres colores", () => {
    expect(buildLastCompany(school, URL)).toEqual(company);
  });

  it('logo "null" → null', () => {
    expect(buildLastCompany({ ...school, logo: "null" }, URL)?.logo).toBeNull();
    expect(buildLastCompany({ ...school, logo: null }, URL)?.logo).toBeNull();
  });

  it("sin colors → {}", () => {
    expect(
      buildLastCompany({ ...school, settings: {} }, URL)?.colors,
    ).toEqual({});
    expect(
      buildLastCompany({ ...school, settings: undefined }, URL)?.colors,
    ).toEqual({});
  });

  it("sin name, sin school o sin urlColegio → null", () => {
    expect(buildLastCompany({ ...school, name: "" }, URL)).toBeNull();
    expect(buildLastCompany(null, URL)).toBeNull();
    expect(buildLastCompany(undefined, URL)).toBeNull();
    expect(buildLastCompany(school, null)).toBeNull();
    expect(buildLastCompany(school, "")).toBeNull();
  });
});

describe("normalizeLogo", () => {
  it("recorta y conserva una ruta válida", () => {
    expect(normalizeLogo(" a/b.png ")).toBe("a/b.png");
  });
});
