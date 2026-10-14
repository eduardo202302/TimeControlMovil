/// <reference types="jest" />
import {
  BEST_EFFORT_TIMEOUT_MS,
  getBestEffortCoordinates,
  LAST_KNOWN_MAX_AGE_MS,
  LAST_KNOWN_REQUIRED_ACCURACY_M,
  promptLocationPermission,
  shouldRequestLocationPermission,
  startOptionalPunchCoordinates,
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
