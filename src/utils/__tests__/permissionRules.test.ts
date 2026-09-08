// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import axios from "axios";
import {
  buildAttachmentUri,
  buildMyPermissionsParams,
  buildMyPermissionsQueryString,
  fetchMyPermissionsPage,
  fetchPermissionDetail,
  getPermissionDayRange,
  getPermissionReporter,
  initialPermissionCursor,
  isOwnPermission,
  MY_PERMISSIONS_FIELDS,
  MY_PERMISSIONS_ROWS,
  parsePermissionScope,
  readSchoolUsersId,
  sourcesForScope,
  type MyPermission,
  type PermissionScope,
} from "../permissionRules";

jest.mock("axios");

const mockedGet = axios.get as unknown as jest.Mock;

/** schoolUsers.id del usuario logueado en todos los casos de abajo. */
const ME = 224;
const URL = "https://timecontrol.example.net:8600";
const TOKEN = "jwt.token.here";

/** Envelope real del backend: { success, message, data: { items, count } }. */
const listBody = (items: unknown[], count?: number) => ({
  data: {
    success: true,
    message: "ok",
    data: { items, count: count ?? items.length },
  },
});

const permission = (over: Partial<MyPermission> = {}): Record<string, unknown> => ({
  id: 1,
  subject: "Cita médica",
  permissionDate: "2026-08-20",
  fromTime: "09:00",
  toTime: "11:00",
  requestedSchoolUserId: ME,
  ...over,
});

/** N permisos con ids descendentes desde `startId`, como los devuelve el
 * backend con orderKey=id/orderDir=desc. */
const rowsOf = (count: number, startId: number) =>
  Array.from({ length: count }, (_, index) =>
    permission({ id: startId - index }),
  );

/** El último `params` con el que se llamó a cada endpoint. */
const paramsFor = (route: string): Record<string, any> | undefined =>
  mockedGet.mock.calls.find((call) => String(call[0]).endsWith(route))?.[1]?.params;

const urlsCalled = (): string[] => mockedGet.mock.calls.map((call) => String(call[0]));

/** Enruta la respuesta por endpoint, sin depender del orden de las llamadas. */
const routeBySource = (
  local: (page: number) => unknown,
  history: (page: number) => unknown,
) => {
  mockedGet.mockImplementation((url: string, config?: any) => {
    const page = Number(config?.params?.page ?? 1);
    return Promise.resolve(
      String(url).endsWith("userdaypermissionsh") ? history(page) : local(page),
    );
  });
};

beforeEach(() => {
  mockedGet.mockReset();
});

// ─── Params del listado ──────────────────────────────────────────────────────

describe("params de GET userdaypermissions", () => {
  test("schoolUserId acota SIEMPRE la lista al usuario logueado", () => {
    expect(buildMyPermissionsParams({ schoolUserId: ME }).schoolUserId).toBe(ME);
  });

  test("orden y paginación del webapp: id desc, 15 filas", () => {
    const params = buildMyPermissionsParams({ schoolUserId: ME });
    expect(params.orderKey).toBe("id");
    expect(params.orderDir).toBe("desc");
    expect(params.rows).toBe(15);
    expect(params.page).toBe(1);
    expect(MY_PERMISSIONS_ROWS).toBe(15);
  });

  test("no viaja ningún param de más", () => {
    expect(Object.keys(buildMyPermissionsParams({ schoolUserId: ME })).sort()).toEqual(
      ["fields", "orderDir", "orderKey", "page", "rows", "schoolUserId"],
    );
  });

  test("`fields` es el string EXACTO del apiConfig del webapp", () => {
    expect(buildMyPermissionsParams({ schoolUserId: ME }).fields).toBe(
      "id,permissionDate,fromTime,toTime,groupWeekDays," +
        "stateTag.id,stateTag.name,stateTag.color,stateTag.fontColor," +
        "typeTag.name,typeTag.color,typeTag.fontColor," +
        "actionTag.name,actionTag.color,actionTag.fontColor," +
        "subject,description," +
        "schoolUser:user.phone,schoolUser:user.email,adminUser:user.fullName",
    );
  });

  test("REGRESIÓN: la mezcla punto / dos puntos NO se normaliza", () => {
    // Los dos puntos son parte del alias del join anidado (`schoolUser:user`)
    // y el punto separa alias de columna. Aplanar cualquiera de los dos
    // produce el 500 de "Unknown column '...undefined'".
    expect(MY_PERMISSIONS_FIELDS).toContain("schoolUser:user.phone");
    expect(MY_PERMISSIONS_FIELDS).not.toContain("schoolUser.user.phone");
    expect(MY_PERMISSIONS_FIELDS).not.toContain("schoolUser:user:phone");
    expect(MY_PERMISSIONS_FIELDS).toContain("stateTag.name");
    expect(MY_PERMISSIONS_FIELDS).not.toContain("stateTag:name");
  });

  test("`fields` NO pide el nombre del solicitante — no se asume poblado", () => {
    // El único fullName de la lista es el del admin que revisó. El del
    // solicitante no se pide: la pantalla usa el del usuario logueado.
    expect(MY_PERMISSIONS_FIELDS).not.toContain("schoolUser:user.fullName");
    expect(MY_PERMISSIONS_FIELDS).toContain("adminUser:user.fullName");
  });

  test("el query string sale armable y con el filtro por usuario", () => {
    const qs = buildMyPermissionsQueryString(
      buildMyPermissionsParams({ schoolUserId: ME, page: 3 }),
    );
    expect(qs).toContain(`schoolUserId=${ME}`);
    expect(qs).toContain("page=3");
  });

  test("las DOS tablas viajan con el mismo filtro por usuario", async () => {
    routeBySource(
      () => listBody(rowsOf(2, 900)),
      () => listBody(rowsOf(2, 100)),
    );

    await fetchMyPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      schoolUserId: ME,
      scope: "todos",
      cursor: initialPermissionCursor(),
    });

    expect(paramsFor("userdaypermissions")?.schoolUserId).toBe(ME);
    expect(paramsFor("userdaypermissionsh")?.schoolUserId).toBe(ME);
    for (const call of mockedGet.mock.calls) {
      expect(call[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    }
  });
});

