import * as Location from "expo-location";
import type { LocationApi } from "./punchLocation";

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
