import { Stack, router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { useSchoolStore } from "../../store/useSchoolStore";

export default function RootLayout() {
  const { setSchool, setUrlColegio, setToken, setUser } = useSchoolStore();

  useEffect(() => {
    const checkAuthorization = async () => {
      const isAuthorized = await SecureStore.getItemAsync("isAuthorized");
      const schoolDataRaw = await SecureStore.getItemAsync("dataSchool");
      const urlColegio = await SecureStore.getItemAsync("urlColegio");
      const token = await SecureStore.getItemAsync("token");
      const userRaw = await SecureStore.getItemAsync("user");

      if (schoolDataRaw) setSchool(JSON.parse(schoolDataRaw));
      if (urlColegio) setUrlColegio(urlColegio);
      if (token) setToken(token);
      if (userRaw) setUser(JSON.parse(userRaw));

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
      <Stack.Screen name="home" options={{ headerShown: false }} />
    </Stack>
  );
}
