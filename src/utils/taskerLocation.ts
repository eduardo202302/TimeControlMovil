/**
 * Posición del teléfono para Reportar (Tasker) — lógica pura, sin
 * expo-location: la API se inyecta (adaptador real en locationApi.ts) para
 * poder testearla en node. A diferencia del ponche, aquí la ubicación es
 * obligatoria: sin posición no se muestra el formulario.
 *
 * Pasos, todos dentro de REPORT_LOCATION_TIMEOUT_MS:
 *   1. permiso de primer plano (se pide si el sistema todavía deja);
 *   2. ubicación del teléfono encendida;
 *   3. última posición conocida, si tiene REPORT_LAST_KNOWN_MAX_AGE_MS o menos;
 *   4. posición nueva (getCurrentPositionAsync, Balanced);
 *   5. si la 4 da error o no responde en CURRENT_POSITION_WAIT_MS, respaldo:
 *      suscripción corta (watchPositionAsync, Balanced) que toma la primera
 *      posición y se cancela. La 4 sigue en carrera: gana la que llegue antes.
 */

import {
  LAST_KNOWN_MAX_AGE_MS,
  LAST_KNOWN_REQUIRED_ACCURACY_M,
  promptLocationPermission,
  type LocationApi,
} from "./punchLocation";
import type { ReportLocationState } from "./taskerRules";

/** Lectura de expo-location; `timestamp` (ms epoch) viene siempre del sistema. */
export interface TaskerPositionReading {
  coords: { latitude: number; longitude: number; accuracy?: number | null };
  timestamp?: number;
}

export interface TaskerPositionSubscription {
  remove(): void;
}

/** LocationApi + ubicación encendida + suscripción (Reportar). */
export interface TaskerLocationApi extends LocationApi {
  hasServicesEnabledAsync(): Promise<boolean>;
  /** Suscripción Balanced (la fija el adaptador). */
  watchPositionAsync(
    onReading: (reading: TaskerPositionReading) => void,
  ): Promise<TaskerPositionSubscription>;
}

/** Tope total de la búsqueda antes de mostrar "Active la ubicación…". */
export const REPORT_LOCATION_TIMEOUT_MS = 15_000;
/** Cuánto se espera a getCurrentPositionAsync sola antes de sumar el respaldo. */
export const CURRENT_POSITION_WAIT_MS = 5_000;
/** "Reciente" para la última posición conocida: 2 minutos (el del ponche). */
export const REPORT_LAST_KNOWN_MAX_AGE_MS = LAST_KNOWN_MAX_AGE_MS;

export type ReportLocationResult = Exclude<ReportLocationState, { status: "pending" }>;

export interface RequestReportLocationOptions {
  timeoutMs?: number;
  currentWaitMs?: number;
  /** Al desmontar la pantalla: corta la búsqueda y cancela la suscripción. */
  signal?: AbortSignal;
  /** Logs de diagnóstico; por defecto console.log solo en __DEV__. */
  log?: (message: string) => void;
  now?: () => number;
}

// ─── Reglas puras ───────────────────────────────────────────────────────────

/** Antigüedad en segundos (redondeada); sin timestamp → null. */
export function getReadingAgeSeconds(timestamp: number | undefined, nowMs: number): number | null {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((nowMs - timestamp) / 1000));
}

/**
 * ¿Sirve la última posición conocida? expo ya filtra por maxAge, pero algunos
 * Android devuelven una más vieja: se vuelve a comprobar. Sin timestamp se
 * acepta (expo lo filtró).
 */
export function isLastKnownFresh(
  timestamp: number | undefined,
  nowMs: number,
  maxAgeMs: number = REPORT_LAST_KNOWN_MAX_AGE_MS,
): boolean {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return true;
  return nowMs - timestamp <= maxAgeMs;
}

/** Coordenadas para el log: 2 decimales (~1 km), nunca completas. */
export function formatCoordsForLog(coords: { latitude: number; longitude: number }): string {
  return `${coords.latitude.toFixed(2)}, ${coords.longitude.toFixed(2)}`;
}

