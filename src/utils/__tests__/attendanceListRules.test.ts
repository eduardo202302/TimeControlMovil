// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import {
  applyListAction,
  displayStatus,
  hhmmFromRecordedAt,
  isRowLocked,
  shouldShowTardinessPicker,
  showEditIcon,
  subtabRowConfig,
  tardinessEntryTimeValue,
} from "../attendanceListRules";
import {
  buildManualStudentsPayload,
  toListRows,
  type AttendanceDetail,
  type AttendanceListRow,
} from "../attendanceRules";

function row(overrides: Partial<AttendanceDetail> = {}): AttendanceListRow {
  return toListRows([
    {
      id: 1,
      attendanceId: 10,
      studentId: 100,
      status: "ausente",
      recorded: "unrecorded",
      haveExcuse: "no",
      student: { id: 100, fullName: "Ana" },
      ...overrides,
    },
  ])[0];
}

describe("applyListAction (handlerAttendance del webapp)", () => {
  test("estado: updated + vuelve a bloquear la fila; limpia la hora si no es tardanza", () => {
    const start = { ...row(), tardinessEntryTime: "08:10", tardinessEntryTimeCustomized: true };
    const [next] = applyListAction([start], 1, "presente");
    expect(next).toEqual(
      expect.objectContaining({
        status: "presente",
        updated: true,
        actionsDisabled: true,
        tardinessEntryTime: null,
        tardinessEntryTimeCustomized: false,
      }),
    );
  });

  test("tardanza conserva la hora previa (solo quita la marca de personalizada)", () => {
    const start = { ...row(), tardinessEntryTime: "08:10", tardinessEntryTimeCustomized: true };
    const [next] = applyListAction([start], 1, "tardanza");
    expect(next.tardinessEntryTime).toBe("08:10");
    expect(next.tardinessEntryTimeCustomized).toBe(false);
  });

  test("edit desbloquea SIN marcar updated", () => {
    const locked = row({ recorded: "auto", status: "presente" });
    expect(locked.actionsDisabled).toBe(true);
    const [next] = applyListAction([locked], 1, "edit");
    expect(next.actionsDisabled).toBe(false);
    expect(next.updated).toBe(false);
  });

  test("hora de entrada: personalizada + updated", () => {
    const [next] = applyListAction([row({ status: "tardanza" })], 1, "tardinessEntryTime", "08:25");
    expect(next).toEqual(
      expect.objectContaining({
        tardinessEntryTime: "08:25",
        tardinessEntryTimeCustomized: true,
        updated: true,
      }),
    );
  });

  test("solo afecta la fila indicada", () => {
    const rows = [row(), { ...row(), id: 2, student: { id: 200, fullName: "Beto" } }];
    const next = applyListAction(rows, 2, "presente");
    expect(next[0]).toBe(rows[0]);
    expect(next[1].status).toBe("presente");
  });

  test("flag simple: A→P→A igual se envía", () => {
    let rows = [row()];
    rows = applyListAction(rows, 1, "presente");
    rows = applyListAction(rows, 1, "edit");
    rows = applyListAction(rows, 1, "ausente");
    expect(buildManualStudentsPayload(rows)).toEqual([{ id: 100, status: "ausente" }]);
  });

  test("tardanza con hora elegida → viaja tardinessEntryTime", () => {
    let rows = [row()];
    rows = applyListAction(rows, 1, "tardanza");
    rows = applyListAction(rows, 1, "tardinessEntryTime", "08:25");
    expect(buildManualStudentsPayload(rows)).toEqual([
      { id: 100, status: "tardanza", tardinessEntryTime: "08:25" },
    ]);
  });
});

