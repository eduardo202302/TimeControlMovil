/// <reference types="jest" />
import {
  BEST_EFFORT_TIMEOUT_MS,
  getBestEffortCoordinates,
  isAccuracySufficient,
  isApproximateLocationPermission,
  LAST_KNOWN_MAX_AGE_MS,
  LAST_KNOWN_REQUIRED_ACCURACY_M,
  pickMoreAccurate,
  promptLocationPermission,
  readWithAccuracyRetry,
  resolveLocationCardStatus,
  shouldRequestLocationPermission,
  startOptionalPunchCoordinates,
  toAccurateCoordinates,
  type AccurateCoordinates,
  type LocationApi,
} from "../punchLocation";

const GRANTED = { status: "granted", canAskAgain: true };
const DENIED_CAN_ASK = { status: "denied", canAskAgain: true };
const DENIED_FINAL = { status: "denied", canAskAgain: false };
const UNDETERMINED = { status: "undetermined", canAskAgain: true };

const reading = (latitude: number, longitude: number) => ({
  coords: { latitude, longitude },
});

function makeApi(overrides: Partial<LocationApi> = {}) {
  const api = {
    getForegroundPermissionsAsync: jest.fn(async () => GRANTED),
    requestForegroundPermissionsAsync: jest.fn(async () => GRANTED),
    getLastKnownPositionAsync: jest.fn(async () => null),
    getCurrentPositionAsync: jest.fn(async () => reading(18.5, -69.9)),
    ...overrides,
  };
  return api as typeof api & jest.Mocked<LocationApi>;
}

describe("shouldRequestLocationPermission", () => {
  it("granted → no pide", () => {
    expect(shouldRequestLocationPermission(GRANTED)).toBe(false);
  });

  it("denied con canAskAgain → pide", () => {
    expect(shouldRequestLocationPermission(DENIED_CAN_ASK)).toBe(true);
  });

  it("undetermined (primer arranque) → pide", () => {
    expect(shouldRequestLocationPermission(UNDETERMINED)).toBe(true);
  });

  it("denied sin canAskAgain → no pide", () => {
    expect(shouldRequestLocationPermission(DENIED_FINAL)).toBe(false);
  });
});

