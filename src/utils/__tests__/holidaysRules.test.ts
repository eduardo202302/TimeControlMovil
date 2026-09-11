// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import axios from "axios";
import {
  buildHolidayPayload,
  buildRangeHours,
  capitalizeDay,
  createHoliday,
  deleteHoliday,
  fetchHolidaysPage,
  formatHolidayDate,
  formatTimeShort,
  holidayDateKey,
  HOLIDAYS_ROWS,
  isHolidayEditable,
  parseRangeHours,
  patchHoliday,
  type Holiday,
} from "../holidaysRules";

jest.mock("axios");

const mockedGet = axios.get as unknown as jest.Mock;
const mockedPost = axios.post as unknown as jest.Mock;
const mockedPatch = axios.patch as unknown as jest.Mock;
const mockedDelete = axios.delete as unknown as jest.Mock;

const URL = "https://timecontrol.example.net:8600";
const TOKEN = "jwt.token.here";

/** 16:00 UTC = 12:00 en RD (UTC-4) — mismo anchor que adminPermissionRules.test.ts,
 * a mitad del día para no depender de la zona del runner cerca de medianoche. */
const NOW = new Date("2026-09-10T16:00:00.000Z");

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPatch.mockReset();
  mockedDelete.mockReset();
});

const holiday = (over: Partial<Holiday> = {}): Holiday => ({
  id: 1,
  schoolId: 5,
  admUserId: 12,
  holidayDate: "2026-09-11",
  name: "Feriado de prueba",
  day: "viernes",
  doublePayment: false,
  working: false,
  rangeHours: "",
  createdDate: "2026-01-01T10:00:00.000Z",
  applyLunch: false,
  isActive: true,
  ...over,
});

// ─── Fecha ──────────────────────────────────────────────────────────────────

describe("formatHolidayDate", () => {
  it("Date del picker → YYYY-MM-DD en hora RD", () => {
    expect(formatHolidayDate(NOW)).toBe("2026-09-10");
  });
});

describe("holidayDateKey", () => {
  it("recorta el sufijo horario, ej. de findById/insertAndFetch", () => {
    expect(holidayDateKey("2026-09-11T00:00:00.000Z")).toBe("2026-09-11");
  });

  it("una fecha ya corta se devuelve igual", () => {
    expect(holidayDateKey("2026-09-11")).toBe("2026-09-11");
  });

  it("null/undefined/vacío → string vacío, sin lanzar", () => {
    expect(holidayDateKey(null)).toBe("");
    expect(holidayDateKey(undefined)).toBe("");
    expect(holidayDateKey("")).toBe("");
  });
});

describe("isHolidayEditable", () => {
  it("hoy es editable (regla >=, no solo >)", () => {
    expect(isHolidayEditable("2026-09-10", NOW)).toBe(true);
  });

  it("una fecha futura es editable", () => {
    expect(isHolidayEditable("2026-09-11", NOW)).toBe(true);
  });

  it("una fecha pasada NO es editable", () => {
    expect(isHolidayEditable("2026-09-09", NOW)).toBe(false);
  });

  it("aplica el mismo recorte defensivo del sufijo horario antes de comparar", () => {
    expect(isHolidayEditable("2026-09-11T00:00:00.000Z", NOW)).toBe(true);
    expect(isHolidayEditable("2026-09-09T00:00:00.000Z", NOW)).toBe(false);
  });

  it("sin fecha no es editable", () => {
    expect(isHolidayEditable(null, NOW)).toBe(false);
    expect(isHolidayEditable("", NOW)).toBe(false);
  });
});

// ─── Día capitalizado ────────────────────────────────────────────────────────

describe("capitalizeDay", () => {
  it.each([
    ["lunes", "Lunes"],
    ["miércoles", "Miércoles"],
    ["sábado", "Sábado"],
    ["domingo", "Domingo"],
  ])("%p → %p — el backend lo manda en minúscula (getDayName)", (raw, expected) => {
    expect(capitalizeDay(raw)).toBe(expected);
  });

  it("vacío/null/undefined → string vacío", () => {
    expect(capitalizeDay("")).toBe("");
    expect(capitalizeDay(null)).toBe("");
    expect(capitalizeDay(undefined)).toBe("");
  });

  it("ya capitalizado no se altera", () => {
    expect(capitalizeDay("Lunes")).toBe("Lunes");
  });
});

// ─── Horario (rangeHours) ────────────────────────────────────────────────────

