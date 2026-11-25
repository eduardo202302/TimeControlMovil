/// <reference types="jest" />
import axios from "axios";
import { useSchoolStore } from "../../../store/useSchoolStore";
import type { MenuItem, RoleItem } from "../../../types/typesMenu/MenuTypes";
import type { User } from "../../../types/typeStore/SchoolStoreType";
import type { TaskerCompanyConfig } from "../../../types/typesTasker/TaskerTypes";
import { fetchPunchesToday } from "../punchesTodayApi";
import type { PunchEvent } from "../punchRules";
import {
  checkOpenJornadaToday,
  LANDING_JORNADA_TIMEOUT_MS,
  resolveLandingPath,
} from "../reportJornada";
import {
  hasOpenJornadaToday,
  PUNCHINOUT_PATH,
  userRequiresJornadaForReport,
} from "../reportJornadaRules";
import * as Storage from "../storage";
import { TASKER_DISCONNECTED_CONFIG } from "../taskerApi";

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
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

const mem = (Storage as unknown as { __mem: Map<string, string> }).__mem;
const mockedGet = axios.get as unknown as jest.Mock;

const URL = "https://timecontrol.example.net:8600";
const TOKEN = "school.jwt";

/** Hoy en RD: 24-nov-2026 a mediodía (los tests corren con TZ=UTC). */
const NOW = new Date("2026-11-24T12:00:00-04:00");

const CONNECTED: TaskerCompanyConfig = {
  connected: true,
  appliesFault: true,
  failureReportMenuLabel: null,
  failureReportLabel: null,
  clientLabel: null,
};

const menuItem = (id: number, path: string): MenuItem => ({
  id,
  parentId: null,
  order: id,
  name: path,
  icon: "x",
  path,
  type: "item",
});
const PUNCH_ITEM = menuItem(1, "/punchinout");
const PERMS_ITEM = menuItem(2, "/mypermissions");

