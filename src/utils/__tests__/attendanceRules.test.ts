// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import axios from "axios";
import {
  buildCourseSearchParams,
  buildManualStudentsPayload,
  countBySubtab,
  courseSubtitle,
  fetchAdminAttendance,
  filterDetailsBySubtab,
  formatHourLabel,
  formatRecognizedCount,
  normalizeAttendanceData,
  readUserTeacherTypeList,
  resolveAttendanceGating,
  splitDetailsByStatus,
  submitAttendanceManual,
  submitAttendancePhotos,
  tabLabel,
  toCourseOption,
  todosSubtabLabel,
  toListRows,
  visibleSubtabs,
  type AttendanceDetail,
  type AttendanceListRow,
} from "../attendanceRules";

jest.mock("axios");

const mockedGet = axios.get as unknown as jest.Mock;
const mockedPost = axios.post as unknown as jest.Mock;

const URL = "https://timecontrol.example.net:8600";
const TOKEN = "jwt.token.here";
const AUTH = { token: TOKEN, urlColegio: URL };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

function detail(overrides: Partial<AttendanceDetail> = {}): AttendanceDetail {
  return {
    id: 1,
    attendanceId: 10,
    studentId: 100,
    status: "ausente",
    recorded: "unrecorded",
    haveExcuse: "no",
    student: { id: 100, fullName: "Ana Pérez" },
    ...overrides,
  };
}

function attendanceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    scheduleId: 5,
    date: "2026-09-19",
    startTime: "08:00:00",
    endTime: "09:00:00",
    statistics: { presente: 1, tardanza: 0, ausente: 2, excusa: 1, total: 3, TardanzaEntrada: 0 },
    photos: [{ path: "school_1/attendance/a.jpeg", markedAs: "presente", studentsMarked: 3 }],
    schedule: {
      id: 5,
      startTime: "08:00:00",
      endTime: "09:00:00",
      subject: { id: 1, name: "Matemáticas" },
      course: { id: 2, name: "1ro", section: "A" },
      teacher: { id: 3, fullName: "Prof. X", typeList: "foto" },
      school: { id: 1, token: "SECRETO", settings: { attendanceMode: "Manual" } },
    },
    attendanceDetails: [detail()],
    ...overrides,
  };
}

describe("resolveAttendanceGating (handleAttendanceValidations del webapp)", () => {
  test.each([
    ["Manual", null, true, false],
    ["Manual", "foto", true, false],
    ["Docente", "manual", true, false],
    ["Docente", "foto", false, true],
    ["Docente", "manualFoto", false, false],
    ["Docente", null, false, false],
    ["", "manual", false, false],
    [undefined, "foto", false, false],
  ])("mode=%p typeList=%p → cantAuto=%p cantManual=%p", (mode, typeList, cantAuto, cantManual) => {
    expect(resolveAttendanceGating(mode as any, typeList as any)).toEqual({ cantAuto, cantManual });
  });
});

describe("readUserTeacherTypeList", () => {
  test("lee user.user.teacher.typeList", () => {
    expect(readUserTeacherTypeList({ user: { teacher: { typeList: "manual" } } })).toBe("manual");
  });
  test("admin sin teacher → null", () => {
    expect(readUserTeacherTypeList({ user: { teacher: null } })).toBeNull();
    expect(readUserTeacherTypeList(null)).toBeNull();
  });
});

describe("splitDetailsByStatus", () => {
  test("un ausente con excusa aparece en ausente Y en excusa", () => {
    const rows = [
      detail({ id: 1, status: "presente" }),
      detail({ id: 2, status: "ausente", haveExcuse: "si" }),
      detail({ id: 3, status: "ausente", haveExcuse: "no" }),
      detail({ id: 4, status: "tardanza" }),
      // haveExcuse "si" pero no ausente → no cuenta como excusa
      detail({ id: 5, status: "presente", haveExcuse: "si" }),
    ];
    const split = splitDetailsByStatus(rows);
    expect(split.presente.map((d) => d.id)).toEqual([1, 5]);
    expect(split.ausente.map((d) => d.id)).toEqual([2, 3]);
    expect(split.tardanza.map((d) => d.id)).toEqual([4]);
    expect(split.excusa.map((d) => d.id)).toEqual([2]);
  });
});

describe("helpers de UI", () => {
  test("formatRecognizedCount une con ' + ' (no suma), vacío sin fotos", () => {
    expect(
      formatRecognizedCount([
        { path: "a", markedAs: "presente", studentsMarked: 3 },
        { path: "b", markedAs: "tardanza", studentsMarked: 2 },
      ]),
    ).toBe("3 + 2");
    expect(formatRecognizedCount([])).toBe("");
  });

  test("tabLabel omite el contador en 0/undefined", () => {
    expect(tabLabel("Pre", 4)).toBe("Pre(4)");
    expect(tabLabel("Pre", 0)).toBe("Pre");
    expect(tabLabel("Pre", undefined)).toBe("Pre");
  });

  test("formatHourLabel → hh:mm AM/PM", () => {
    expect(formatHourLabel("08:05:00")).toBe("08:05 AM");
    expect(formatHourLabel("13:30")).toBe("01:30 PM");
    expect(formatHourLabel("00:15:00")).toBe("12:15 AM");
    expect(formatHourLabel("12:00:00")).toBe("12:00 PM");
    expect(formatHourLabel("")).toBe("");
    expect(formatHourLabel(null)).toBe("");
  });

  test("courseSubtitle", () => {
    expect(courseSubtitle({ id: 1, name: "1ro", section: "A", studentCount: 25 })).toBe(
      "A · 25 estudiantes",
    );
    expect(courseSubtitle({ id: 1, name: "1ro", section: null, studentCount: 1 })).toBe(
      "1 estudiante",
    );
  });
});

