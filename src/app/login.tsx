import Authorization from "@/components/login/Authorization";
import FormLogin from "@/components/login/FormLogin";
import { BlurView } from "expo-blur";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSchoolStore } from "../../store/useSchoolStore";

const Login = () => {
  const [showAuth, setShowAuth] = useState(false);
  const [checking, setChecking] = useState(true);
  const { school, urlColegio } = useSchoolStore();
  const { name, logo } = school || {};

  useEffect(() => {
    const check = async () => {
      const isAuthorized = await SecureStore.getItemAsync("isAuthorized");

      if (isAuthorized === "true") {
        setShowAuth(false);
      } else {
        setShowAuth(true);
      }
      setChecking(false);
    };
    check();
  }, []);

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
