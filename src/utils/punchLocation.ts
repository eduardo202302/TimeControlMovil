/**
 * Ubicación del ponche — lógica pura, sin expo-location: la API se inyecta
 * (ver locationApi.ts para el adaptador real) para poder testearla en node.
 *
 * Igual que el webapp, todo ponche envía latitude/longitude cuando hay permiso,
 * esté o no activa la validación de ubicación (isValidLocation). Cuando la
 * validación NO está activa la ubicación es de mejor esfuerzo: nunca pide el
 * permiso, nunca muestra avisos y nunca frena el ponche más de ~3 s. La rama
 * con validación activa (posición nueva, 10 s, aviso y bloqueo) solo usa de
 * aquí las reglas de precisión (sección "Precisión").
 */

export interface PunchCoordinates {
  latitude: number;
  longitude: number;
}

/** Lectura con su radio de error en metros (null = el sistema no lo informó). */
export interface AccurateCoordinates extends PunchCoordinates {
  accuracy: number | null;
}

interface LocationPermission {
  status: string;
  canAskAgain: boolean;
  /** Solo Android: "fine" (precisa), "coarse" (aproximada) o "none". */
  android?: { accuracy?: string };
}

interface LocationReading {
  coords: { latitude: number; longitude: number; accuracy?: number | null };
}

/** Subconjunto de expo-location que usan estas reglas. */
export interface LocationApi {
  getForegroundPermissionsAsync(): Promise<LocationPermission>;
  requestForegroundPermissionsAsync(): Promise<LocationPermission>;
  getLastKnownPositionAsync(options: {
    maxAge: number;
    requiredAccuracy: number;
  }): Promise<LocationReading | null>;
  /** Posición nueva con precisión Balanced (la fija el adaptador). */
  getCurrentPositionAsync(): Promise<LocationReading>;
}

/** Antigüedad máxima aceptada de la última posición conocida. */
export const LAST_KNOWN_MAX_AGE_MS = 120_000;
/** Precisión mínima (metros) de la última posición conocida. */
export const LAST_KNOWN_REQUIRED_ACCURACY_M = 100;
/** Tope de espera de una posición nueva cuando la ubicación es opcional. */
export const BEST_EFFORT_TIMEOUT_MS = 3_000;

// ─── Permiso ──────────────────────────────────────────────────────────────────

/**
 * Se pide solo si no está concedido y el sistema todavía deja preguntar. Con
 * canAskAgain false (iOS tras el primer "No", Android tras el segundo) no se
 * hace nada: ni diálogo ni aviso.
 */
export function shouldRequestLocationPermission(
  permission: LocationPermission,
): boolean {
  return permission.status !== "granted" && permission.canAskAgain;
}

/**
 * Android 12+ deja conceder solo la ubicación "Aproximada": el permiso queda
 * "granted" pero las posiciones llegan ofuscadas (error de ~1-3 km). iOS no
 * trae el campo android → false.
 */
export function isApproximateLocationPermission(
  permission: Pick<LocationPermission, "android">,
): boolean {
  return permission.android?.accuracy === "coarse";
}

// Bandera en memoria: el (app)/_layout y el ponchador montan casi a la vez en
// el arranque — ambos se suman a la misma petición en vez de encadenar dos
// diálogos.
let permissionPromptInFlight: Promise<void> | null = null;

/**
 * Pide el permiso de ubicación (primer plano) si corresponde. Nunca lanza ni
 * bloquea: quien la llama no la espera.
 */
export function promptLocationPermission(api: LocationApi): Promise<void> {
  if (permissionPromptInFlight) return permissionPromptInFlight;
  permissionPromptInFlight = (async () => {
    try {
      const permission = await api.getForegroundPermissionsAsync();
      if (shouldRequestLocationPermission(permission)) {
        await api.requestForegroundPermissionsAsync();
      }
    } catch {
      // Sin permiso se poncha igual (salvo la validación, que lo pide aparte).
    } finally {
      permissionPromptInFlight = null;
    }
  })();
  return permissionPromptInFlight;
}

// ─── Coordenadas de mejor esfuerzo ────────────────────────────────────────────

function toCoordinates(reading: LocationReading): PunchCoordinates {
  return {
    latitude: reading.coords.latitude,
    longitude: reading.coords.longitude,
  };
}

export function toAccurateCoordinates(
  reading: LocationReading,
): AccurateCoordinates {
  return {
    ...toCoordinates(reading),
    accuracy: reading.coords.accuracy ?? null,
  };
}

