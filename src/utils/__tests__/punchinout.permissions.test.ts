// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import type { UserSchedule } from "../../../types/typeStore/SchoolStoreType";
import {
  PERMISSION_ACTION,
  getApprovedPermission,
  getApprovedPermissionsToday,
  getPunctuality,
  getRDMinutes,
  isAlmuerzoButtonVisible,
  isAlmuerzoVisible,
  isBreakVisible,
  isJornadaVisible,
  timeStrToMinutes,
  warnedUnexpectedActions,
  type PunchEvent,
  type UserDayPermission,
} from "../punchRules";

/**
 * Feature 1 — permisos del día aplicados al ponchador.
 *
 * Todo lo de aquí es lógica pura: no hay red, emulador ni componentes. El caso
 * 14 (aprobar un permiso desde el webapp y refrescar con pull-to-refresh) es
 * manual a propósito y NO está automatizado.
 */

// ─── Oráculo de regresión ─────────────────────────────────────────────────────
// Copia literal de las implementaciones ANTES de la feature (commit 030ae69),
// extraída del propio git. Sirve para probar que sin permisos aplicables el
// comportamiento es idéntico al de siempre. Si alguna vez cambian a propósito
// las reglas base (no las de permisos), estas copias hay que actualizarlas.

function isJornadaVisibleLegacy(
  now: Date,
  schedule: UserSchedule | null,
  isInicio: boolean,
  tolWorkIn: number,
  tolWorkOut: number,
  punches: PunchEvent[],
): boolean {
  // Sin horario -> ocultar siempre
  if (!schedule) return false;

  const current = getRDMinutes(now);
  // Los intentos rechazados por imagen no cuentan como jornada iniciada
  const lastJornada = [...punches]
    .reverse()
    .find(
      (p) =>
        (p.type === "InicioJornada" || p.type === "FinJornada") &&
        p.status !== "Error de Imagen" &&
        !p.hasOpenDay &&
        p.hasOpenDay !== ("true" as any),
    );

  if (isInicio) {
    // Ya poncho entrada -> ocultar (jornada activa)
    if (lastJornada?.type === "InicioJornada") return false;
    // Ya salio hoy -> ocultar
    if (lastJornada?.type === "FinJornada") return false;
    // Sin ponche -> visible desde N min antes de entrada (tolerancia) hasta el
    // fin exacto de la jornada (workExitTime, sin tolerancia extra — la ventana
    // completa de la jornada ya es el margen)
    const entryStart = timeStrToMinutes(schedule.workEntryTime) - tolWorkIn;
    const entryEnd = timeStrToMinutes(schedule.workExitTime);
    return current >= entryStart && current < entryEnd;
  } else {
    // Ya salio hoy -> ocultar
    if (lastJornada?.type === "FinJornada") return false;
    // Visible desde N min antes de salida, sin limite superior (horas extras)
    const exitStart = timeStrToMinutes(schedule.workExitTime) - tolWorkOut;
    return current >= exitStart;
  }
}

