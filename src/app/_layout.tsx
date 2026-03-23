import { Stack, router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef } from "react";
import { useSchoolStore } from "../../store/useSchoolStore";

export default function RootLayout() {
  const { setSchool, setUrlColegio, setToken, setMenuResolution } =
    useSchoolStore();

  // Guardar si ya hicimos la carga inicial — para distinguirla del logout
  const initialLoadDone = useRef(false);

  // ── Carga inicial: hidratar store desde SecureStore ──────────────────────────
  useEffect(() => {
    const checkAuthorization = async () => {
      const isAuthorized = await SecureStore.getItemAsync("isAuthorized");
      const schoolDataRaw = await SecureStore.getItemAsync("dataSchool");
      const urlColegio = await SecureStore.getItemAsync("urlColegio");
      const token = await SecureStore.getItemAsync("token");
      const userRaw = await SecureStore.getItemAsync("user");
      const menuItemsRaw = await SecureStore.getItemAsync("menuItems");

      if (schoolDataRaw) setSchool(JSON.parse(schoolDataRaw));
      if (urlColegio) setUrlColegio(urlColegio);
      if (token) setToken(token);

      if (isAuthorized === "true" && userRaw && menuItemsRaw) {
        const user = JSON.parse(userRaw);
        const menuItems = JSON.parse(menuItemsRaw);
        setMenuResolution(user, menuItems);
        const { initialPath } = useSchoolStore.getState();
        initialLoadDone.current = true;
        router.replace((initialPath ?? "/login") as never);
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
          SecureStore.deleteItemAsync("token"),
          SecureStore.deleteItemAsync("user"),
          SecureStore.deleteItemAsync("menuItems"),
          // isAuthorized NO se borra — es la autorización del dispositivo físico,
          // no de la sesión del usuario. Solo se borra si el dispositivo se revocan.
        ]);
        router.replace("/login");
      }
    });

    return () => unsubscribe();
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