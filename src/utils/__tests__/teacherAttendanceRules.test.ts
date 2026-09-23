// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import axios from "axios";
import type { TeacherAttendanceToday } from "../../../types/typeStore/SchoolStoreType";
import {
  currentWeekdayName,
  fetchTeacherAttendance,
  formatDayMonthYear,
  getCurrentSubject,
  hasAvailableClassesToday,
} from "../attendanceRules";

jest.mock("axios");

const mockedGet = axios.get as unknown as jest.Mock;

const URL = "https://timecontrol.example.net:8600";
const AUTH = { token: "jwt.token.here", urlColegio: URL };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

/**
 * jest.config.js fija TZ=UTC, así que estas fechas son deterministas.
 * 2026-09-21 es lunes; 2026-09-22, martes.
 */
const MONDAY = (h: number, m: number) => new Date(2026, 8, 21, h, m, 0);
const TUESDAY = (h: number, m: number) => new Date(2026, 8, 22, h, m, 0);

/**
 * Item de `teacherAttendancesToday`. Ojo con los dos pares de horas: las de
 * arriba son la ventana real de hoy y las de `schedule`, el horario semanal.
 */
function item(overrides: {
  id: number;
  weekday: string;
  startTime?: string | null;
  endTime?: string | null;
  subjectId?: number;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
}): TeacherAttendanceToday {
  const {
    id,
    weekday,
    startTime = "08:00:00",
    endTime = "09:00:00",
    subjectId = 11,
    scheduleStartTime = "07:00:00",
    scheduleEndTime = "07:45:00",
  } = overrides;
  return {
    id,
    scheduleId: id * 10,
    date: "2026-09-21",
    status: "pendiente",
    statistics: { presente: 0, tardanza: 0, ausente: 0, excusa: 0, total: 0, TardanzaEntrada: 0 },
    startTime,
    endTime,
    schedule: {
      id: id * 10,
      courseId: 2,
      subjectId,
      teacherId: 3,
      weekday,
      startTime: scheduleStartTime,
      endTime: scheduleEndTime,
      schoolId: 1,
      isActive: true,
      subject: { id: subjectId, name: `Materia ${subjectId}` },
      course: { id: 2, name: "1ro", section: "A", fullName: "1ro A" },
    },
  };
}

describe("currentWeekdayName", () => {
  test.each([
    [new Date(2026, 8, 20, 12, 0), "Domingo"],
    [new Date(2026, 8, 21, 12, 0), "Lunes"],
    [new Date(2026, 8, 22, 12, 0), "Martes"],
    [new Date(2026, 8, 23, 12, 0), "Miércoles"],
    [new Date(2026, 8, 24, 12, 0), "Jueves"],
    [new Date(2026, 8, 25, 12, 0), "Viernes"],
    [new Date(2026, 8, 26, 12, 0), "Sábado"],
  ])("%s → %s", (date, expected) => {
    expect(currentWeekdayName(date)).toBe(expected);
  });
});

describe("formatDayMonthYear (getTimeLabel 'D [de] MMMM [del] YYYY')", () => {
  test("Date → '22 de septiembre del 2026'", () => {
    expect(formatDayMonthYear(new Date(2026, 8, 22, 15, 0))).toBe("22 de septiembre del 2026");
  });

  test("acepta el string ISO que manda el backend en createdDate", () => {
    expect(formatDayMonthYear("2026-01-05T13:45:00.000Z")).toBe("5 de enero del 2026");
  });

  test("sin día de la semana, a diferencia del título de TeacherScheduleCard", () => {
    expect(formatDayMonthYear(new Date(2026, 8, 21, 8, 0))).not.toMatch(/Lunes/);
  });

  test("null, vacío o fecha inválida → cadena vacía", () => {
    expect(formatDayMonthYear(null)).toBe("");
    expect(formatDayMonthYear(undefined)).toBe("");
    expect(formatDayMonthYear("")).toBe("");
    expect(formatDayMonthYear("no es una fecha")).toBe("");
  });
});