function isAlmuerzoVisibleLegacy(
  now: Date,
  schedule: UserSchedule | null,
  tolLunchIn: number,
  tolLunchOut: number,
  punches: PunchEvent[],
): boolean {
  if (!schedule) return false;

  const lastAlmuerzo = [...punches]
    .reverse()
    .find((p) => p.type === "InicioAlmuerzo" || p.type === "FinAlmuerzo");

  if (lastAlmuerzo?.type === "InicioAlmuerzo") return true;
  if (lastAlmuerzo?.type === "FinAlmuerzo") return false;

  if (!schedule.lunchEntryTime || !schedule.lunchExitTime) return false;

  const current = getRDMinutes(now);
  const windowStart = timeStrToMinutes(schedule.lunchEntryTime) - tolLunchIn;
  const windowEnd = timeStrToMinutes(schedule.lunchExitTime) + tolLunchOut;

  return current >= windowStart && current <= windowEnd;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Date cuya hora de pared en RD (UTC-4) es h:m. jest.config.js fija TZ=UTC. */
const rd = (h: number, m = 0): Date => new Date(Date.UTC(2026, 7, 19, h + 4, m));

const TOL = { workIn: 5, workOut: 5, lunchIn: 5, lunchOut: 5 };

/** "Ver Botón" — a propósito distinto de TOL, para probar que la ventana de
 * visibilidad del botón (isAlmuerzoButtonVisible) no se confunde con la
 * tolerancia de puntualidad (getPunctuality, fuera del alcance de este
 * archivo — eso vive en punchinout.tsx). */
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

const scheduleSinAlmuerzo: UserSchedule = {
  ...schedule,
  lunchEntryTime: null,
  lunchExitTime: null,
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
  almuerzoCerrado: [
    punch("InicioJornada"),
    punch("InicioAlmuerzo"),
    punch("FinAlmuerzo"),
  ],
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

const verEntrada = (
  now: Date,
  permissions: UserDayPermission[],
  punches: PunchEvent[] = PUNCHES.ninguno,
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
  );

const verSalida = (
  now: Date,
  permissions: UserDayPermission[],
  punches: PunchEvent[] = PUNCHES.jornadaIniciada,
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
  );

const verAlmuerzo = (
  now: Date,
  permissions: UserDayPermission[],
  punches: PunchEvent[] = PUNCHES.jornadaIniciada,
  sch: UserSchedule | null = schedule,
) =>
  isAlmuerzoVisible(
    now,
    sch,
    TOL.lunchIn,
    TOL.lunchOut,
    punches,
    permissions,
  );

const verAlmuerzoBotonEntrada = (
  now: Date,
  permissions: UserDayPermission[] = [],
  punches: PunchEvent[] = PUNCHES.jornadaIniciada,
  sch: UserSchedule | null = schedule,
) =>
  isAlmuerzoButtonVisible(
    now,
    sch,
    true,
    BTN.lunchIn,
    BTN.lunchOut,
    punches,
    permissions,
  );

const verAlmuerzoBotonSalida = (
  now: Date,
  permissions: UserDayPermission[] = [],
  punches: PunchEvent[] = PUNCHES.almuerzoIniciado,
  sch: UserSchedule | null = schedule,
) =>
  isAlmuerzoButtonVisible(
    now,
    sch,
    false,
    BTN.lunchIn,
    BTN.lunchOut,
    punches,
    permissions,
  );

beforeEach(() => {
  // El warn de acción desconocida se memoriza por proceso — limpiarlo mantiene
  // los tests independientes entre sí.
  warnedUnexpectedActions.clear();
});

// ─── 1. REGRESIÓN: sin permisos aplicables, comportamiento idéntico ───────────

describe("1. Regresión — sin permisos aplicables nada cambia", () => {
  /**
   * Barre cada minuto del día contra el oráculo pre-feature, cruzando los 3
   * tipos de horario y los 5 estados de ponches, para Entrada y Salida y para
   * Almuerzo. `skip` excluye la franja en que el fixture SÍ debe aplicar.
   */
  const barrer = (
    permissions: UserDayPermission[],
    skip?: [number, number],
  ): string[] => {
    const diffs: string[] = [];
    for (const sch of [schedule, scheduleSinAlmuerzo, null]) {
      for (const [estado, punches] of Object.entries(PUNCHES)) {
        for (let mins = 0; mins < 24 * 60; mins++) {
          if (skip && mins >= skip[0] && mins <= skip[1]) continue;
          const now = rd(Math.floor(mins / 60), mins % 60);
          const ctx = `${estado} sch=${sch ? (sch.lunchEntryTime ? "completo" : "sinAlmuerzo") : "null"} ${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;

          for (const isInicio of [true, false]) {
            const antes = isJornadaVisibleLegacy(
              now,
              sch,
              isInicio,
              TOL.workIn,
              TOL.workOut,
              punches,
            );
            const ahora = isJornadaVisible(
              now,
              sch,
              isInicio,
              TOL.workIn,
              TOL.workOut,
              punches,
              permissions,
            );
            if (antes !== ahora) {
              diffs.push(
                `jornada ${isInicio ? "entrada" : "salida"} ${ctx}: antes=${antes} ahora=${ahora}`,
              );
            }
          }

          const antesA = isAlmuerzoVisibleLegacy(
            now,
            sch,
            TOL.lunchIn,
            TOL.lunchOut,
            punches,
          );
          const ahoraA = isAlmuerzoVisible(
            now,
            sch,
            TOL.lunchIn,
            TOL.lunchOut,
            punches,
            permissions,
          );
          if (antesA !== ahoraA) {
            diffs.push(`almuerzo ${ctx}: antes=${antesA} ahora=${ahoraA}`);
          }
        }
      }
    }
    return diffs;
  };

  it("1a. sin ningún permiso hoy (array vacío)", () => {
    expect(barrer([])).toEqual([]);
  });

  it("1b. permiso de una acción sin efecto (Horas Extras aprobado todo el día)", () => {
    expect(barrer([permiso("Horas Extras", "00:00:00", "23:59:00")])).toEqual(
      [],
    );
  });

  it("1c. permiso con acción desconocida aprobado todo el día", () => {
    // el warn de acción desconocida es el comportamiento esperado aquí
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(barrer([permiso("Vacaciones", "00:00:00", "23:59:00")])).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("1d. todas las acciones en estado Solicitado, todo el día", () => {
    const solicitados = Object.values(PERMISSION_ACTION).map((a) =>
      permiso(a, "00:00:00", "23:59:00", "Solicitado"),
    );
    expect(barrer(solicitados)).toEqual([]);
  });

  it("1e. todas las acciones en estado Rechazado, todo el día", () => {
    const rechazados = Object.values(PERMISSION_ACTION).map((a) =>
      permiso(a, "00:00:00", "23:59:00", "Rechazado"),
    );
    expect(barrer(rechazados)).toEqual([]);
  });

  it("1f. permisos aprobados evaluados fuera de su ventana (01:00–02:00)", () => {
    const aprobados = [
      permiso("Ausencia", "01:00:00", "02:00:00"),
      permiso("Entrada", "01:00:00", "02:00:00"),
      permiso("Salida", "01:00:00", "02:00:00"),
      permiso("Fuera de Horario", "01:00:00", "02:00:00"),
    ];
    expect(barrer(aprobados, [60, 120])).toEqual([]);
  });
});

// ─── 2–3. AUSENCIA ────────────────────────────────────────────────────────────

describe("2. Ausencia aprobada bloquea todo el día", () => {
  const ausencia = [permiso("Ausencia", "00:00:00", "23:59:00")];

  it.each([
    ["madrugada", 3, 0],
    ["antes de entrar", 7, 55],
    ["en horario", 9, 0],
    ["hora de almuerzo", 12, 30],
    ["hora de salida", 17, 0],
    ["noche", 23, 30],
  ])("2. %s (%i:%i) — Entrada, Salida y Almuerzo ocultos", (_l, h, m) => {
    expect(verEntrada(rd(h, m), ausencia)).toBe(false);
    expect(verSalida(rd(h, m), ausencia)).toBe(false);
    expect(verAlmuerzo(rd(h, m), ausencia)).toBe(false);
  });

  it("2b. bloquea incluso con el almuerzo ya iniciado", () => {
    expect(verAlmuerzo(rd(12, 30), ausencia, PUNCHES.almuerzoIniciado)).toBe(
      false,
    );
  });
});

describe("3. Ausencia en estado Solicitado no bloquea nada", () => {
  const solicitada = [permiso("Ausencia", "00:00:00", "23:59:00", "Solicitado")];

  it("3. se comporta igual que sin permisos", () => {
    expect(verEntrada(rd(9), solicitada)).toBe(verEntrada(rd(9), []));
    expect(verSalida(rd(17), solicitada)).toBe(verSalida(rd(17), []));
    expect(verAlmuerzo(rd(12, 30), solicitada)).toBe(
      verAlmuerzo(rd(12, 30), []),
    );
    // y en concreto: siguen visibles cuando toca
    expect(verEntrada(rd(9), solicitada)).toBe(true);
    expect(verSalida(rd(17), solicitada)).toBe(true);
    expect(verAlmuerzo(rd(12, 30), solicitada)).toBe(true);
  });
});

// ─── 4–5. ENTRADA ─────────────────────────────────────────────────────────────

describe("4–5. Permiso de Entrada (llegada tardía)", () => {
  const entrada = [permiso("Entrada", "08:00:00", "11:30:00")];

  it("4. dentro de la ventana el botón Entrada está habilitado", () => {
    expect(verEntrada(rd(8), entrada)).toBe(true);
    expect(verEntrada(rd(9, 30), entrada)).toBe(true);
    expect(verEntrada(rd(11, 30), entrada)).toBe(true);
    // sin el permiso, a esas horas estaría visible
    expect(verEntrada(rd(9, 30), [])).toBe(true);
  });

  it("5. pasada la ventana el botón Entrada vuelve a estar visible", () => {
    expect(verEntrada(rd(11, 31), entrada)).toBe(true);
    expect(verEntrada(rd(13), entrada)).toBe(true);
    // y sigue respetando el horario normal: a las 17:00 ya venció la ventana
    expect(verEntrada(rd(17), entrada)).toBe(false);
  });

  it("5b. no afecta Salida ni Almuerzo", () => {
    expect(verSalida(rd(17), entrada)).toBe(true);
    expect(verAlmuerzo(rd(12, 30), entrada)).toBe(true);
  });
});

// ─── 6–8. SALIDA ──────────────────────────────────────────────────────────────

describe("6–8. Permiso de Salida (salida anticipada)", () => {
  const salida = [permiso("Salida", "11:30:00", "15:00:00")];

  it("6. dentro de la ventana la Salida es visible antes del workExitTime", () => {
    // sin permiso estaría oculta: exitStart = 17:00 - 5min = 16:55
    expect(verSalida(rd(12), [])).toBe(false);
    expect(verSalida(rd(12), salida)).toBe(true);
    expect(verSalida(rd(11, 30), salida)).toBe(true);
    expect(verSalida(rd(15), salida)).toBe(true);
  });

  it("7. fuera de la ventana y antes del workExitTime, Salida oculta", () => {
    expect(verSalida(rd(10), salida)).toBe(false);
    expect(verSalida(rd(15, 1), salida)).toBe(false);
    expect(verSalida(rd(16, 54), salida)).toBe(false);
  });

  it("8. salida tardía normal (sin permisos) sigue visible sin límite superior", () => {
    expect(verSalida(rd(16, 55), [])).toBe(true);
    expect(verSalida(rd(17), [])).toBe(true);
    expect(verSalida(rd(20), [])).toBe(true);
    expect(verSalida(rd(23, 59), [])).toBe(true);
  });

  it("8b. si ya ponchó FinJornada, el permiso no la reabre", () => {
    expect(verSalida(rd(12), salida, PUNCHES.jornadaCerrada)).toBe(false);
  });
});

// ─── 9–10. FUERA DE HORARIO ───────────────────────────────────────────────────

describe("9–10. Permiso de Fuera de Horario", () => {
  const fuera = [permiso("Fuera de Horario", "19:00:00", "22:00:00")];

  it("9. sin horario asignado, habilita Entrada y Salida dentro de la ventana", () => {
    // baseline: sin horario, ambos ocultos siempre
    expect(verEntrada(rd(20), [], PUNCHES.ninguno, null)).toBe(false);
    expect(verSalida(rd(20), [], PUNCHES.jornadaIniciada, null)).toBe(false);

    expect(verEntrada(rd(20), fuera, PUNCHES.ninguno, null)).toBe(true);
    expect(verSalida(rd(20), fuera, PUNCHES.jornadaIniciada, null)).toBe(true);
  });

  it("9b. sin horario y fuera de la ventana, siguen ocultos", () => {
    expect(verEntrada(rd(23), fuera, PUNCHES.ninguno, null)).toBe(false);
    expect(verSalida(rd(23), fuera, PUNCHES.jornadaIniciada, null)).toBe(false);
  });

  it("10a. con horario normal, habilita Entrada DESPUÉS del workExitTime", () => {
    expect(verEntrada(rd(20), [])).toBe(false);
    expect(verEntrada(rd(20), fuera)).toBe(true);
  });

  it("10b. con horario normal, habilita Entrada ANTES del workEntryTime", () => {
    const madrugada = [permiso("Fuera de Horario", "05:00:00", "07:00:00")];
    expect(verEntrada(rd(6), [])).toBe(false);
    expect(verEntrada(rd(6), madrugada)).toBe(true);
    expect(verSalida(rd(6), madrugada)).toBe(true);
  });

  it("10c. no reabre la jornada ya cerrada ni duplica una activa", () => {
    expect(verEntrada(rd(20), fuera, PUNCHES.jornadaIniciada)).toBe(false);
    expect(verSalida(rd(20), fuera, PUNCHES.jornadaCerrada)).toBe(false);
  });
});

// ─── 12. ALMUERZO ─────────────────────────────────────────────────────────────

describe("12. Permiso de Almuerzo reemplaza la ventana del horario", () => {
  const almuerzo = [permiso("Almuerzo", "15:00:00", "16:00:00")];

  it("12a. la ventana del horario (12:00–13:00) deja de aplicar", () => {
    expect(verAlmuerzo(rd(12, 30), [])).toBe(true);
    expect(verAlmuerzo(rd(12, 30), almuerzo)).toBe(false);
  });

  it("12b. manda la ventana del permiso, con la misma tolerancia", () => {
    expect(verAlmuerzo(rd(15, 30), almuerzo)).toBe(true);
    expect(verAlmuerzo(rd(14, 55), almuerzo)).toBe(true); // 15:00 - 5min
    expect(verAlmuerzo(rd(16, 5), almuerzo)).toBe(true); // 16:00 + 5min
    expect(verAlmuerzo(rd(14, 54), almuerzo)).toBe(false);
    expect(verAlmuerzo(rd(16, 6), almuerzo)).toBe(false);
  });

  it("12c. aplica aunque el horario del día no tenga almuerzo definido", () => {
    expect(
      verAlmuerzo(rd(15, 30), [], PUNCHES.jornadaIniciada, scheduleSinAlmuerzo),
    ).toBe(false);
    expect(
      verAlmuerzo(
        rd(15, 30),
        almuerzo,
        PUNCHES.jornadaIniciada,
        scheduleSinAlmuerzo,
      ),
    ).toBe(true);
  });

  it("12d. respeta los ponches ya hechos de almuerzo", () => {
    expect(verAlmuerzo(rd(9), almuerzo, PUNCHES.almuerzoIniciado)).toBe(true);
    expect(verAlmuerzo(rd(15, 30), almuerzo, PUNCHES.almuerzoCerrado)).toBe(
      false,
    );
  });
});

// ─── 13. COMBINADO ────────────────────────────────────────────────────────────

describe("13. Ausencia + Entrada el mismo día", () => {
  const ambos = [
    permiso("Entrada", "08:00:00", "11:30:00"),
    permiso("Ausencia", "00:00:00", "23:59:00"),
  ];

  it("13. gana Ausencia: Entrada, Salida y Almuerzo ocultos", () => {
    // 12:00 está FUERA de la ventana del permiso de Entrada, así que si
    // ganara Entrada la Salida y el Almuerzo seguirían su curso normal.
    expect(verEntrada(rd(12), ambos)).toBe(false);
    expect(verSalida(rd(17), ambos)).toBe(false);
    expect(verAlmuerzo(rd(12, 30), ambos)).toBe(false);
  });

  it("13b. Ausencia también gana sobre Fuera de Horario", () => {
    const conFuera = [
      permiso("Fuera de Horario", "19:00:00", "22:00:00"),
      permiso("Ausencia", "00:00:00", "23:59:00"),
    ];
    expect(verEntrada(rd(20), conFuera)).toBe(false);
    expect(verSalida(rd(20), conFuera)).toBe(false);
  });
});

// ─── 14. isAlmuerzoButtonVisible — Entrada usa TODO el bloque de almuerzo ─────
// A diferencia de Salida (ventana simétrica alrededor de su propio horario),
// Entrada arranca en lunchEntryTime - margen pero se extiende hasta
// lunchExitTime + margen — el bloque completo de almuerzo con colchón en
// ambas puntas, para que llegar tarde a marcar la entrada no deje a la
// persona sin acceso al resto de su almuerzo. Horario fixture: almuerzo
// 12:00–13:00, BTN.lunchIn/Out=10 (distinto de TOL=5 a propósito) -> Entrada
// visible 11:50–13:10. La etiqueta de puntualidad (Tardanza/A Tiempo) sigue
// siendo cosa de Tolerancia (getPunctuality, fuera de este archivo) — un
// ponche tardío dentro de esta ventana ensanchada sigue pudiendo dar
// Tardanza si corresponde.

describe("14. isAlmuerzoButtonVisible — Entrada", () => {
  it("14a. oculto antes de que abra la ventana (11:49, 11 min antes de entrada)", () => {
    expect(verAlmuerzoBotonEntrada(rd(11, 49))).toBe(false);
  });

  it("14b. visible apenas abre la ventana (11:50, 10 min antes de entrada)", () => {
    expect(verAlmuerzoBotonEntrada(rd(11, 50))).toBe(true);
  });

  it("14c. visible exactamente en el horario de entrada (12:00)", () => {
    expect(verAlmuerzoBotonEntrada(rd(12, 0))).toBe(true);
  });

  it("14d. sigue visible bien pasada la entrada — no se cierra ahí (12:30)", () => {
    expect(verAlmuerzoBotonEntrada(rd(12, 30))).toBe(true);
  });

  it("14e. visible exactamente en el horario de salida (13:00)", () => {
    expect(verAlmuerzoBotonEntrada(rd(13, 0))).toBe(true);
  });

  it("14f. visible justo al cierre de la ventana (13:10, 10 min después de salida)", () => {
    expect(verAlmuerzoBotonEntrada(rd(13, 10))).toBe(true);
  });

  it("14g. oculto apenas se pasa del cierre (13:11)", () => {
    expect(verAlmuerzoBotonEntrada(rd(13, 11))).toBe(false);
  });

  it("14h. oculto si ya inició o ya cerró el almuerzo hoy", () => {
    expect(
      verAlmuerzoBotonEntrada(rd(12, 30), [], PUNCHES.almuerzoIniciado),
    ).toBe(false);
    expect(
      verAlmuerzoBotonEntrada(rd(12, 30), [], PUNCHES.almuerzoCerrado),
    ).toBe(false);
  });

  it("14i. oculto sin horario de almuerzo configurado (ni entrada ni salida)", () => {
    expect(
      verAlmuerzoBotonEntrada(
        rd(12, 30),
        [],
        PUNCHES.jornadaIniciada,
        scheduleSinAlmuerzo,
      ),
    ).toBe(false);
  });

  it("14j. oculto si falta lunchExitTime aunque haya lunchEntryTime", () => {
    const scheduleSinSalida: UserSchedule = {
      ...schedule,
      lunchExitTime: null,
    };
    expect(
      verAlmuerzoBotonEntrada(rd(12, 30), [], PUNCHES.jornadaIniciada, scheduleSinSalida),
    ).toBe(false);
  });

  it("14k. Ausencia aprobada oculta el botón igual que siempre", () => {
    const ausencia = [permiso("Ausencia", "00:00:00", "23:59:00")];
    expect(verAlmuerzoBotonEntrada(rd(12, 30), ausencia)).toBe(false);
  });

  it("14l. permiso de Almuerzo reemplaza la ventana, mismo criterio ensanchado", () => {
    const permisoAlmuerzo = [permiso("Almuerzo", "15:00:00", "16:00:00")];
    expect(verAlmuerzoBotonEntrada(rd(14, 49), permisoAlmuerzo)).toBe(false);
    expect(verAlmuerzoBotonEntrada(rd(14, 50), permisoAlmuerzo)).toBe(true);
    expect(verAlmuerzoBotonEntrada(rd(15, 30), permisoAlmuerzo)).toBe(true);
    expect(verAlmuerzoBotonEntrada(rd(16, 10), permisoAlmuerzo)).toBe(true);
    expect(verAlmuerzoBotonEntrada(rd(16, 11), permisoAlmuerzo)).toBe(false);
  });
});

describe("15. isAlmuerzoButtonVisible — Salida", () => {
  it("15a. oculto antes de que abra la ventana (12:49, 11 min antes)", () => {
    expect(verAlmuerzoBotonSalida(rd(12, 49))).toBe(false);
  });

  it("15b. visible apenas abre la ventana (12:50, 10 min antes)", () => {
    expect(verAlmuerzoBotonSalida(rd(12, 50))).toBe(true);
  });

  it("15c. visible exactamente en el horario (13:00)", () => {
    expect(verAlmuerzoBotonSalida(rd(13, 0))).toBe(true);
  });

  it("15d. visible justo al cierre de la ventana (13:10, 10 min después)", () => {
    expect(verAlmuerzoBotonSalida(rd(13, 10))).toBe(true);
  });

  it("15e. oculto apenas se pasa del cierre (13:11)", () => {
    expect(verAlmuerzoBotonSalida(rd(13, 11))).toBe(false);
  });

  it("15f. oculto si no inició almuerzo, o si ya lo cerró", () => {
    expect(
      verAlmuerzoBotonSalida(rd(13, 0), [], PUNCHES.jornadaIniciada),
    ).toBe(false);
    expect(
      verAlmuerzoBotonSalida(rd(13, 0), [], PUNCHES.almuerzoCerrado),
    ).toBe(false);
  });

  it("15g. Ausencia aprobada oculta el botón igual que siempre", () => {
    const ausencia = [permiso("Ausencia", "00:00:00", "23:59:00")];
    expect(verAlmuerzoBotonSalida(rd(13, 0), ausencia)).toBe(false);
  });

  it("15h. permiso de Almuerzo reemplaza la ventana, mismo margen simétrico", () => {
    const permisoAlmuerzo = [permiso("Almuerzo", "15:00:00", "16:00:00")];
    const conAlmuerzoIniciado = [
      ...PUNCHES.jornadaIniciada,
      punch("InicioAlmuerzo"),
    ];
    expect(
      verAlmuerzoBotonSalida(rd(15, 49), permisoAlmuerzo, conAlmuerzoIniciado),
    ).toBe(false);
    expect(
      verAlmuerzoBotonSalida(rd(15, 50), permisoAlmuerzo, conAlmuerzoIniciado),
    ).toBe(true);
    expect(
      verAlmuerzoBotonSalida(rd(16, 10), permisoAlmuerzo, conAlmuerzoIniciado),
    ).toBe(true);
    expect(
      verAlmuerzoBotonSalida(rd(16, 11), permisoAlmuerzo, conAlmuerzoIniciado),
    ).toBe(false);
  });
});

// ─── 16. isBreakVisible — no se puede estar en Break y Almuerzo a la vez ──────

describe("16. isBreakVisible", () => {
  it("16a. visible sin ningún ponche de almuerzo hoy", () => {
    expect(isBreakVisible(PUNCHES.ninguno)).toBe(true);
  });

  it("16b. visible con la jornada iniciada, sin haber ido a almorzar", () => {
    expect(isBreakVisible(PUNCHES.jornadaIniciada)).toBe(true);
  });

  it("16c. oculto mientras el almuerzo está activo (InicioAlmuerzo sin cerrar)", () => {
    expect(isBreakVisible(PUNCHES.almuerzoIniciado)).toBe(false);
  });

  it("16d. visible de nuevo una vez que el almuerzo ya se cerró", () => {
    expect(isBreakVisible(PUNCHES.almuerzoCerrado)).toBe(true);
  });
});

// ─── Helper puro: getApprovedPermission ───────────────────────────────────────

describe("getApprovedPermission", () => {
  it("solo devuelve permisos aprobados y vigentes", () => {
    const ps = [permiso("Salida", "11:30:00", "15:00:00")];
    expect(getApprovedPermission(ps, PERMISSION_ACTION.SALIDA, rd(12))?.id).toBe(
      690,
    );
    expect(getApprovedPermission(ps, PERMISSION_ACTION.SALIDA, rd(16))).toBe(
      null,
    );
    expect(getApprovedPermission(ps, PERMISSION_ACTION.ENTRADA, rd(12))).toBe(
      null,
    );
  });

  it("entre varios de la misma acción elige el que cubre la hora actual", () => {
    const ps = [
      permiso("Salida", "01:00:00", "02:00:00"),
      permiso("Salida", "11:30:00", "15:00:00"),
    ];
    expect(
      getApprovedPermission(ps, PERMISSION_ACTION.SALIDA, rd(12))?.fromTime,
    ).toBe("11:30:00");
  });

  it("normaliza casing y espacios en actionTag y stateTag", () => {
    const ps = [permiso("  SALIDA  ", "11:30:00", "15:00:00", " aprobado ")];
    expect(getApprovedPermission(ps, PERMISSION_ACTION.SALIDA, rd(12))).not.toBe(
      null,
    );
  });

  it("tolera tags nulos sin lanzar", () => {
    const ps = [
      { ...permiso("Salida", "11:30:00", "15:00:00"), actionTag: null, stateTag: null },
    ];
    expect(() =>
      getApprovedPermission(ps, PERMISSION_ACTION.SALIDA, rd(12)),
    ).not.toThrow();
    expect(getApprovedPermission(ps, PERMISSION_ACTION.SALIDA, rd(12))).toBe(
      null,
    );
  });

  it("avisa en consola cuando llega una acción aprobada desconocida", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const ps = [permiso("Entradas", "08:00:00", "11:30:00")];
    getApprovedPermission(ps, PERMISSION_ACTION.ENTRADA, rd(9));
    expect(warn).toHaveBeenCalledWith(
      "Permiso con actionTag.name inesperado:",
      "Entradas",
    );
    warn.mockRestore();
  });
});

describe("getApprovedPermissionsToday", () => {
  it("devuelve todos los permisos aprobados, sin filtrar por acción ni hora", () => {
    const ps = [
      permiso("Entrada", "08:00:00", "11:30:00"),
      permiso("Salida", "11:30:00", "15:00:00"),
      permiso("Almuerzo", "15:00:00", "16:00:00"),
    ];
    expect(getApprovedPermissionsToday(ps)).toHaveLength(3);
  });

  it("descarta los que no están aprobados", () => {
    const ps = [
      permiso("Entrada", "08:00:00", "11:30:00", "Solicitado"),
      permiso("Salida", "11:30:00", "15:00:00", "Rechazado"),
      permiso("Ausencia", "08:00:00", "18:00:00"),
    ];
    const aprobados = getApprovedPermissionsToday(ps);
    expect(aprobados).toHaveLength(1);
    expect(aprobados[0].actionTag?.name).toBe("Ausencia");
  });

  it("normaliza casing y espacios en stateTag", () => {
    const ps = [permiso("Salida", "11:30:00", "15:00:00", " APROBADO ")];
    expect(getApprovedPermissionsToday(ps)).toHaveLength(1);
  });

  it("tolera stateTag nulo y lista vacía sin lanzar", () => {
    const ps = [
      { ...permiso("Salida", "11:30:00", "15:00:00"), stateTag: null },
    ];
    expect(getApprovedPermissionsToday(ps)).toEqual([]);
    expect(getApprovedPermissionsToday([])).toEqual([]);
  });

  it("no avisa por acciones desconocidas: no mira actionTag", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const ps = [permiso("Entradas", "08:00:00", "11:30:00")];
    expect(getApprovedPermissionsToday(ps)).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ─── 17. Ponches cubiertos por un permiso ────────────────────────────────────
// Cuando el backend asocia el ponche a un permiso (permissionId), ya resolvió
// el estado teniéndolo en cuenta. El cálculo local no tiene el permiso a la
// vista y marcaría Tardanza/Anticipada, pisando el valor correcto — por eso
// getPunctuality se salta el cálculo y devuelve null, dejando que la UI caiga
// en el fallback `punch.status`.

describe("17. getPunctuality con permissionId", () => {
  /** Réplica del fallback de la UI: puntualidad local > status del backend.
   * (La cadena completa vive en punchinout.tsx; aquí solo el tramo relevante.) */
  const displayStatus = (p: PunchEvent) =>
    getPunctuality(p, [schedule], TOL) ?? p.status ?? "A Tiempo";

  /** El caso real: entrada 11:53 con permiso de llegada tardía aprobado.
   * Horario 08:00 + 5 min de tolerancia -> localmente sería "Tardanza". */
  const entradaConPermiso = punch("InicioJornada", {
    id: 9666,
    createdDate: "2026-08-19T15:53:31.000Z",
    permissionId: 698,
    status: "A Tiempo",
  });

  it("17a. InicioJornada con permissionId no se recalcula: queda A Tiempo", () => {
    expect(getPunctuality(entradaConPermiso, [schedule], TOL)).toBeNull();
    expect(displayStatus(entradaConPermiso)).toBe("A Tiempo");
  });

  it("17b. el mismo ponche SIN permissionId sí se marca Tardanza", () => {
    const sinPermiso = { ...entradaConPermiso, permissionId: null };
    expect(getPunctuality(sinPermiso, [schedule], TOL)).toBe("Tardanza");
    expect(displayStatus(sinPermiso)).toBe("Tardanza");

    // permissionId ausente por completo se comporta igual que null
    const { permissionId, ...omitido } = entradaConPermiso;
    expect(getPunctuality(omitido, [schedule], TOL)).toBe("Tardanza");
  });

  it("17c. FinJornada con permissionId tampoco se recalcula", () => {
    // 14:00, muy antes de las 17:00 -> localmente sería "Anticipada"
    const salida = punch("FinJornada", {
      createdDate: "2026-08-19T18:00:00.000Z",
      permissionId: 700,
      status: "A Tiempo",
    });
    expect(getPunctuality(salida, [schedule], TOL)).toBeNull();
    expect(displayStatus(salida)).toBe("A Tiempo");

    const sinPermiso = { ...salida, permissionId: null };
    expect(getPunctuality(sinPermiso, [schedule], TOL)).toBe("Anticipada");
  });

  it("17d. Almuerzo NO cambia: sigue calculándose aunque traiga permissionId", () => {
    // 12:30, pasada la ventana 12:00 + 5 -> "Tardanza" con o sin permiso
    const inicio = punch("InicioAlmuerzo", {
      createdDate: "2026-08-19T16:30:00.000Z",
      permissionId: 701,
    });
    expect(getPunctuality(inicio, [schedule], TOL)).toBe("Tardanza");

    // 13:30, pasada la ventana 13:00 + 5 -> "Tardanza"
    const fin = punch("FinAlmuerzo", {
      createdDate: "2026-08-19T17:30:00.000Z",
      permissionId: 701,
    });
    expect(getPunctuality(fin, [schedule], TOL)).toBe("Tardanza");
  });

  it("17e. sin horario del día devuelve null como siempre", () => {
    expect(getPunctuality(entradaConPermiso, [], TOL)).toBeNull();
  });

  /** Réplica LITERAL de la cadena completa de punchinout.tsx (~líneas
   * 2106-2118), no la versión simplificada de arriba. El bug real estaba
   * aquí: con permissionId válido, punctuality da null y la cadena caía en
   * lateEntry/earlyExit (que ignoran el permiso) antes de llegar a status. */
  const displayStatusReal = (
    punch: PunchEvent,
    isJornadaOvertime: boolean,
  ): string => {
    const punctuality = getPunctuality(punch, [schedule], TOL);
    return isJornadaOvertime
      ? "Horas extras"
      : punch.status === "Error de Imagen"
        ? "Error de Imagen"
        : punctuality !== null
          ? punctuality
          : punch.permissionId != null
            ? punch.status || "A Tiempo"
            : punch.lateEntry
              ? "Tardanza"
              : punch.earlyExit
                ? "Anticipada"
                : punch.type === "FinBreak"
                  ? "A Tiempo"
                  : punch.status || "A Tiempo";
  };

  it("17f. cadena completa: permissionId + lateEntry:true + status A Tiempo -> A Tiempo, no Tardanza", () => {
    const conPermisoYFlagSucio = punch("InicioJornada", {
      createdDate: "2026-08-19T15:53:31.000Z", // 11:53 RD, tardaría si se recalculara
      permissionId: 698,
      status: "A Tiempo",
      lateEntry: true, // flag "sucio" del backend que el permiso debe ignorar
    });
    expect(displayStatusReal(conPermisoYFlagSucio, false)).toBe("A Tiempo");

    // sin permissionId, el mismo lateEntry:true SÍ debe producir Tardanza
    const sinPermiso = { ...conPermisoYFlagSucio, permissionId: null };
    expect(displayStatusReal(sinPermiso, false)).toBe("Tardanza");
  });
});

// ─── Sanidad de los helpers de tiempo usados por los fixtures ────────────────

describe("helpers de tiempo (RD = UTC-4)", () => {
  it("rd() produce la hora de pared esperada", () => {
    expect(getRDMinutes(rd(0, 0))).toBe(0);
    expect(getRDMinutes(rd(9, 30))).toBe(570);
    expect(getRDMinutes(rd(23, 59))).toBe(1439);
  });

  it("timeStrToMinutes interpreta HH:mm:ss", () => {
    expect(timeStrToMinutes("00:00:00")).toBe(0);
    expect(timeStrToMinutes("11:30:00")).toBe(690);
    expect(timeStrToMinutes("23:59:00")).toBe(1439);
  });
});
