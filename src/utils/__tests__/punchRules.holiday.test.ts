// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import type {
  TodayHoliday,
  UserSchedule,
} from "../../../types/typeStore/SchoolStoreType";
import {
  buildTodayHoliday,
  isAlmuerzoButtonVisible,
  isAlmuerzoVisible,
  isJornadaVisible,
  isNonWorkingHoliday,
  resolvePunchTypeForApi,
  warnedUnexpectedActions,
  type PunchEvent,
  type UserDayPermission,
} from "../punchRules";

/**
 * Feriado no laborable + permiso "Fuera de Horario" (FH) en el ponchador.
 *
 * Regla: en un feriado no laborable nadie inicia jornada salvo con un FH
 * aprobado, vigente y sin consumir. El ponche sale como InicioJornadaFH /
 * FinJornadaFH para que el backend aplique el permiso.
 */

// ─── Fixtures (copiadas de punchinout.permissions.test.ts) ────────────────────

/** Date cuya hora de pared en RD (UTC-4) es h:m. jest.config.js fija TZ=UTC. */
const rd = (h: number, m = 0): Date => new Date(Date.UTC(2026, 7, 19, h + 4, m));

/** El día de `rd()` en RD */
const HOY = "2026-08-19";

const TOL = { workIn: 5, workOut: 5, lunchIn: 5, lunchOut: 5 };

const BTN = { lunchIn: 10, lunchOut: 10 };

/** Miércoles 8:00–17:00, almuerzo 12:00–13:00 */
const schedule: UserSchedule = {
  id: 1,
  weekDay: "Miércoles",
  workEntryTime: "08:00:00",
  workExitTime: "17:00:00",
  lunchEntryTime: "12:00:00",
  lunchExitTime: "13:00:00",
};

const punch = (type: string, extra: Partial<PunchEvent> = {}): PunchEvent => ({
  id: 1,
  type,
  status: "A Tiempo",
  createdDate: "2026-08-19T12:00:00.000Z",
  ...extra,
});

const PUNCHES = {
  ninguno: [] as PunchEvent[],
  jornadaIniciada: [punch("InicioJornada")],
  jornadaCerrada: [punch("InicioJornada"), punch("FinJornada")],
  almuerzoIniciado: [punch("InicioJornada"), punch("InicioAlmuerzo")],
};

/** Permiso con la forma real de GET /userdaypermissions/today/{schoolUserId} */
const permiso = (
  action: string,
  fromTime: string,
  toTime: string,
  state = "Aprobado",
): UserDayPermission => ({
  id: 690,
  schoolId: 21,
  schoolUserId: 224,
  permissionDate: "2026-08-19T04:00:00.000Z",
  fromTime,
  toTime,
  stateTagId: 64,
  typeTagId: 105,
  actionTagId: 109,
  typeTag: { id: 105, name: "Personal" },
  stateTag: { id: 64, name: state },
  actionTag: { id: 109, name: action },
});

const feriado = (
  working: boolean,
  holidayDate = HOY,
): TodayHoliday => ({
  id: 7,
  name: "Día de la Restauración",
  holidayDate,
  working,
});

const NO_LABORABLE = feriado(false);
const LABORABLE = feriado(true);

const verEntrada = (
  now: Date,
  permissions: UserDayPermission[],
  punches: PunchEvent[] = PUNCHES.ninguno,
  holiday: TodayHoliday | null = NO_LABORABLE,
  sch: UserSchedule | null = schedule,
) =>
  isJornadaVisible(
    now,
    sch,
    true,
    TOL.workIn,
    TOL.workOut,
    punches,
    permissions,
    holiday,
  );

const verSalida = (
  now: Date,
  permissions: UserDayPermission[],
  punches: PunchEvent[] = PUNCHES.jornadaIniciada,
  holiday: TodayHoliday | null = NO_LABORABLE,
  sch: UserSchedule | null = schedule,
) =>
  isJornadaVisible(
    now,
    sch,
    false,
    TOL.workIn,
    TOL.workOut,
    punches,
    permissions,
    holiday,
  );

beforeEach(() => {
  warnedUnexpectedActions.clear();
});

const FH = [permiso("Fuera de Horario", "09:00:00", "11:00:00")];

// ─── buildTodayHoliday / isNonWorkingHoliday ──────────────────────────────────