// ─── schoolUsersId del JWT ───────────────────────────────────────────────────

describe("readSchoolUsersId — el claim del propio token", () => {
  test("lee el claim numérico", () => {
    expect(readSchoolUsersId({ schoolUsersId: ME })).toBe(ME);
  });

  test("acepta el claim como string", () => {
    expect(readSchoolUsersId({ schoolUsersId: "224" })).toBe(ME);
  });

  test("sin claim usable devuelve null — nunca un undefined que liste todo", () => {
    expect(readSchoolUsersId({})).toBeNull();
    expect(readSchoolUsersId(null)).toBeNull();
    expect(readSchoolUsersId({ schoolUsersId: 0 })).toBeNull();
    expect(readSchoolUsersId({ schoolUsersId: "abc" })).toBeNull();
  });
});

// ─── Filtro ──────────────────────────────────────────────────────────────────

describe("filtro Todos / Local / Histórico", () => {
  test("lo persistido se valida antes de usarse", () => {
    expect(parsePermissionScope("historico")).toBe("historico");
    expect(parsePermissionScope("local")).toBe("local");
    expect(parsePermissionScope(null)).toBe("todos");
    expect(parsePermissionScope("basura")).toBe("todos");
  });

  test("cada modo declara qué tablas consulta", () => {
    expect(sourcesForScope("todos")).toEqual(["local", "historico"]);
    expect(sourcesForScope("local")).toEqual(["local"]);
    expect(sourcesForScope("historico")).toEqual(["historico"]);
  });
});

// ─── Mezcla de las dos tablas ────────────────────────────────────────────────

