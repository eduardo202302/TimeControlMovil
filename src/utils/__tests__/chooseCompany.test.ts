/// <reference types="jest" />
import axios from "axios";
import { useSchoolStore } from "../../../store/useSchoolStore";
import {
  buildSessionUser,
  canChangeCompany,
  commitSession,
  fetchUserCompanies,
  getActiveSchoolId,
  LOAD_COMPANIES_ERROR,
  mapUserSchools,
  prepareCompanySwitch,
  readChooseSchoolResponse,
  SWITCH_COMPANY_ERROR,
  switchCompany,
} from "../chooseCompany";
import * as Storage from "../storage";

// SecureStore en memoria — el real necesita react-native.
jest.mock("../storage", () => {
  const mem = new Map<string, string>();
  return {
    __mem: mem,
    getItemAsync: jest.fn(async (key: string) => mem.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      mem.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      mem.delete(key);
    }),
  };
});
jest.mock("axios");

const mem = (Storage as unknown as { __mem: Map<string, string> }).__mem;
const mockedGet = axios.get as unknown as jest.Mock;
const mockedCreate = axios.create as unknown as jest.Mock;
const mockedRawPost = jest.fn();

const URL = "https://timecontrol.example.net:8600";
const LOGIN_TOKEN = "login.token";

const MENU_ITEMS = [
  { id: 1, parentId: null, order: 1, name: "Ponche", icon: "clock", path: "/punchinout", type: "item" },
  { id: 2, parentId: null, order: 2, name: "Ponche ADM", icon: "clock", path: "/adminpunchinout", type: "item" },
];

const schedule = (weekDay: string, entry: string) => ({
  id: 1,
  weekDay,
  workEntryTime: entry,
  workExitTime: "17:00",
  lunchEntryTime: null,
  lunchExitTime: null,
});

const schoolA = {
  id: 1,
  name: "Empresa A",
  logo: "logos/a.png",
  settings: { colors: { logoPrimary: "#111111" }, entryTime: "08:00" },
};
const schoolB = {
  id: 2,
  name: "Empresa B",
  logo: "logos/b.png",
  settings: { colors: { logoPrimary: "#222222" }, entryTime: "09:00" },
};

const schoolUserA = {
  id: 11,
  schoolId: 1,
  userId: 7,
  roleId: 10,
  code: "A-1",
  isActive: true,
  photourl: "photos/a.jpg",
  s3Photo: null,
  role: { id: 10, name: "Empleado", permissions: {}, menu: [1], defaultMenu: { path: "/punchinout" } },
  school: schoolA,
  userSchedules: [schedule("Lunes", "08:00")],
};
const schoolUserB = {
  id: 22,
  schoolId: 2,
  userId: 7,
  roleId: 10,
  code: "B-1",
  isActive: true,
  photourl: "photos/b.jpg",
  s3Photo: "s3/b.jpg",
  role: { id: 10, name: "Empleado", permissions: {}, menu: [1], defaultMenu: { path: "/punchinout" } },
  school: schoolB,
  userSchedules: [schedule("Lunes", "09:00")],
};

const loginData = (schoolUsers: unknown[]) => ({
  token: LOGIN_TOKEN,
  user: { id: 7, fullName: "Ana Pérez", schoolUsers },
});

/** chooseschool OK — misma forma que Authentication/handlers.js chooseSchool. */
const chooseSchoolOk = (over: Record<string, unknown> = {}) => ({
  success: true,
  message: "Successful School Selection",
  data: {
    token: "scoped.token.b",
    user: { id: 7, fullName: "Ana Pérez" },
    school: { ...schoolB, settings: { ...schoolB.settings, entryTime: "09:30" } },
    role: {
      id: 2,
      name: "Administrador",
      permissions: {},
      menu: [1, 2],
      defaultMenu: { path: "/adminpunchinout" },
      menuItems: MENU_ITEMS,
    },
    menu: MENU_ITEMS,
    userSchedules: [schedule("Martes", "10:00")],
    todayHoliday: { id: 5, name: "Feriado B", holidayDate: "2026-10-08", working: false },
    punchesToday: [],
    ...over,
  },
});

/**
 * Lógica de `completeLogin` de FormLogin ANTES de extraerla, copiada tal
 * cual: la regresión compara contra esto.
 */
