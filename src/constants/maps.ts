import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * `extra.hasGoogleMapsKey` lo fija app.config.ts según
 * GOOGLE_MAPS_ANDROID_API_KEY. En Android, montar un MapView sin
 * com.google.android.geo.API_KEY en el manifest crashea ("API key not found"),
 * así que sin key no se monta y se muestra el aviso. iOS usa Apple Maps y no
 * la necesita.
 */
const hasGoogleMapsKey = Constants.expoConfig?.extra?.hasGoogleMapsKey === true;

export const MAP_AVAILABLE = Platform.OS !== "android" || hasGoogleMapsKey;
