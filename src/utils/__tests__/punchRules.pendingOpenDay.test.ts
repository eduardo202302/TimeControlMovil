/// <reference types="jest" />
import type { UserSchedule } from "../../../types/typeStore/SchoolStoreType";
import {
  buildOpenDayFromChooseSchool,
  findOpenDayPunch,
  findOpenDayPunchForUser,
  getPendingOpenDayDate,
  getScheduleForDay,
  toRDDateString,
  type PunchEvent,
} from "../punchRules";

const punch = (over: Partial<PunchEvent>): PunchEvent => ({
  id: 1,
  type: "InicioJornada",
  status: "A Tiempo",
  createdDate: "2026-08-29T14:51:16.716Z",
  ...over,
});

const day = (p: PunchEvent | null) => {
  const d = getPendingOpenDayDate(p);
  return d ? toRDDateString(d) : null;
};

describe("fecha real de la jornada pendiente (TZ del runner = UTC)", () => {
  test("punch real del sáb 29-ago (id 9511 análogo): 14:51Z = 10:51 RD", () => {
    expect(day(punch({}))).toBe("2026-08-29");
  });

  test("punch real del sáb 22-ago 15:38Z", () => {
    expect(day(punch({ createdDate: "2026-08-22T15:38:55.000Z" }))).toBe(
      "2026-08-22",
    );
  });

  test("REGRESIÓN: ponche nocturno RD cuyo UTC cae al día siguiente", () => {
    // 01:00Z del 30 = 21:00 RD del 29. El viejo .split("T")[0] daba "2026-08-30".
    expect(day(punch({ createdDate: "2026-08-30T01:00:00.000Z" }))).toBe(
      "2026-08-29",
    );
  });

  test("REGRESIÓN: fecha sin hora no se corre al día anterior", () => {
    // new Date("2026-08-29") es medianoche UTC = 28-ago 20:00 en RD.
    expect(day(punch({ openDayDate: "2026-08-29" }))).toBe("2026-08-29");
  });

  test("timestamp sin zona se interpreta como hora RD", () => {
    expect(day(punch({ createdDate: "2026-08-29T10:51:16" }))).toBe(
      "2026-08-29",
    );
  });

  test("openDayDate tiene precedencia sobre createdDate", () => {
    expect(
      day(punch({ openDayDate: "2026-08-22T15:38:55.000Z" })),
    ).toBe("2026-08-22");
  });

  test("sin punch NO se adivina una fecha", () => {
    expect(getPendingOpenDayDate(null)).toBeNull();
  });

  test("fecha basura no explota", () => {
    expect(day(punch({ createdDate: "no-es-fecha" }))).toBeNull();
  });

  test("la hora sugerida sale del horario del SÁBADO, no del domingo", () => {
    const schedules = [
      { weekDay: "Sábado", workExitTime: "13:00:00" },
      { weekDay: "Domingo", workExitTime: "18:00:00" },
      { weekDay: "Lunes", workExitTime: "17:00:00" },
    ] as unknown as UserSchedule[];
    const d = getPendingOpenDayDate(punch({}))!;
    expect(getScheduleForDay(schedules, d)?.workExitTime).toBe("13:00:00");
  });

  test("findOpenDayPunch acepta boolean y string", () => {
    expect(findOpenDayPunch([punch({ hasOpenDay: true })])?.id).toBe(1);
    expect(findOpenDayPunch([punch({ hasOpenDay: "true" })])?.id).toBe(1);
    expect(findOpenDayPunch([punch({})])).toBeNull();
    expect(findOpenDayPunch([])).toBeNull();
  });
});

