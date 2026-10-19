/// <reference types="jest" />
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTaskerCompanyConfig, getTaskerUserClients } from "../../constants/taskerMock";
import {
  clearTaskerSession,
  loadAndPersistTaskerSession,
  restoreTaskerSession,
  TASKER_CLIENTS_STORAGE_KEY,
  TASKER_CONFIG_STORAGE_KEY,
} from "../taskerSession";

// AsyncStorage en memoria — el real necesita react-native.
jest.mock("@react-native-async-storage/async-storage", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      __mem: mem,
      getItem: jest.fn(async (key: string) => mem.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        mem.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        mem.delete(key);
      }),
    },
  };
});

const mem = (AsyncStorage as unknown as { __mem: Map<string, string> }).__mem;
const setItem = AsyncStorage.setItem as jest.Mock;

const fresh = () => ({ config: getTaskerCompanyConfig(), clients: getTaskerUserClients() });

beforeEach(() => {
  mem.clear();
  jest.clearAllMocks();
});

describe("claves", () => {
  it("taskerConfig y taskerClients", () => {
    expect(TASKER_CONFIG_STORAGE_KEY).toBe("taskerConfig");
    expect(TASKER_CLIENTS_STORAGE_KEY).toBe("taskerClients");
  });
});

describe("loadAndPersistTaskerSession (login / cambio de empresa)", () => {
  it("devuelve lo del mock y lo guarda en las dos claves", async () => {
    const session = await loadAndPersistTaskerSession();
    expect(session).toEqual(fresh());
    expect(JSON.parse(mem.get(TASKER_CONFIG_STORAGE_KEY)!)).toEqual(session.config);
    expect(JSON.parse(mem.get(TASKER_CLIENTS_STORAGE_KEY)!)).toEqual(session.clients);
  });
  it("reescribe lo que había (otra empresa)", async () => {
    mem.set(TASKER_CONFIG_STORAGE_KEY, JSON.stringify({ connected: false, appliesFault: false }));
    mem.set(TASKER_CLIENTS_STORAGE_KEY, "[]");
    await loadAndPersistTaskerSession();
    expect(JSON.parse(mem.get(TASKER_CONFIG_STORAGE_KEY)!)).toEqual(getTaskerCompanyConfig());
    expect(JSON.parse(mem.get(TASKER_CLIENTS_STORAGE_KEY)!)).toEqual(getTaskerUserClients());
  });
  it("si no se puede guardar, igual devuelve los datos", async () => {
    setItem.mockRejectedValueOnce(new Error("disco lleno"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(loadAndPersistTaskerSession()).resolves.toEqual(fresh());
    warn.mockRestore();
  });
});

describe("restoreTaskerSession (arranque en frío)", () => {
  it("válido → lo guardado, sin volver a escribir", async () => {
    const stored = {
      config: {
        connected: false,
        appliesFault: false,
        failureReportMenuLabel: "X",
        failureReportLabel: null,
        clientLabel: null,
      },
      clients: [],
    };
    mem.set(TASKER_CONFIG_STORAGE_KEY, JSON.stringify(stored.config));
    mem.set(TASKER_CLIENTS_STORAGE_KEY, JSON.stringify(stored.clients));
    await expect(restoreTaskerSession()).resolves.toEqual(stored);
    expect(setItem).not.toHaveBeenCalled();
  });
  it("ausente → se vuelve a cargar y se guarda", async () => {
    await expect(restoreTaskerSession()).resolves.toEqual(fresh());
    expect(mem.has(TASKER_CONFIG_STORAGE_KEY)).toBe(true);
    expect(mem.has(TASKER_CLIENTS_STORAGE_KEY)).toBe(true);
  });
  it("solo una de las dos claves → se recarga todo", async () => {
    mem.set(TASKER_CONFIG_STORAGE_KEY, JSON.stringify(getTaskerCompanyConfig()));
    await expect(restoreTaskerSession()).resolves.toEqual(fresh());
  });
  it("JSON corrupto → se ignora y se vuelve a cargar", async () => {
    mem.set(TASKER_CONFIG_STORAGE_KEY, "{connected:");
    mem.set(TASKER_CLIENTS_STORAGE_KEY, "[{");
    await expect(restoreTaskerSession()).resolves.toEqual(fresh());
    expect(JSON.parse(mem.get(TASKER_CONFIG_STORAGE_KEY)!)).toEqual(getTaskerCompanyConfig());
  });
  it("config guardada con los nombres viejos (serviceLabel / faultLabel) → se recarga y se reescribe", async () => {
    mem.set(
      TASKER_CONFIG_STORAGE_KEY,
      JSON.stringify({
        connected: true,
        appliesFault: true,
        serviceLabel: "Viejo",
        faultLabel: "Viejo",
        clientLabel: null,
      }),
    );
    mem.set(TASKER_CLIENTS_STORAGE_KEY, JSON.stringify(getTaskerUserClients()));
    await expect(restoreTaskerSession()).resolves.toEqual(fresh());
    const rewritten = JSON.parse(mem.get(TASKER_CONFIG_STORAGE_KEY)!);
    expect(rewritten).toEqual(getTaskerCompanyConfig());
    expect(rewritten).not.toHaveProperty("serviceLabel");
  });
  it("si la lectura falla → se vuelve a cargar", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("x"));
    await expect(restoreTaskerSession()).resolves.toEqual(fresh());
  });
});

describe("clearTaskerSession (cierre de sesión)", () => {
  it("borra las dos claves", async () => {
    await loadAndPersistTaskerSession();
    await clearTaskerSession();
    expect(mem.has(TASKER_CONFIG_STORAGE_KEY)).toBe(false);
    expect(mem.has(TASKER_CLIENTS_STORAGE_KEY)).toBe(false);
  });
  it("nunca lanza", async () => {
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error("x"));
    await expect(clearTaskerSession()).resolves.toBeUndefined();
  });
});