describe("toListRows / buildManualStudentsPayload", () => {
  test("actionsDisabled solo en lo ya registrado", () => {
    const rows = toListRows([
      detail({ id: 1, recorded: "unrecorded" }),
      detail({ id: 2, recorded: "auto" }),
    ]);
    expect(rows.map((r) => [r.updated, r.actionsDisabled])).toEqual([
      [false, false],
      [false, true],
    ]);
  });

  test("solo filas updated; tardinessEntryTime solo si tardanza + customized", () => {
    const base = toListRows([detail()])[0];
    const rows: AttendanceListRow[] = [
      { ...base, id: 1, student: { id: 11, fullName: "A" }, status: "presente", updated: true },
      { ...base, id: 2, student: { id: 12, fullName: "B" }, status: "ausente", updated: false },
      {
        ...base,
        id: 3,
        student: { id: 13, fullName: "C" },
        status: "tardanza",
        updated: true,
        tardinessEntryTime: "08:10",
        tardinessEntryTimeCustomized: true,
      },
      {
        ...base,
        id: 4,
        student: { id: 14, fullName: "D" },
        status: "tardanza",
        updated: true,
        tardinessEntryTime: "08:10",
        tardinessEntryTimeCustomized: false,
      },
    ];
    expect(buildManualStudentsPayload(rows)).toEqual([
      { id: 11, status: "presente" },
      { id: 13, status: "tardanza", tardinessEntryTime: "08:10" },
      { id: 14, status: "tardanza" },
    ]);
  });

  test("sin cambios → arreglo vacío", () => {
    expect(buildManualStudentsPayload(toListRows([detail()]))).toEqual([]);
  });
});

describe("cursos", () => {
  test("sin búsqueda: no manda all ni fields; activeAttendance string", () => {
    expect(buildCourseSearchParams({ query: "  " })).toEqual({
      orderKey: "name",
      orderDir: "asc",
      page: 1,
      rows: 12,
      isActive: 1,
      activeAttendance: "1",
    });
  });

  test("con búsqueda: all + fields", () => {
    expect(buildCourseSearchParams({ query: " 1ro ", page: 2 })).toEqual(
      expect.objectContaining({ all: "1ro", fields: "name,section,id,fullName", page: 2 }),
    );
  });

  test("toCourseOption normaliza studentCount string y descarta sin id", () => {
    expect(toCourseOption({ id: 1, name: "1ro", section: "A", studentCount: "25" })).toEqual(
      expect.objectContaining({ id: 1, name: "1ro", section: "A", studentCount: 25 }),
    );
    expect(toCourseOption({ name: "x" })).toBeNull();
  });
});

describe("normalizeAttendanceData", () => {
  test("descarta schedule.school y conserva lo que se muestra", () => {
    const data = normalizeAttendanceData(attendanceRow());
    expect(data).not.toBeNull();
    expect(JSON.stringify(data)).not.toContain("SECRETO");
    expect(data?.schedule?.course).toEqual({ id: 2, name: "1ro", section: "A" });
    expect(data?.schedule?.teacher?.typeList).toBe("foto");
  });

  test("photos/statistics como string JSON se parsean", () => {
    const data = normalizeAttendanceData(
      attendanceRow({
        photos: JSON.stringify([{ path: "p", markedAs: "tardanza", studentsMarked: 2 }]),
        statistics: JSON.stringify({ presente: 4 }),
      }),
    );
    expect(data?.photos).toEqual([{ path: "p", markedAs: "tardanza", studentsMarked: 2 }]);
    expect(data?.statistics.presente).toBe(4);
    expect(data?.statistics.ausente).toBe(0);
  });

  test("photos null → []", () => {
    expect(normalizeAttendanceData(attendanceRow({ photos: null }))?.photos).toEqual([]);
  });
});

describe("fetchAdminAttendance", () => {
  test("success → found", async () => {
    mockedGet.mockResolvedValueOnce({ data: { success: true, data: attendanceRow() } });
    const result = await fetchAdminAttendance(2, AUTH);
    expect(mockedGet).toHaveBeenCalledWith(`${URL}/attendance/course/2`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(result.status).toBe("found");
  });

  test("attendanceFound:false → notFound con el mensaje real", async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        success: false,
        message: "No se encontró un registro de asistencia para el curso 2",
        data: { attendanceFound: false },
      },
    });
    expect(await fetchAdminAttendance(2, AUTH)).toEqual({
      status: "notFound",
      message: "No se encontró un registro de asistencia para el curso 2",
    });
  });

  test("success:false sin attendanceFound → error", async () => {
    mockedGet.mockResolvedValueOnce({ data: { success: false, message: "Parámetro requerido: courseId" } });
    expect(await fetchAdminAttendance(2, AUTH)).toEqual({
      status: "error",
      message: "Parámetro requerido: courseId",
    });
  });

  test("fallo de red → error", async () => {
    mockedGet.mockRejectedValueOnce(new Error("Network Error"));
    expect((await fetchAdminAttendance(2, AUTH)).status).toBe("error");
  });
});

