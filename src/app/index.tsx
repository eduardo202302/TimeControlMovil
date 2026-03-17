import { Redirect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";

export default function Index() {
<<<<<<< HEAD
  const [target, setTarget] = useState<
    "/login" | "/time-control/entrada-salida" | null
  >(null);
=======
  const [target, setTarget] = useState<"/login" | "/home" | null>(null);
>>>>>>> main

  useEffect(() => {
    const check = async () => {
      const isAuthorized = await SecureStore.getItemAsync("isAuthorized");
      const token = await SecureStore.getItemAsync("token");

      if (isAuthorized === "true" && token) {
<<<<<<< HEAD
        setTarget("/time-control/entrada-salida");
=======
        setTarget("/home");
>>>>>>> main
      } else {
        setTarget("/login");
      }
    };
<<<<<<< HEAD

=======
>>>>>>> main
    check();
  }, []);

  if (!target) return null;

  return <Redirect href={target} />;
<<<<<<< HEAD
}
=======
}
>>>>>>> main
