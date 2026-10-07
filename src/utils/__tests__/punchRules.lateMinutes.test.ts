/// <reference types="jest" />
import type { UserSchedule } from "../../../types/typeStore/SchoolStoreType";
import {
  formatLateDuration,
  getLateMinutes,
  type PunchEvent,
  type ToleranceConfig,
} from "../punchRules";

// 2026-08-19 es miércoles; RD = UTC-4, así que 09:00 RD = 13:00Z.
const schedule: UserSchedule = {
  id: 1,
  weekDay: "Miércoles",
  workEntryTime: "09:00",
  workExitTime: "17:00",
  lunchEntryTime: "12:00",
  lunchExitTime: "13:00",
  toleranceWorkTimeIn: 5,
};

const defaults: ToleranceConfig = {
  workIn: 5,
  workOut: 5,
  lunchIn: 5,
  lunchOut: 5,
};

const punchAt = (
  rdTime: string,
  overrides: Partial<PunchEvent> = {},
): PunchEvent => {
  const [h, m] = rdTime.split(":").map(Number);
  const utc = new Date(Date.UTC(2026, 7, 19, h + 4, m));
  return {
    id: 1,
    type: "InicioJornada",
    status: "",
    createdDate: utc.toISOString(),
    ...overrides,
  };
};

describe("getLateMinutes + formatLateDuration", () => {
  test("10:00 → 60 → \"1 h\"", () => {
    const minutes = getLateMinutes(punchAt("10:00"), [schedule], defaults);
    expect(minutes).toBe(60);
    expect(formatLateDuration(minutes!)).toBe("1 h");
  });

  test("09:07 → 7 → \"7 min\" (se cuenta desde 09:00, no desde 09:05)", () => {
    const minutes = getLateMinutes(punchAt("09:07"), [schedule], defaults);
    expect(minutes).toBe(7);
    expect(formatLateDuration(minutes!)).toBe("7 min");
  });

  test("10:15 → 75 → \"1 h 15 min\"", () => {
    const minutes = getLateMinutes(punchAt("10:15"), [schedule], defaults);
    expect(minutes).toBe(75);
    expect(formatLateDuration(minutes!)).toBe("1 h 15 min");
  });
});

describe("getLateMinutes → null cuando no aplica", () => {
  test("09:04, dentro de la tolerancia", () => {
    expect(getLateMinutes(punchAt("09:04"), [schedule], defaults)).toBeNull();
  });

  test("ponche con permissionId", () => {
    expect(
      getLateMinutes(punchAt("10:00", { permissionId: 7 }), [schedule], defaults),
    ).toBeNull();
  });

  test("día sin horario", () => {
    const otroDia: UserSchedule = { ...schedule, weekDay: "Lunes" };
    expect(getLateMinutes(punchAt("10:00"), [otroDia], defaults)).toBeNull();
    expect(getLateMinutes(punchAt("10:00"), [], defaults)).toBeNull();
  });

  test.each(["FinJornada", "InicioAlmuerzo", "InicioJornadaFH"])(
    "tipo %s",
    (type) => {
      expect(
        getLateMinutes(punchAt("13:30", { type }), [schedule], defaults),
      ).toBeNull();
    },
  );
});