function legacyFullUser(schoolUser: any, loginDataArg: any, storeSchool: any) {
  const schoolUsers = loginDataArg?.user?.schoolUsers ?? [];
  const selected =
    schoolUser ??
    schoolUsers[0] ??
    (loginDataArg.userSchedules ? { school: loginDataArg.school ?? {} } : null);
  const roleId = selected?.roleId ?? loginDataArg?.roleId;
  const role = selected?.role ??
    loginDataArg?.role ?? {
      id: roleId,
      name: selected?.role?.name ?? loginDataArg?.roleName ?? "",
      permissions: {},
      menu: selected?.role?.menu ?? [],
      defaultMenu: selected?.role?.defaultMenu ?? null,
    };
  const schedules = selected?.userSchedules ?? loginDataArg?.userSchedules ?? [];
  const selectedId = selected?.id ?? selected?.schoolId;
  const reorderedSchoolUsers = (loginDataArg?.user?.schoolUsers ?? [])
    .slice()
    .sort((a: any, b: any) => {
      const aSelected = a?.id === selectedId || a?.schoolId === selectedId;
      const bSelected = b?.id === selectedId || b?.schoolId === selectedId;
      return (bSelected ? 1 : 0) - (aSelected ? 1 : 0);
    });
  return {
    ...loginDataArg,
    user: { ...loginDataArg?.user, schoolUsers: reorderedSchoolUsers },
    roleId,
    role: {
      id: roleId,
      name: role?.name ?? "",
      permissions: {},
      menu: role?.menu ?? [],
      defaultMenu: role?.defaultMenu ?? null,
    },
    school: selected?.school ?? storeSchool ?? {},
    userSchedules: schedules,
  };
}

function resetSession() {
  mem.clear();
  useSchoolStore.getState().clear();
  useSchoolStore.setState({ lastCompany: null });
  useSchoolStore.getState().setUrlColegio(URL);
}

/** Sesión abierta en la Empresa A, igual que la deja el login multi-empresa. */
async function loginIntoA() {
  const login = loginData([schoolUserA, schoolUserB]);
  const { user, selected } = buildSessionUser(schoolUserA as any, login, null);
  await commitSession({
    user,
    selected,
    menuItems: MENU_ITEMS as any,
    token: "scoped.token.a",
    urlColegio: URL,
    chooseSchoolData: {
      token: "scoped.token.a",
      school: schoolA,
      teacherAttendancesToday: [{ id: 99 }],
      todayHoliday: { id: 4, name: "Feriado A", holidayDate: "2026-10-08", working: true },
    },
    storeToken: true,
  });
}

/** Foto completa de lo persistido, para afirmar "nada cambió". */
function snapshotSession() {
  const { token, user, role, menuTree, companySettings, attendancesToday, todayHoliday, lastCompany } =
    useSchoolStore.getState();
  return {
    store: { token, user, role, menuTree, companySettings, attendancesToday, todayHoliday, lastCompany },
    storage: Object.fromEntries(mem),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedCreate.mockReturnValue({ post: mockedRawPost });
  mockedGet.mockImplementation(async (url: string) => {
    if (url.endsWith("/menu/all")) return { data: { success: true, data: MENU_ITEMS } };
    throw new Error(`GET inesperado: ${url}`);
  });
  resetSession();
});

// ─── Funciones puras ─────────────────────────────────────────────────────────

describe("getActiveSchoolId / canChangeCompany (visibilidad de 'Cambiar Empresa')", () => {
  test("la empresa activa es schoolUsers[0]; si no hay, user.school", () => {
    expect(getActiveSchoolId({ user: { schoolUsers: [{ schoolId: 2 }, { schoolId: 1 }] } })).toBe(2);
    expect(getActiveSchoolId({ school: { id: 3 }, user: { schoolUsers: [] } })).toBe(3);
    expect(getActiveSchoolId(null)).toBeNull();
  });

  test("visible solo con empresa activa > 0 y más de una empresa (webapp)", () => {
    const two = { user: { schoolUsers: [{ schoolId: 1 }, { schoolId: 2 }] } };
    expect(canChangeCompany(two)).toBe(true);
    expect(canChangeCompany({ user: { schoolUsers: [{ schoolId: 1 }] } })).toBe(false);
    expect(canChangeCompany({ user: { schoolUsers: [] } })).toBe(false);
    // companyId 0 / ausente → oculto aunque haya varias.
    expect(canChangeCompany({ user: { schoolUsers: [{ schoolId: 0 }, { schoolId: 2 }] } })).toBe(false);
    expect(canChangeCompany({ user: { schoolUsers: [{}, {}] } })).toBe(false);
    expect(canChangeCompany(null)).toBe(false);
  });
});

