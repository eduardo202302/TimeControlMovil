// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import {
  INVALID_TIMELINE_STATUSES,
  getOpenJornadaStartPunch,
  getTodayLunchExitPunch,
  type PunchEvent,
} from "../punchRules";

/** Date cuya hora de pared en RD (UTC-4) es h:m. jest.config.js fija TZ=UTC. */
const rd = (h: number, m = 0): Date => new Date(Date.UTC(2026, 7, 19, h + 4, m));

let nextId = 1;
/** Ponche con createdDate a la hora RD h:m del día de rd() */
const at = (
  type: string,
  h: number,
  m: number,
  extra: Partial<PunchEvent> = {},
): PunchEvent => ({
  id: nextId++,
  type,
  status: "A Tiempo",
  createdDate: rd(h, m).toISOString(),
  ...extra,
});

describe("getOpenJornadaStartPunch", () => {
  it("sin ponches → null", () => {
    expect(getOpenJornadaStartPunch([])).toBeNull();
  });

  it.each(["InicioJornada", "InicioJornadaAdicional", "InicioJornadaFH"])(
    "%s abierto → ese ponche",
    (tipo) => {
      const inicio = at(tipo, 8, 0);
      expect(getOpenJornadaStartPunch([inicio])).toBe(inicio);
    },
  );

  it.each([
    ["FinJornada", "InicioJornada"],
    ["FinJornadaAdicional", "InicioJornadaAdicional"],
    ["FinJornadaFH", "InicioJornadaFH"],
  ])("última jornada cerrada con %s → null", (fin, inicio) => {
    expect(
      getOpenJornadaStartPunch([at(inicio, 8, 0), at(fin, 12, 0)]),
    ).toBeNull();
  });

  it("jornada cerrada y luego Adicional abierta → la Adicional", () => {
    const adicional = at("InicioJornadaAdicional", 18, 0);
    expect(
      getOpenJornadaStartPunch([
        at("InicioJornada", 8, 0),
        at("FinJornada", 17, 0),
        adicional,
      ]),
    ).toBe(adicional);
  });

  it.each([...INVALID_TIMELINE_STATUSES])(
    "inicio con status %s no cuenta",
    (status) => {
      expect(
        getOpenJornadaStartPunch([at("InicioJornada", 8, 0, { status })]),
      ).toBeNull();
    },
  );

  it("inicio rechazado seguido de uno válido → el válido", () => {
    const valido = at("InicioJornada", 8, 5);
    expect(
      getOpenJornadaStartPunch([
        at("InicioJornada", 8, 0, { status: "Error de Imagen" }),
        valido,
      ]),
    ).toBe(valido);
  });

  it("fin rechazado no cierra la jornada", () => {
    const inicio = at("InicioJornada", 8, 0);
    expect(
      getOpenJornadaStartPunch([
        inicio,
        at("FinJornada", 12, 0, { status: "Fuera de área" }),
      ]),
    ).toBe(inicio);
  });

  it.each([true, "true"])("ignora el inicio con hasOpenDay %p", (flag) => {
    expect(
      getOpenJornadaStartPunch([
        at("InicioJornada", 8, 0, { hasOpenDay: flag as boolean | string }),
      ]),
    ).toBeNull();
  });

  it("ordena por createdDate, no por orden del array", () => {
    // FinJornada 17:00 va primero en el array pero es posterior → cerrada
    expect(
      getOpenJornadaStartPunch([at("FinJornada", 17, 0), at("InicioJornada", 8, 0)]),
    ).toBeNull();
    const adicional = at("InicioJornadaAdicional", 18, 0);
    expect(
      getOpenJornadaStartPunch([
        adicional,
        at("FinJornada", 17, 0),
        at("InicioJornada", 8, 0),
      ]),
    ).toBe(adicional);
  });

  it("ignora ponches que no son de jornada", () => {
    const inicio = at("InicioJornada", 8, 0);
    expect(
      getOpenJornadaStartPunch([
        inicio,
        at("InicioAlmuerzo", 12, 0),
        at("FinAlmuerzo", 13, 0),
        at("InicioBreak", 15, 0),
      ]),
    ).toBe(inicio);
  });
});

describe("getTodayLunchExitPunch", () => {
  const now = rd(15, 0);

  it("sin FinAlmuerzo → null", () => {
    expect(
      getTodayLunchExitPunch(
        [at("InicioJornada", 8, 0), at("InicioAlmuerzo", 12, 0)],
        now,
      ),
    ).toBeNull();
  });

  it("FinAlmuerzo válido de hoy → ese ponche", () => {
    const fin = at("FinAlmuerzo", 13, 20);
    expect(
      getTodayLunchExitPunch([at("InicioAlmuerzo", 12, 20), fin], now),
    ).toBe(fin);
  });

  it("varios → el más reciente por createdDate, no por orden del array", () => {
    const ultimo = at("FinAlmuerzo", 13, 40);
    expect(
      getTodayLunchExitPunch([ultimo, at("FinAlmuerzo", 13, 0)], now),
    ).toBe(ultimo);
  });

  it.each([...INVALID_TIMELINE_STATUSES])(
    "FinAlmuerzo con status %s no cuenta",
    (status) => {
      const valido = at("FinAlmuerzo", 13, 0);
      expect(
        getTodayLunchExitPunch(
          [valido, at("FinAlmuerzo", 13, 30, { status })],
          now,
        ),
      ).toBe(valido);
    },
  );

  it("FinAlmuerzo de otro día RD no cuenta", () => {
    const ayer: PunchEvent = {
      ...at("FinAlmuerzo", 13, 0),
      createdDate: new Date(rd(13, 0).getTime() - 24 * 60 * 60000).toISOString(),
    };
    expect(getTodayLunchExitPunch([ayer], now)).toBeNull();
  });

  it("el día lo decide la hora RD, no la UTC", () => {
    // 21:30 RD = 01:30 UTC del día siguiente: sigue siendo "hoy" en RD
    const tarde = at("FinAlmuerzo", 21, 30);
    expect(getTodayLunchExitPunch([tarde], rd(22, 0))).toBe(tarde);
  });
});
