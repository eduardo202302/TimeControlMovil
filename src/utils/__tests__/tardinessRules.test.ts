// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import axios from "axios";
import {
  buildStudentSearchParams,
  buildTardinessDateTime,
  createTardiness,
  extractTableRows,
  getStudentTardiness,
  identifyStudentByFace,
  searchStudents,
  STUDENT_SEARCH_FIELDS,
  tardinessColorAt,
  tardinessLightOrder,
  toStudentDetail,
  toStudentOption,
  type StudentDetail,
  type StudentOption,
} from "../tardinessRules";

jest.mock("axios");

const mockedGet = axios.get as unknown as jest.Mock;
const mockedPost = axios.post as unknown as jest.Mock;

const URL = "https://timecontrol.example.net:8600";
const TOKEN = "jwt.token.here";

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
});

const studentRow = (over: Record<string, unknown> = {}) => ({
  id: 42,
  fullName: "María Pérez",
  code: "S-042",
  photourl: "/photos/s42.jpg",
  course: [{ fullName: "2do B", listNumber: 5 }],
  ...over,
});

// ─── Fecha del payload ─────────────────────────────────────────────────────────

describe("buildTardinessDateTime", () => {
  test("dateTime con padStart en cada parte", () => {
    // TZ env = UTC en jest: hora local == hora UTC.
    const date = new Date(2026, 8, 4, 9, 5, 7);
    expect(buildTardinessDateTime(date)).toBe("2026-09-04 09:05:07");
  });

  test("padStart aplica también a decenas (1 → 01) y a medianoche", () => {
    const date = new Date(2026, 0, 2, 0, 0, 0);
    expect(buildTardinessDateTime(date)).toBe("2026-01-02 00:00:00");
  });
});

// ─── Semáforo ──────────────────────────────────────────────────────────────────

describe("tardinessLightOrder", () => {
  test("daysLateAbsence === 4 agrega la luz azul (replica exacta del webapp)", () => {
    expect(tardinessLightOrder(4)).toEqual(["blue", "green", "yellow", "red"]);
  });

  test("cualquier otro valor usa las 3 luces (green, yellow, red)", () => {
    expect(tardinessLightOrder(3)).toEqual(["green", "yellow", "red"]);
    expect(tardinessLightOrder(5)).toEqual(["green", "yellow", "red"]);
  });
});

describe("tardinessColorAt", () => {
  test("pinta por índice dentro del orden", () => {
    expect(tardinessColorAt(0, 3)).toBe("#16A34A"); // green
    expect(tardinessColorAt(1, 3)).toBe("#EAB308"); // yellow
    expect(tardinessColorAt(2, 3)).toBe("#DC2626"); // red
    expect(tardinessColorAt(0, 4)).toBe("#2563EB"); // blue
  });

  test("los registros que sobran del orden quedan en rojo, sin ciclo", () => {
    expect(tardinessColorAt(3, 3)).toBe("#DC2626");
    expect(tardinessColorAt(10, 3)).toBe("#DC2626");
    expect(tardinessColorAt(4, 4)).toBe("#DC2626");
  });
});

// ─── Normalización ─────────────────────────────────────────────────────────────

describe("toStudentOption", () => {
  test("fila completa de GET /students → StudentOption", () => {
    const option = toStudentOption(studentRow());
    expect(option).toEqual({
      id: 42,
      fullName: "María Pérez",
      code: "S-042",
      photourl: "/photos/s42.jpg",
      course: [{ fullName: "2do B", listNumber: 5 }],
      parents: [],
    } satisfies StudentOption | null);
  });

  test("parents se normaliza con nombres alternos (name, relationship, telephone)", () => {
    const option = toStudentOption(
      studentRow({
        parents: [
          {
            name: "Juan Pérez",
            relationship: "Padre",
            telephone: "8091234567",
          },
          { fullName: "Ana Gómez", parentRelationship: "Madre", phone: null },
        ],
      }),
    );
    expect(option?.parents).toEqual([
      {
        fullName: "Juan Pérez",
        parentRelationship: "Padre",
        phone: "8091234567",
      },
      { fullName: "Ana Gómez", parentRelationship: "Madre", phone: null },
    ]);
  });

  test("s3Photo como respaldo cuando no hay photourl", () => {
    const option = toStudentOption(studentRow({ photourl: null, s3Photo: "/s3/42.jpg" }));
    expect(option?.photourl).toBe("/s3/42.jpg");
  });

  test("sin id numérico → null (no hay a quién registrar la tardanza)", () => {
    expect(toStudentOption(studentRow({ id: "no" }))).toBeNull();
    expect(toStudentOption(null)).toBeNull();
  });

  test("course como objeto suelto también se normaliza a arreglo", () => {
    const option = toStudentOption(
      studentRow({ course: { fullName: "3ro A" } }),
    );
    expect(option?.course).toEqual([{ fullName: "3ro A", listNumber: null }]);
  });
});