/** Resuelve null si `promise` no termina en `ms`; limpia el timer si gana. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Coordenadas para un ponche SIN validación de ubicación. Lee el permiso sin
 * pedirlo; usa la última posición conocida si es reciente y precisa, y si no,
 * una posición nueva con tope de BEST_EFFORT_TIMEOUT_MS. Cualquier fallo → null
 * (el ponche sale sin coordenadas). Nunca lanza.
 */
export async function getBestEffortCoordinates(
  api: LocationApi,
  timeoutMs: number = BEST_EFFORT_TIMEOUT_MS,
): Promise<PunchCoordinates | null> {
  try {
    const permission = await api.getForegroundPermissionsAsync();
    if (permission.status !== "granted") return null;

    try {
      const lastKnown = await api.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_MAX_AGE_MS,
        requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_M,
      });
      if (lastKnown) return toCoordinates(lastKnown);
    } catch {
      // Sin caché utilizable: se intenta una posición nueva.
    }

    const current = await withTimeout(api.getCurrentPositionAsync(), timeoutMs);
    return current ? toCoordinates(current) : null;
  } catch {
    return null;
  }
}

// ─── Precisión ────────────────────────────────────────────────────────────────

/**
 * ¿La lectura es lo bastante precisa para decir Dentro/Fuera de área? Umbral:
 * LAST_KNOWN_REQUIRED_ACCURACY_M. Sin dato de precisión (null o no finito) se
 * trata como suficiente: no hay base para llamarla imprecisa, y así se conserva
 * el comportamiento de antes de revisarla. En Android e iOS expo siempre la
 * informa.
 */
export function isAccuracySufficient(
  accuracy: number | null | undefined,
): boolean {
  if (accuracy == null || !Number.isFinite(accuracy)) return true;
  return accuracy <= LAST_KNOWN_REQUIRED_ACCURACY_M;
}

/** Sin precisión conocida cuenta como la peor. */
function accuracyRank(reading: AccurateCoordinates): number {
  return reading.accuracy != null && Number.isFinite(reading.accuracy)
    ? reading.accuracy
    : Infinity;
}

/**
 * La más precisa de dos lecturas (menor accuracy). Empate → la primera; una
 * lectura sin precisión conocida pierde frente a una que la tiene.
 */
export function pickMoreAccurate(
  a: AccurateCoordinates | null,
  b: AccurateCoordinates | null,
): AccurateCoordinates | null {
  if (!a) return b;
  if (!b) return a;
  return accuracyRank(b) < accuracyRank(a) ? b : a;
}

/**
 * Posición nueva con un reintento por precisión, todo dentro de `timeoutMs`:
 * primero `readPrimary` (High); si sale imprecisa y queda tiempo, `readRetry`
 * (Highest) con el tiempo restante, y gana la más precisa de las dos.
 * El primer intento se comporta como antes del reintento (timeout → null,
 * error → lanza); el reintento nunca empeora el resultado: si falla o vence,
 * queda la primera lectura.
 */
export async function readWithAccuracyRetry(
  readPrimary: () => Promise<AccurateCoordinates>,
  readRetry: () => Promise<AccurateCoordinates>,
  timeoutMs: number,
): Promise<AccurateCoordinates | null> {
  const deadline = Date.now() + timeoutMs;
  const first = await withTimeout(readPrimary(), timeoutMs);
  if (!first || isAccuracySufficient(first.accuracy)) return first;

  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return first;
  const retry = await withTimeout(readRetry(), remainingMs).catch(() => null);
  return pickMoreAccurate(first, retry);
}

export type LocationCardStatus = "within" | "outside" | "imprecise";

/**
 * Veredicto de la card de ubicación. Una lectura imprecisa nunca se muestra
 * como "Fuera de área": su error puede ser de kilómetros.
 */
export function resolveLocationCardStatus(
  accuracy: number | null,
  distanceMeters: number,
  radiusMeters: number,
): LocationCardStatus {
  if (!isAccuracySufficient(accuracy)) return "imprecise";
  return distanceMeters <= radiusMeters ? "within" : "outside";
}

// ─── Payload ──────────────────────────────────────────────────────────────────

/**
 * Con validación activa las coordenadas salen del flujo estricto (posición
 * nueva, bloqueante), así que aquí no se arranca nada. Sin validación se
 * arranca el mejor esfuerzo de inmediato, para que corra en paralelo con la
 * cámara y se espere recién al armar el payload.
 */
export function startOptionalPunchCoordinates(
  locationRequired: boolean,
  fetchCoordinates: () => Promise<PunchCoordinates | null>,
): Promise<PunchCoordinates | null> | null {
  return locationRequired ? null : fetchCoordinates();
}
