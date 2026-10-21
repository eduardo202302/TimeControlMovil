/// <reference types="jest" />
import {
  chooseReportPosition,
  CURRENT_POSITION_WAIT_MS,
  formatCoordsForLog,
  getCurrentPositionWaitMs,
  getPermissionStep,
  getReadingAgeSeconds,
  isLastKnownFresh,
  REPORT_LAST_KNOWN_MAX_AGE_MS,
  REPORT_LOCATION_TIMEOUT_MS,
  requestReportLocation,
  watchFirstPosition,
  type TaskerLocationApi,
  type TaskerPositionReading,
} from "../taskerLocation";

const reading = (latitude: number, longitude: number, timestamp?: number): TaskerPositionReading => ({
  coords: { latitude, longitude, accuracy: 10 },
  timestamp,
});

const never = <T,>() => new Promise<T>(() => undefined);

/** Suscripción falsa: `emit` entrega una lectura; `removed` dice si se canceló. */
function fakeWatch() {
  const state = {
    removed: 0,
    emit: (_r: TaskerPositionReading) => undefined as void,
  };
  const watchPositionAsync = jest.fn(async (onReading: (r: TaskerPositionReading) => void) => {
    state.emit = onReading;
    return { remove: () => void (state.removed += 1) };
  });
  return { state, watchPositionAsync };
}

function fakeApi(over: Partial<Record<keyof TaskerLocationApi, jest.Mock>> = {}) {
  const watch = fakeWatch();
  const api = {
    getForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted", canAskAgain: true })),
    requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted", canAskAgain: true })),
    getLastKnownPositionAsync: jest.fn(async () => null),
    getCurrentPositionAsync: jest.fn(async () => reading(18.4706, -69.9389)),
    hasServicesEnabledAsync: jest.fn(async () => true),
    watchPositionAsync: watch.watchPositionAsync,
    ...over,
  } as unknown as TaskerLocationApi & Record<keyof TaskerLocationApi, jest.Mock>;
  return { api, watch: watch.state };
}

/** Tiempos cortos para correr con timers reales. */
const FAST = { timeoutMs: 120, currentWaitMs: 20 };

// ─── Reglas puras ───────────────────────────────────────────────────────────

describe("umbrales", () => {
  it("respaldo (última conocida) = 120 s o menos", () => {
    expect(REPORT_LAST_KNOWN_MAX_AGE_MS).toBe(120_000);
  });
  it("tope total 15 s; getCurrentPositionAsync sola, 5 s", () => {
    expect(REPORT_LOCATION_TIMEOUT_MS).toBe(15_000);
    expect(CURRENT_POSITION_WAIT_MS).toBe(5_000);
    expect(CURRENT_POSITION_WAIT_MS).toBeLessThan(REPORT_LOCATION_TIMEOUT_MS);
  });
});

describe("getReadingAgeSeconds", () => {
  it("segundos redondeados; nunca negativos; sin timestamp → null", () => {
    expect(getReadingAgeSeconds(1_000, 91_400)).toBe(90);
    expect(getReadingAgeSeconds(5_000, 1_000)).toBe(0);
    expect(getReadingAgeSeconds(undefined, 1_000)).toBeNull();
    expect(getReadingAgeSeconds(Number.NaN, 1_000)).toBeNull();
  });
});

describe("isLastKnownFresh", () => {
  const now = 1_000_000;
  it("hasta 120 s → sí; más → no", () => {
    expect(isLastKnownFresh(now - 120_000, now)).toBe(true);
    expect(isLastKnownFresh(now - 120_001, now)).toBe(false);
  });
  it("sin timestamp (edad desconocida) → no", () => {
    expect(isLastKnownFresh(undefined, now)).toBe(false);
  });
});