describe('"Todos" — local primero, el histórico completa', () => {
  test("página local completa: el histórico ni se consulta", async () => {
    routeBySource(
      () => listBody(rowsOf(MY_PERMISSIONS_ROWS, 900), 40),
      () => listBody(rowsOf(MY_PERMISSIONS_ROWS, 100)),
    );

    const page = await fetchMyPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      schoolUserId: ME,
      scope: "todos",
      cursor: initialPermissionCursor(),
    });

    expect(page.items).toHaveLength(15);
    expect(page.items.every((item) => item.source === "local")).toBe(true);
    expect(urlsCalled().some((u) => u.endsWith("userdaypermissionsh"))).toBe(false);
  });

  test("página local corta: se completa con histórico hasta las 15 filas", async () => {
    routeBySource(
      () => listBody(rowsOf(6, 900), 6),
      () => listBody(rowsOf(MY_PERMISSIONS_ROWS, 100), 60),
    );

    const page = await fetchMyPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      schoolUserId: ME,
      scope: "todos",
      cursor: initialPermissionCursor(),
    });

    expect(page.items).toHaveLength(15);
    expect(page.items.filter((item) => item.source === "local")).toHaveLength(6);
    expect(page.items.filter((item) => item.source === "historico")).toHaveLength(9);
  });

  test("NO se reordena: primero todo lo local, después lo histórico", async () => {
    routeBySource(
      () => listBody([permission({ id: 900, permissionDate: "2020-01-01" })], 1),
      () => listBody([permission({ id: 100, permissionDate: "2030-01-01" })], 1),
    );

    const page = await fetchMyPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      schoolUserId: ME,
      scope: "todos",
      cursor: initialPermissionCursor(),
    });

    // El histórico es más nuevo por fecha y aun así va segundo: el orden lo
    // fija el backend con orderKey=id, y la mezcla respeta "local primero".
    expect(page.items.map((item) => item.id)).toEqual([900, 100]);
  });

  test("el sobrante del histórico se guarda y la página siguiente no lo re-pide", async () => {
    routeBySource(
      () => listBody(rowsOf(6, 900), 6),
      (page) => (page === 1 ? listBody(rowsOf(MY_PERMISSIONS_ROWS, 100), 60) : listBody([])),
    );

    const first = await fetchMyPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      schoolUserId: ME,
      scope: "todos",
      cursor: initialPermissionCursor(),
    });

    // 15 traídas del histórico, 9 usadas → 6 quedan en el buffer.
    expect(first.cursor.buffer).toHaveLength(6);
    expect(first.cursor.localDone).toBe(true);

    const callsAfterFirst = mockedGet.mock.calls.length;

    const second = await fetchMyPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      schoolUserId: ME,
      scope: "todos",
      cursor: first.cursor,
    });

    expect(second.items).toHaveLength(6);
    expect(second.items.every((item) => item.source === "historico")).toBe(true);
    // Sin el buffer, completar esta página habría exigido un offset que el
    // backend no acepta: se consume lo ya traído y solo se pide la página
    // siguiente del histórico.
    expect(mockedGet.mock.calls.length).toBe(callsAfterFirst + 1);
    expect(second.hasMore).toBe(false);
  });

  test("la tabla local agotada no se vuelve a pedir en la página siguiente", async () => {
    routeBySource(
      () => listBody(rowsOf(3, 900), 3),
      () => listBody(rowsOf(MY_PERMISSIONS_ROWS, 100), 60),
    );

    const first = await fetchMyPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      schoolUserId: ME,
      scope: "todos",
      cursor: initialPermissionCursor(),
    });

    mockedGet.mockClear();

    await fetchMyPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      schoolUserId: ME,
      scope: "todos",
      cursor: first.cursor,
    });

    expect(urlsCalled().some((u) => u.endsWith("userdaypermissions"))).toBe(false);
  });

  test("`count` corta la tabla aunque la página venga llena", async () => {
    // 15 filas justas y count=15: no hay página 2 que pedir.
    routeBySource(
      () => listBody(rowsOf(MY_PERMISSIONS_ROWS, 900), 15),
      () => listBody([], 0),
    );

    const page = await fetchMyPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      schoolUserId: ME,
      scope: "todos",
      cursor: initialPermissionCursor(),
    });

    expect(page.cursor.localDone).toBe(true);
  });

  test("una tabla caída no tumba la otra", async () => {
    // El fallo se loguea a propósito (logFailure); acá se silencia para no
    // ensuciar la salida de jest con un error que el test provoca.
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    mockedGet.mockImplementation((url: string) =>
      String(url).endsWith("userdaypermissionsh")
        ? Promise.reject(new Error("500"))
        : Promise.resolve(listBody(rowsOf(4, 900), 4)),
    );

    const page = await fetchMyPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      schoolUserId: ME,
      scope: "todos",
      cursor: initialPermissionCursor(),
    });

    expect(page.items).toHaveLength(4);
    // La tabla que falló queda marcada como agotada: no se reintenta en cada
    // scroll.
    expect(page.cursor.historyDone).toBe(true);
    expect(page.hasMore).toBe(false);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("modos Local e Histórico — cada uno consulta una sola tabla", () => {
  const onlyOne = async (scope: PermissionScope) => {
    routeBySource(
      () => listBody(rowsOf(2, 900), 2),
      () => listBody(rowsOf(2, 100), 2),
    );
    const page = await fetchMyPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      schoolUserId: ME,
      scope,
      cursor: initialPermissionCursor(),
    });
    return page;
  };

  test('"Local" nunca pega al histórico', async () => {
    const page = await onlyOne("local");
    expect(urlsCalled().some((u) => u.endsWith("userdaypermissionsh"))).toBe(false);
    expect(page.items.every((item) => item.source === "local")).toBe(true);
  });

  test('"Histórico" nunca pega a la tabla vigente', async () => {
    const page = await onlyOne("historico");
    expect(urlsCalled().some((u) => u.endsWith("userdaypermissions"))).toBe(false);
    expect(page.items.every((item) => item.source === "historico")).toBe(true);
  });

  test("cada item guarda su tabla — es lo que decide la ruta del detalle", async () => {
    routeBySource(
      () => listBody([permission({ id: 900 })], 1),
      () => listBody([permission({ id: 100 })], 1),
    );

    const page = await fetchMyPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      schoolUserId: ME,
      scope: "todos",
      cursor: initialPermissionCursor(),
    });

    expect(page.items.find((item) => item.id === 900)?.source).toBe("local");
    expect(page.items.find((item) => item.id === 100)?.source).toBe("historico");
  });
});

