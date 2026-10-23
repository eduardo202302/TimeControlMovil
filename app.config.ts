import type { ExpoConfig } from "expo/config";

/**
 * Key del SDK nativo de Google Maps (Android). Viene de .env / variables de
 * EAS — nunca hardcodeada. Sin ella el manifest no lleva
 * com.google.android.geo.API_KEY y montar un MapView tumba la app, por eso la
 * app recibe `hasGoogleMapsKey` en `extra` y no monta el mapa (ver
 * src/constants/maps.ts).
 */
const googleMapsAndroidApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() ?? "";

const config: ExpoConfig = {
  name: "timeControlApp",
  slug: "timeControlMovil",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/logos/logo2.png",
  scheme: "timecontrolapp",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    icon: "./assets/expo.icon",
  },
  android: {
    package: "com.timecontrol.movil",
    permissions: [
      "android.permission.CAMERA",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.RECORD_AUDIO",
    ],
    icon: "./assets/images/logos/logo_adaptive.png",
    adaptiveIcon: {
      foregroundImage: "./assets/images/logos/logo_adaptive.png",
      backgroundColor: "#E6F4FE",
    },
    predictiveBackGestureEnabled: false,
    config: {
      googleMaps: {
        apiKey: googleMapsAndroidApiKey || undefined,
      },
    },
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#EFEFEF",
        android: {
          image: "./assets/images/logos/logo_adaptive.png",
          imageWidth: 100,
        },
      },
    ],
    "expo-secure-store",
    "expo-image-picker",
    "@react-native-community/datetimepicker",
    "expo-font",
    "expo-image",
    "expo-status-bar",
    "expo-web-browser",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Tu ubicación se registra junto a cada ponche y, si tu empresa lo requiere, se usa para validar que estés en el área permitida.",
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "ea57f376-647a-4164-a977-94d685b3ac4e",
    },
    hasGoogleMapsKey: googleMapsAndroidApiKey.length > 0,
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    url: "https://u.expo.dev/ea57f376-647a-4164-a977-94d685b3ac4e",
  },
  owner: "anthonyjr0511",
};

export default config;