describe("formatTimeShort", () => {
  it.each([
    [new Date(2026, 0, 1, 8, 0), "8:00 am"],
    [new Date(2026, 0, 1, 0, 0), "12:00 am"],
    [new Date(2026, 0, 1, 12, 0), "12:00 pm"],
    [new Date(2026, 0, 1, 17, 5), "5:05 pm"],
    [new Date(2026, 0, 1, 23, 59), "11:59 pm"],
  ])("%p → %p", (date, expected) => {
    expect(formatTimeShort(date)).toBe(expected);
  });
});

describe("buildRangeHours / parseRangeHours", () => {
  it("construye el string exacto que espera el backend", () => {
    const start = new Date(2026, 0, 1, 8, 0);
    const end = new Date(2026, 0, 1, 17, 0);
    expect(buildRangeHours(start, end)).toBe("8:00 am - 5:00 pm");
  });

  it("parseRangeHours es el inverso de buildRangeHours", () => {
    const base = new Date(2026, 5, 1);
    const parsed = parseRangeHours("8:00 am - 5:00 pm", base);
    expect(parsed).not.toBeNull();
    expect(parsed!.start.getHours()).toBe(8);
    expect(parsed!.start.getMinutes()).toBe(0);
    expect(parsed!.end.getHours()).toBe(17);
    expect(parsed!.end.getMinutes()).toBe(0);
  });

  it("parsea medianoche y mediodía (12 am / 12 pm) correctamente", () => {
    const parsed = parseRangeHours("12:00 am - 12:00 pm");
    expect(parsed!.start.getHours()).toBe(0);
    expect(parsed!.end.getHours()).toBe(12);
  });

  it("un string vacío o inválido devuelve null", () => {
    expect(parseRangeHours("")).toBeNull();
    expect(parseRangeHours(null)).toBeNull();
    expect(parseRangeHours("no es un rango")).toBeNull();
  });
});

// ─── Payload ─────────────────────────────────────────────────────────────────

describe("buildHolidayPayload", () => {
  it("working=true: incluye rangeHours, applyLunch y doublePayment", () => {
    const payload = buildHolidayPayload({
      name: "  Año Nuevo  ",
      holidayDate: NOW,
      working: true,
      startTime: new Date(2026, 0, 1, 8, 0),
      endTime: new Date(2026, 0, 1, 17, 0),
      applyLunch: true,
      doublePayment: true,
    });
    expect(payload).toEqual({
      name: "Año Nuevo",
      holidayDate: "2026-09-10",
      working: true,
      rangeHours: "8:00 am - 5:00 pm",
      applyLunch: true,
      doublePayment: true,
    });
  });

  it("working=false: rangeHours/applyLunch/doublePayment se resetean aunque vengan en true", () => {
    const payload = buildHolidayPayload({
      name: "Domingo Ramos",
      holidayDate: NOW,
      working: false,
      startTime: new Date(2026, 0, 1, 8, 0),
      endTime: new Date(2026, 0, 1, 17, 0),
      applyLunch: true,
      doublePayment: true,
    });
    expect(payload).toEqual({
      name: "Domingo Ramos",
      holidayDate: "2026-09-10",
      working: false,
      rangeHours: "",
      applyLunch: false,
      doublePayment: false,
    });
  });

  it("working=true sin startTime/endTime → rangeHours vacío (no debería pasar validado, pero no lanza)", () => {
    const payload = buildHolidayPayload({
      name: "X",
      holidayDate: NOW,
      working: true,
      startTime: null,
      endTime: null,
      applyLunch: false,
      doublePayment: false,
    });
    expect(payload.rangeHours).toBe("");
  });
});

// ─── Red: listado ────────────────────────────────────────────────────────────

