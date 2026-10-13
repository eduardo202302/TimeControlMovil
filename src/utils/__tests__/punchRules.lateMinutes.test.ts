/// <reference types="jest" />
import type { UserSchedule } from "../../../types/typeStore/SchoolStoreType";
import {
  formatLateDuration,
  getLateMinutes,
  type PunchEvent,
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

// getLateMinutes ya no decide SI hubo tardanza: eso lo dice el status que
// guardó el backend (el estado mostrado). Solo cuenta los minutos desde la
// hora de entrada del horario.
describe("getLateMinutes + formatLateDuration", () => {
  test('10:00 → 60 → "1 h"', () => {
    const minutes = getLateMinutes(punchAt("10:00"), [schedule], "Tardanza");
    expect(minutes).toBe(60);
    expect(formatLateDuration(minutes!)).toBe("1 h");
  });

  test('09:07 → 7 → "7 min" (se cuenta desde 09:00, no desde 09:05)', () => {
    const minutes = getLateMinutes(punchAt("09:07"), [schedule], "Tardanza");
    expect(minutes).toBe(7);
    expect(formatLateDuration(minutes!)).toBe("7 min");
  });

  test('10:15 → 75 → "1 h 15 min"', () => {
    const minutes = getLateMinutes(punchAt("10:15"), [schedule], "Tardanza");
    expect(minutes).toBe(75);
    expect(formatLateDuration(minutes!)).toBe("1 h 15 min");
  });
});

describe("getLateMinutes → null cuando no aplica", () => {
  test.each(["A Tiempo", "Anticipada", "Fuera de Horario", "Fuera de área"])(
    "el estado mostrado es %s, aunque la hora sea tarde",
    (status) => {
      // Ej. reentrada a las 10:00: el backend la guarda "A Tiempo" y no
      // debe aparecer un chip de minutos de tardanza.
      expect(getLateMinutes(punchAt("10:00"), [schedule], status)).toBeNull();
    },
  );

  test("ponche con permissionId", () => {
    expect(
      getLateMinutes(
        punchAt("10:00", { permissionId: 7 }),
        [schedule],
        "Tardanza",
      ),
    ).toBeNull();
  });

  test("día sin horario", () => {
    const otroDia: UserSchedule = { ...schedule, weekDay: "Lunes" };
    expect(getLateMinutes(punchAt("10:00"), [otroDia], "Tardanza")).toBeNull();
    expect(getLateMinutes(punchAt("10:00"), [], "Tardanza")).toBeNull();
  });

  test.each(["FinJornada", "InicioAlmuerzo", "InicioJornadaFH"])(
    "tipo %s",
    (type) => {
      expect(
        getLateMinutes(punchAt("13:30", { type }), [schedule], "Tardanza"),
      ).toBeNull();
    },
  );
});
