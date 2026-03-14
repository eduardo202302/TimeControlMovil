import { Redirect } from "expo-router";

export default function Index() {
  const isLoggedIn = false; // false = no ha iniciado sesión

  // if (isLoggedIn) {
  //   return
  // }

  return <Redirect href="/login" />;
}