describe("hasAvailableClassesToday", () => {
  const lunes = item({ id: 1, weekday: "Lunes" });

  test("lista vacía o no-array → null", () => {
    expect(hasAvailableClassesToday([], MONDAY(8, 30))).toBeNull();
    expect(hasAvailableClassesToday(null, MONDAY(8, 30))).toBeNull();
    expect(hasAvailableClassesToday(undefined, MONDAY(8, 30))).toBeNull();
  });

  test("dentro de la ventana devuelve el item", () => {
    expect(hasAvailableClassesToday([lunes], MONDAY(8, 30))?.id).toBe(1);
  });

  test("antes y después de la ventana → null", () => {
    expect(hasAvailableClassesToday([lunes], MONDAY(7, 59))).toBeNull();
    expect(hasAvailableClassesToday([lunes], MONDAY(9, 1))).toBeNull();
  });

  test("el rango es cerrado en los dos extremos, como el webapp", () => {
    expect(hasAvailableClassesToday([lunes], MONDAY(8, 0))?.id).toBe(1);
    expect(hasAvailableClassesToday([lunes], MONDAY(9, 0))?.id).toBe(1);
  });

  test("filtra por schedule.weekday: la misma hora en otro día → null", () => {
    expect(hasAvailableClassesToday([lunes], TUESDAY(8, 30))).toBeNull();
  });

  test("compara la ventana REAL (nivel superior), no el horario del schedule", () => {
    // schedule dice 07:00-07:45; la ventana de hoy dice 08:00-09:00.
    expect(hasAvailableClassesToday([lunes], MONDAY(7, 30))).toBeNull();
    expect(hasAvailableClassesToday([lunes], MONDAY(8, 30))?.id).toBe(1);
  });

  test("ignora los items sin startTime o sin endTime", () => {
    const sinHoras = item({ id: 2, weekday: "Lunes", startTime: null, endTime: null });
    expect(hasAvailableClassesToday([sinHoras], MONDAY(8, 30))).toBeNull();
  });

  test("acepta 'HH:MM' además de 'HH:MM:SS' (compara en minutos)", () => {
    const corto = item({ id: 3, weekday: "Lunes", startTime: "08:00", endTime: "09:00" });
    expect(hasAvailableClassesToday([corto], MONDAY(8, 30))?.id).toBe(3);
  });

  test("con clases solapadas devuelve la primera de la lista (la más temprana)", () => {
    const temprana = item({ id: 4, weekday: "Lunes", startTime: "08:00:00", endTime: "10:00:00" });
    const tardia = item({ id: 5, weekday: "Lunes", startTime: "08:30:00", endTime: "10:00:00" });
    expect(hasAvailableClassesToday([temprana, tardia], MONDAY(8, 45))?.id).toBe(4);
  });
});

