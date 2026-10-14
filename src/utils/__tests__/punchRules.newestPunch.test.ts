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

  // El blink se generalizó a todos los ponches exitosos: la fila resaltada es
  // la más reciente sin importar el tipo (no solo jornada).
  const dayWith = (newest: PunchEvent): PunchEvent[] => [
    punch({ id: 1, type: "InicioJornada", createdDate: "2026-10-08T12:00:00.000Z" }),
    newest,
    punch({ id: 2, type: "InicioBreak", createdDate: "2026-10-08T13:00:00.000Z" }),
  ];

  test.each([
    "FinBreak",
    "InicioAlmuerzo",
    "FinAlmuerzo",
    "FinJornada",
    "InicioJornadaAdicional",
    "FinJornadaFH",
  ])("%s recién ponchado (en medio del array) es el más reciente", (type) => {
    const newest = punch({ id: 99, type, createdDate: "2026-10-08T17:45:00.000Z" });
    expect(getNewestPunch(dayWith(newest))).toBe(newest);
  });

  test("un InicioBreak nuevo gana al InicioJornada aunque la jornada vaya al final", () => {
    const breakStart = punch({ id: 5, type: "InicioBreak", createdDate: "2026-10-08T15:10:00.000Z" });
    const punches = [
      breakStart,
      punch({ id: 4, type: "InicioJornada", createdDate: "2026-10-08T12:00:00.000Z" }),
    ];
    expect(getNewestPunch(punches)).toBe(breakStart);
  });

  test("FinAlmuerzo con offset RD (-04:00) se compara por instante, no por texto", () => {
    const lunchEnd = punch({ id: 7, type: "FinAlmuerzo", createdDate: "2026-10-08T13:30:00-04:00" });
    const punches = [
      punch({ id: 6, type: "InicioAlmuerzo", createdDate: "2026-10-08T16:45:00.000Z" }),
      lunchEnd, // 17:30Z
    ];
    expect(getNewestPunch(punches)).toBe(lunchEnd);
  });
});
