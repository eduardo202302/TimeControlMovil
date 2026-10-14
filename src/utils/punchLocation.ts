/**
 * Ubicación del ponche — lógica pura, sin expo-location: la API se inyecta
 * (ver locationApi.ts para el adaptador real) para poder testearla en node.
 *
 * Igual que el webapp, todo ponche envía latitude/longitude cuando hay permiso,
 * esté o no activa la validación de ubicación (isValidLocation). Cuando la
 * validación NO está activa la ubicación es de mejor esfuerzo: nunca pide el
 * permiso, nunca muestra avisos y nunca frena el ponche más de ~3 s. La rama
 * con validación activa (posición nueva, 10 s, aviso y bloqueo) no pasa por
 * aquí.
 */

export interface PunchCoordinates {
  latitude: number;
  longitude: number;
}

interface LocationPermission {
  status: string;
  canAskAgain: boolean;
}

interface LocationReading {
  coords: { latitude: number; longitude: number };
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

/** Resuelve null si `promise` no termina en `ms`; limpia el timer si gana. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
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
