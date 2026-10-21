import * as Device from "expo-device";
import * as Location from "expo-location";
import type { LocationApi } from "./punchLocation";
import type { TaskerLocationApi } from "./taskerLocation";

/**
 * Adaptador real de expo-location para las reglas de punchLocation.ts. Vive
 * aparte para que los tests (node, sin expo) no lo importen.
 */
export const expoLocationApi: LocationApi = {
  getForegroundPermissionsAsync: () => Location.getForegroundPermissionsAsync(),
  requestForegroundPermissionsAsync: () =>
    Location.requestForegroundPermissionsAsync(),
  getLastKnownPositionAsync: (options) =>
    Location.getLastKnownPositionAsync(options),
  getCurrentPositionAsync: () =>
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }),
};

/**
 * El mismo adaptador (getCurrentPositionAsync con Balanced), más saber si la
 * ubicación está encendida y una suscripción Balanced para el respaldo de
 * Reportar (ver taskerLocation.ts).
 */
export const expoTaskerLocationApi: TaskerLocationApi = {
  ...expoLocationApi,
  hasServicesEnabledAsync: () => Location.hasServicesEnabledAsync(),
  watchPositionAsync: (onReading) =>
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0 },
      onReading,
    ),
};

/**
 * Emulador / simulador en desarrollo: Reportar acepta ahí la última posición
 * conocida aunque tenga más de 120 s (ver acceptStaleLastKnown en
 * taskerLocation.ts). En dispositivo real y en producción, siempre false.
 */
export const isDevEmulator: boolean = __DEV__ && Device.isDevice === false;