describe("buildTodayHoliday / isNonWorkingHoliday", () => {
  it("null/undefined → no es feriado no laborable", () => {
    expect(isNonWorkingHoliday(null, rd(10))).toBe(false);
    expect(isNonWorkingHoliday(undefined, rd(10))).toBe(false);
    expect(buildTodayHoliday(null)).toBeNull();
    expect(buildTodayHoliday(undefined)).toBeNull();
    expect(buildTodayHoliday({})).toBeNull();
    expect(buildTodayHoliday({ todayHoliday: null })).toBeNull();
    expect(buildTodayHoliday({ todayHoliday: { name: "X" } })).toBeNull();
  });

  it("working true → laborable", () => {
    expect(isNonWorkingHoliday(LABORABLE, rd(10))).toBe(false);
  });

  it("working false y fecha de hoy → no laborable; otra fecha → false", () => {
    expect(isNonWorkingHoliday(NO_LABORABLE, rd(10))).toBe(true);
    expect(isNonWorkingHoliday(feriado(false, "2026-08-18"), rd(10))).toBe(
      false,
    );
  });

  it("la fecha se compara en RD, no en UTC", () => {
    // 23:30 RD del 19 = 03:30 UTC del 20
    expect(isNonWorkingHoliday(NO_LABORABLE, rd(23, 30))).toBe(true);
    expect(isNonWorkingHoliday(feriado(false, "2026-08-20"), rd(23, 30))).toBe(
      false,
    );
  });

  it("holidayDate con sufijo T00:00:00.000Z se normaliza", () => {
    const h = buildTodayHoliday({
      todayHoliday: {
        id: 7,
        name: "Restauración",
        holidayDate: "2026-08-19T00:00:00.000Z",
        working: false,
      },
    });
    expect(h).toEqual({
      id: 7,
      name: "Restauración",
      holidayDate: HOY,
      working: false,
    });
    expect(isNonWorkingHoliday(h, rd(10))).toBe(true);
  });

  it.each([
    [true, true],
    [1, true],
    ["1", true],
    [false, false],
    [0, false],
    ["0", false],
    [undefined, false],
  ])("working=%p → laborable=%p", (working, laborable) => {
    const h = buildTodayHoliday({
      todayHoliday: { id: 1, name: "F", holidayDate: HOY, working },
    });
    expect(h?.working).toBe(laborable);
    expect(isNonWorkingHoliday(h, rd(10))).toBe(!laborable);
  });

  it("name ausente → cadena vacía", () => {
    const h = buildTodayHoliday({ todayHoliday: { id: 1, holidayDate: HOY } });
    expect(h?.name).toBe("");
  });
});

// ─── Entrada en feriado no laborable ──────────────────────────────────────────

describe("Entrada en feriado no laborable", () => {
  it("sin permisos, dentro del horario normal → oculta", () => {
    expect(verEntrada(rd(9), [], PUNCHES.ninguno, null)).toBe(true);
    expect(verEntrada(rd(9), [])).toBe(false);
  });

  it("FH aprobado dentro de su ventana → visible", () => {
    expect(verEntrada(rd(10), FH)).toBe(true);
    expect(verEntrada(rd(9), FH)).toBe(true);
    expect(verEntrada(rd(11), FH)).toBe(true);
  });

  it("FH aprobado fuera de su ventana → oculta", () => {
    expect(verEntrada(rd(8, 59), FH)).toBe(false);
    expect(verEntrada(rd(11, 1), FH)).toBe(false);
  });

  it("FH en estado Solicitado dentro de su ventana → oculta", () => {
    const solicitado = [
      permiso("Fuera de Horario", "09:00:00", "11:00:00", "Solicitado"),
    ];
    expect(verEntrada(rd(10), solicitado)).toBe(false);
  });

  it("permiso Entrada aprobado y vigente → oculta", () => {
    const entrada = [permiso("Entrada", "09:00:00", "11:00:00")];
    expect(verEntrada(rd(10), entrada, PUNCHES.ninguno, null)).toBe(true);
    expect(verEntrada(rd(10), entrada)).toBe(false);
  });

  it("Ausencia vigente + FH vigente → oculta", () => {
    const conAusencia = [
      ...FH,
      permiso("Ausencia", "00:00:00", "23:59:00"),
    ];
    expect(verEntrada(rd(10), conAusencia)).toBe(false);
  });

  it("feriado LABORABLE → igual que un día normal", () => {
    for (let mins = 0; mins < 24 * 60; mins += 7) {
      const now = rd(Math.floor(mins / 60), mins % 60);
      for (const perms of [[], FH]) {
        for (const p of Object.values(PUNCHES)) {
          expect(verEntrada(now, perms, p, LABORABLE)).toBe(
            verEntrada(now, perms, p, null),
          );
          expect(verSalida(now, perms, p, LABORABLE)).toBe(
            verSalida(now, perms, p, null),
          );
        }
      }
    }
  });
});

