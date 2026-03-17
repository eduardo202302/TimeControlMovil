import { Stack, router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { useSchoolStore } from "../../store/useSchoolStore";

export default function RootLayout() {
  const { setSchool, setUrlColegio, setToken, setMenuResolution } =
    useSchoolStore();

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
        router.replace((initialPath ?? "/login") as never);
        return;
      }

      if (isAuthorized !== "true") {
        router.replace("/login");
      }
    };

    checkAuthorization();
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