const punch = (
  id: number,
  type: string,
  createdDate: string,
  extra: Partial<PunchEvent> = {},
): PunchEvent => ({ id, type, status: "A tiempo", createdDate, ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  mem.clear();
  useSchoolStore.getState().clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Reglas puras ───────────────────────────────────────────────────────────

describe("userRequiresJornadaForReport", () => {
  it("Tasker conectado y el ponchador en el menú → aplica", () => {
    expect(userRequiresJornadaForReport([PERMS_ITEM, PUNCH_ITEM], CONNECTED)).toBe(true);
  });
  it("sin el ponchador en el menú → no aplica", () => {
    expect(userRequiresJornadaForReport([PERMS_ITEM], CONNECTED)).toBe(false);
    expect(userRequiresJornadaForReport([], CONNECTED)).toBe(false);
    expect(userRequiresJornadaForReport(null, CONNECTED)).toBe(false);
  });
  it("Tasker no conectado (o sin config) → no aplica aunque tenga el ponchador", () => {
    expect(userRequiresJornadaForReport([PUNCH_ITEM], TASKER_DISCONNECTED_CONFIG)).toBe(false);
    expect(userRequiresJornadaForReport([PUNCH_ITEM], null)).toBe(false);
  });
  it("PUNCHINOUT_PATH es la ruta del ponchador", () => {
    expect(PUNCHINOUT_PATH).toBe("/punchinout");
  });
});

describe("hasOpenJornadaToday", () => {
  it("InicioJornada de hoy sin fin → abierta", () => {
    expect(hasOpenJornadaToday([punch(1, "InicioJornada", "2026-11-24T08:00:00")], null, NOW)).toBe(true);
  });
  it("Adicional y FH también abren", () => {
    expect(
      hasOpenJornadaToday([punch(1, "InicioJornadaAdicional", "2026-11-24T08:00:00")], null, NOW),
    ).toBe(true);
    expect(hasOpenJornadaToday([punch(1, "InicioJornadaFH", "2026-11-24T08:00:00")], null, NOW)).toBe(true);
  });
  it("con FinJornada posterior → cerrada; sin ponches → cerrada", () => {
    expect(
      hasOpenJornadaToday(
        [punch(1, "InicioJornada", "2026-11-24T08:00:00"), punch(2, "FinJornada", "2026-11-24T11:00:00")],
        null,
        NOW,
      ),
    ).toBe(false);
    expect(hasOpenJornadaToday([], null, NOW)).toBe(false);
  });
  it("breaks después del inicio no la cierran", () => {
    expect(
      hasOpenJornadaToday(
        [punch(1, "InicioJornada", "2026-11-24T08:00:00"), punch(2, "InicioBreak", "2026-11-24T10:00:00")],
        null,
        NOW,
      ),
    ).toBe(true);
  });
  it("inicio rechazado (Fuera de área, Error de Imagen) → no cuenta", () => {
    expect(
      hasOpenJornadaToday(
        [punch(1, "InicioJornada", "2026-11-24T08:00:00", { status: "Fuera de área" })],
        null,
        NOW,
      ),
    ).toBe(false);
    expect(
      hasOpenJornadaToday(
        [punch(1, "InicioJornada", "2026-11-24T08:00:00", { status: "Error de Imagen" })],
        null,
        NOW,
      ),
    ).toBe(false);
  });
  it("inicio de un día anterior → no es de hoy", () => {
    expect(hasOpenJornadaToday([punch(1, "InicioJornada", "2026-11-23T08:00:00")], null, NOW)).toBe(false);
  });
  it("hoy en RD aunque en UTC ya sea mañana (21:30 RD = 01:30 UTC)", () => {
    const lateNow = new Date("2026-11-24T21:45:00-04:00");
    expect(
      hasOpenJornadaToday([punch(1, "InicioJornada", "2026-11-24T21:30:00")], null, lateNow),
    ).toBe(true);
  });
  it("la jornada pendiente de un día anterior (pendingOpenDay) cuenta como NO abierta", () => {
    const pending = punch(7, "InicioJornada", "2026-11-23T08:00:00");
    // Aunque el backend la devolviera marcada hoy: mismo ponche por id → no.
    expect(hasOpenJornadaToday([punch(7, "InicioJornada", "2026-11-24T08:00:00")], pending, NOW)).toBe(false);
    // Sin la jornada de hoy, la pendiente sola no abre nada.
    expect(hasOpenJornadaToday([], pending, NOW)).toBe(false);
    // Con una jornada propia de hoy (otro ponche, otro día) → abierta.
    expect(hasOpenJornadaToday([punch(8, "InicioJornada", "2026-11-24T08:00:00")], pending, NOW)).toBe(true);
  });
  it("marcado con hasOpenDay (jornada arrastrada) → no cuenta", () => {
    expect(
      hasOpenJornadaToday(
        [punch(1, "InicioJornada", "2026-11-24T08:00:00", { hasOpenDay: true })],
        null,
        NOW,
      ),
    ).toBe(false);
  });
});

// ─── GET /punches/today ─────────────────────────────────────────────────────

describe("fetchPunchesToday", () => {
  it("éxito → ok con los ponches; manda el token y el timeout pedido", async () => {
    const punches = [punch(1, "InicioJornada", "2026-11-24T08:00:00")];
    mockedGet.mockResolvedValueOnce({ data: { success: true, data: punches } });
    await expect(fetchPunchesToday({ urlColegio: URL, token: TOKEN, timeoutMs: 3000 })).resolves.toEqual({
      ok: true,
      punches,
    });
    expect(mockedGet).toHaveBeenCalledWith(`${URL}/punches/today`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 3000,
    });
  });
  it("sin timeoutMs no manda timeout (como el ponchador)", async () => {
    mockedGet.mockResolvedValueOnce({ data: { success: true, data: [] } });
    await fetchPunchesToday({ urlColegio: URL, token: TOKEN });
    expect(mockedGet.mock.calls[0][1]).toEqual({ headers: { Authorization: `Bearer ${TOKEN}` } });
  });
  it("data ausente o no lista → ok con []", async () => {
    mockedGet.mockResolvedValueOnce({ data: { success: true } });
    await expect(fetchPunchesToday({ urlColegio: URL, token: TOKEN })).resolves.toEqual({ ok: true, punches: [] });
  });
  it("success false, error de red o respuesta rara → ok false, sin lanzar", async () => {
    mockedGet.mockResolvedValueOnce({ data: { success: false, message: "x" } });
    await expect(fetchPunchesToday({ urlColegio: URL, token: TOKEN })).resolves.toEqual({ ok: false, punches: [] });
    mockedGet.mockRejectedValueOnce(new Error("Network Error"));
    await expect(fetchPunchesToday({ urlColegio: URL, token: TOKEN })).resolves.toEqual({ ok: false, punches: [] });
    mockedGet.mockResolvedValueOnce(undefined);
    await expect(fetchPunchesToday({ urlColegio: URL, token: TOKEN })).resolves.toEqual({ ok: false, punches: [] });
  });
});

// ─── Sesión: consulta y ruta de inicio ──────────────────────────────────────

/** Sesión con rol (defaultMenu) y menú permitido; Tasker conectado o no. */
function session({
  defaultPath = "/mypermissions",
  menu = [PUNCH_ITEM, PERMS_ITEM],
  tasker = CONNECTED,
  token = TOKEN as string | null,
}: {
  defaultPath?: string;
  menu?: MenuItem[];
  tasker?: TaskerCompanyConfig;
  token?: string | null;
} = {}) {
  const role: RoleItem = {
    id: 10,
    name: "Empleado",
    permissions: {},
    menu: menu.map((m) => m.id),
    defaultMenu: { icon: "x", id: 2, name: "x", order: 1, parentId: 0, path: defaultPath, type: "item" },
  };
  const user = { roleId: 10, role } as unknown as User;
  const store = useSchoolStore.getState();
  store.setUrlColegio(URL);
  if (token) store.setToken(token);
  store.setTaskerSession({ config: tasker, clients: [] });
  store.setMenuResolution(user, menu);
}

/** Ponches de hoy (fecha real del reloj: la regla compara con new Date()). */
function todayNaive(hour: number): string {
  const rd = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const ymd = rd.toISOString().slice(0, 10);
  return `${ymd}T${String(hour).padStart(2, "0")}:00:00`;
}

describe("checkOpenJornadaToday", () => {
  it("jornada abierta hoy → { ok, open: true }", async () => {
    session();
    mockedGet.mockResolvedValueOnce({
      data: { success: true, data: [punch(1, "InicioJornada", todayNaive(0))] },
    });
    await expect(checkOpenJornadaToday(1000)).resolves.toEqual({ ok: true, open: true });
  });
  it("sin token en el store usa el de SecureStore", async () => {
    session({ token: null });
    mem.set("token", "secure.jwt");
    mockedGet.mockResolvedValueOnce({ data: { success: true, data: [] } });
    await expect(checkOpenJornadaToday(1000)).resolves.toEqual({ ok: true, open: false });
    expect(mockedGet.mock.calls[0][1].headers).toEqual({ Authorization: "Bearer secure.jwt" });
  });
  it("sin token en ningún lado o red caída → { ok: false }", async () => {
    session({ token: null });
    await expect(checkOpenJornadaToday(1000)).resolves.toEqual({ ok: false });
    expect(mockedGet).not.toHaveBeenCalled();
    session();
    mockedGet.mockRejectedValueOnce(new Error("timeout of 1000ms exceeded"));
    await expect(checkOpenJornadaToday(1000)).resolves.toEqual({ ok: false });
  });
});

describe("resolveLandingPath", () => {
  it("regla + jornada abierta hoy → /reportfault (consulta con tope corto)", async () => {
    session();
    mockedGet.mockResolvedValueOnce({
      data: { success: true, data: [punch(1, "InicioJornada", todayNaive(0))] },
    });
    await expect(resolveLandingPath()).resolves.toBe("/reportfault");
    expect(mockedGet.mock.calls[0][1].timeout).toBe(LANDING_JORNADA_TIMEOUT_MS);
    expect(LANDING_JORNADA_TIMEOUT_MS).toBe(3000);
  });
  it("regla + jornada cerrada → la ruta de siempre (defaultMenu)", async () => {
    session();
    mockedGet.mockResolvedValueOnce({ data: { success: true, data: [] } });
    await expect(resolveLandingPath()).resolves.toBe("/mypermissions");
  });
  it("regla + consulta fallida → la ruta de siempre", async () => {
    session();
    mockedGet.mockRejectedValueOnce(new Error("Network Error"));
    await expect(resolveLandingPath()).resolves.toBe("/mypermissions");
  });
  it("sin la regla (Tasker no conectado o sin ponchador) → sin consultar", async () => {
    session({ tasker: TASKER_DISCONNECTED_CONFIG });
    await expect(resolveLandingPath()).resolves.toBe("/mypermissions");
    session({ menu: [PERMS_ITEM] });
    await expect(resolveLandingPath()).resolves.toBe("/mypermissions");
    expect(mockedGet).not.toHaveBeenCalled();
  });
  it("defaultMenu no válido en el móvil → /punchinout (resolveMobilePath)", async () => {
    session({ defaultPath: "/roles", tasker: TASKER_DISCONNECTED_CONFIG });
    await expect(resolveLandingPath()).resolves.toBe("/punchinout");
  });
});