describe("findOpenDayPunchForUser — respaldo vía GET /punches/opendays", () => {
  // Shape confirmado contra respuestas reales de POST /punches capturadas en
  // el log de Metro (id 9506-9511, 22-ago; id 9546-9548, 24-ago): el punch
  // trae schoolUserId, createdDate y type — sin hasOpenDay/openDayDate, que
  // solo expone /punches/today.
  const openDayPunch = (over: Partial<PunchEvent>): PunchEvent => ({
    id: 9511,
    type: "InicioJornada",
    status: "A Tiempo",
    createdDate: "2026-08-22T15:38:55.000Z",
    schoolUserId: 224,
    ...over,
  });

  test("caso real: aísla el InicioJornada del usuario 224 entre los de otros usuarios de la escuela", () => {
    const schoolWide = [
      openDayPunch({ id: 9200, schoolUserId: 103 }),
      openDayPunch({ id: 9511, schoolUserId: 224 }),
      openDayPunch({ id: 9350, schoolUserId: 170 }),
    ];
    expect(findOpenDayPunchForUser(schoolWide, 224)?.id).toBe(9511);
  });

  test("ignora otros tipos de ponche del mismo usuario (FinJornada, InicioAlmuerzo)", () => {
    const punches = [
      openDayPunch({ id: 9505, type: "FinJornada" }),
      openDayPunch({ id: 9506, type: "InicioAlmuerzo" }),
      openDayPunch({ id: 9511, type: "InicioJornada" }),
    ];
    expect(findOpenDayPunchForUser(punches, 224)?.id).toBe(9511);
  });

  test("usuario sin InicioJornada abierto → null, no un punch ajeno", () => {
    const schoolWide = [openDayPunch({ id: 9200, schoolUserId: 103 })];
    expect(findOpenDayPunchForUser(schoolWide, 224)).toBeNull();
  });

  test("lista vacía → null", () => {
    expect(findOpenDayPunchForUser([], 224)).toBeNull();
  });

  test("más de un InicioJornada abierto del mismo usuario → se queda con el más reciente", () => {
    const punches = [
      openDayPunch({ id: 9400, createdDate: "2026-08-15T15:00:00.000Z" }),
      openDayPunch({ id: 9511, createdDate: "2026-08-22T15:38:55.000Z" }),
    ];
    expect(findOpenDayPunchForUser(punches, 224)?.id).toBe(9511);
  });

  test("la fecha del punch de /opendays cae a createdDate (sin openDayDate) y normaliza a RD", () => {
    // id 9511 real: 2026-08-22T15:38:55Z = sábado 22-ago 11:38 RD, no domingo 23.
    const pending = findOpenDayPunchForUser(
      [openDayPunch({})],
      224,
    );
    expect(day(pending)).toBe("2026-08-22");
  });
});

