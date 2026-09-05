/// <reference types="jest" />
import {
  buildAdminCreatedDate,
  buildAdminPunchPayload,
  buildEmployeeSearchParams,
  buildEmployeeSearchQueryString,
  EMPLOYEE_SEARCH_FIELDS,
  daysElapsedRD,
  extractTableRows,
  formatEmployeeContact,
  getAdminPunchDay,
  getHistoryEvents,
  getNextAdminAction,
  getOpenWorkdayDate,
  getSuggestedPunchTime,
  isAdminBreakEnabled,
  normalizeAdminPanel,
  toEmployeeOption,
  toOpenWorkdayRows,
  type AdminOpenDayPunch,
  type AdminPunchPanel,
} from "../adminPunchRules";
import type { UserSchedule } from "../../../types/typeStore/SchoolStoreType";
import { toRDDateString, type PunchEvent, type Tag } from "../punchRules";

const TARGET_ID = 501;

const punch = (over: Partial<PunchEvent>): PunchEvent => ({
  id: 1,
  type: "InicioJornada",
  status: "A Tiempo",
  createdDate: "2026-09-04T13:00:00.000Z",
  schoolUserId: TARGET_ID,
  ...over,
});

const panel = (over: Partial<AdminPunchPanel>): AdminPunchPanel => ({
  schoolUser: null,
  userSchedules: [],
  punchesToday: [],
  openDayEvents: [],
  ...over,
});

// ── Payload del ponche admin ──────────────────────────────────────────────────

describe("buildAdminPunchPayload", () => {
  test("schoolUserId SIEMPRE viaja — es lo único que activa el modo admin", () => {
    const payload = buildAdminPunchPayload({
      schoolUserId: TARGET_ID,
      type: "InicioJornada",
      createdDate: "2026-09-04T08:00:00-04:00",
    });
    expect(payload.schoolUserId).toBe(TARGET_ID);
    expect(Object.keys(payload)).toContain("schoolUserId");
  });

  test("sin tagId, la clave no existe (no viaja como undefined/null)", () => {
    const payload = buildAdminPunchPayload({
      schoolUserId: TARGET_ID,
      type: "FinJornada",
      createdDate: "2026-09-04T17:00:00-04:00",
    });
    expect("tagId" in payload).toBe(false);
    expect(JSON.parse(JSON.stringify(payload))).toEqual({
      schoolUserId: TARGET_ID,
      type: "FinJornada",
      createdDate: "2026-09-04T17:00:00-04:00",
    });
  });

  test("tagId null se trata igual que ausente", () => {
    const payload = buildAdminPunchPayload({
      schoolUserId: TARGET_ID,
      type: "InicioBreak",
      createdDate: "2026-09-04T10:00:00-04:00",
      tagId: null,
    });
    expect("tagId" in payload).toBe(false);
  });

  test("tagId presente se incluye tal cual", () => {
    const payload = buildAdminPunchPayload({
      schoolUserId: TARGET_ID,
      type: "InicioBreak",
      createdDate: "2026-09-04T10:00:00-04:00",
      tagId: 77,
    });
    expect(payload.tagId).toBe(77);
  });

  test("NO se agrega ningún campo de texto para motivo — el backend lo ignora", () => {
    const payload = buildAdminPunchPayload({
      schoolUserId: TARGET_ID,
      type: "InicioBreak",
      createdDate: "2026-09-04T10:00:00-04:00",
      tagId: 77,
    });
    expect(Object.keys(payload).sort()).toEqual([
      "createdDate",
      "schoolUserId",
      "tagId",
      "type",
    ]);
  });
});

// ── createdDate ────────────────────────────────────────

describe("buildAdminCreatedDate (TZ del runner = UTC)", () => {
  test("el día sale de `day` y la hora del `picked`, ambos en RD", () => {
    // 18:00Z = 14:00 RD del 4-sep
    const day = new Date("2026-09-04T18:00:00.000Z");
    const picked = new Date("2026-09-04T12:30:00.000Z"); // 08:30 RD
    expect(buildAdminCreatedDate(day, picked)).toBe(
      "2026-09-04T08:30:00-04:00",
    );
  });

  test("el string generado vuelve al mismo instante al parsearlo", () => {
    const day = new Date("2026-09-04T18:00:00.000Z");
    const built = buildAdminCreatedDate(day, day);
    expect(new Date(built).toISOString()).toBe("2026-09-04T18:00:00.000Z");
  });

  test("hora nocturna RD no corre el día al siguiente", () => {
    // 01:00Z del 5-sep = 21:00 RD del 4-sep
    const nightRD = new Date("2026-09-05T01:00:00.000Z");
    expect(buildAdminCreatedDate(nightRD, nightRD)).toBe(
      "2026-09-04T21:00:00-04:00",
    );
  });
});