describe("mapUserSchools (GET /users/schools → selector)", () => {
  test("filas de schools: id es el schoolId; isActive de la empresa", () => {
    expect(
      mapUserSchools([
        { id: 1, name: "Empresa A", logo: "logos/a.png", isActive: true, token: "x" },
        { id: 2, name: "Empresa B", logo: null, isActive: false },
      ]),
    ).toEqual([
      { id: 1, schoolId: 1, isActive: true, school: { id: 1, name: "Empresa A", logo: "logos/a.png" } },
      { id: 2, schoolId: 2, isActive: false, school: { id: 2, name: "Empresa B", logo: null } },
    ]);
  });

  test("isActive ausente cuenta como activa; nombre vacío queda sin nombre", () => {
    expect(mapUserSchools([{ id: 3, name: "  " }])).toEqual([
      { id: 3, schoolId: 3, isActive: true, school: { id: 3, name: undefined, logo: null } },
    ]);
  });

  test("descarta filas sin id numérico y entradas que no son array", () => {
    expect(mapUserSchools([null, { name: "Sin id" }, { id: "4" }])).toEqual([]);
    expect(mapUserSchools({ id: 1 })).toEqual([]);
    expect(mapUserSchools(undefined)).toEqual([]);
  });
});

describe("readChooseSchoolResponse", () => {
  test("success con token → ok", () => {
    const body = chooseSchoolOk();
    expect(readChooseSchoolResponse(body)).toEqual({
      ok: true,
      token: "scoped.token.b",
      data: body.data,
    });
  });

  test("success:false → el message del backend", () => {
    expect(
      readChooseSchoolResponse({ success: false, message: "No tienes acceso a esta entidad." }),
    ).toEqual({ ok: false, message: "No tienes acceso a esta entidad." });
  });

  test("sin token o sin cuerpo → error sin mensaje", () => {
    expect(readChooseSchoolResponse({ success: true, data: {} })).toEqual({ ok: false, message: null });
    expect(readChooseSchoolResponse(undefined)).toEqual({ ok: false, message: null });
  });
});

describe("prepareCompanySwitch", () => {
  test("la entrada elegida toma school/role/horarios frescos de chooseschool; el resto queda igual", () => {
    const { user } = buildSessionUser(schoolUserA as any, loginData([schoolUserA, schoolUserB]), null);
    const data = chooseSchoolOk().data;
    const prepared = prepareCompanySwitch(user, 2, data);

    expect(prepared).not.toBeNull();
    const { schoolUser, loginData: base } = prepared!;
    expect(schoolUser.school).toEqual(data.school);
    expect(schoolUser.roleId).toBe(2);
    expect(schoolUser.role).toEqual({
      id: 2,
      name: "Administrador",
      permissions: {},
      menu: [1, 2],
      defaultMenu: { path: "/adminpunchinout" },
    }); // sin menuItems
    expect(schoolUser.userSchedules).toEqual(data.userSchedules);
    // La foto no viene en chooseschool: queda la de la entrada de esa empresa.
    expect(schoolUser.photourl).toBe("photos/b.jpg");
    expect(base.user.schoolUsers?.find((su) => su.schoolId === 1)).toBe(user.user.schoolUsers?.[0]);
    expect(base.user.schoolUsers?.find((su) => su.schoolId === 2)).toBe(schoolUser);
  });

  test("empresa que el usuario no tiene → null", () => {
    const { user } = buildSessionUser(schoolUserA as any, loginData([schoolUserA, schoolUserB]), null);
    expect(prepareCompanySwitch(user, 99, chooseSchoolOk().data)).toBeNull();
  });
});

// ─── Regresión del login ─────────────────────────────────────────────────────

describe("login — buildSessionUser es la lógica de completeLogin sin cambios", () => {
  test("varias empresas: elige la segunda → queda primera, con su rol y horarios", () => {
    const login = loginData([schoolUserA, schoolUserB]);
    const { user, selected } = buildSessionUser(schoolUserB as any, login, { id: 50 });
    expect(user).toEqual(legacyFullUser(schoolUserB, login, { id: 50 }));
    expect(selected).toBe(schoolUserB);
    expect(user.user.schoolUsers?.map((su) => su.schoolId)).toEqual([2, 1]);
    expect(user.school).toBe(schoolB);
    expect(user.userSchedules).toBe(schoolUserB.userSchedules);
  });

  test("una sola empresa", () => {
    const login = loginData([schoolUserA]);
    const { user } = buildSessionUser(schoolUserA as any, login, null);
    expect(user).toEqual(legacyFullUser(schoolUserA, login, null));
    expect(getActiveSchoolId(user)).toBe(1);
    expect(canChangeCompany(user)).toBe(false);
  });

  test("sin schoolUser (rama de respaldo) usa schoolUsers[0] o el userSchedules del login", () => {
    const login = loginData([schoolUserA]);
    expect(buildSessionUser(null, login, null).user).toEqual(legacyFullUser(null, login, null));

    const legacyShape = {
      user: { id: 7, schoolUsers: [] },
      roleId: 3,
      roleName: "Docente",
      userSchedules: [schedule("Lunes", "07:00")],
      school: schoolA,
    };
    expect(buildSessionUser(null, legacyShape, { id: 9 }).user).toEqual(
      legacyFullUser(null, legacyShape, { id: 9 }),
    );
  });
});