describe("fetchHolidaysPage", () => {
  const body = (items: unknown[], count?: number) => ({
    data: { success: true, data: { items, count: count ?? items.length } },
  });

  it("pega a GET /holidays con los params por defecto", async () => {
    mockedGet.mockResolvedValue(body([holiday()]));

    await fetchHolidaysPage({ token: TOKEN, urlColegio: URL });

    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/holidays`);
    expect(mockedGet.mock.calls[0][1].params).toEqual({
      page: 1,
      rows: HOLIDAYS_ROWS,
      orderKey: "id",
      orderDir: "desc",
      isActive: 1,
    });
    expect(mockedGet.mock.calls[0][1].headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('isActive:"false" manda 0, y "all" no manda el filtro — mismo criterio que el webapp', async () => {
    mockedGet.mockResolvedValue(body([]));

    await fetchHolidaysPage({ token: TOKEN, urlColegio: URL, isActive: "false" });
    expect(mockedGet.mock.calls[0][1].params.isActive).toBe(0);

    await fetchHolidaysPage({ token: TOKEN, urlColegio: URL, isActive: "all" });
    expect(mockedGet.mock.calls[1][1].params).not.toHaveProperty("isActive");
  });

  it("normaliza holidayDate con sufijo horario en cada item de la página", async () => {
    mockedGet.mockResolvedValue(body([holiday({ holidayDate: "2026-09-11T00:00:00.000Z" })]));

    const page = await fetchHolidaysPage({ token: TOKEN, urlColegio: URL });

    expect(page.items[0].holidayDate).toBe("2026-09-11");
  });

  it("success:false → página vacía, sin lanzar", async () => {
    mockedGet.mockResolvedValue({ data: { success: false, message: {} } });

    const page = await fetchHolidaysPage({ token: TOKEN, urlColegio: URL });

    expect(page).toEqual({ items: [], count: null, hasMore: false });
  });

  it("hasMore: página llena y count pendiente → true; página corta → false", async () => {
    const full = Array.from({ length: HOLIDAYS_ROWS }, (_, i) => holiday({ id: i + 1 }));
    mockedGet.mockResolvedValueOnce(body(full, 40));
    expect((await fetchHolidaysPage({ token: TOKEN, urlColegio: URL })).hasMore).toBe(true);

    mockedGet.mockResolvedValueOnce(body([holiday()], 40));
    expect(
      (await fetchHolidaysPage({ token: TOKEN, urlColegio: URL, page: 3 })).hasMore,
    ).toBe(false);
  });
});

// ─── Red: mutaciones ─────────────────────────────────────────────────────────

describe("createHoliday / patchHoliday", () => {
  it("createHoliday: POST /holidays con el payload, ok:true en éxito", async () => {
    mockedPost.mockResolvedValue({ data: { success: true, data: holiday() } });

    const result = await createHoliday({
      token: TOKEN,
      urlColegio: URL,
      payload: { name: "Año Nuevo", holidayDate: "2026-01-01" },
    });

    expect(result.ok).toBe(true);
    expect(mockedPost).toHaveBeenCalledWith(
      `${URL}/holidays`,
      { name: "Año Nuevo", holidayDate: "2026-01-01" },
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
  });

  it("ER_DUP_ENTRY: success:false con HTTP 200 — el mensaje del backend viaja TAL CUAL", async () => {
    const message = "Ya existe un feriado para esa fecha";
    mockedPost.mockResolvedValue({ data: { success: false, message } });

    const result = await createHoliday({
      token: TOKEN,
      urlColegio: URL,
      payload: { name: "Duplicado", holidayDate: "2026-01-01" },
    });

    expect(result).toEqual({ ok: false, message, data: null });
  });

  it("patchHoliday: PATCH /holidays/{id}, mismo manejo de ER_DUP_ENTRY", async () => {
    const message = "Ya existe un feriado para esa fecha";
    mockedPatch.mockResolvedValue({ data: { success: false, message } });

    const result = await patchHoliday({
      token: TOKEN,
      urlColegio: URL,
      id: 7,
      payload: { holidayDate: "2026-01-01" },
    });

    expect(result).toEqual({ ok: false, message, data: null });
    expect(mockedPatch).toHaveBeenCalledWith(
      `${URL}/holidays/7`,
      { holidayDate: "2026-01-01" },
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
  });

  it("un error de red se devuelve como ok:false con el mensaje del backend", async () => {
    mockedPost.mockRejectedValue({ response: { data: { message: "Sin permiso" } } });
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await createHoliday({ token: TOKEN, urlColegio: URL, payload: {} });

    expect(result).toEqual({ ok: false, message: "Sin permiso", data: null });
  });
});

describe("deleteHoliday", () => {
  it("DELETE /holidays/{id}, ok:true en éxito", async () => {
    mockedDelete.mockResolvedValue({ data: { success: true, message: "Successfully Deleted UserHoliday." } });

    const result = await deleteHoliday({ token: TOKEN, urlColegio: URL, id: 7 });

    expect(result.ok).toBe(true);
    expect(mockedDelete.mock.calls[0][0]).toBe(`${URL}/holidays/7`);
  });

  it("un error de red se devuelve como ok:false", async () => {
    mockedDelete.mockRejectedValue(new Error("network down"));
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await deleteHoliday({ token: TOKEN, urlColegio: URL, id: 7 });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("network down");
  });
});