// ─── Flujo FH ─────────────────────────────────────────────────────────────────

describe("Flujo FH", () => {
  it("día normal, ciclo completo + FH vigente → Entrada visible", () => {
    // Tras una salida la Entrada vuelve dentro de la ventana normal: es la
    // jornada adicional del webapp (PunchInOutForm/index.jsx:462-483).
    expect(verEntrada(rd(10), [], PUNCHES.jornadaCerrada, null)).toBe(true);
    expect(verEntrada(rd(10), FH, PUNCHES.jornadaCerrada, null)).toBe(true);
  });

  it("FH consumido (ponche con su permissionId) → Entrada oculta", () => {
    const consumido = [
      punch("InicioJornadaFH", { permissionId: 690 }),
      punch("FinJornadaFH", { permissionId: 690 }),
    ];
    expect(verEntrada(rd(10), FH, consumido)).toBe(false);
    // Día normal: tras el ciclo FH la Entrada vuelve dentro de la ventana
    // normal (webapp PunchInOutForm/index.jsx:462-483). Sale como
    // InicioJornada porque no hay FinJornada base.
    expect(verEntrada(rd(10), FH, consumido, null)).toBe(true);
  });

  it("InicioJornadaFH abierto → Entrada oculta; Salida visible a cualquier hora, incluso en feriado", () => {
    const abierta = [punch("InicioJornadaFH", { permissionId: 690 })];
    expect(verEntrada(rd(10), FH, abierta)).toBe(false);
    // dentro de la ventana, fuera de ella, y sin el permiso
    expect(verSalida(rd(10), FH, abierta)).toBe(true);
    expect(verSalida(rd(14), FH, abierta)).toBe(true);
    expect(verSalida(rd(3), [], abierta)).toBe(true);
    expect(verSalida(rd(14), [], abierta, null)).toBe(true);
    expect(verSalida(rd(14), [], abierta, null, null)).toBe(true);
  });

  it("InicioJornadaAdicional abierto → Salida visible", () => {
    const abierta = [punch("InicioJornadaAdicional")];
    // Pedido del 8-oct: en día normal la salida de la adicional solo con la
    // ventana de salida (17:00 − 5) o un permiso de Salida sin consumir.
    expect(verSalida(rd(10), [], abierta, null)).toBe(false);
    expect(verSalida(rd(16, 55), [], abierta, null)).toBe(true);
    expect(verSalida(rd(10), [], abierta)).toBe(true);
    expect(verEntrada(rd(10), [], abierta, null)).toBe(false);
  });

  it("FinJornadaFH → Salida oculta", () => {
    const cerrada = [
      punch("InicioJornadaFH", { permissionId: 690 }),
      punch("FinJornadaFH", { permissionId: 690 }),
    ];
    expect(verSalida(rd(10), FH, cerrada)).toBe(false);
    expect(verSalida(rd(18), [], cerrada, null)).toBe(false);
  });

  it.each(["Inválido", "Fuera de área", "Error de Imagen"])(
    "InicioJornadaFH con status %s no cuenta como jornada abierta",
    (status) => {
      const rechazado = [punch("InicioJornadaFH", { status })];
      // Salida a las 10:00 en un día normal sin permisos: solo sería visible
      // si contara como jornada FH abierta.
      expect(verSalida(rd(10), [], rechazado, null)).toBe(false);
      // y la Entrada sigue disponible en la ventana normal
      expect(verEntrada(rd(9), [], rechazado, null)).toBe(true);
    },
  );

  it("InicioJornada con status Inválido SÍ cuenta (sin cambio)", () => {
    const invalido = [punch("InicioJornada", { status: "Inválido" })];
    expect(verEntrada(rd(9), [], invalido, null)).toBe(false);
    expect(verSalida(rd(17), [], invalido, null)).toBe(true);
  });
});