// ─── Rango de días ───────────────────────────────────────────────────────────

describe("getPermissionDayRange", () => {
  test("sin permissionGroupId manda permissionDate: un solo día", () => {
    expect(
      getPermissionDayRange({ permissionDate: "2026-08-20", permissionGroupId: null }),
    ).toEqual({ from: "2026-08-20", to: "2026-08-20", totalDays: 1, isRange: false });
  });

  test("sin permissionGroupId se ignoran groupDates residuales", () => {
    expect(
      getPermissionDayRange({
        permissionDate: "2026-08-20",
        permissionGroupId: null,
        groupDates: ["2026-08-20", "2026-08-25"],
      }),
    ).toEqual({ from: "2026-08-20", to: "2026-08-20", totalDays: 1, isRange: false });
  });

  test("con permissionGroupId el rango sale del min/max de groupDates", () => {
    expect(
      getPermissionDayRange({
        permissionDate: "2026-08-22",
        permissionGroupId: 77,
        // Desordenadas a propósito: el backend no garantiza el orden.
        groupDates: ["2026-08-25", "2026-08-20", "2026-08-22"],
      }),
    ).toEqual({ from: "2026-08-20", to: "2026-08-25", totalDays: 3, isRange: true });
  });

  test("el total cuenta días DISTINTOS, no la longitud del arreglo", () => {
    expect(
      getPermissionDayRange({
        permissionDate: "2026-08-20",
        permissionGroupId: 77,
        groupDates: ["2026-08-20", "2026-08-20", "2026-08-21"],
      }).totalDays,
    ).toBe(2);
  });

  test("grupo de un solo día NO se reporta como rango", () => {
    expect(
      getPermissionDayRange({
        permissionDate: "2026-08-20",
        permissionGroupId: 77,
        groupDates: ["2026-08-20"],
      }),
    ).toEqual({ from: "2026-08-20", to: "2026-08-20", totalDays: 1, isRange: false });
  });

  test("una fecha ISO con hora no se corre de día", () => {
    expect(
      getPermissionDayRange({
        permissionDate: "2026-08-20T00:00:00.000Z",
        permissionGroupId: 77,
        groupDates: [],
      }).from,
    ).toBe("2026-08-20");
  });

  test("sin ninguna fecha no se inventa una", () => {
    expect(getPermissionDayRange({ permissionDate: null })).toEqual({
      from: "",
      to: "",
      totalDays: 0,
      isRange: false,
    });
  });
});

// ─── Quién Solicita ──────────────────────────────────────────────────────────

describe("getPermissionReporter — prioridad exacta del webapp", () => {
  test("requestedSchoolUser gana sobre schoolUser", () => {
    const reporter = getPermissionReporter({
      requestedSchoolUser: { id: 1, user: { fullName: "Solicitante" } },
      schoolUser: { id: 2, user: { fullName: "Dueño" } },
    });
    expect(reporter?.user?.fullName).toBe("Solicitante");
  });

  test("sin requestedSchoolUser cae a schoolUser", () => {
    const reporter = getPermissionReporter({
      schoolUser: { id: 2, user: { fullName: "Dueño" } },
    });
    expect(reporter?.user?.fullName).toBe("Dueño");
  });

  test("sin ninguno de los dos devuelve null", () => {
    expect(getPermissionReporter({})).toBeNull();
    expect(getPermissionReporter(null)).toBeNull();
  });
});

// ─── Detalle y guard de pertenencia ──────────────────────────────────────────