/** Qué hacer después de leer el permiso y si la ubicación está encendida. */
export function getPermissionStep(
  permission: { status: string; canAskAgain: boolean },
  servicesEnabled: boolean | null,
): ReportLocationResult | "continue" {
  if (permission.status !== "granted") {
    return { status: "failed", canAskAgain: permission.canAskAgain };
  }
  if (servicesEnabled === false) return { status: "failed", canAskAgain: true };
  return "continue";
}

/**
 * Espera para getCurrentPositionAsync sola: CURRENT_POSITION_WAIT_MS, sin
 * pasarse del tiempo que queda. Lo que sobra es para el respaldo.
 */
export function getCurrentPositionWaitMs(remainingMs: number, currentWaitMs: number): number {
  return Math.max(0, Math.min(currentWaitMs, remainingMs));
}

// ─── Búsqueda ───────────────────────────────────────────────────────────────

const LOG_PREFIX = "[Reportar/ubicación]";

function defaultLog(message: string): void {
  if ((globalThis as { __DEV__?: boolean }).__DEV__ === true) {
    console.log(`${LOG_PREFIX} ${message}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Outcome =
  | { kind: "position"; reading: TaskerPositionReading }
  | { kind: "error"; error: unknown }
  | { kind: "timeout" }
  | { kind: "aborted" };

function delay(ms: number, signal?: AbortSignal): Promise<Outcome> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve({ kind: "timeout" });
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve({ kind: "aborted" });
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Primera posición de una suscripción. La suscripción se cancela SIEMPRE: al
 * llegar la posición, si falla, al vencer `ms` o con `signal` (desmontar o
 * ganó la otra lectura). Si se cancela antes de que la suscripción exista, se
 * quita apenas llega.
 */
export function watchFirstPosition(
  api: Pick<TaskerLocationApi, "watchPositionAsync">,
  ms: number,
  signal?: AbortSignal,
): Promise<Outcome> {
  return new Promise((resolve) => {
    let done = false;
    let subscription: TaskerPositionSubscription | null = null;

    const finish = (outcome: Outcome) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      subscription?.remove();
      subscription = null;
      resolve(outcome);
    };
    const onAbort = () => finish({ kind: "aborted" });
    const timer = setTimeout(() => finish({ kind: "timeout" }), ms);

    if (signal?.aborted) {
      finish({ kind: "aborted" });
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    api
      .watchPositionAsync((reading) => finish({ kind: "position", reading }))
      .then(
        (sub) => {
          if (done) sub.remove();
          else subscription = sub;
        },
        (error) => finish({ kind: "error", error }),
      );
  });
}

function ok(reading: TaskerPositionReading): ReportLocationResult {
  const { latitude, longitude } = reading.coords;
  return { status: "ok", coords: { latitude, longitude } };
}

const FAILED: ReportLocationResult = { status: "failed", canAskAgain: true };

/**
 * Permiso negado, ubicación apagada, error o sin posición dentro del tope →
 * "failed". `canAskAgain: false` = negado de forma permanente (solo se arregla
 * desde los ajustes del sistema). Nunca lanza.
 */
export async function requestReportLocation(
  api: TaskerLocationApi,
  options: RequestReportLocationOptions = {},
): Promise<ReportLocationResult> {
  const {
    timeoutMs = REPORT_LOCATION_TIMEOUT_MS,
    currentWaitMs = CURRENT_POSITION_WAIT_MS,
    signal,
    log = defaultLog,
    now = Date.now,
  } = options;
  const deadline = now() + timeoutMs;
  const remaining = () => Math.max(0, deadline - now());
  const aborted = () => {
    if (!signal?.aborted) return false;
    log("cancelado (pantalla cerrada)");
    return true;
  };

  try {
    // Se suma a la petición del (app)/_layout si sigue abierta: un solo diálogo.
    await promptLocationPermission(api);
    const permission = await api.getForegroundPermissionsAsync();
    log(`permiso: ${permission.status} (canAskAgain=${permission.canAskAgain})`);
    let step = getPermissionStep(permission, null);
    if (step !== "continue") return step;

    const servicesEnabled = await api.hasServicesEnabledAsync();
    log(`hasServicesEnabledAsync: ${servicesEnabled}`);
    step = getPermissionStep(permission, servicesEnabled);
    if (step !== "continue") return step;
    if (aborted()) return FAILED;

    // ── Última posición conocida ──
    try {
      const lastKnown = (await api.getLastKnownPositionAsync({
        maxAge: REPORT_LAST_KNOWN_MAX_AGE_MS,
        requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_M,
      })) as TaskerPositionReading | null;
      if (!lastKnown) {
        log("getLastKnownPositionAsync: null");
      } else {
        const age = getReadingAgeSeconds(lastKnown.timestamp, now());
        const fresh = isLastKnownFresh(lastKnown.timestamp, now());
        log(
          `getLastKnownPositionAsync: ${formatCoordsForLog(lastKnown.coords)}, ` +
            `antigüedad ${age ?? "?"} s${fresh ? "" : " (vieja, se descarta)"}`,
        );
        if (fresh) return ok(lastKnown);
      }
    } catch (error) {
      log(`getLastKnownPositionAsync: error (${errorMessage(error)})`);
    }
    if (aborted()) return FAILED;

    // ── Posición nueva ──
    const current: Promise<Outcome> = api.getCurrentPositionAsync().then(
      (reading): Outcome => ({ kind: "position", reading }),
      (error): Outcome => ({ kind: "error", error }),
    );
    const firstWait = getCurrentPositionWaitMs(remaining(), currentWaitMs);
    const first = await Promise.race([current, delay(firstWait, signal)]);
    if (first.kind === "aborted") {
      aborted();
      return FAILED;
    }
    if (first.kind === "position") {
      log(`getCurrentPositionAsync: posición ${formatCoordsForLog(first.reading.coords)}`);
      return ok(first.reading);
    }
    log(
      first.kind === "error"
        ? `getCurrentPositionAsync: error (${errorMessage(first.error)})`
        : `getCurrentPositionAsync: sin respuesta en ${Math.round(firstWait / 1000)} s`,
    );

    // ── Respaldo: suscripción corta, en carrera con la posición nueva si sigue viva ──
    const fallbackMs = remaining();
    if (fallbackMs <= 0) {
      log("sin tiempo para el respaldo");
      return FAILED;
    }
    log(`watchPositionAsync: respaldo por ${Math.round(fallbackMs / 1000)} s`);
    const race = new AbortController();
    const onOuterAbort = () => race.abort();
    signal?.addEventListener("abort", onOuterAbort, { once: true });
    const never = new Promise<never>(() => undefined);
    // La posición nueva sigue compitiendo solo si no falló ya.
    const currentAlive = first.kind === "timeout";
    try {
      const winner = await Promise.race([
        watchFirstPosition(api, fallbackMs, race.signal).then((o) => {
          if (o.kind === "position") return { source: "watchPositionAsync", outcome: o };
          if (o.kind === "error") {
            log(`watchPositionAsync: error (${errorMessage(o.error)})`);
            if (currentAlive) return never; // queda la posición nueva hasta el tope
          }
          return { source: "watchPositionAsync", outcome: o };
        }),
        currentAlive
          ? current.then((o) =>
              o.kind === "position" ? { source: "getCurrentPositionAsync (tarde)", outcome: o } : never,
            )
          : never,
        delay(fallbackMs, race.signal).then((o) => ({ source: "tope", outcome: o })),
      ]);
      const { source, outcome } = winner;
      if (outcome.kind === "position") {
        log(`${source}: posición ${formatCoordsForLog(outcome.reading.coords)}`);
        return ok(outcome.reading);
      }
      if (outcome.kind === "aborted") {
        aborted();
        return FAILED;
      }
      if (outcome.kind === "timeout") {
        log(`sin posición; tope total de ${Math.round(timeoutMs / 1000)} s vencido`);
      }
      return FAILED;
    } finally {
      // Cancela la suscripción (y el tope) gane quien gane.
      race.abort();
      signal?.removeEventListener("abort", onOuterAbort);
    }
  } catch (error) {
    log(`error inesperado (${errorMessage(error)})`);
    return FAILED;
  }
}