describe("subtabRowConfig", () => {
  test("Todos/Foto: solo lectura", () => {
    expect(subtabRowConfig("Todos", false)).toEqual({ listDisabled: true, buttons: [] });
    expect(subtabRowConfig("Foto", false)).toEqual({ listDisabled: true, buttons: [] });
  });
  test("Verif.: Tard./Ause./Pres.; Manual: Tard./Pres. (Exc. nunca)", () => {
    expect(subtabRowConfig("Verificados", false).buttons).toEqual([
      "tardanza",
      "ausente",
      "presente",
    ]);
    expect(subtabRowConfig("Manual", false).buttons).toEqual(["tardanza", "presente"]);
  });
  test("con fotos nuevas sin guardar, Verif./Manual pasan a solo lectura", () => {
    expect(subtabRowConfig("Verificados", true).listDisabled).toBe(true);
    expect(subtabRowConfig("Manual", true).listDisabled).toBe(true);
  });
});

describe("bloqueo y lápiz", () => {
  test("Verif. arranca bloqueada con lápiz; Manual arranca activa sin lápiz", () => {
    const verified = row({ recorded: "manual", status: "presente" });
    const pending = row();
    expect(isRowLocked(verified, false)).toBe(true);
    expect(showEditIcon(verified, false)).toBe(true);
    expect(isRowLocked(pending, false)).toBe(false);
    expect(showEditIcon(pending, false)).toBe(false);
  });
  test("en lista de solo lectura no hay lápiz", () => {
    expect(showEditIcon(row({ recorded: "auto" }), true)).toBe(false);
  });
});

describe("shouldShowTardinessPicker", () => {
  test("pendiente marcada como tardanza → sí", () => {
    const [r] = applyListAction([row()], 1, "tardanza");
    expect(shouldShowTardinessPicker(r, false)).toBe(true);
  });
  test("recorded auto → nunca", () => {
    const [r] = applyListAction([row({ recorded: "auto" })], 1, "tardanza");
    expect(shouldShowTardinessPicker(r, false)).toBe(false);
  });
  test("tardanza manual ya guardada: solo al desbloquear", () => {
    const saved = row({ recorded: "manual", status: "tardanza" });
    expect(shouldShowTardinessPicker(saved, false)).toBe(false);
    const [unlocked] = applyListAction([saved], 1, "edit");
    expect(shouldShowTardinessPicker(unlocked, false)).toBe(true);
  });
  test("no tardanza o lista de solo lectura → no", () => {
    expect(shouldShowTardinessPicker(row(), false)).toBe(false);
    const [r] = applyListAction([row()], 1, "tardanza");
    expect(shouldShowTardinessPicker(r, true)).toBe(false);
  });
});

describe("tardinessEntryTimeValue", () => {
  const now = new Date(2026, 8, 19, 9, 5);

  test("personalizada manda", () => {
    const r = { ...row({ status: "tardanza" }), tardinessEntryTime: "08:25:00", tardinessEntryTimeCustomized: true };
    expect(tardinessEntryTimeValue(r, false, now)).toBe("08:25");
  });
  test("pendiente sin hora → ahora", () => {
    expect(tardinessEntryTimeValue(row({ status: "tardanza" }), false, now)).toBe("09:05");
  });
  test("registrada → recordedAt", () => {
    const r = row({ status: "tardanza", recorded: "manual", recordedAt: "2026-09-19 08:12:00" });
    expect(tardinessEntryTimeValue(r, false, now)).toBe("08:12");
  });
});

describe("helpers", () => {
  test("hhmmFromRecordedAt", () => {
    expect(hhmmFromRecordedAt("2026-09-19 08:12:30")).toBe("08:12");
    expect(hhmmFromRecordedAt("2026-09-19T08:12:30")).toBe("08:12");
    // jest corre con TZ=UTC
    expect(hhmmFromRecordedAt("2026-09-19T12:40:00.000Z")).toBe("12:40");
    expect(hhmmFromRecordedAt("")).toBe("");
    expect(hhmmFromRecordedAt(null)).toBe("");
  });
  test("displayStatus: ausente con excusa → excusa", () => {
    expect(displayStatus({ status: "ausente", haveExcuse: "si" })).toBe("excusa");
    expect(displayStatus({ status: "ausente", haveExcuse: "no" })).toBe("ausente");
    expect(displayStatus({ status: "tardanza", haveExcuse: "si" })).toBe("tardanza");
  });
});
