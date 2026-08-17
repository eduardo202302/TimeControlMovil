import { Redirect } from "expo-router";
import * as Storage from "../utils/storage";
import { useEffect, useState } from "react";

export default function Index() {
  const [target, setTarget] = useState<"/login" | "/home" | null>(null);

  useEffect(() => {
    const check = async () => {
      const isAuthorized = await Storage.getItemAsync("isAuthorized");
      const token = await Storage.getItemAsync("token");

      if (isAuthorized === "true" && token) {
        setTarget("/home");
      } else {
        setTarget("/login");
      }
    };
    check();
  }, []);

  if (!target) return null;

  return <Redirect href={target} />;
}