describe("getCurrentSubject (port literal del webapp, con sus bugs)", () => {
  test("lista vacía o no-array → null", () => {
    expect(getCurrentSubject([], MONDAY(8, 30))).toBeNull();
    expect(getCurrentSubject(null, MONDAY(8, 30))).toBeNull();
  });

  test("dentro de la ventana devuelve el item", () => {
    expect(getCurrentSubject([item({ id: 1, weekday: "Lunes" })], MONDAY(8, 30))?.id).toBe(1);
  });

  test("ignora los items sin startTime o sin endTime", () => {
    const sinHoras = item({ id: 2, weekday: "Lunes", startTime: null, endTime: null });
    expect(getCurrentSubject([sinHoras], MONDAY(8, 30))).toBeNull();
  });

  test("BUG replicado: no filtra por weekday — devuelve una clase de otro día", () => {
    const martes = item({ id: 7, weekday: "Martes" });
    expect(getCurrentSubject([martes], MONDAY(8, 30))?.id).toBe(7);
  });

  test("BUG replicado: compara strings, así que 'HH:MM' rompe el rango", () => {
    // A las 08:30 la comparación de strings todavía acierta, porque el primer
    // caracter que difiere ya decide. El fin es otra historia: a las 09:00 en
    // punto, "09:00:00" > "09:00" (mismo prefijo, pero el más largo gana), así
    // que el rango se cierra un minuto antes de tiempo.
    const corto = item({ id: 8, weekday: "Lunes", startTime: "08:00", endTime: "09:00" });
    expect(getCurrentSubject([corto], MONDAY(8, 30))?.id).toBe(8);
    // Con la hora exacta del fin, el string largo supera al corto:
    expect(getCurrentSubject([corto], MONDAY(9, 0))).toBeNull();
    // …mientras que la versión en minutos sí la considera en curso.
    expect(hasAvailableClassesToday([corto], MONDAY(9, 0))?.id).toBe(8);
  });

  test("DIVERGENCIA: sin clase para hasAvailableClassesToday, pero sí para getCurrentSubject", () => {
    // Un solo item, de MARTES, en la ventana 08:00-09:00. Se consulta un LUNES
    // a las 08:30: el día no coincide, pero la hora sí.
    const otroDia = [item({ id: 9, weekday: "Martes", subjectId: 99 })];

    expect(hasAvailableClassesToday(otroDia, MONDAY(8, 30))).toBeNull();

    const found = getCurrentSubject(otroDia, MONDAY(8, 30));
    expect(found?.id).toBe(9);
    // Y esta es la materia que la pantalla le pide al backend — de ahí que el
    // GET pueda responder `attendanceFound: false` aunque la UI creyó que sí.
    expect(found?.schedule?.subjectId).toBe(99);
  });
});

describe("fetchTeacherAttendance", () => {
  test("pega a /attendance/teacher/{subjectId} con el bearer", async () => {
    mockedGet.mockResolvedValue({
      data: { success: true, data: { id: 10, statistics: {}, photos: [], attendanceDetails: [] } },
    });
    await fetchTeacherAttendance(42, AUTH);
    expect(mockedGet).toHaveBeenCalledWith(`${URL}/attendance/teacher/42`, {
      headers: { Authorization: `Bearer ${AUTH.token}` },
    });
  });

  test("success:true → found con los datos normalizados", async () => {
    mockedGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 10,
          scheduleId: 5,
          date: "2026-09-21",
          startTime: "08:00:00",
          endTime: "09:00:00",
          statistics: { presente: 1, tardanza: 0, ausente: 0, excusa: 0, total: 1, TardanzaEntrada: 0 },
          photos: [],
          schedule: { id: 5, subject: { id: 11, name: "Matemáticas" } },
          attendanceDetails: [],
        },
      },
    });
    const result = await fetchTeacherAttendance(11, AUTH);
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.data.id).toBe(10);
      expect(result.data.schedule?.subject?.name).toBe("Matemáticas");
    }
  });

  test("attendanceFound:false → notFound con el mensaje del backend", async () => {
    mockedGet.mockResolvedValue({
      data: {
        success: false,
        message: "No se encontró un registro deasistencia para la materia 11 en Lunes a las 09:30:00",
        data: { attendanceFound: false },
      },
    });
    const result = await fetchTeacherAttendance(11, AUTH);
    expect(result.status).toBe("notFound");
    expect(result).toMatchObject({ message: expect.stringContaining("No se encontró") });
  });

  test("success:false sin attendanceFound → error", async () => {
    mockedGet.mockResolvedValue({
      data: { success: false, message: "No autenticado o sin permisos" },
    });
    expect(await fetchTeacherAttendance(11, AUTH)).toEqual({
      status: "error",
      message: "No autenticado o sin permisos",
    });
  });

  test("caída de red → error con mensaje genérico", async () => {
    mockedGet.mockRejectedValue(new Error("Network Error"));
    expect(await fetchTeacherAttendance(11, AUTH)).toEqual({
      status: "error",
      message: "Error de conexión.",
    });
  });
});