describe("toStudentDetail", () => {
  it("envuelve student con tardiness y tardinessCount cuando vienen", () => {
    const raw = studentRow({
      tardiness: [{ id: 1, date: "2026-09-10 08:15:00" }],
      tardinessCount: 1,
    });
    const detail = toStudentDetail(raw);
    expect(detail?.tardiness).toHaveLength(1);
    expect(detail?.tardinessCount).toBe(1);
  });

  it("deriva tardinessCount de la lista si el backend no la manda", () => {
    const detail = toStudentDetail(
      studentRow({ tardiness: [{ id: 1 }, { id: 2 }] }),
    );
    expect(detail?.tardinessCount).toBe(2);
  });

  it("sin id en el student → null", () => {
    expect(toStudentDetail(studentRow({ id: undefined }))).toBeNull();
  });
});

// ─── Tabla genérica ────────────────────────────────────────────────────────────

describe("extractTableRows", () => {
  test("acepta arreglo directo, data, items y rows anidadas", () => {
    expect(extractTableRows([1])).toEqual([1]);
    expect(extractTableRows({ data: [1] })).toEqual([1]);
    expect(extractTableRows({ rows: [1] })).toEqual([1]);
    expect(extractTableRows({ items: [1] })).toEqual([1]);
    expect(extractTableRows({ items: { rows: [1] } })).toEqual([1]);
    expect(extractTableRows({ foo: 1 })).toEqual([]);
    expect(extractTableRows(null)).toEqual([]);
  });
});

// ─── Red ───────────────────────────────────────────────────────────────────────

describe("buildStudentSearchParams", () => {
  test("all + fields exactos pedidos + orderKey fullName", () => {
    expect(buildStudentSearchParams({ query: "mar" })).toEqual({
      all: "mar",
      fields: STUDENT_SEARCH_FIELDS,
      rows: 10,
      page: 1,
      orderKey: "fullName",
    });
    expect(STUDENT_SEARCH_FIELDS).toBe("fullName,code,id,course.fullName");
  });
});

describe("searchStudents", () => {
  test("success → filas normalizadas", async () => {
    mockedGet.mockResolvedValueOnce({
      data: { success: true, data: { items: [studentRow()] } },
    });
    const result = await searchStudents("mar", { token: TOKEN, urlColegio: URL });
    expect(mockedGet).toHaveBeenCalledWith(`${URL}/students`, expect.objectContaining({ params: expect.any(Object) }));
    expect(result).toEqual([
      expect.objectContaining({ id: 42, fullName: "María Pérez" }),
    ] satisfies StudentOption[]);
  });

  test("success false o error de red → []", async () => {
    mockedGet.mockResolvedValueOnce({ data: { success: false } });
    mockedGet.mockRejectedValueOnce(new Error("network"));
    expect(await searchStudents("mar", { token: TOKEN, urlColegio: URL })).toEqual([]);
    expect(await searchStudents("mar", { token: TOKEN, urlColegio: URL })).toEqual([]);
  });
});