// ─── resolvePunchTypeForApi ───────────────────────────────────────────────────

describe("resolvePunchTypeForApi", () => {
  it("InicioJornada sin FH → InicioJornada; con FH usable → InicioJornadaFH", () => {
    expect(resolvePunchTypeForApi("InicioJornada", [], [], rd(10))).toBe(
      "InicioJornada",
    );
    expect(resolvePunchTypeForApi("InicioJornada", [], FH, rd(10))).toBe(
      "InicioJornadaFH",
    );
    // fuera de la ventana o consumido → normal
    expect(resolvePunchTypeForApi("InicioJornada", [], FH, rd(12))).toBe(
      "InicioJornada",
    );
    const consumido = [
      punch("InicioJornadaFH", { permissionId: 690 }),
      punch("FinJornadaFH", { permissionId: 690 }),
    ];
    expect(resolvePunchTypeForApi("InicioJornada", consumido, FH, rd(10))).toBe(
      "InicioJornada",
    );
  });

  it("FinJornada según el inicio abierto", () => {
    expect(
      resolvePunchTypeForApi("FinJornada", [punch("InicioJornada")], FH, rd(10)),
    ).toBe("FinJornada");
    expect(
      resolvePunchTypeForApi(
        "FinJornada",
        [punch("InicioJornadaFH", { permissionId: 690 })],
        [],
        rd(14),
      ),
    ).toBe("FinJornadaFH");
    expect(
      resolvePunchTypeForApi(
        "FinJornada",
        [punch("InicioJornadaAdicional")],
        [],
        rd(10),
      ),
    ).toBe("FinJornadaAdicional");
  });

  it.each(["InicioAlmuerzo", "FinAlmuerzo", "InicioBreak", "FinBreak"])(
    "%s → sin cambio",
    (type) => {
      expect(
        resolvePunchTypeForApi(type, [punch("InicioJornadaFH")], FH, rd(10)),
      ).toBe(type);
    },
  );
});

// ─── Almuerzo en feriado no laborable ─────────────────────────────────────────

describe("Almuerzo en feriado no laborable", () => {
  const verAlmuerzo = (
    now: Date,
    punches: PunchEvent[],
    holiday: TodayHoliday | null,
  ) =>
    isAlmuerzoVisible(
      now,
      schedule,
      TOL.lunchIn,
      TOL.lunchOut,
      punches,
      [],
      holiday,
    );

  const verBoton = (
    now: Date,
    isInicio: boolean,
    punches: PunchEvent[],
    holiday: TodayHoliday | null,
  ) =>
    isAlmuerzoButtonVisible(
      now,
      schedule,
      isInicio,
      BTN.lunchIn,
      BTN.lunchOut,
      punches,
      [],
      holiday,
    );

  it("isAlmuerzoVisible: oculto dentro de la ventana; visible con almuerzo abierto", () => {
    expect(verAlmuerzo(rd(12, 30), PUNCHES.jornadaIniciada, null)).toBe(true);
    expect(verAlmuerzo(rd(12, 30), PUNCHES.jornadaIniciada, NO_LABORABLE)).toBe(
      false,
    );
    expect(verAlmuerzo(rd(12, 30), PUNCHES.almuerzoIniciado, NO_LABORABLE)).toBe(
      true,
    );
    expect(verAlmuerzo(rd(12, 30), PUNCHES.jornadaIniciada, LABORABLE)).toBe(
      true,
    );
  });

  it("isAlmuerzoButtonVisible: Entrada oculta; Salida conserva sus reglas", () => {
    expect(verBoton(rd(12, 30), true, PUNCHES.jornadaIniciada, null)).toBe(true);
    expect(
      verBoton(rd(12, 30), true, PUNCHES.jornadaIniciada, NO_LABORABLE),
    ).toBe(false);
    expect(verBoton(rd(13), false, PUNCHES.almuerzoIniciado, NO_LABORABLE)).toBe(
      verBoton(rd(13), false, PUNCHES.almuerzoIniciado, null),
    );
    expect(verBoton(rd(13), false, PUNCHES.almuerzoIniciado, NO_LABORABLE)).toBe(
      true,
    );
  });
});
