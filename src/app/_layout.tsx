import { Stack, router } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Alert } from "react-native";
import * as Updates from "expo-updates";
import { useSchoolStore } from "../../store/useSchoolStore";
import * as Storage from "../utils/storage";

export default function RootLayout() {
  const { setSchool, setUrlColegio, setToken, setMenuResolution } =
    useSchoolStore();

  // Guardar si ya hicimos la carga inicial — para distinguirla del logout
  const initialLoadDone = useRef(false);

  // ── Carga inicial: hidratar store desde SecureStore ──────────────────────────
  useEffect(() => {
    const checkAuthorization = async () => {
      const isAuthorized = await Storage.getItemAsync("isAuthorized");
      const schoolDataRaw = await Storage.getItemAsync("dataSchool");
      const urlColegio = await Storage.getItemAsync("urlColegio");
      const token = await Storage.getItemAsync("token");
      const userRaw = await Storage.getItemAsync("user");
      const menuItemsRaw = await Storage.getItemAsync("menuItems");

      if (schoolDataRaw) setSchool(JSON.parse(schoolDataRaw));
      if (urlColegio) setUrlColegio(urlColegio);
      if (token) setToken(token);

      if (isAuthorized === "true" && userRaw && menuItemsRaw) {
        const user = JSON.parse(userRaw);
        const menuItems = JSON.parse(menuItemsRaw);
        setMenuResolution(user, menuItems);
        initialLoadDone.current = true;
        const { role } = useSchoolStore.getState();
        router.replace((role?.defaultMenu?.path ?? "/login") as never);
        return;
      }

      initialLoadDone.current = true;
      router.replace("/login");
    };

    checkAuthorization();
  }, []);

  // ── Observar logout: cuando token pasa a null DESPUÉS de la carga inicial ────
  useEffect(() => {
    const unsubscribe = useSchoolStore.subscribe(async (state, prevState) => {
      // Solo actuar si: ya cargamos, el token pasó de algo a null
      if (!initialLoadDone.current) return;
      if (prevState.token !== null && state.token === null) {
        // Limpiar todas las claves de SecureStore que el layout usa
        await Promise.all([
          Storage.deleteItemAsync("token"),
          Storage.deleteItemAsync("user"),
          Storage.deleteItemAsync("menuItems"),
          // isAuthorized NO se borra — es la autorización del dispositivo físico,
          // no de la sesión del usuario. Solo se borra si el dispositivo se revocan.
        ]);
        router.replace("/login");
      }
    });

    return () => unsubscribe();
  }, []);

  // ── Detectar actualizaciones OTA (EAS Update) ─────────────────────────────────
  useEffect(() => {
    if (!Updates.isEnabled) return; // Expo Go / dev client no soportan updates

    let alertShown = false;

    const checkForUpdate = async () => {
      if (alertShown) return;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;

        await Updates.fetchUpdateAsync();
        alertShown = true;

        Alert.alert(
          "Actualización disponible",
          "Hay una nueva versión de la app. Debes reiniciarla para aplicar los cambios.",
          [{ text: "Reiniciar ahora", onPress: () => Updates.reloadAsync() }],
          { cancelable: false },
        );
      } catch {
        // Silencioso — errores de red no deben interrumpir el uso de la app
      }
    };

    checkForUpdate();
    const updatePoller = setInterval(checkForUpdate, 10_000); // cada 10 seg — igual que el poller de horario

    const appStateListener = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") checkForUpdate();
    });

    return () => {
      clearInterval(updatePoller);
      appStateListener.remove();
    };
  }, []);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="forgotPassword" options={{ headerShown: false }} />
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
    </Stack>
  );
}