describe("chooseReportPosition (fuente de la posición)", () => {
  const now = 1_000_000;
  it("nueva → se usa la nueva, aunque haya respaldo reciente", () => {
    expect(chooseReportPosition(reading(1, 2, now - 2_000), reading(3, 4, now - 1_000), now)).toEqual({
      source: "nueva",
      reading: reading(1, 2, now - 2_000),
      ageSeconds: 2,
    });
  });
  it("sin nueva y respaldo de 120 s o menos → respaldo, con su edad", () => {
    expect(chooseReportPosition(null, reading(3, 4, now - 120_000), now)).toMatchObject({
      source: "respaldo",
      ageSeconds: 120,
    });
    // Entre 30 y 120 s (antes se rechazaba) → también sirve.
    expect(chooseReportPosition(null, reading(3, 4, now - 90_000), now)).toMatchObject({
      source: "respaldo",
      ageSeconds: 90,
    });
  });
  it("sin nueva y respaldo viejo (o sin timestamp) → null = error de ubicación", () => {
    expect(chooseReportPosition(null, reading(3, 4, now - 120_001), now)).toBeNull();
    expect(chooseReportPosition(null, reading(3, 4), now)).toBeNull();
  });
  it("sin nueva ni respaldo → null", () => {
    expect(chooseReportPosition(null, null, now)).toBeNull();
  });
  it("nueva sin timestamp → edad desconocida (null)", () => {
    expect(chooseReportPosition(reading(1, 2), null, now)?.ageSeconds).toBeNull();
  });
});

describe("formatCoordsForLog", () => {
  it("2 decimales, nunca la coordenada completa", () => {
    expect(formatCoordsForLog({ latitude: 18.470612, longitude: -69.938934 })).toBe("18.47, -69.94");
  });
});

describe("getPermissionStep", () => {
  it("permiso no concedido → failed con su canAskAgain", () => {
    expect(getPermissionStep({ status: "denied", canAskAgain: false }, null)).toEqual({
      status: "failed",
      canAskAgain: false,
    });
    expect(getPermissionStep({ status: "undetermined", canAskAgain: true }, true)).toEqual({
      status: "failed",
      canAskAgain: true,
    });
  });
  it("concedido con la ubicación apagada → failed", () => {
    expect(getPermissionStep({ status: "granted", canAskAgain: true }, false)).toEqual({
      status: "failed",
      canAskAgain: true,
    });
  });
  it("concedido y encendida (o todavía sin saber) → continue", () => {
    expect(getPermissionStep({ status: "granted", canAskAgain: true }, true)).toBe("continue");
    expect(getPermissionStep({ status: "granted", canAskAgain: true }, null)).toBe("continue");
  });
});

describe("getCurrentPositionWaitMs", () => {
  it("la espera propia, sin pasarse de lo que queda", () => {
    expect(getCurrentPositionWaitMs(15_000, 5_000)).toBe(5_000);
    expect(getCurrentPositionWaitMs(3_000, 5_000)).toBe(3_000);
    expect(getCurrentPositionWaitMs(-10, 5_000)).toBe(0);
  });
});

// ─── watchFirstPosition ─────────────────────────────────────────────────────

