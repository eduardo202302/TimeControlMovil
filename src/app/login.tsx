import Authorization from "@/components/login/Authorization";
import FormLogin from "@/components/login/FormLogin";
import { BlurView } from "expo-blur";
import { useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSchoolStore } from "../../store/useSchoolStore";

const Login = () => {
  const [showAuth, setShowAuth] = useState(false);
  const [checking, setChecking] = useState(true);
  const { school } = useSchoolStore();
  const { name, logo } = school || {};

  // useFocusEffect corre cada vez que la pantalla recibe foco —
  // esto cubre tanto el primer mount como cuando se navega de vuelta
  // desde el app (logout), garantizando que siempre lea el estado
  // actualizado de SecureStore.
  useFocusEffect(
    useCallback(() => {
      const check = async () => {
        setChecking(true);
        const isAuthorized = await SecureStore.getItemAsync("isAuthorized");
        // Si isAuthorized fue borrado por el logout → mostrar login directo
        setShowAuth(isAuthorized !== "true");
        setChecking(false);
      };
      check();
    }, []),
  );

  if (checking) return null;

  return (
    <SafeAreaView style={styles.container}>
      <FormLogin name={name} image={logo} />

      {showAuth && (
        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill}>
          <View style={styles.authContainer}>
            <Authorization onClose={() => setShowAuth(false)} />
          </View>
        </BlurView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#dfe9ff",
    justifyContent: "center",
    alignItems: "center",
  },
  authContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
});

export default Login;