// ── getNextAdminAction ────────────────────────────────────────────────────────

describe("getNextAdminAction — Jornada", () => {
  test("sin ponches y sin jornada abierta → Entrada", () => {
    const next = getNextAdminAction(panel({}), "Jornada");
    expect(next).toMatchObject({
      kind: "inicio",
      type: "InicioJornada",
      label: "Entrada",
      requiresTag: false,
    });
  });

  test("con InicioJornada de hoy → Salida", () => {
    const next = getNextAdminAction(
      panel({ punchesToday: [punch({ type: "InicioJornada" })] }),
      "Jornada",
    );
    expect(next).toMatchObject({ kind: "fin", type: "FinJornada", label: "Salida" });
  });

  test("con jornada ya cerrada hoy → vuelve a Entrada", () => {
    const next = getNextAdminAction(
      panel({
        punchesToday: [
          punch({ id: 1, type: "InicioJornada" }),
          punch({ id: 2, type: "FinJornada" }),
        ],
      }),
      "Jornada",
    );
    expect(next.kind).toBe("inicio");
  });

  test("jornada abierta de un día PREVIO (no está en punchesToday) → Salida", () => {
    // Sin este caso la pantalla ofrecería Entrada sobre una jornada abierta
    // y el backend la rechazaría.
    const next = getNextAdminAction(
      panel({ openDayEvents: [punch({ id: 9, type: "InicioJornada" })] }),
      "Jornada",
    );
    expect(next).toMatchObject({ kind: "fin", type: "FinJornada" });
  });

  test("los ponches de hoy mandan por encima del openDay", () => {
    const next = getNextAdminAction(
      panel({
        openDayEvents: [punch({ id: 9, type: "InicioJornada" })],
        punchesToday: [
          punch({ id: 1, type: "InicioJornada" }),
          punch({ id: 2, type: "FinJornada" }),
        ],
      }),
      "Jornada",
    );
    expect(next.kind).toBe("inicio");
  });

  test("un intento rechazado no cuenta como jornada iniciada", () => {
    for (const status of ["Error de Imagen", "Fuera de área"]) {
      const next = getNextAdminAction(
        panel({ punchesToday: [punch({ type: "InicioJornada", status })] }),
        "Jornada",
      );
      expect(next.kind).toBe("inicio");
    }
  });

  test("los ponches de Break no afectan la pestaña Jornada", () => {
    const next = getNextAdminAction(
      panel({ punchesToday: [punch({ type: "InicioBreak" })] }),
      "Jornada",
    );
    expect(next.kind).toBe("inicio");
  });
});

describe("getNextAdminAction — Break", () => {
  test("sin ponches → Entrada, y exige motivo", () => {
    const next = getNextAdminAction(panel({}), "Break");
    expect(next).toMatchObject({
      kind: "inicio",
      type: "InicioBreak",
      requiresTag: true,
    });
  });

  test("con InicioBreak → Salida, sin motivo", () => {
    const next = getNextAdminAction(
      panel({ punchesToday: [punch({ type: "InicioBreak" })] }),
      "Break",
    );
    expect(next).toMatchObject({
      kind: "fin",
      type: "FinBreak",
      requiresTag: false,
    });
  });

  test("break cerrado → vuelve a Entrada", () => {
    const next = getNextAdminAction(
      panel({
        punchesToday: [
          punch({ id: 1, type: "InicioBreak" }),
          punch({ id: 2, type: "FinBreak" }),
        ],
      }),
      "Break",
    );
    expect(next.kind).toBe("inicio");
  });

  test("una jornada abierta NO empuja el Break a Salida", () => {
    const next = getNextAdminAction(
      panel({ openDayEvents: [punch({ type: "InicioJornada" })] }),
      "Break",
    );
    expect(next.kind).toBe("inicio");
  });
});