describe("buildOpenDayFromChooseSchool — punchOpen/dateOpen de chooseschool", () => {
  const inicio = punch({ id: 9511, createdDate: "2026-08-22T15:38:55.000Z" });

  test("punchOpen true + evento de inicio → ese evento", () => {
    const data = {
      punchOpen: true,
      dateOpen: "2026-08-22T15:38:55.000Z",
      openDayEvents: [inicio],
    };
    expect(buildOpenDayFromChooseSchool(data)).toBe(inicio);
  });

  test("punchOpen/dateOpen con openDayEvents vacío → null (punchOpen viejo, ponches borrados)", () => {
    const data = {
      punchOpen: true,
      dateOpen: "2026-08-22T15:38:55.000Z",
      openDayEvents: [],
    };
    expect(buildOpenDayFromChooseSchool(data)).toBeNull();
  });

  test("punchOpen/dateOpen sin openDayEvents en la respuesta → null", () => {
    const data = { punchOpen: true, dateOpen: "2026-08-22T15:38:55.000Z" };
    expect(buildOpenDayFromChooseSchool(data)).toBeNull();
  });

  test("punchOpen false o dateOpen null → null", () => {
    expect(
      buildOpenDayFromChooseSchool({
        punchOpen: false,
        dateOpen: "2026-08-22T15:38:55.000Z",
        openDayEvents: [inicio],
      }),
    ).toBeNull();
    expect(
      buildOpenDayFromChooseSchool({
        punchOpen: true,
        dateOpen: null,
        openDayEvents: [inicio],
      }),
    ).toBeNull();
    expect(buildOpenDayFromChooseSchool({})).toBeNull();
    expect(buildOpenDayFromChooseSchool(null)).toBeNull();
  });

  test("openDayEvents con solo InicioJornadaAdicional/FH sin Fin → null", () => {
    // El modal cierra con FinJornada: un Adicional/FH abierto no lo puede
    // cerrar, y el POST tampoco bloquea al usuario por él.
    const data = {
      punchOpen: true,
      dateOpen: "2026-08-22T20:00:00.000Z",
      openDayEvents: [
        punch({ id: 20, type: "InicioJornadaAdicional" }),
        punch({ id: 30, type: "InicioJornadaFH" }),
      ],
    };
    expect(buildOpenDayFromChooseSchool(data)).toBeNull();
  });

  test("Adicional abierto junto a un InicioJornada sin Fin → el InicioJornada", () => {
    const data = {
      punchOpen: true,
      dateOpen: "2026-08-22T15:38:55.000Z",
      openDayEvents: [
        inicio,
        punch({
          id: 20,
          type: "InicioJornadaAdicional",
          createdDate: "2026-08-22T20:00:00.000Z",
        }),
      ],
    };
    expect(buildOpenDayFromChooseSchool(data)?.id).toBe(9511);
  });

  test("InicioJornada + FinJornada válido posterior → null (punchOpen viejo)", () => {
    const data = {
      punchOpen: true,
      dateOpen: "2026-08-22T15:38:55.000Z",
      openDayEvents: [
        inicio,
        punch({
          id: 9520,
          type: "FinJornada",
          createdDate: "2026-08-22T22:00:00.000Z",
        }),
      ],
    };
    expect(buildOpenDayFromChooseSchool(data)).toBeNull();
  });

  test("FinJornada rechazado no cierra la jornada", () => {
    const data = {
      punchOpen: true,
      dateOpen: "2026-08-22T15:38:55.000Z",
      openDayEvents: [
        inicio,
        punch({
          id: 9520,
          type: "FinJornada",
          status: "Fuera de área",
          createdDate: "2026-08-22T22:00:00.000Z",
        }),
      ],
    };
    expect(buildOpenDayFromChooseSchool(data)?.id).toBe(9511);
  });

  test("FinJornada anterior al InicioJornada (otro ciclo) no lo cierra", () => {
    const data = {
      punchOpen: true,
      dateOpen: "2026-08-22T18:00:00.000Z",
      openDayEvents: [
        punch({ id: 1, createdDate: "2026-08-22T12:00:00.000Z" }),
        punch({
          id: 2,
          type: "FinJornada",
          createdDate: "2026-08-22T16:00:00.000Z",
        }),
        punch({ id: 3, createdDate: "2026-08-22T18:00:00.000Z" }),
      ],
    };
    expect(buildOpenDayFromChooseSchool(data)?.id).toBe(3);
  });

  test("InicioJornada con \"Error de Imagen\" como único inicio → null", () => {
    const data = {
      punchOpen: true,
      dateOpen: "2026-08-22T15:38:55.000Z",
      openDayEvents: [punch({ id: 1, status: "Error de Imagen" })],
    };
    expect(buildOpenDayFromChooseSchool(data)).toBeNull();
  });

  test("eventos sin ningún InicioJornada (inicio borrado) → null, no sintético", () => {
    const data = {
      punchOpen: true,
      dateOpen: "2026-08-22T15:38:55.000Z",
      openDayEvents: [punch({ id: 11, type: "InicioAlmuerzo" })],
    };
    expect(buildOpenDayFromChooseSchool(data)).toBeNull();
  });

  test("prefiere un inicio no rechazado (lista sin filtrar de punchOpen persistido)", () => {
    const data = {
      punchOpen: true,
      dateOpen: "2026-08-22T15:38:55.000Z",
      openDayEvents: [
        punch({ id: 1, status: "Error de Imagen" }),
        punch({ id: 2, status: "A Tiempo" }),
      ],
    };
    expect(buildOpenDayFromChooseSchool(data)?.id).toBe(2);
  });

  test("fecha del modal y del payload de cierre: evento real", () => {
    // 15:38Z = sábado 22-ago 11:38 RD.
    const pending = buildOpenDayFromChooseSchool({
      punchOpen: true,
      dateOpen: "2026-08-22T15:38:55.000Z",
      openDayEvents: [inicio],
    });
    expect(day(pending)).toBe("2026-08-22");
  });

  test("fecha del modal y del payload de cierre: InicioJornada nocturno", () => {
    // 01:00Z del 23 = 21:00 RD del 22: no se corre al día siguiente.
    const pending = buildOpenDayFromChooseSchool({
      punchOpen: true,
      dateOpen: "2026-08-23T01:00:00.000Z",
      openDayEvents: [punch({ createdDate: "2026-08-23T01:00:00.000Z" })],
    });
    expect(day(pending)).toBe("2026-08-22");
  });

  // Se eliminó el test de fecha del sintético con dateOpen "YYYY-MM-DD
  // HH:mm:ss": el ponche sintético está desactivado, la fecha ya solo sale
  // del createdDate de un InicioJornada real (ISO), que cubren los dos tests
  // de arriba.
});
