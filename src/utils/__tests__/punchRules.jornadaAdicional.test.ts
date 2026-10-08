/// <reference types="jest" />

import type {
  TodayHoliday,
  UserSchedule,
} from "../../../types/typeStore/SchoolStoreType";
import {
  INVALID_TIMELINE_STATUSES,
  isAlmuerzoVisible,
  isJornadaVisible,
  resolvePunchTypeForApi,
  warnedUnexpectedActions,
  type PunchEvent,
  type UserDayPermission,
} from "../punchRules";

/**
 * Jornada Adicional, portada del webapp (face-class-web PunchInOutForm):
 * con un "FinJornada" válido hoy, la siguiente jornada sale como Adicional.
 */

/** Date cuya hora de pared en RD (UTC-4) es h:m. jest.config.js fija TZ=UTC. */
const rd = (h: number, m = 0): Date =>
  new Date(Date.UTC(2026, 7, 19, h + 4, m));

const TOL = { workIn: 5, workOut: 5, lunchIn: 5, lunchOut: 5 };

/** Miércoles 8:00–17:00, almuerzo 12:00–13:00 */
const schedule: UserSchedule = {
  id: 1,
  weekDay: "Miércoles",
  workEntryTime: "08:00:00",
  workExitTime: "17:00:00",
  lunchEntryTime: "12:00:00",
  lunchExitTime: "13:00:00",
};

let nextId = 1;
/** Ponche registrado hoy a las h:m (RD). */
const punch = (
  type: string,
  h: number,
  m = 0,
  extra: Partial<PunchEvent> = {},
): PunchEvent => ({
  id: nextId++,
  type,
  status: "A Tiempo",
  createdDate: rd(h, m).toISOString(),
  ...extra,
});

const permiso = (
  action: string,
  fromTime: string,
  toTime: string,
  id = 690,
): UserDayPermission => ({
  id,
  schoolId: 21,
  schoolUserId: 224,
  permissionDate: "2026-08-19T04:00:00.000Z",
  fromTime,
  toTime,
  stateTagId: 64,
  typeTagId: 105,
  actionTagId: 109,
  typeTag: { id: 105, name: "Personal" },
  stateTag: { id: 64, name: "Aprobado" },
  actionTag: { id: 109, name: action },
});

const FH = [permiso("Fuera de Horario", "09:00:00", "11:00:00")];

/** Jornada base cerrada: 08:00 → 10:00 */
const cerrada = (): PunchEvent[] => [
  punch("InicioJornada", 8),
  punch("FinJornada", 10),
];

const tipo = (
  baseType: string,
  punches: PunchEvent[],
  permissions: UserDayPermission[] = [],
  now = rd(14),
) => resolvePunchTypeForApi(baseType, punches, permissions, now);

const verJornada = (
  now: Date,
  isInicio: boolean,
  punches: PunchEvent[],
  permissions: UserDayPermission[] = [],
) =>
  isJornadaVisible(
    now,
    schedule,
    isInicio,
    TOL.workIn,
    TOL.workOut,
    punches,
    permissions,
    null,
  );

beforeEach(() => {
  warnedUnexpectedActions.clear();
});

// ─── Tipo que se envía (webapp helpers.js:697-725) ────────────────────────────

describe("resolvePunchTypeForApi — Jornada Adicional", () => {
  it("sin FinJornada hoy → InicioJornada", () => {
    expect(tipo("InicioJornada", [])).toBe("InicioJornada");
    expect(
      tipo("InicioJornada", [
        punch("InicioBreak", 9),
        punch("FinBreak", 9, 15),
      ]),
    ).toBe("InicioJornada");
  });

  it("FinJornada válido → InicioJornadaAdicional; fin con adicional abierta → FinJornadaAdicional", () => {
    expect(tipo("InicioJornada", cerrada())).toBe("InicioJornadaAdicional");
    const abierta = [...cerrada(), punch("InicioJornadaAdicional", 11)];
    expect(tipo("FinJornada", abierta)).toBe("FinJornadaAdicional");
  });

  it("sin límite: tras una adicional cerrada, la siguiente también es adicional", () => {
    const dosCiclos = [
      ...cerrada(),
      punch("InicioJornadaAdicional", 11),
      punch("FinJornadaAdicional", 12),
    ];
    expect(tipo("InicioJornada", dosCiclos)).toBe("InicioJornadaAdicional");
  });

  it.each(INVALID_TIMELINE_STATUSES)(
    "FinJornada con status %s → InicioJornada",
    (status) => {
      const rechazado = [
        punch("InicioJornada", 8),
        punch("FinJornada", 10, 0, { status }),
      ];
      expect(tipo("InicioJornada", rechazado)).toBe("InicioJornada");
    },
  );

  it("solo un ciclo FH (sin FinJornada base) → InicioJornada", () => {
    const cicloFh = [
      punch("InicioJornadaFH", 9, 0, { permissionId: 690 }),
      punch("FinJornadaFH", 10, 0, { permissionId: 690 }),
    ];
    expect(tipo("InicioJornada", cicloFh, FH, rd(10, 30))).toBe(
      "InicioJornada",
    );
    expect(tipo("InicioJornada", cicloFh)).toBe("InicioJornada");
  });

  it("FH vigente con FinJornada base → InicioJornadaFH / FinJornadaFH", () => {
    expect(tipo("InicioJornada", cerrada(), FH, rd(10, 30))).toBe(
      "InicioJornadaFH",
    );
    const fhAbierta = [
      ...cerrada(),
      punch("InicioJornadaFH", 10, 30, { permissionId: 690 }),
    ];
    expect(tipo("FinJornada", fhAbierta, FH, rd(10, 45))).toBe("FinJornadaFH");
  });
});

