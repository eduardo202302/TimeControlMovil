/// <reference types="jest" />
import { getPunchPhotoUrl } from "../punchRules";

const BASE = "https://colegio.example.com";

describe("getPunchPhotoUrl (ícono 'Ver imagen' del historial)", () => {
  test("string vacío → null", () => {
    expect(getPunchPhotoUrl({ photourl: "" }, BASE)).toBeNull();
    expect(getPunchPhotoUrl({ photourl: "   " }, BASE)).toBeNull();
  });

  test("null o ausente → null", () => {
    expect(getPunchPhotoUrl({ photourl: null }, BASE)).toBeNull();
    expect(getPunchPhotoUrl({}, BASE)).toBeNull();
  });

  test("array → usa el primer elemento", () => {
    expect(
      getPunchPhotoUrl({ photourl: ["punches/a.jpg", "punches/b.jpg"] }, BASE),
    ).toBe(`${BASE}/downloads/punches/a.jpg`);
    expect(getPunchPhotoUrl({ photourl: [] }, BASE)).toBeNull();
  });

  test("URL http(s) → tal cual", () => {
    const url = "https://cdn.example.com/punches/a.jpg";
    expect(getPunchPhotoUrl({ photourl: url }, BASE)).toBe(url);
    expect(getPunchPhotoUrl({ photourl: "http://x.test/a.jpg" }, BASE)).toBe(
      "http://x.test/a.jpg",
    );
  });

  test("data: URI → tal cual", () => {
    const uri = "data:image/jpeg;base64,/9j/4AAQ";
    expect(getPunchPhotoUrl({ photourl: uri }, BASE)).toBe(uri);
  });

  test("ruta relativa → `${baseUrl}/downloads/${photourl}`", () => {
    expect(getPunchPhotoUrl({ photourl: "punches/a.jpg" }, BASE)).toBe(
      `${BASE}/downloads/punches/a.jpg`,
    );
    // Mismas normalizaciones de barras que buildAttachmentUri.
    expect(getPunchPhotoUrl({ photourl: "/punches/a.jpg" }, `${BASE}/`)).toBe(
      `${BASE}/downloads/punches/a.jpg`,
    );
  });

  test("ruta relativa sin baseUrl → null (no hay URL que abrir)", () => {
    expect(getPunchPhotoUrl({ photourl: "punches/a.jpg" }, null)).toBeNull();
  });
});
