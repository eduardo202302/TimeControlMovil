import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, router } from "expo-router";
import { useEffect } from "react";

export default function RootLayout() {
  useEffect(() => {
    const checkAuthorization = async () => {
      const isAuthorized = await AsyncStorage.getItem("isAuthorized");
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