describe("isAdminBreakEnabled", () => {
  test("sin jornada activa, el Break queda deshabilitado", () => {
    expect(isAdminBreakEnabled(panel({}))).toBe(false);
  });

  test("con jornada iniciada hoy, habilitado", () => {
    expect(
      isAdminBreakEnabled(
        panel({ punchesToday: [punch({ type: "InicioJornada" })] }),
      ),
    ).toBe(true);
  });

  test("con jornada abierta de un día previo, habilitado", () => {
    expect(
      isAdminBreakEnabled(
        panel({ openDayEvents: [punch({ type: "InicioJornada" })] }),
      ),
    ).toBe(true);
  });

  test("con la jornada ya cerrada hoy, deshabilitado", () => {
    expect(
      isAdminBreakEnabled(
        panel({
          punchesToday: [
            punch({ id: 1, type: "InicioJornada" }),
            punch({ id: 2, type: "FinJornada" }),
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe("Historial del Día con una jornada abierta de un día anterior", () => {
  const ayer = punch({
    id: 90,
    type: "InicioJornada",
    createdDate: "2026-09-02T12:00:00.000Z", // 08:00 RD del 2-sep
  });
  const ayerBreak = punch({
    id: 91,
    type: "InicioBreak",
    createdDate: "2026-09-02T14:00:00.000Z",
  });
  const hoy = punch({ id: 1, type: "InicioJornada" });

  test("sin jornada abierta, el historial son los ponches de hoy", () => {
    expect(
      getHistoryEvents(panel({ punchesToday: [hoy] })).map((p) => p.id),
    ).toEqual([1]);
  });

  test("con jornada abierta, el historial son los eventos de ESE día", () => {
    // openDayEvents es la lista completa del día, no un subconjunto: mostrar
    // punchesToday acá dejaría el historial vacío.
    const withOpen = panel({
      openDayEvents: [ayer, ayerBreak],
      punchesToday: [],
    });
    expect(getHistoryEvents(withOpen).map((p) => p.id)).toEqual([90, 91]);
  });

  test("openDayEvents gana aunque haya ponches de hoy", () => {
    const both = panel({ openDayEvents: [ayer], punchesToday: [hoy] });
    expect(getHistoryEvents(both).map((p) => p.id)).toEqual([90]);
  });

  test("un panel nulo no rompe el render", () => {
    expect(getHistoryEvents(null)).toEqual([]);
  });

  test("la fecha del título sale del InicioJornada abierto", () => {
    const withOpen = panel({ openDayEvents: [ayerBreak, ayer] });
    const date = getOpenWorkdayDate(withOpen);
    expect(toRDDateString(date!)).toBe("2026-09-02");
  });

  test("sin InicioJornada explícito cae al primer evento del día", () => {
    const withOpen = panel({ openDayEvents: [ayerBreak] });
    expect(toRDDateString(getOpenWorkdayDate(withOpen)!)).toBe("2026-09-02");
  });

  test("sin jornada abierta no hay fecha que mostrar", () => {
    expect(getOpenWorkdayDate(panel({ punchesToday: [hoy] }))).toBeNull();
    expect(getOpenWorkdayDate(null)).toBeNull();
  });

  test("los N días del título salen del mismo daysElapsedRD que diasTrans", () => {
    const date = getOpenWorkdayDate(panel({ openDayEvents: [ayer] }))!;
    // 2-sep → 4-sep = 2 días.
    expect(daysElapsedRD(date, new Date("2026-09-04T20:00:00.000Z"))).toBe(2);
  });
});

describe("getAdminPunchDay — el día que lleva el createdDate", () => {
  // Hoy: 2026-09-04 16:00 RD. Jornada abierta el 2026-09-02.
  const TODAY = new Date("2026-09-04T20:00:00.000Z");
  const abierta = punch({
    id: 90,
    type: "InicioJornada",
    createdDate: "2026-09-02T12:00:00.000Z", // 08:00 RD del 2-sep
  });

  const conJornadaAbierta = panel({ openDayEvents: [abierta] });
  const finJornada = getNextAdminAction(conJornadaAbierta, "Jornada");
  const inicioJornada = getNextAdminAction(panel({}), "Jornada");

  test("cerrar una jornada abierta usa la fecha de ESA jornada, no hoy", () => {
    // Sin esto el backend rechaza con "La fecha debe coincidir con el día del
    // InicioJornada que se está cerrando".
    expect(finJornada.type).toBe("FinJornada");
    const day = getAdminPunchDay(conJornadaAbierta, finJornada, TODAY);
    expect(toRDDateString(day)).toBe("2026-09-02");
  });

  test("el createdDate completo sale con esa fecha y la hora elegida", () => {
    const day = getAdminPunchDay(conJornadaAbierta, finJornada, TODAY);
    const picked = new Date("2026-09-04T21:00:00.000Z"); // 17:00 RD
    expect(buildAdminCreatedDate(day, picked)).toBe(
      "2026-09-02T17:00:00-04:00",
    );
  });

  test("FinJornada del MISMO día sigue usando hoy", () => {
    const hoyMismo = panel({
      punchesToday: [punch({ id: 1, type: "InicioJornada" })],
    });
    const action = getNextAdminAction(hoyMismo, "Jornada");
    expect(action.type).toBe("FinJornada");
    expect(toRDDateString(getAdminPunchDay(hoyMismo, action, TODAY))).toBe(
      "2026-09-04",
    );
  });

  test("InicioJornada usa hoy aunque haya una jornada abierta", () => {
    expect(inicioJornada.type).toBe("InicioJornada");
    expect(
      toRDDateString(getAdminPunchDay(conJornadaAbierta, inicioJornada, TODAY)),
    ).toBe("2026-09-04");
  });

  test("Break usa hoy aunque haya una jornada abierta", () => {
    const breakAction = getNextAdminAction(conJornadaAbierta, "Break");
    expect(breakAction.type).toBe("InicioBreak");
    expect(
      toRDDateString(getAdminPunchDay(conJornadaAbierta, breakAction, TODAY)),
    ).toBe("2026-09-04");
  });

  test("sin panel, o sin fecha legible, cae a hoy en vez de adivinar", () => {
    expect(toRDDateString(getAdminPunchDay(null, finJornada, TODAY))).toBe(
      "2026-09-04",
    );
    const sinFecha = panel({
      openDayEvents: [punch({ id: 9, type: "InicioJornada", createdDate: "" })],
    });
    expect(toRDDateString(getAdminPunchDay(sinFecha, finJornada, TODAY))).toBe(
      "2026-09-04",
    );
  });
});

describe("getSuggestedPunchTime — hora inicial del picker", () => {
  // 2026-09-04 es VIERNES. 20:00Z = 16:00 RD.
  const NOW = new Date("2026-09-04T20:00:00.000Z");

  const schedule = (over: Partial<UserSchedule> = {}): UserSchedule => ({
    id: 1,
    weekDay: "Viernes",
    workEntryTime: "08:00:00",
    workExitTime: "17:00:00",
    lunchEntryTime: "12:00:00",
    lunchExitTime: "13:00:00",
    ...over,
  });

  const withSchedule = (s: UserSchedule[]) => panel({ userSchedules: s });
  const salida = getNextAdminAction(panel({}), "Jornada"); // sin ponches → Entrada
  const finJornada = getNextAdminAction(
    panel({ punchesToday: [punch({ type: "InicioJornada" })] }),
    "Jornada",
  );

  test("Jornada→Salida arranca en el workExitTime del día", () => {
    // Salida programada 15:00 RD, ya pasada respecto de NOW (16:00 RD).
    const suggested = getSuggestedPunchTime(
      withSchedule([schedule({ workExitTime: "15:00:00" })]),
      finJornada,
      NOW,
    );
    expect(suggested.toISOString()).toBe("2026-09-04T19:00:00.000Z"); // 15:00 RD
  });

  test("una salida programada que aún no llegó se sugiere igual", () => {
    // 17:00 RD > 16:00 RD (NOW): la sugerencia NO se recorta. Queda en el
    // futuro a propósito — sugerir y validar son cosas distintas.
    const suggested = getSuggestedPunchTime(
      withSchedule([schedule()]),
      finJornada,
      NOW,
    );
    expect(suggested.toISOString()).toBe("2026-09-04T21:00:00.000Z"); // 17:00 RD
  });

  test("una jornada abierta usa el horario de SU día, no el de hoy", () => {
    // Jornada abierta el MARTES 2026-09-01 (sale 17:00); hoy es VIERNES
    // 2026-09-04 (sale 15:00). La sugerencia tiene que ser la del martes.
    const abierta = punch({
      id: 90,
      type: "InicioJornada",
      createdDate: "2026-09-01T12:00:00.000Z", // 08:00 RD del martes 1-sep
    });
    const conJornadaAbierta = panel({
      openDayEvents: [abierta],
      userSchedules: [
        schedule({ weekDay: "Martes", workExitTime: "17:00:00" }),
        schedule({ weekDay: "Viernes", workExitTime: "15:00:00" }),
      ],
    });
    const action = getNextAdminAction(conJornadaAbierta, "Jornada");
    expect(action.type).toBe("FinJornada");

    const suggested = getSuggestedPunchTime(conJornadaAbierta, action, NOW);
    // 17:00 RD del martes 1-sep, no las 15:00 del viernes.
    expect(suggested.toISOString()).toBe("2026-09-01T21:00:00.000Z");

    // Y el createdDate queda coherente: día del martes, hora del martes.
    const day = getAdminPunchDay(conJornadaAbierta, action, NOW);
    expect(buildAdminCreatedDate(day, suggested)).toBe(
      "2026-09-01T17:00:00-04:00",
    );
  });

  test("sin horario para el día de la jornada abierta cae a la hora actual", () => {
    const abierta = punch({
      id: 90,
      type: "InicioJornada",
      createdDate: "2026-09-01T12:00:00.000Z", // martes
    });
    const soloViernes = panel({
      openDayEvents: [abierta],
      userSchedules: [schedule({ weekDay: "Viernes" })],
    });
    const action = getNextAdminAction(soloViernes, "Jornada");
    expect(getSuggestedPunchTime(soloViernes, action, NOW)).toBe(NOW);
  });

  test("sin horario para HOY cae a la hora actual", () => {
    // Horario de lunes, hoy es viernes.
    const otroDia = withSchedule([schedule({ weekDay: "Lunes" })]);
    expect(getSuggestedPunchTime(otroDia, finJornada, NOW)).toBe(NOW);
  });

  test("sin userSchedules cae a la hora actual", () => {
    expect(getSuggestedPunchTime(panel({}), finJornada, NOW)).toBe(NOW);
    expect(getSuggestedPunchTime(null, finJornada, NOW)).toBe(NOW);
  });

  test("workExitTime ilegible cae a la hora actual, no a una fecha inválida", () => {
    const roto = withSchedule([schedule({ workExitTime: "no-es-hora" })]);
    expect(getSuggestedPunchTime(roto, finJornada, NOW)).toBe(NOW);
  });

  test("Jornada→ENTRADA no se toca: sigue en la hora actual", () => {
    expect(salida.type).toBe("InicioJornada");
    expect(
      getSuggestedPunchTime(
        withSchedule([schedule({ workExitTime: "15:00:00" })]),
        salida,
        NOW,
      ),
    ).toBe(NOW);
  });

  test("Break no se toca: sigue en la hora actual", () => {
    for (const category of ["Break"] as const) {
      const breakAction = getNextAdminAction(
        panel({ punchesToday: [punch({ type: "InicioJornada" })] }),
        category,
      );
      expect(
        getSuggestedPunchTime(
          withSchedule([schedule({ workExitTime: "15:00:00" })]),
          breakAction,
          NOW,
        ),
      ).toBe(NOW);
    }
  });

  test("la hora sugerida sobrevive el round-trip a createdDate", () => {
    const suggested = getSuggestedPunchTime(
      withSchedule([schedule({ workExitTime: "15:30:00" })]),
      finJornada,
      NOW,
    );
    expect(buildAdminCreatedDate(NOW, suggested)).toBe(
      "2026-09-04T15:30:00-04:00",
    );
  });

});

// ── Normalización de listados ─────────────────────────────────────────────────

describe("toOpenWorkdayRows", () => {
  const row: AdminOpenDayPunch = {
    id: 9511,
    type: "InicioJornada",
    status: "A Tiempo",
    createdDate: "2026-09-03T12:00:00.000Z",
    schoolUser: {
      id: TARGET_ID,
      code: "EMP-01",
      photourl: "uploads/a.jpg",
      user: {
        fullName: "Ana Pérez",
        email: "ana@colegio.do",
        phone: "809-555-0101",
      },
      role: { name: "Docente" },
      adminPunchCount: { admInitJornada: 2, admFinJornada: "1" },
    },
    tag: { id: 3, name: "Personal" },
    permission: {
      typeTag: { id: 4, name: "Salud" },
      stateTag: { id: 5, name: "Aprobado" },
    },
  };

  // 3-sep 12:00Z = 08:00 RD del 3-sep (createdDate de `row`).
  const NOW_SAME_DAY = new Date("2026-09-03T20:00:00.000Z"); // 16:00 RD del 3

  test("mapea nombre, rol y contadores del webapp", () => {
    const [mapped] = toOpenWorkdayRows([row], NOW_SAME_DAY);
    expect(mapped).toMatchObject({
      punchId: 9511,
      schoolUserId: TARGET_ID,
      fullName: "Ana Pérez",
      roleName: "Docente",
      email: "ana@colegio.do",
      phone: "809-555-0101",
      entradas: 2,
      salidas: 1,
      tagName: "Personal",
      permissionType: "Salud",
      permissionState: "Aprobado",
      diasTrans: 0,
    });
  });

  test("contadores ausentes cuentan como 0, no NaN", () => {
    const [mapped] = toOpenWorkdayRows(
      [{ ...row, schoolUser: { ...row.schoolUser!, adminPunchCount: null } }],
      NOW_SAME_DAY,
    );
    expect(mapped.entradas).toBe(0);
    expect(mapped.salidas).toBe(0);
  });

  test("photourl tiene precedencia sobre s3Photo", () => {
    // Mismo orden que punchinout.tsx, que arma el avatar solo con photourl.
    const [mapped] = toOpenWorkdayRows(
      [{ ...row, schoolUser: { ...row.schoolUser!, s3Photo: "https://s3/a.jpg" } }],
      NOW_SAME_DAY,
    );
    expect(mapped.photourl).toBe("uploads/a.jpg");
  });

  test("s3Photo se usa cuando NO hay photourl — sigue siendo un fallback válido", () => {
    const [mapped] = toOpenWorkdayRows(
      [
        {
          ...row,
          schoolUser: {
            ...row.schoolUser!,
            photourl: null,
            s3Photo: "https://s3/a.jpg",
          },
        },
      ],
      NOW_SAME_DAY,
    );
    expect(mapped.photourl).toBe("https://s3/a.jpg");
  });

  test("sin ninguna de las dos, null", () => {
    const [mapped] = toOpenWorkdayRows(
      [{ ...row, schoolUser: { ...row.schoolUser!, photourl: null } }],
      NOW_SAME_DAY,
    );
    expect(mapped.photourl).toBeNull();
  });

  test("Días Trans. = 0 el mismo día en que quedó abierta", () => {
    expect(toOpenWorkdayRows([row], NOW_SAME_DAY)[0].diasTrans).toBe(0);
  });

  test("Días Trans. = 1 al día siguiente", () => {
    const nextDay = new Date("2026-09-04T20:00:00.000Z"); // 16:00 RD del 4
    expect(toOpenWorkdayRows([row], nextDay)[0].diasTrans).toBe(1);
  });

  test("Días Trans. cuenta varios días", () => {
    const sixDaysLater = new Date("2026-09-09T20:00:00.000Z"); // 16:00 RD del 9
    expect(toOpenWorkdayRows([row], sixDaysLater)[0].diasTrans).toBe(6);
  });

  test("BORDE medianoche: cuenta días de calendario, no bloques de 24h", () => {
    // Abre 23:30 RD del 3-sep (03:30Z del 4), se mira 00:30 RD del 4-sep
    // (04:30Z): solo pasó 1 hora, pero ya cruzó la medianoche → 1 día.
    const nocturno = {
      ...row,
      createdDate: "2026-09-04T03:30:00.000Z",
    };
    const justAfterMidnight = new Date("2026-09-04T04:30:00.000Z");
    expect(toOpenWorkdayRows([nocturno], justAfterMidnight)[0].diasTrans).toBe(
      1,
    );
  });

  test("BORDE medianoche: 23h dentro del MISMO día RD siguen siendo 0", () => {
    // Abre 00:30 RD del 3-sep, se mira 23:30 RD del 3-sep: casi 24h, mismo día.
    const madrugada = { ...row, createdDate: "2026-09-03T04:30:00.000Z" };
    const sameDayNight = new Date("2026-09-04T03:30:00.000Z");
    expect(toOpenWorkdayRows([madrugada], sameDayNight)[0].diasTrans).toBe(0);
  });

  test("una fecha futura da 0, nunca un negativo", () => {
    const past = new Date("2026-09-01T20:00:00.000Z");
    expect(toOpenWorkdayRows([row], past)[0].diasTrans).toBe(0);
  });

  test("daysElapsedRD no depende de la hora del día", () => {
    // Mismo par de días de calendario, horas muy distintas → mismo resultado.
    const from = new Date("2026-09-03T12:00:00.000Z"); // 08:00 RD del 3
    expect(daysElapsedRD(from, new Date("2026-09-05T12:00:00.000Z"))).toBe(2);
    expect(daysElapsedRD(from, new Date("2026-09-05T23:00:00.000Z"))).toBe(2);
    expect(daysElapsedRD(from, new Date("2026-09-06T02:00:00.000Z"))).toBe(2);
  });

  test("cruza fin de mes sin romperse", () => {
    const from = new Date("2026-08-30T16:00:00.000Z"); // 12:00 RD del 30-ago
    const to = new Date("2026-09-02T16:00:00.000Z"); // 12:00 RD del 2-sep
    expect(daysElapsedRD(from, to)).toBe(3);
  });

  test("una fila sin schoolUser identificable se descarta", () => {
    expect(
      toOpenWorkdayRows([{ ...row, schoolUser: null, schoolUserId: undefined }]),
    ).toEqual([]);
  });
});

describe("toEmployeeOption", () => {
  test("forma schoolUser: el id de la fila ES el schoolUserId", () => {
    expect(
      toEmployeeOption({
        id: TARGET_ID,
        code: "EMP-01",
        photourl: "a.jpg",
        user: {
          id: 9,
          fullName: "Ana Pérez",
          email: "ana@colegio.do",
          phone: "809-555-0101",
        },
        role: { name: "Docente" },
      }),
    ).toEqual({
      schoolUserId: TARGET_ID,
      fullName: "Ana Pérez",
      roleName: "Docente",
      code: "EMP-01",
      photourl: "a.jpg",
      email: "ana@colegio.do",
      phone: "809-555-0101",
    });
  });

  test("forma user: el schoolUserId sale de schoolUsers[0], NO del user.id", () => {
    const option = toEmployeeOption({
      id: 9,
      fullName: "Ana Pérez",
      email: "ana@colegio.do",
      phone: "809-555-0101",
      schoolUsers: [{ id: TARGET_ID, code: "EMP-01", role: { name: "Docente" } }],
    });
    expect(option?.schoolUserId).toBe(TARGET_ID);
    expect(option?.fullName).toBe("Ana Pérez");
    expect(option?.email).toBe("ana@colegio.do");
    expect(option?.phone).toBe("809-555-0101");
  });

  test("email/phone ausentes o en blanco quedan en null, no en cadena vacía", () => {
    const option = toEmployeeOption({
      id: TARGET_ID,
      user: { fullName: "Ana Pérez", email: "   " },
      role: { name: "Docente" },
    });
    expect(option?.email).toBeNull();
    expect(option?.phone).toBeNull();
  });

  test("NO se filtra por rol: un admin es tan seleccionable como un docente", () => {
    // El selector debe traer empleados Y admins — el control de acceso es el
    // gate del menú dinámico, no un filtro de rol en esta pantalla.
    const roles = ["Docente", "Administrador", "Recursos Humanos", "Conserje"];
    const options = roles.map((name, i) =>
      toEmployeeOption({
        id: TARGET_ID + i,
        user: { fullName: `Usuario ${i}` },
        role: { name },
      }),
    );
    expect(options.every((o) => o !== null)).toBe(true);
    expect(options.map((o) => o?.roleName)).toEqual(roles);
  });

  test("sin schoolUserId determinable devuelve null (poncharía a otra persona)", () => {
    expect(toEmployeeOption({ id: 9, fullName: "Ana Pérez" })).toBeNull();
    expect(toEmployeeOption(null)).toBeNull();
    expect(toEmployeeOption("texto")).toBeNull();
  });

  test("acepta un schoolUserId explícito como último recurso", () => {
    expect(
      toEmployeeOption({ schoolUserId: TARGET_ID, fullName: "Ana Pérez" }),
    ).toMatchObject({ schoolUserId: TARGET_ID });
  });
});

describe("query string de GET /users (el selector venía vacío sin `fields`)", () => {
  const qs = (over?: Parameters<typeof buildEmployeeSearchParams>[0]) =>
    buildEmployeeSearchQueryString(
      buildEmployeeSearchParams(over ?? { query: "ana" }),
    );

  test("`fields` viaja SIEMPRE — sin él, `all` no tiene dónde buscar", () => {
    expect(buildEmployeeSearchParams({ query: "ana" }).fields).toBe(
      EMPLOYEE_SEARCH_FIELDS,
    );
  });

  test("las cuatro columnas buscables están presentes", () => {
    expect(EMPLOYEE_SEARCH_FIELDS.split(",")).toEqual([
      "user.fullName",
      "user.nickName",
      "user.cedula",
      "code",
    ]);
  });

  test("REGRESIÓN: alias.columna con PUNTO, nunca con dos puntos", () => {
    // `user:fullName` hacía que getTableQuery (methods.js:246-249) tomara todo
    // el string como alias y le concatenara `.undefined` → 500 con
    // "Unknown column 'user:fullName.undefined' in 'where clause'".
    // Los dos puntos son parte del alias SOLO en joins anidados de Objection,
    // y /users hace leftJoinRelated('[user, role, tags]') — primer nivel.
    expect(EMPLOYEE_SEARCH_FIELDS).not.toContain(":");
    for (const field of EMPLOYEE_SEARCH_FIELDS.split(",")) {
      const parts = field.split(".");
      expect(parts.length).toBeLessThanOrEqual(2);
      // Si lleva alias, la columna después del punto no puede quedar vacía.
      if (parts.length === 2) expect(parts[1]).not.toBe("");
    }
  });

  test("`code` va sin alias — es columna de la tabla base (schoolusers)", () => {
    expect(EMPLOYEE_SEARCH_FIELDS.split(",")).toContain("code");
  });

  test("el query string completo, en orden: all, fields, rows, page", () => {
    expect(qs()).toBe(
      "all=ana&fields=user.fullName%2Cuser.nickName%2Cuser.cedula%2Ccode&rows=10&page=1",
    );
  });

  test("rows/page por defecto son 10 y 1", () => {
    const params = buildEmployeeSearchParams({ query: "ana" });
    expect(params.rows).toBe(10);
    expect(params.page).toBe(1);
  });

  test("la paginación se puede sobrescribir sin perder `fields`", () => {
    const params = buildEmployeeSearchParams({
      query: "ana",
      page: 3,
      rows: 50,
    });
    expect(params).toEqual({
      all: "ana",
      fields: EMPLOYEE_SEARCH_FIELDS,
      rows: 50,
      page: 3,
    });
  });

  test("un término con espacios y tildes se codifica, no se manda crudo", () => {
    expect(qs({ query: "ana pérez" })).toContain("all=ana+p%C3%A9rez");
  });
});

describe("formatEmployeeContact — segunda línea del selector", () => {
  test("rol • email | teléfono cuando están los tres", () => {
    expect(
      formatEmployeeContact({
        roleName: "Docente",
        email: "ana@colegio.do",
        phone: "809-555-0101",
      }),
    ).toBe("Docente • ana@colegio.do | 809-555-0101");
  });

  test("sin email no queda un ' • ' colgando", () => {
    expect(
      formatEmployeeContact({
        roleName: "Docente",
        email: null,
        phone: "809-555-0101",
      }),
    ).toBe("Docente | 809-555-0101");
  });

  test("sin teléfono no queda un ' | ' colgando", () => {
    expect(
      formatEmployeeContact({
        roleName: "Docente",
        email: "ana@colegio.do",
        phone: null,
      }),
    ).toBe("Docente • ana@colegio.do");
  });

  test("solo teléfono se muestra solo", () => {
    expect(formatEmployeeContact({ phone: "809-555-0101" })).toBe(
      "809-555-0101",
    );
  });

  test("sin ningún dato devuelve cadena vacía, no separadores sueltos", () => {
    expect(formatEmployeeContact({})).toBe("");
    expect(
      formatEmployeeContact({ roleName: "  ", email: "", phone: null }),
    ).toBe("");
  });
});

describe("extractTableRows", () => {
  const rows = [{ id: 1 }];
  test.each([
    ["arreglo suelto", rows],
    ["{ rows }", { rows }],
    ["{ data }", { data: rows }],
    ["{ data: { rows } }", { data: { rows } }],
  ])("soporta %s", (_label, payload) => {
    expect(extractTableRows(payload)).toEqual(rows);
  });

  test("cualquier otra forma devuelve lista vacía", () => {
    expect(extractTableRows(null)).toEqual([]);
    expect(extractTableRows({ total: 0 })).toEqual([]);
  });
});

describe("normalizeAdminPanel", () => {
  test("rellena las cuatro claves aunque el backend omita alguna", () => {
    expect(normalizeAdminPanel({ schoolUser: { id: TARGET_ID } })).toEqual({
      schoolUser: { id: TARGET_ID },
      userSchedules: [],
      punchesToday: [],
      openDayEvents: [],
    });
  });

  test("un payload nulo no rompe el render", () => {
    expect(normalizeAdminPanel(null).punchesToday).toEqual([]);
  });
});
