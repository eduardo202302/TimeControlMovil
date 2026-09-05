/// <reference types="jest" />
import {
  buildAdminCreatedDate,
  buildAdminPunchPayload,
  buildEmployeeSearchParams,
  buildEmployeeSearchQueryString,
  EMPLOYEE_SEARCH_FIELDS,
  clampPickedTimeToNow,
  extractTableRows,
  formatEmployeeContact,
  getNextAdminAction,
  isAdminBreakEnabled,
  isFutureCreatedDate,
  normalizeAdminPanel,
  toEmployeeOption,
  toOpenWorkdayRows,
  type AdminOpenDayPunch,
  type AdminPunchPanel,
} from "../adminPunchRules";
import type { PunchEvent, Tag } from "../punchRules";

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

// ── createdDate y guard de hora futura ────────────────────────────────────────

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

describe("guard de hora futura (el backend no la valida hoy)", () => {
  const now = new Date("2026-09-04T18:00:00.000Z"); // 14:00 RD

  test("un minuto en el futuro se bloquea", () => {
    expect(isFutureCreatedDate("2026-09-04T14:01:00-04:00", now)).toBe(true);
  });

  test("la hora exacta actual NO se bloquea", () => {
    expect(isFutureCreatedDate("2026-09-04T14:00:00-04:00", now)).toBe(false);
  });

  test("el pasado nunca se bloquea", () => {
    expect(isFutureCreatedDate("2026-09-04T07:59:00-04:00", now)).toBe(false);
  });

  test("acepta un Date además del string ya construido", () => {
    expect(isFutureCreatedDate(new Date("2026-09-04T18:00:01.000Z"), now)).toBe(
      true,
    );
    expect(isFutureCreatedDate(new Date("2026-09-04T17:59:59.000Z"), now)).toBe(
      false,
    );
  });

  test("una fecha inválida no se considera futura (no bloquea por parseo)", () => {
    expect(isFutureCreatedDate("no-es-una-fecha", now)).toBe(false);
  });

  test("clampPickedTimeToNow recorta la selección futura a ahora", () => {
    const future = new Date("2026-09-04T23:00:00.000Z");
    expect(clampPickedTimeToNow(future, now)).toBe(now);
  });

  test("clampPickedTimeToNow deja pasar una selección pasada", () => {
    const past = new Date("2026-09-04T12:00:00.000Z");
    expect(clampPickedTimeToNow(past, now)).toBe(past);
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

  test("mapea nombre, rol y contadores del webapp", () => {
    const [mapped] = toOpenWorkdayRows([row]);
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
    });
  });

  test("contadores ausentes cuentan como 0, no NaN", () => {
    const [mapped] = toOpenWorkdayRows([
      { ...row, schoolUser: { ...row.schoolUser!, adminPunchCount: null } },
    ]);
    expect(mapped.entradas).toBe(0);
    expect(mapped.salidas).toBe(0);
  });

  test("s3Photo tiene precedencia sobre photourl", () => {
    const [mapped] = toOpenWorkdayRows([
      { ...row, schoolUser: { ...row.schoolUser!, s3Photo: "https://s3/a.jpg" } },
    ]);
    expect(mapped.photourl).toBe("https://s3/a.jpg");
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
