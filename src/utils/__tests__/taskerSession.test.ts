/// <reference types="jest" />
import AsyncStorage from "@react-native-async-storage/async-storage";
import { mapTaskerSession, TASKER_DISCONNECTED_CONFIG } from "../taskerApi";
import {
  clearTaskerSession,
  persistTaskerSession,
  removeLegacyTaskerStorage,
  restoreTaskerSession,
  TASKER_CLIENTS_STORAGE_KEY,
  TASKER_CONFIG_STORAGE_KEY,
  TASKER_LEGACY_STORAGE_KEYS,
  TASKER_STORAGE_VERSION,
} from "../taskerSession";
import { clearSession } from "../session";

// session.ts importa expo-router y el store (que importa ../storage): sin RN en node.
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("../storage", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

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

/** `data` de chooseschool con Tasker conectado (y campos que NO se guardan). */
const CHOOSE_SCHOOL_DATA = {
  token: "scoped.token.secret",
  school: { id: 1, settings: { taskerApiKey: "nunca-se-guarda" } },
  taskrCompany: {
    id: 9,
    name: "Empresa Taskr",
    channel: "canal-secreto",
    settings: {
      isFailureReport: true,
      failureReportMenuLabel: "Reportar Avería",
      failureReportLabel: null,
      clientLabel: "Sucursal",
      otherSetting: "x",
    },
  },
  taskrClients: [
    {
      id: 301,
      name: "Clínica Las Marías",
      token: "token-del-cliente",
      faceClassUsers: [{ id: 1, faceClassId: 55 }],
      defaultAddress: {
        title: "Sede Naco",
        province: "D.N.",
        city: "Santo Domingo",
        street: "Av. Tiradentes",
        streetNumber: "25",
        latitude: 18.4775,
        longitude: -69.9273,
      },
      addresses: [],
    },
  ],
};

const DISCONNECTED = { config: TASKER_DISCONNECTED_CONFIG, clients: [] };
const fresh = () => mapTaskerSession(CHOOSE_SCHOOL_DATA);

beforeEach(() => {
  mem.clear();
  jest.clearAllMocks();
});

describe("claves", () => {
  it("con versión: taskerConfig:v3 y taskerClients:v3", () => {
    expect(TASKER_STORAGE_VERSION).toBe("v3");
    expect(TASKER_CONFIG_STORAGE_KEY).toBe("taskerConfig:v3");
    expect(TASKER_CLIENTS_STORAGE_KEY).toBe("taskerClients:v3");
  });
  it("las viejas: sin versión y v2 (datos de ejemplo)", () => {
    expect(TASKER_LEGACY_STORAGE_KEYS).toEqual([
      "taskerConfig",
      "taskerClients",
      "taskerConfig:v2",
      "taskerClients:v2",
    ]);
  });
});

describe("persistTaskerSession (login / cambio de empresa)", () => {
  it("mapea chooseschool y lo guarda en las dos claves", async () => {
    const session = await persistTaskerSession(CHOOSE_SCHOOL_DATA);
    expect(session).toEqual(fresh());
    expect(session.config.connected).toBe(true);
    expect(session.clients.map((c) => c.id)).toEqual([301]);
    expect(JSON.parse(mem.get(TASKER_CONFIG_STORAGE_KEY)!)).toEqual(session.config);
    expect(JSON.parse(mem.get(TASKER_CLIENTS_STORAGE_KEY)!)).toEqual(session.clients);
  });
  it("en el teléfono no queda nada fuera de lo mapeado (ni tokens, ni channel, ni faceClassUsers)", async () => {
    await persistTaskerSession(CHOOSE_SCHOOL_DATA);
    const stored = [...mem.values()].join("\n");
    for (const secret of ["token", "secret", "nunca-se-guarda", "canal", "channel", "faceClassUsers", "otherSetting"]) {
      expect(stored).not.toContain(secret);
    }
  });
  it("reescribe lo que había (otra empresa)", async () => {
    mem.set(TASKER_CONFIG_STORAGE_KEY, JSON.stringify({ connected: false, appliesFault: false }));
    mem.set(TASKER_CLIENTS_STORAGE_KEY, "[]");
    await persistTaskerSession(CHOOSE_SCHOOL_DATA);
    expect(JSON.parse(mem.get(TASKER_CONFIG_STORAGE_KEY)!)).toEqual(fresh().config);
    expect(JSON.parse(mem.get(TASKER_CLIENTS_STORAGE_KEY)!)).toEqual(fresh().clients);
  });
  it("escuela no conectada (taskrCompany null) → no conectada y sin clientes, y se guarda así", async () => {
    const session = await persistTaskerSession({ ...CHOOSE_SCHOOL_DATA, taskrCompany: null });
    expect(session).toEqual(DISCONNECTED);
    expect(JSON.parse(mem.get(TASKER_CONFIG_STORAGE_KEY)!)).toEqual(TASKER_DISCONNECTED_CONFIG);
    expect(JSON.parse(mem.get(TASKER_CLIENTS_STORAGE_KEY)!)).toEqual([]);
  });
  it("sin data de chooseschool (falló) → no conectada", async () => {
    await expect(persistTaskerSession(undefined)).resolves.toEqual(DISCONNECTED);
  });
  it("si no se puede guardar, igual devuelve los datos", async () => {
    setItem.mockRejectedValueOnce(new Error("disco lleno"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(persistTaskerSession(CHOOSE_SCHOOL_DATA)).resolves.toEqual(fresh());
    warn.mockRestore();
  });
});

describe("restoreTaskerSession (arranque en frío)", () => {
  it("válido → lo guardado, sin volver a escribir", async () => {
    await persistTaskerSession(CHOOSE_SCHOOL_DATA);
    setItem.mockClear();
    await expect(restoreTaskerSession()).resolves.toEqual(fresh());
    expect(setItem).not.toHaveBeenCalled();
  });
  it("guardado antes de la fusión de duplicados → se fusiona al leer", async () => {
    const point = { latitude: 18.4775, longitude: -69.9273 };
    const stored = [
      {
        id: 1,
        name: "X",
        defaultAddress: { id: 1, isDefault: true, title: "Sede", street: "", ...point },
        addresses: [
          { id: 1, isDefault: true, title: "Sede", street: "", ...point },
          { id: 2, isDefault: false, title: "Copia", street: "Av. Tiradentes", ...point },
        ],
      },
    ];
    mem.set(TASKER_CONFIG_STORAGE_KEY, JSON.stringify(fresh().config));
    mem.set(TASKER_CLIENTS_STORAGE_KEY, JSON.stringify(stored));
    const { clients } = await restoreTaskerSession();
    expect(clients[0].addresses).toHaveLength(1);
    expect(clients[0].addresses[0]).toMatchObject({ id: 1, title: "Sede", street: "Av. Tiradentes" });
  });
  it("ausente → no conectada, sin escribir nada (solo chooseschool trae los datos)", async () => {
    await expect(restoreTaskerSession()).resolves.toEqual(DISCONNECTED);
    expect(setItem).not.toHaveBeenCalled();
    expect(mem.size).toBe(0);
  });
  it("solo una de las dos claves → no conectada", async () => {
    mem.set(TASKER_CONFIG_STORAGE_KEY, JSON.stringify(fresh().config));
    await expect(restoreTaskerSession()).resolves.toEqual(DISCONNECTED);
  });
  it("JSON corrupto → no conectada", async () => {
    mem.set(TASKER_CONFIG_STORAGE_KEY, "{connected:");
    mem.set(TASKER_CLIENTS_STORAGE_KEY, "[{");
    await expect(restoreTaskerSession()).resolves.toEqual(DISCONNECTED);
  });
  it("config guardada con los nombres viejos (serviceLabel / faultLabel) → no conectada", async () => {
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
    mem.set(TASKER_CLIENTS_STORAGE_KEY, JSON.stringify(fresh().clients));
    await expect(restoreTaskerSession()).resolves.toEqual(DISCONNECTED);
  });
  it("si la lectura falla → no conectada", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("x"));
    await expect(restoreTaskerSession()).resolves.toEqual(DISCONNECTED);
  });
});

describe("claves de versiones anteriores", () => {
  const seedLegacy = () => {
    // Forma válida a propósito: si se leyeran, se usarían.
    const config = JSON.stringify({ ...fresh().config });
    const clients = JSON.stringify(fresh().clients);
    for (const suffix of ["", ":v2"]) {
      mem.set(`taskerConfig${suffix}`, config);
      mem.set(`taskerClients${suffix}`, clients);
    }
  };

  it("la lectura las ignora: sin claves v3 → no conectada", async () => {
    seedLegacy();
    await expect(restoreTaskerSession()).resolves.toEqual(DISCONNECTED);
    for (const key of TASKER_LEGACY_STORAGE_KEYS) {
      expect(AsyncStorage.getItem).not.toHaveBeenCalledWith(key);
    }
  });
  it("guardar escribe solo las v3", async () => {
    await persistTaskerSession(CHOOSE_SCHOOL_DATA);
    expect([...mem.keys()].sort()).toEqual([TASKER_CLIENTS_STORAGE_KEY, TASKER_CONFIG_STORAGE_KEY].sort());
  });
  it("removeLegacyTaskerStorage (arranque) borra las sin versión y las v2, y no toca las v3", async () => {
    seedLegacy();
    await persistTaskerSession(CHOOSE_SCHOOL_DATA);
    await removeLegacyTaskerStorage();
    for (const key of TASKER_LEGACY_STORAGE_KEYS) expect(mem.has(key)).toBe(false);
    expect(mem.has(TASKER_CONFIG_STORAGE_KEY)).toBe(true);
    expect(mem.has(TASKER_CLIENTS_STORAGE_KEY)).toBe(true);
  });
  it("removeLegacyTaskerStorage sin claves viejas o con error → no lanza", async () => {
    await expect(removeLegacyTaskerStorage()).resolves.toBeUndefined();
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error("x"));
    await expect(removeLegacyTaskerStorage()).resolves.toBeUndefined();
  });
});

describe("clearSession (cierre de sesión de la app)", () => {
  it("borra las dos claves v3 de Tasker", async () => {
    await persistTaskerSession(CHOOSE_SCHOOL_DATA);
    await clearSession();
    expect(mem.has(TASKER_CONFIG_STORAGE_KEY)).toBe(false);
    expect(mem.has(TASKER_CLIENTS_STORAGE_KEY)).toBe(false);
  });
});

describe("clearTaskerSession (cierre de sesión)", () => {
  it("borra las dos claves", async () => {
    await persistTaskerSession(CHOOSE_SCHOOL_DATA);
    await clearTaskerSession();
    expect(mem.has(TASKER_CONFIG_STORAGE_KEY)).toBe(false);
    expect(mem.has(TASKER_CLIENTS_STORAGE_KEY)).toBe(false);
  });
  it("nunca lanza", async () => {
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error("x"));
    await expect(clearTaskerSession()).resolves.toBeUndefined();
  });
});