describe("login — commitSession deja la sesión igual que completeLogin", () => {
  test("varias empresas: token en store, snapshot del día, foto y lastCompany de la elegida", async () => {
    const login = loginData([schoolUserA, schoolUserB]);
    const { user, selected } = buildSessionUser(schoolUserB as any, login, null);
    const data = chooseSchoolOk().data;
    await commitSession({
      user,
      selected,
      menuItems: MENU_ITEMS as any,
      token: data.token,
      urlColegio: URL,
      chooseSchoolData: data,
      storeToken: true,
    });

    const state = useSchoolStore.getState();
    expect(state.token).toBe("scoped.token.b");
    expect(state.user).toBe(user);
    expect(state.role?.defaultMenu?.path).toBe("/punchinout");
    expect(state.companySettings?.entryTime).toBe("09:30");
    expect(state.attendancesToday).toEqual([]);
    expect(state.todayHoliday).toEqual({ id: 5, name: "Feriado B", holidayDate: "2026-10-08", working: false });
    expect(state.lastCompany).toMatchObject({ schoolId: 2, name: "Empresa B", urlColegio: URL });

    expect(mem.get("isAuthorized")).toBe("true");
    expect(mem.get("token")).toBe("scoped.token.b");
    expect(mem.get("urlColegio")).toBe(URL);
    expect(JSON.parse(mem.get("user")!)).toEqual(JSON.parse(JSON.stringify(user)));
    expect(JSON.parse(mem.get("menuItems")!)).toEqual(MENU_ITEMS);
    expect(mem.get("photourl")).toBe("photos/b.jpg");
    expect(mem.get("s3Photo")).toBe("s3/b.jpg");
  });

  test("una sola empresa: el token NO se guarda en el store (como antes)", async () => {
    const login = loginData([schoolUserA]);
    const { user, selected } = buildSessionUser(schoolUserA as any, login, null);
    await commitSession({
      user,
      selected,
      menuItems: MENU_ITEMS as any,
      token: "scoped.token.a",
      urlColegio: URL,
      chooseSchoolData: { token: "scoped.token.a", school: schoolA },
    });

    expect(useSchoolStore.getState().token).toBeNull();
    expect(mem.get("token")).toBe("scoped.token.a");
    expect(useSchoolStore.getState().companySettings?.entryTime).toBe("08:00");
    expect(mem.get("photourl")).toBe("photos/a.jpg");
    // Sin s3Photo → se borra lo que hubiera.
    expect(mem.has("s3Photo")).toBe(false);
  });

  test("chooseschool falló (token de login): no toca settings/asistencias/feriado; lastCompany de selected.school", async () => {
    useSchoolStore.getState().setAttendancesToday([{ id: 1 }]);
    const login = loginData([schoolUserA]);
    const { user, selected } = buildSessionUser(schoolUserA as any, login, null);
    await commitSession({
      user,
      selected,
      menuItems: MENU_ITEMS as any,
      token: LOGIN_TOKEN,
      urlColegio: URL,
    });

    const state = useSchoolStore.getState();
    expect(state.companySettings).toBeNull();
    expect(state.attendancesToday).toEqual([{ id: 1 }]);
    expect(state.lastCompany).toMatchObject({ schoolId: 1, name: "Empresa A" });
    expect(mem.get("token")).toBe(LOGIN_TOKEN);
  });
});

// ─── Cambiar Empresa ─────────────────────────────────────────────────────────

