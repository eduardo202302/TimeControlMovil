/// <reference types="jest" />
import { getNewestPunch, type PunchEvent } from "../punchRules";

const punch = (over: Partial<PunchEvent>): PunchEvent => ({
  id: 1,
  type: "InicioJornada",
  status: "A Tiempo",
  createdDate: "2026-10-08T12:00:00.000Z",
  ...over,
});

describe("getNewestPunch", () => {
  test("lista vacía → null", () => {
    expect(getNewestPunch([])).toBeNull();
  });

  test("devuelve el de createdDate más reciente aunque no esté al final", () => {
    const newest = punch({ id: 2, createdDate: "2026-10-08T16:00:00.000Z" });
    const punches = [
      punch({ id: 1, createdDate: "2026-10-08T12:00:00.000Z" }),
      newest,
      punch({
        id: 3,
        type: "InicioAlmuerzo",
        createdDate: "2026-10-08T14:00:00.000Z",
      }),
    ];
    expect(getNewestPunch(punches)).toBe(newest);
  });

  test("un ponche hasOpenDay de ayer al final del array no gana al de hoy", () => {
    const today = punch({ id: 20, createdDate: "2026-10-08T12:30:00.000Z" });
    const punches = [
      today,
      punch({
        id: 10,
        hasOpenDay: true,
        openDayDate: "2026-10-07",
        createdDate: "2026-10-07T12:00:00.000Z",
      }),
    ];
    expect(getNewestPunch(punches)).toBe(today);
  });
});