describe("watchFirstPosition", () => {
  it("primera posición → se cancela la suscripción", async () => {
    const { state, watchPositionAsync } = fakeWatch();
    const promise = watchFirstPosition({ watchPositionAsync }, 1_000);
    await Promise.resolve();
    await Promise.resolve();
    state.emit(reading(1, 2));
    await expect(promise).resolves.toMatchObject({ kind: "position" });
    expect(state.removed).toBe(1);
  });
  it("timeout → se cancela la suscripción", async () => {
    const { state, watchPositionAsync } = fakeWatch();
    await expect(watchFirstPosition({ watchPositionAsync }, 10)).resolves.toEqual({ kind: "timeout" });
    expect(state.removed).toBe(1);
  });
  it("error al suscribirse → error", async () => {
    const watchPositionAsync = jest.fn(async () => {
      throw new Error("no provider");
    });
    await expect(watchFirstPosition({ watchPositionAsync }, 1_000)).resolves.toMatchObject({
      kind: "error",
    });
  });
  it("cancelada antes de que exista la suscripción → se quita apenas llega", async () => {
    let resolveSub: (s: { remove(): void }) => void = () => undefined;
    const remove = jest.fn();
    const watchPositionAsync = jest.fn(
      () => new Promise<{ remove(): void }>((resolve) => (resolveSub = resolve)),
    );
    const controller = new AbortController();
    const promise = watchFirstPosition({ watchPositionAsync }, 1_000, controller.signal);
    controller.abort();
    await expect(promise).resolves.toEqual({ kind: "aborted" });
    resolveSub({ remove });
    await Promise.resolve();
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it("señal ya cancelada → ni se suscribe", async () => {
    const { watchPositionAsync } = fakeWatch();
    const controller = new AbortController();
    controller.abort();
    await expect(watchFirstPosition({ watchPositionAsync }, 1_000, controller.signal)).resolves.toEqual({
      kind: "aborted",
    });
    expect(watchPositionAsync).not.toHaveBeenCalled();
  });
});

// ─── requestReportLocation ──────────────────────────────────────────────────

describe("requestReportLocation — permiso y ubicación", () => {
  it("sin permiso todavía → lo pide; si lo concede, sigue", async () => {
    const permission = jest
      .fn()
      .mockResolvedValueOnce({ status: "undetermined", canAskAgain: true })
      .mockResolvedValue({ status: "granted", canAskAgain: true });
    const { api } = fakeApi({ getForegroundPermissionsAsync: permission });
    await expect(requestReportLocation(api, { ...FAST, log: () => undefined })).resolves.toMatchObject({
      status: "ok",
    });
    expect(api.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });
  it("negado de forma permanente → failed con canAskAgain false, sin diálogo", async () => {
    const { api } = fakeApi({
      getForegroundPermissionsAsync: jest.fn(async () => ({ status: "denied", canAskAgain: false })),
    });
    await expect(requestReportLocation(api, { log: () => undefined })).resolves.toEqual({
      status: "failed",
      canAskAgain: false,
    });
    expect(api.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it("ubicación apagada → failed, sin pedir posición", async () => {
    const { api } = fakeApi({ hasServicesEnabledAsync: jest.fn(async () => false) });
    await expect(requestReportLocation(api, { log: () => undefined })).resolves.toEqual({
      status: "failed",
      canAskAgain: true,
    });
    expect(api.getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(api.getCurrentPositionAsync).not.toHaveBeenCalled();
  });
});

describe("requestReportLocation — posición nueva primero", () => {
  it("siempre pide una nueva; la última conocida ni se consulta si llega", async () => {
    const now = 1_000_000;
    const { api } = fakeApi({
      getLastKnownPositionAsync: jest.fn(async () => reading(1, 2, now - 1_000)),
      getCurrentPositionAsync: jest.fn(async () => reading(18.4706, -69.9389, now)),
    });
    await expect(
      requestReportLocation(api, { ...FAST, now: () => now, log: () => undefined }),
    ).resolves.toEqual({ status: "ok", coords: { latitude: 18.4706, longitude: -69.9389 } });
    expect(api.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(api.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });
});

describe("requestReportLocation — respaldo con la última conocida", () => {
  const failing = () => ({
    getCurrentPositionAsync: jest.fn(async () => {
      throw new Error("Location request failed");
    }),
  });
  /** La suscripción también falla: no hay posición nueva. */
  const noFresh = (over: Partial<Record<keyof TaskerLocationApi, jest.Mock>>) => {
    const { api } = fakeApi({ ...failing(), ...over });
    api.watchPositionAsync.mockRejectedValue(new Error("no provider"));
    return api;
  };

  it("la nueva falla y la última conocida es de 120 s o menos → se usa", async () => {
    const now = 1_000_000;
    const api = noFresh({ getLastKnownPositionAsync: jest.fn(async () => reading(1, 2, now - 90_000)) });
    await expect(
      requestReportLocation(api, { ...FAST, now: () => now, log: () => undefined }),
    ).resolves.toEqual({ status: "ok", coords: { latitude: 1, longitude: 2 } });
    expect(api.getLastKnownPositionAsync).toHaveBeenCalledWith(
      expect.objectContaining({ maxAge: REPORT_LAST_KNOWN_MAX_AGE_MS }),
    );
  });
  it("la nueva falla y la última conocida es más vieja → failed", async () => {
    const now = 1_000_000;
    const api = noFresh({ getLastKnownPositionAsync: jest.fn(async () => reading(1, 2, now - 121_000)) });
    await expect(
      requestReportLocation(api, { ...FAST, now: () => now, log: () => undefined }),
    ).resolves.toEqual({ status: "failed", canAskAgain: true });
  });
  it("la nueva falla y la última conocida falla o es null → failed", async () => {
    const throwing = noFresh({
      getLastKnownPositionAsync: jest.fn(async () => {
        throw new Error("x");
      }),
    });
    await expect(requestReportLocation(throwing, { ...FAST, log: () => undefined })).resolves.toEqual({
      status: "failed",
      canAskAgain: true,
    });
    await expect(requestReportLocation(noFresh({}), { ...FAST, log: () => undefined })).resolves.toEqual({
      status: "failed",
      canAskAgain: true,
    });
  });
});

describe("requestReportLocation — posición nueva y respaldo", () => {
  it("getCurrentPositionAsync responde → ok, sin respaldo", async () => {
    const { api } = fakeApi();
    await expect(requestReportLocation(api, { ...FAST, log: () => undefined })).resolves.toMatchObject({
      status: "ok",
    });
    expect(api.watchPositionAsync).not.toHaveBeenCalled();
  });

  it("no responde → respaldo con watchPositionAsync; la suscripción se cancela", async () => {
    const { api, watch } = fakeApi({ getCurrentPositionAsync: jest.fn(() => never()) });
    api.watchPositionAsync.mockImplementation(async (onReading: (r: TaskerPositionReading) => void) => {
      setTimeout(() => onReading(reading(5, 6)), 5);
      return { remove: () => void (watch.removed += 1) };
    });
    await expect(requestReportLocation(api, { ...FAST, log: () => undefined })).resolves.toEqual({
      status: "ok",
      coords: { latitude: 5, longitude: 6 },
    });
    expect(watch.removed).toBe(1);
  });

  it("da error → respaldo con watchPositionAsync", async () => {
    const { api, watch } = fakeApi({
      getCurrentPositionAsync: jest.fn(async () => {
        throw new Error("Location request failed");
      }),
    });
    api.watchPositionAsync.mockImplementation(async (onReading: (r: TaskerPositionReading) => void) => {
      setTimeout(() => onReading(reading(5, 6)), 5);
      return { remove: () => void (watch.removed += 1) };
    });
    await expect(requestReportLocation(api, { ...FAST, log: () => undefined })).resolves.toMatchObject({
      status: "ok",
    });
    expect(watch.removed).toBe(1);
  });

  it("ninguna responde → failed al tope total; la suscripción se cancela", async () => {
    const { api, watch } = fakeApi({ getCurrentPositionAsync: jest.fn(() => never()) });
    const started = Date.now();
    await expect(requestReportLocation(api, { ...FAST, log: () => undefined })).resolves.toEqual({
      status: "failed",
      canAskAgain: true,
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(FAST.timeoutMs - 15);
    expect(watch.removed).toBe(1);
  });

  it("getCurrentPositionAsync responde tarde, durante el respaldo → gana y se cancela la suscripción", async () => {
    const late = jest.fn(
      () => new Promise<TaskerPositionReading>((resolve) => setTimeout(() => resolve(reading(7, 8)), 40)),
    );
    const { api, watch } = fakeApi({ getCurrentPositionAsync: late });
    await expect(requestReportLocation(api, { ...FAST, log: () => undefined })).resolves.toEqual({
      status: "ok",
      coords: { latitude: 7, longitude: 8 },
    });
    expect(api.watchPositionAsync).toHaveBeenCalledTimes(1);
    expect(watch.removed).toBe(1);
  });

  it("el respaldo falla pero getCurrentPositionAsync sigue viva → se espera a esta", async () => {
    const late = jest.fn(
      () => new Promise<TaskerPositionReading>((resolve) => setTimeout(() => resolve(reading(7, 8)), 40)),
    );
    const { api } = fakeApi({ getCurrentPositionAsync: late });
    api.watchPositionAsync.mockRejectedValue(new Error("no provider"));
    await expect(requestReportLocation(api, { ...FAST, log: () => undefined })).resolves.toMatchObject({
      status: "ok",
    });
  });

  it("al desmontar (signal) durante el respaldo → failed y la suscripción se cancela", async () => {
    const { api, watch } = fakeApi({ getCurrentPositionAsync: jest.fn(() => never()) });
    const controller = new AbortController();
    const promise = requestReportLocation(api, {
      timeoutMs: 5_000,
      currentWaitMs: 10,
      signal: controller.signal,
      log: () => undefined,
    });
    setTimeout(() => controller.abort(), 30);
    await expect(promise).resolves.toEqual({ status: "failed", canAskAgain: true });
    expect(watch.removed).toBe(1);
  });

  it("al desmontar mientras espera a getCurrentPositionAsync → failed sin respaldo", async () => {
    const { api } = fakeApi({ getCurrentPositionAsync: jest.fn(() => never()) });
    const controller = new AbortController();
    const promise = requestReportLocation(api, {
      timeoutMs: 5_000,
      currentWaitMs: 1_000,
      signal: controller.signal,
      log: () => undefined,
    });
    setTimeout(() => controller.abort(), 10);
    await expect(promise).resolves.toEqual({ status: "failed", canAskAgain: true });
    expect(api.watchPositionAsync).not.toHaveBeenCalled();
  });
});

describe("requestReportLocation — logs", () => {
  it("dicen el paso y nunca imprimen coordenadas completas", async () => {
    const lines: string[] = [];
    const now = 1_000_000;
    const { api } = fakeApi({
      getLastKnownPositionAsync: jest.fn(async () => reading(18.470612, -69.938934, now - 600_000)),
      getCurrentPositionAsync: jest.fn(() => never()),
    });
    await requestReportLocation(api, { ...FAST, now: () => now, log: (l) => lines.push(l) });
    const text = lines.join("\n");
    expect(text).toContain("permiso: granted");
    expect(text).toContain("hasServicesEnabledAsync: true");
    expect(text).toContain("getCurrentPositionAsync: sin respuesta");
    expect(text).toContain("watchPositionAsync: respaldo");
    expect(text).toContain("tope de");
    expect(text).toContain("antigüedad 600 s");
    expect(text).toContain("sin posición nueva ni respaldo");
    expect(text).not.toMatch(/\d+\.\d{3,}/);
  });
  it("dicen la fuente usada y su edad en segundos", async () => {
    const now = 1_000_000;
    const fresh: string[] = [];
    const { api } = fakeApi({ getCurrentPositionAsync: jest.fn(async () => reading(1, 2, now - 3_000)) });
    await requestReportLocation(api, { ...FAST, now: () => now, log: (l) => fresh.push(l) });
    expect(fresh).toContain("fuente: nueva, edad 3 s");

    const backup: string[] = [];
    const { api: api2 } = fakeApi({
      getCurrentPositionAsync: jest.fn(async () => {
        throw new Error("x");
      }),
      getLastKnownPositionAsync: jest.fn(async () => reading(1, 2, now - 12_000)),
    });
    api2.watchPositionAsync.mockRejectedValue(new Error("no provider"));
    await requestReportLocation(api2, { ...FAST, now: () => now, log: (l) => backup.push(l) });
    expect(backup).toContain("fuente: respaldo, edad 12 s");
  });
  it("sin __DEV__ (tests, producción) no escribe en la consola", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const { api } = fakeApi();
    await requestReportLocation(api, FAST);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