describe("switchCompany", () => {
  test("éxito: POST con token vigente + platform App, y toda la sesión pasa a la empresa nueva", async () => {
    await loginIntoA();
    mockedRawPost.mockResolvedValue({ data: chooseSchoolOk() });

    const result = await switchCompany(2);

    expect(mockedRawPost).toHaveBeenCalledWith(
      `${URL}/authentication/chooseschool`,
      { schoolId: 2 },
      { headers: { Authorization: "Bearer scoped.token.a", platform: "App" } },
    );
    // Ruta de inicio del rol NUEVO, por resolveMobilePath.
    expect(result).toEqual({ ok: true, path: "/adminpunchinout" });

    const state = useSchoolStore.getState();
    expect(state.token).toBe("scoped.token.b");
    expect(getActiveSchoolId(state.user)).toBe(2);
    expect(state.user?.user.schoolUsers?.map((su) => su.schoolId)).toEqual([2, 1]);
    expect(state.user?.user.schoolUsers?.[0].userSchedules).toEqual([schedule("Martes", "10:00")]);
    expect(state.user?.userSchedules).toEqual([schedule("Martes", "10:00")]);
    expect(state.user?.school?.name).toBe("Empresa B");
    expect(state.role).toMatchObject({ id: 2, name: "Administrador", menu: [1, 2] });
    expect(state.menuTree.map((t) => t.parent.id)).toEqual([1, 2]);
    expect(state.companySettings?.entryTime).toBe("09:30");
    // Empresa B no trae asistencias de docente → [] (no las de A).
    expect(state.attendancesToday).toEqual([]);
    expect(state.todayHoliday?.name).toBe("Feriado B");
    expect(state.lastCompany).toMatchObject({ schoolId: 2, name: "Empresa B" });

    expect(mem.get("token")).toBe("scoped.token.b");
    expect(mem.get("photourl")).toBe("photos/b.jpg");
    expect(mem.get("s3Photo")).toBe("s3/b.jpg");
    expect(getActiveSchoolId(JSON.parse(mem.get("user")!))).toBe(2);
  });

  test("feriado ausente en la empresa nueva → null (no el de la anterior)", async () => {
    await loginIntoA();
    mockedRawPost.mockResolvedValue({ data: chooseSchoolOk({ todayHoliday: undefined }) });
    await switchCompany(2);
    expect(useSchoolStore.getState().todayHoliday).toBeNull();
  });

  test("success:false → message del backend y la sesión queda intacta", async () => {
    await loginIntoA();
    const before = snapshotSession();
    mockedRawPost.mockResolvedValue({
      data: { success: false, message: "No tienes acceso a esta entidad." },
    });

    expect(await switchCompany(2)).toEqual({
      ok: false,
      message: "No tienes acceso a esta entidad.",
    });
    expect(snapshotSession()).toEqual(before);
  });

  test("error de red → mensaje genérico y la sesión queda intacta", async () => {
    await loginIntoA();
    const before = snapshotSession();
    mockedRawPost.mockRejectedValue(new Error("Network Error"));

    expect(await switchCompany(2)).toEqual({ ok: false, message: SWITCH_COMPANY_ERROR });
    expect(snapshotSession()).toEqual(before);
  });

  test("empresa que no está en schoolUsers → error y la sesión queda intacta", async () => {
    await loginIntoA();
    const before = snapshotSession();
    mockedRawPost.mockResolvedValue({ data: chooseSchoolOk() });

    expect(await switchCompany(99)).toEqual({ ok: false, message: SWITCH_COMPANY_ERROR });
    expect(snapshotSession()).toEqual(before);
  });
});

describe("fetchUserCompanies", () => {
  test("GET /users/schools con el token vigente", async () => {
    await loginIntoA();
    mockedGet.mockResolvedValueOnce({
      data: { success: true, data: [{ id: 1, name: "Empresa A", isActive: true }] },
    });
    expect(await fetchUserCompanies()).toEqual({
      ok: true,
      companies: [{ id: 1, schoolId: 1, isActive: true, school: { id: 1, name: "Empresa A", logo: null } }],
    });
    expect(mockedGet).toHaveBeenCalledWith(`${URL}/users/schools`, {
      headers: { Authorization: "Bearer scoped.token.a" },
    });
  });

  test("success:false → message del backend; error de red → genérico", async () => {
    await loginIntoA();
    mockedGet.mockResolvedValueOnce({ data: { success: false, message: "Sin acceso" } });
    expect(await fetchUserCompanies()).toEqual({ ok: false, message: "Sin acceso" });

    mockedGet.mockRejectedValueOnce(new Error("Network Error"));
    expect(await fetchUserCompanies()).toEqual({ ok: false, message: LOAD_COMPANIES_ERROR });
  });
});