describe("promptLocationPermission", () => {
  it("granted → no muestra el diálogo", async () => {
    const api = makeApi();
    await promptLocationPermission(api);
    expect(api.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it("denied + canAskAgain → muestra el diálogo", async () => {
    const api = makeApi({
      getForegroundPermissionsAsync: jest.fn(async () => DENIED_CAN_ASK),
    });
    await promptLocationPermission(api);
    expect(api.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("denied sin canAskAgain → no hace nada", async () => {
    const api = makeApi({
      getForegroundPermissionsAsync: jest.fn(async () => DENIED_FINAL),
    });
    await promptLocationPermission(api);
    expect(api.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it("layout y ponchador a la vez → un solo diálogo", async () => {
    const api = makeApi({
      getForegroundPermissionsAsync: jest.fn(async () => UNDETERMINED),
    });
    await Promise.all([
      promptLocationPermission(api),
      promptLocationPermission(api),
    ]);
    expect(api.getForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(api.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("terminada una petición, la siguiente entrada vuelve a evaluar", async () => {
    const api = makeApi({
      getForegroundPermissionsAsync: jest.fn(async () => DENIED_CAN_ASK),
    });
    await promptLocationPermission(api);
    await promptLocationPermission(api);
    expect(api.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
  });

  it("si expo falla, no lanza", async () => {
    const api = makeApi({
      getForegroundPermissionsAsync: jest.fn(async () => {
        throw new Error("boom");
      }),
    });
    await expect(promptLocationPermission(api)).resolves.toBeUndefined();
  });
});

describe("getBestEffortCoordinates", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("permiso negado → null, sin pedirlo ni tocar el GPS", async () => {
    const api = makeApi({
      getForegroundPermissionsAsync: jest.fn(async () => DENIED_CAN_ASK),
    });
    await expect(getBestEffortCoordinates(api)).resolves.toBeNull();
    expect(api.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(api.getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(api.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it("última posición reciente → la usa sin pedir una nueva", async () => {
    const api = makeApi({
      getLastKnownPositionAsync: jest.fn(async () => reading(18.47, -69.93)),
    });
    await expect(getBestEffortCoordinates(api)).resolves.toEqual({
      latitude: 18.47,
      longitude: -69.93,
    });
    expect(api.getLastKnownPositionAsync).toHaveBeenCalledWith({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_M,
    });
    expect(api.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it("sin última posición → usa la posición nueva", async () => {
    const api = makeApi();
    await expect(getBestEffortCoordinates(api)).resolves.toEqual({
      latitude: 18.5,
      longitude: -69.9,
    });
  });

  it("si la última posición falla, intenta una nueva", async () => {
    const api = makeApi({
      getLastKnownPositionAsync: jest.fn(async () => {
        throw new Error("sin caché");
      }),
    });
    await expect(getBestEffortCoordinates(api)).resolves.toEqual({
      latitude: 18.5,
      longitude: -69.9,
    });
  });

  it("timeout → null", async () => {
    jest.useFakeTimers();
    const api = makeApi({
      getCurrentPositionAsync: jest.fn(() => new Promise<never>(() => {})),
    });
    const result = getBestEffortCoordinates(api);
    await jest.advanceTimersByTimeAsync(BEST_EFFORT_TIMEOUT_MS);
    await expect(result).resolves.toBeNull();
  });

  it("error del GPS → null", async () => {
    const api = makeApi({
      getCurrentPositionAsync: jest.fn(async () => {
        throw new Error("GPS apagado");
      }),
    });
    await expect(getBestEffortCoordinates(api)).resolves.toBeNull();
  });
});

describe("startOptionalPunchCoordinates", () => {
  it("con validación activa → no arranca el mejor esfuerzo", () => {
    const fetchCoordinates = jest.fn(async () => null);
    expect(startOptionalPunchCoordinates(true, fetchCoordinates)).toBeNull();
    expect(fetchCoordinates).not.toHaveBeenCalled();
  });

  it("sin validación → lo arranca de inmediato y devuelve sus coordenadas", async () => {
    const coords = { latitude: 18.47, longitude: -69.93 };
    const fetchCoordinates = jest.fn(async () => coords);
    const promise = startOptionalPunchCoordinates(false, fetchCoordinates);
    expect(fetchCoordinates).toHaveBeenCalledTimes(1);
    await expect(promise).resolves.toEqual(coords);
  });

  it("sin validación y sin permiso → null (el ponche sale sin coordenadas)", async () => {
    const promise = startOptionalPunchCoordinates(false, async () => null);
    await expect(promise).resolves.toBeNull();
  });
});

// ─── Precisión ────────────────────────────────────────────────────────────────

const fix = (accuracy: number | null): AccurateCoordinates => ({
  latitude: 18.47,
  longitude: -69.93,
  accuracy,
});

describe("isAccuracySufficient", () => {
  it("≤ 100 m → suficiente", () => {
    expect(isAccuracySufficient(5)).toBe(true);
    expect(isAccuracySufficient(LAST_KNOWN_REQUIRED_ACCURACY_M)).toBe(true);
  });

  it("> 100 m → imprecisa", () => {
    expect(isAccuracySufficient(100.5)).toBe(false);
    expect(isAccuracySufficient(2_500)).toBe(false);
  });

  it("sin dato de precisión → se trata como suficiente (como antes de revisarla)", () => {
    expect(isAccuracySufficient(null)).toBe(true);
    expect(isAccuracySufficient(undefined)).toBe(true);
    expect(isAccuracySufficient(NaN)).toBe(true);
  });
});

describe("pickMoreAccurate", () => {
  it("gana la de menor accuracy, en cualquier orden", () => {
    expect(pickMoreAccurate(fix(800), fix(20))).toEqual(fix(20));
    expect(pickMoreAccurate(fix(20), fix(800))).toEqual(fix(20));
  });

  it("empate → la primera", () => {
    const a = fix(50);
    expect(pickMoreAccurate(a, fix(50))).toBe(a);
  });

  it("una lectura sin precisión pierde frente a una con precisión", () => {
    expect(pickMoreAccurate(fix(null), fix(900))).toEqual(fix(900));
  });

  it("si falta una, queda la otra", () => {
    expect(pickMoreAccurate(fix(300), null)).toEqual(fix(300));
    expect(pickMoreAccurate(null, fix(300))).toEqual(fix(300));
    expect(pickMoreAccurate(null, null)).toBeNull();
  });
});

describe("isApproximateLocationPermission", () => {
  it('Android "coarse" (Aproximada) → true', () => {
    expect(
      isApproximateLocationPermission({ android: { accuracy: "coarse" } }),
    ).toBe(true);
  });

  it('Android "fine" (Precisa) → false', () => {
    expect(
      isApproximateLocationPermission({ android: { accuracy: "fine" } }),
    ).toBe(false);
  });

  it("iOS (sin campo android) → false", () => {
    expect(isApproximateLocationPermission({})).toBe(false);
  });
});

describe("toAccurateCoordinates", () => {
  it("conserva la precisión; sin ella → null", () => {
    expect(
      toAccurateCoordinates({
        coords: { latitude: 1, longitude: 2, accuracy: 12 },
      }),
    ).toEqual({ latitude: 1, longitude: 2, accuracy: 12 });
    expect(toAccurateCoordinates(reading(1, 2))).toEqual({
      latitude: 1,
      longitude: 2,
      accuracy: null,
    });
  });
});

describe("readWithAccuracyRetry", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("primera lectura precisa → no reintenta", async () => {
    const retry = jest.fn(async () => fix(5));
    await expect(
      readWithAccuracyRetry(async () => fix(30), retry, 10_000),
    ).resolves.toEqual(fix(30));
    expect(retry).not.toHaveBeenCalled();
  });

  it("imprecisa → reintenta y se queda con la más precisa", async () => {
    await expect(
      readWithAccuracyRetry(
        async () => fix(1_500),
        async () => fix(12),
        10_000,
      ),
    ).resolves.toEqual(fix(12));
  });

  it("si el reintento sale peor, queda la primera", async () => {
    await expect(
      readWithAccuracyRetry(
        async () => fix(300),
        async () => fix(900),
        10_000,
      ),
    ).resolves.toEqual(fix(300));
  });

  it("si el reintento falla, queda la primera (imprecisa, no se bloquea)", async () => {
    await expect(
      readWithAccuracyRetry(
        async () => fix(300),
        async () => {
          throw new Error("GPS");
        },
        10_000,
      ),
    ).resolves.toEqual(fix(300));
  });

  it("el reintento usa solo el tiempo que queda del mismo tope", async () => {
    jest.useFakeTimers();
    const result = readWithAccuracyRetry(
      () =>
        new Promise<AccurateCoordinates>((resolve) =>
          setTimeout(() => resolve(fix(400)), 7_000),
        ),
      () => new Promise<never>(() => {}),
      10_000,
    );
    await jest.advanceTimersByTimeAsync(7_000);
    await jest.advanceTimersByTimeAsync(3_000);
    await expect(result).resolves.toEqual(fix(400));
  });

  it("la primera lectura vence → null (como antes)", async () => {
    jest.useFakeTimers();
    const retry = jest.fn(async () => fix(5));
    const result = readWithAccuracyRetry(
      () => new Promise<never>(() => {}),
      retry,
      10_000,
    );
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toBeNull();
    expect(retry).not.toHaveBeenCalled();
  });

  it("la primera lectura falla → lanza (quien llama muestra su aviso)", async () => {
    await expect(
      readWithAccuracyRetry(
        async () => {
          throw new Error("GPS apagado");
        },
        async () => fix(5),
        10_000,
      ),
    ).rejects.toThrow("GPS apagado");
  });
});

describe("resolveLocationCardStatus", () => {
  it("precisa y dentro del radio → within", () => {
    expect(resolveLocationCardStatus(20, 120, 150)).toBe("within");
  });

  it("precisa y fuera del radio → outside", () => {
    expect(resolveLocationCardStatus(20, 70_000, 150)).toBe("outside");
  });

  it("imprecisa → nunca 'Fuera de área', aunque la distancia lo diga", () => {
    expect(resolveLocationCardStatus(2_000, 70_000, 150)).toBe("imprecise");
    expect(resolveLocationCardStatus(2_000, 10, 150)).toBe("imprecise");
  });

  it("sin dato de precisión → veredicto normal", () => {
    expect(resolveLocationCardStatus(null, 70_000, 150)).toBe("outside");
  });
});
