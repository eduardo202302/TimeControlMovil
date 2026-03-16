import { Redirect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";

export default function Index() {
  const [target, setTarget] = useState<
    "/login" | "/time-control/entrada-salida" | null
  >(null);

  useEffect(() => {
    const check = async () => {
      const isAuthorized = await SecureStore.getItemAsync("isAuthorized");
      const token = await SecureStore.getItemAsync("token");

      if (isAuthorized === "true" && token) {
        setTarget("/time-control/entrada-salida");
      } else {
        setTarget("/login");
      }
    };

    check();
  }, []);

  if (!target) return null;

  return <Redirect href={target} />;
}