describe("detalle: ruta según la tabla de origen y permiso siempre propio", () => {
  const detailBody = (data: unknown) => ({
    data: { success: true, message: "ok", data },
  });

  test("un item local pide su detalle a userdaypermissions", async () => {
    mockedGet.mockResolvedValue(detailBody(permission({ id: 55 })));

    await fetchPermissionDetail({
      token: TOKEN,
      urlColegio: URL,
      id: 55,
      source: "local",
      schoolUsersId: ME,
    });

    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/userdaypermissions/55`);
  });

  test("un item archivado pide su detalle a userdaypermissionsh", async () => {
    mockedGet.mockResolvedValue(detailBody(permission({ id: 90 })));

    await fetchPermissionDetail({
      token: TOKEN,
      urlColegio: URL,
      id: 90,
      source: "historico",
      schoolUsersId: ME,
    });

    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/userdaypermissionsh/90`);
  });

  test("el detalle va sin params extra", async () => {
    mockedGet.mockResolvedValue(detailBody(permission({ id: 55 })));

    await fetchPermissionDetail({
      token: TOKEN,
      urlColegio: URL,
      id: 55,
      source: "local",
      schoolUsersId: ME,
    });

    expect(mockedGet.mock.calls[0][1]?.params).toBeUndefined();
  });

  test("detalle propio: se devuelve, con su source", async () => {
    mockedGet.mockResolvedValue(detailBody(permission({ id: 55 })));

    const detail = await fetchPermissionDetail({
      token: TOKEN,
      urlColegio: URL,
      id: 55,
      source: "local",
      schoolUsersId: ME,
    });

    expect(detail?.id).toBe(55);
    expect(detail?.source).toBe("local");
  });

  test("un permiso de otro usuario se trata como no encontrado", async () => {
    mockedGet.mockResolvedValue(
      detailBody(permission({ id: 55, requestedSchoolUserId: 999 })),
    );

    const detail = await fetchPermissionDetail({
      token: TOKEN,
      urlColegio: URL,
      id: 55,
      source: "local",
      schoolUsersId: ME,
    });

    expect(detail).toBeNull();
  });

  test("un permiso sin dueño legible también se rechaza", async () => {
    mockedGet.mockResolvedValue(detailBody({ id: 55, subject: "Sin dueño" }));

    const detail = await fetchPermissionDetail({
      token: TOKEN,
      urlColegio: URL,
      id: 55,
      source: "local",
      schoolUsersId: ME,
    });

    expect(detail).toBeNull();
  });

  test("isOwnPermission acepta las cuatro formas del dueño y nada más", () => {
    const own = (over: Partial<MyPermission>) =>
      isOwnPermission({ id: 1, source: "local", ...over }, ME);

    expect(own({ requestedSchoolUser: { id: ME } })).toBe(true);
    expect(own({ requestedSchoolUserId: ME })).toBe(true);
    expect(own({ schoolUser: { id: ME } })).toBe(true);
    expect(own({ schoolUserId: ME })).toBe(true);

    expect(own({ requestedSchoolUserId: 999 })).toBe(false);
    expect(own({})).toBe(false);
    expect(isOwnPermission({ id: 1, source: "local", schoolUserId: ME }, null)).toBe(
      false,
    );
    expect(isOwnPermission(null, ME)).toBe(false);
  });

  test("REGRESIÓN: schoolUser NO tapa a un requestedSchoolUser ajeno", () => {
    // Un permiso cargado por un admin a nombre de otro empleado: el dueño real
    // es requestedSchoolUser. Si el guard mirara schoolUser primero, el admin
    // vería el permiso de su empleado como propio.
    expect(
      isOwnPermission(
        {
          id: 1,
          source: "local",
          requestedSchoolUser: { id: 999 },
          schoolUser: { id: ME },
        },
        ME,
      ),
    ).toBe(false);
  });
});

// ─── Adjuntos ────────────────────────────────────────────────────────────────

describe("buildAttachmentUri", () => {
  test("arma la URI absoluta contra /downloads", () => {
    expect(buildAttachmentUri(URL, "permissions/2026/receta.png")).toBe(
      `${URL}/downloads/permissions/2026/receta.png`,
    );
  });

  test("no duplica las barras del borde", () => {
    expect(buildAttachmentUri(`${URL}/`, "/receta.png")).toBe(
      `${URL}/downloads/receta.png`,
    );
  });

  test("sin base o sin ruta devuelve vacío en vez de una URI rota", () => {
    expect(buildAttachmentUri(null, "receta.png")).toBe("");
    expect(buildAttachmentUri(URL, "")).toBe("");
  });
});