describe("identifyStudentByFace", () => {
  const faceStudent = studentRow({
    tardiness: [{ id: 1, date: "2026-09-10 08:15:00" }],
    tardinessCount: 1,
  });

  test("success → recognitionData + student completo", async () => {
    mockedPost.mockResolvedValueOnce({
      data: {
        success: true,
        message: "Estudiante identificado correctamente",
        data: {
          recognitionData: { studentId: 42, similarity: 98.1, faceId: "face-1" },
          student: faceStudent,
        },
      },
    });
    const result = await identifyStudentByFace("data:image/jpeg;base64,AAA", {
      token: TOKEN,
      urlColegio: URL,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recognitionData?.studentId).toBe(42);
      expect(result.data.student).toEqual(
        expect.objectContaining({ tardinessCount: 1 }) as StudentDetail,
      );
    }
  });

  test("success false → expone el mensaje real del backend", async () => {
    mockedPost.mockResolvedValueOnce({
      data: { success: false, message: "No se reconoció ningún estudiante en la imagen" },
    });
    const result = await identifyStudentByFace("AAA", { token: TOKEN, urlColegio: URL });
    expect(result).toEqual({
      ok: false,
      message: "No se reconoció ningún estudiante en la imagen",
    });
  });

  test("error de red → mensaje del response si existe, si no 'Error de conexión.'", async () => {
    mockedPost.mockRejectedValueOnce({
      response: { data: { message: "La imagen es requerida" } },
    });
    mockedPost.mockRejectedValueOnce(new Error("timeout"));
    expect(await identifyStudentByFace("AAA", { token: TOKEN, urlColegio: URL })).toEqual({
      ok: false,
      message: "La imagen es requerida",
    });
    expect(await identifyStudentByFace("AAA", { token: TOKEN, urlColegio: URL })).toEqual({
      ok: false,
      message: "Error de conexión.",
    });
  });
});

describe("getStudentTardiness", () => {
  test("success → data.student normalizado", async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        success: true,
        data: { student: studentRow({ tardiness: [], tardinessCount: 0 }) },
      },
    });
    const detail = await getStudentTardiness(42, { token: TOKEN, urlColegio: URL });
    expect(mockedGet).toHaveBeenCalledWith(
      `${URL}/tardiness/student/42`,
      expect.anything(),
    );
    expect(detail).toEqual(expect.objectContaining({ id: 42 }));
  });

  test("success false o error → null", async () => {
    mockedGet.mockResolvedValueOnce({ data: { success: false } });
    mockedGet.mockRejectedValueOnce(new Error("network"));
    expect(await getStudentTardiness(42, { token: TOKEN, urlColegio: URL })).toBeNull();
    expect(await getStudentTardiness(42, { token: TOKEN, urlColegio: URL })).toBeNull();
  });
});

describe("createTardiness", () => {
  test("Manual con hora escrita → envía date + time", async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: true } });
    const result = await createTardiness(
      { studentId: 42, tardinessMode: "Manual", time: "08:15" },
      { token: TOKEN, urlColegio: URL },
    );
    expect(result.ok).toBe(true);
    const [, body] = mockedPost.mock.calls[0];
    expect(body.studentId).toBe(42);
    expect(body.time).toBe("08:15");
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test("Automatica (o sin hora) → NO envía time, solo date", async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: true } });
    await createTardiness(
      { studentId: 7, tardinessMode: "Automatica", time: "08:15" },
      { token: TOKEN, urlColegio: URL },
    );
    const [, body] = mockedPost.mock.calls[0];
    expect(body.date).toBeDefined();
    expect("time" in body).toBe(false);
  });

  test("success false → expone el mensaje real del backend", async () => {
    mockedPost.mockResolvedValueOnce({
      data: { success: false, message: "El colegio no tiene configurada la hora de entrada (entryTime)." },
    });
    const result = await createTardiness(
      { studentId: 7, tardinessMode: "Automatica" },
      { token: TOKEN, urlColegio: URL },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe(
      "El colegio no tiene configurada la hora de entrada (entryTime).",
    );
  });

  test("error de red → fallback a Error de conexión", async () => {
    mockedPost.mockRejectedValueOnce(new Error("timeout"));
    const result = await createTardiness(
      { studentId: 7, tardinessMode: "Automatica" },
      { token: TOKEN, urlColegio: URL },
    );
    expect(result).toEqual({ ok: false, message: "Error de conexión." });
  });
});