// ─── Entrada tras una salida (webapp index.jsx:462-483, helpers.js:366-373) ───

describe("isJornadaVisible — Entrada tras una salida", () => {
  it("dentro de la ventana visible (workEntryTime − Ver botón .. workExitTime)", () => {
    expect(verJornada(rd(10, 30), true, cerrada())).toBe(true);
    expect(verJornada(rd(16, 59), true, cerrada())).toBe(true);
    // la ventana empieza 5 min antes de la entrada
    const madrugada = [punch("InicioJornada", 6), punch("FinJornada", 7)];
    expect(verJornada(rd(7, 55), true, madrugada)).toBe(true);
    expect(verJornada(rd(7, 54), true, madrugada)).toBe(false);
  });

  it("desde workExitTime → oculta", () => {
    expect(verJornada(rd(17), true, cerrada())).toBe(false);
    expect(verJornada(rd(20), true, cerrada())).toBe(false);
  });

  it("con permiso de Entrada vigente pero fuera de la ventana → oculta", () => {
    const entrada = [permiso("Entrada", "17:30:00", "19:00:00")];
    expect(verJornada(rd(18), true, cerrada(), entrada)).toBe(false);
    // antes del primer inicio del día el permiso sí habilita
    expect(verJornada(rd(18), true, [], entrada)).toBe(true);
  });
});

// ─── Salida de la adicional (regla propia del móvil, 8-oct) ───────────────────
// Solo con la ventana de salida (workExitTime − tolWorkOut) o un permiso de
// Salida aprobado, vigente y sin consumir. Reemplaza a la regla del webapp
// (index.jsx:343-408), que queda comentada en isJornadaVisible.