describe("submitAttendance*", () => {
  test("fotos: solo data URIs nuevas + late; expone failedPhotos", async () => {
    mockedPost.mockResolvedValueOnce({
      data: {
        success: true,
        message: "Procesadas 1 fotos: 3 estudiantes marcados",
        data: { ...attendanceRow(), failedPhotos: ["La foto 2 no se reconoció ningún estudiante"] },
      },
    });
    const result = await submitAttendancePhotos(
      {
        attendanceId: 10,
        photos: ["data:image/jpeg;base64,AAA", "school_1/attendance/old.jpeg"],
        late: true,
      },
      AUTH,
    );
    expect(mockedPost).toHaveBeenCalledWith(
      `${URL}/attendance/10`,
      { photos: ["data:image/jpeg;base64,AAA"], late: true },
      expect.anything(),
    );
    expect(result).toEqual({
      ok: true,
      message: "Procesadas 1 fotos: 3 estudiantes marcados",
      failedPhotos: ["La foto 2 no se reconoció ningún estudiante"],
    });
    // No se filtra `data` (con schedule.school) al caller.
    expect(JSON.stringify(result)).not.toContain("SECRETO");
  });

  test("manual: envía students aunque venga vacío y expone el rechazo", async () => {
    mockedPost.mockResolvedValueOnce({
      data: { success: false, message: "No hay informacion nueva para actualizar la asistencia" },
    });
    const result = await submitAttendanceManual({ attendanceId: 10, students: [] }, AUTH);
    expect(mockedPost).toHaveBeenCalledWith(
      `${URL}/attendance/10`,
      { students: [] },
      expect.anything(),
    );
    expect(result).toEqual({
      ok: false,
      message: "No hay informacion nueva para actualizar la asistencia",
    });
  });
});

describe("subtabs de la Lista", () => {
  const rows = [
    detail({ id: 1, recorded: "auto", status: "presente" }),
    detail({ id: 2, recorded: "manual", status: "tardanza" }),
    detail({ id: 3, recorded: "unrecorded", haveExcuse: "no", tardiness: null }),
    // pendiente pero con tardanza de entrada → fuera de Manual
    detail({ id: 4, recorded: "unrecorded", haveExcuse: "no", tardiness: { id: 9 } }),
    // pendiente pero con excusa → fuera de Manual
    detail({ id: 5, recorded: "unrecorded", haveExcuse: "si" }),
    // haveExcuse undefined → fuera de Manual (=== "no" estricto)
    detail({ id: 6, recorded: "unrecorded", haveExcuse: undefined as any }),
    // tardiness {} cuenta como vacío (isEmpty de lodash)
    detail({ id: 7, recorded: "unrecorded", haveExcuse: "no", tardiness: {} }),
  ];
  const ids = (list: AttendanceDetail[]) => list.map((d) => d.id);

  test("Todos no filtra", () => {
    expect(ids(filterDetailsBySubtab(rows, "Todos"))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  test("Foto: recorded === auto", () => {
    expect(ids(filterDetailsBySubtab(rows, "Foto"))).toEqual([1]);
  });
  test("Verif.: auto y manual", () => {
    expect(ids(filterDetailsBySubtab(rows, "Verificados"))).toEqual([1, 2]);
  });
  test("Manual: unrecorded + sin tardanza + haveExcuse 'no' estricto", () => {
    expect(ids(filterDetailsBySubtab(rows, "Manual"))).toEqual([3, 7]);
  });

  test("conteos y label de Todos", () => {
    const counts = countBySubtab(rows);
    expect(counts).toEqual({ todos: 7, foto: 1, verificados: 2, manual: 2 });
    expect(todosSubtabLabel(counts)).toBe("Todos(2 de 7)");
    expect(todosSubtabLabel({ todos: 3, foto: 0, verificados: 0, manual: 3 })).toBe("Todos(3)");
    expect(todosSubtabLabel({ todos: 0, foto: 0, verificados: 0, manual: 0 })).toBe("Todos");
  });

  test("visibilidad: Foto oculta con cantAuto; Verif./Manual con cantManual", () => {
    expect(visibleSubtabs({ cantAuto: false, cantManual: false })).toEqual([
      "Todos",
      "Foto",
      "Verificados",
      "Manual",
    ]);
    expect(visibleSubtabs({ cantAuto: true, cantManual: false })).toEqual([
      "Todos",
      "Verificados",
      "Manual",
    ]);
    expect(visibleSubtabs({ cantAuto: false, cantManual: true })).toEqual(["Todos", "Foto"]);
  });
});