describe("isJornadaVisible — Salida de la adicional", () => {
  const adicional = (): PunchEvent[] => [
    ...cerrada(),
    punch("InicioJornadaAdicional", 11),
  ];

  /** El caso de la captura: la jornada base se cerró con el permiso 690. */
  const SALIDA_USADA = permiso("Salida", "09:30:00", "11:00:00", 690);
  const conSalidaUsada = (): PunchEvent[] => [
    punch("InicioJornada", 8),
    punch("FinJornada", 9, 45, { permissionId: 690 }),
    punch("InicioJornadaAdicional", 10),
  ];

  it("captura: permiso de Salida ya consumido por la jornada base, 10:10 → oculta", () => {
    expect(
      verJornada(rd(10, 10), false, conSalidaUsada(), [SALIDA_USADA]),
    ).toBe(false);
  });

  it("mismo caso con un segundo permiso de Salida vigente y sin consumir → visible", () => {
    const nuevo = permiso("Salida", "10:00:00", "12:00:00", 691);
    expect(
      verJornada(rd(10, 10), false, conSalidaUsada(), [SALIDA_USADA, nuevo]),
    ).toBe(true);
  });

  it("mismo caso a las 16:55 (ventana de salida) → visible", () => {
    expect(
      verJornada(rd(16, 55), false, conSalidaUsada(), [SALIDA_USADA]),
    ).toBe(true);
    expect(
      verJornada(rd(16, 54), false, conSalidaUsada(), [SALIDA_USADA]),
    ).toBe(false);
  });

  it("mismo caso con un break después del inicio adicional, 10:10 → oculta", () => {
    const conBreak = [...conSalidaUsada(), punch("InicioBreak", 10, 5)];
    expect(verJornada(rd(10, 10), false, conBreak, [SALIDA_USADA])).toBe(false);
  });

  it("antes de la ventana y sin permisos → oculta; en la ventana → visible", () => {
    expect(verJornada(rd(11, 5), false, adicional())).toBe(false);
    expect(verJornada(rd(14), false, adicional())).toBe(false);
    expect(verJornada(rd(16, 55), false, adicional())).toBe(true);
    expect(verJornada(rd(23, 30), false, adicional())).toBe(true);
  });

  it("permiso de Salida nuevo fuera de su ventana → oculta", () => {
    const salida = [permiso("Salida", "12:00:00", "13:00:00")];
    expect(verJornada(rd(14), false, adicional(), salida)).toBe(false);
  });

  it("feriado no laborable, sin permisos, 10:00 → visible (la salida no se bloquea)", () => {
    const noLaborable: TodayHoliday = {
      id: 7,
      name: "Día de la Restauración",
      holidayDate: "2026-08-19",
      working: false,
    };
    expect(
      isJornadaVisible(
        rd(10),
        schedule,
        false,
        TOL.workIn,
        TOL.workOut,
        adicional(),
        [],
        noLaborable,
      ),
    ).toBe(true);
  });

  it("un FH vigente no habilita la salida de la adicional", () => {
    const fh = [permiso("Fuera de Horario", "11:00:00", "13:00:00", 692)];
    expect(verJornada(rd(12), false, adicional(), fh)).toBe(false);
  });

  it("con un break después → misma regla (ventana de salida)", () => {
    const conBreak = [...adicional(), punch("InicioBreak", 12)];
    expect(verJornada(rd(12, 30), false, conBreak)).toBe(false);
    expect(verJornada(rd(16, 55), false, conBreak)).toBe(true);

    const breakCerrado = [...conBreak, punch("FinBreak", 12, 15)];
    expect(verJornada(rd(12, 30), false, breakCerrado)).toBe(false);
    expect(verJornada(rd(17), false, breakCerrado)).toBe(true);
  });

  it("con un break después y permiso de Salida vigente sin consumir → visible", () => {
    const conBreak = [...adicional(), punch("InicioBreak", 12)];
    const salida = [permiso("Salida", "12:00:00", "13:00:00")];
    expect(verJornada(rd(12, 30), false, conBreak, salida)).toBe(true);
  });
});

// ─── Regresión: salida de la jornada normal y de una FH abierta ───────────────

describe("isJornadaVisible — Salida normal y FH sin cambios", () => {
  it("jornada normal: ventana de salida, permiso de Salida y FH vigente", () => {
    const normal = [punch("InicioJornada", 8)];
    expect(verJornada(rd(16, 54), false, normal)).toBe(false);
    expect(verJornada(rd(16, 55), false, normal)).toBe(true);
    const salida = [permiso("Salida", "09:30:00", "11:00:00")];
    expect(verJornada(rd(10), false, normal, salida)).toBe(true);
    expect(verJornada(rd(10), false, normal, FH)).toBe(true);
  });

  it("FH abierta: salida visible a cualquier hora", () => {
    const fhAbierta = [punch("InicioJornadaFH", 9, 0, { permissionId: 690 })];
    for (const now of [rd(3), rd(10), rd(14), rd(23, 30)]) {
      expect(verJornada(now, false, fhAbierta)).toBe(true);
    }
  });
});

// ─── Almuerzo (webapp index.jsx:609-614) ──────────────────────────────────────

describe("isAlmuerzoVisible — Almuerzo tras FinAlmuerzo", () => {
  const verAlmuerzo = (now: Date, punches: PunchEvent[]) =>
    isAlmuerzoVisible(
      now,
      schedule,
      TOL.lunchIn,
      TOL.lunchOut,
      punches,
      [],
      null,
    );

  it("oculto si ya hubo un FinAlmuerzo hoy, aun en una jornada adicional", () => {
    const conAlmuerzo = [
      punch("InicioJornada", 8),
      punch("InicioAlmuerzo", 11),
      punch("FinAlmuerzo", 11, 30),
      punch("FinJornada", 11, 45),
      punch("InicioJornadaAdicional", 12, 10),
    ];
    expect(verAlmuerzo(rd(12, 30), conAlmuerzo)).toBe(false);
    // sin almuerzo previo, la adicional sí lo muestra en su ventana
    const sinAlmuerzo = [...cerrada(), punch("InicioJornadaAdicional", 12, 10)];
    expect(verAlmuerzo(rd(12, 30), sinAlmuerzo)).toBe(true);
  });
});
