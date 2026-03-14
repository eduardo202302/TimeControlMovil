import Authorization from "@/components/login/Authorization";
import FormLogin from "@/components/login/FormLogin";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Login = () => {
  const [showAuth, setShowAuth] = useState(true);
  const [checking, setChecking] = useState(true);
  const [schoolData, setSchoolData] = useState<any | null>(null);

  useEffect(() => {
    const check = async () => {
      const isAuthorized = await AsyncStorage.getItem("isAuthorized");
      const schoolDataRaw = await AsyncStorage.getItem("schoolData");
      const schoolData = schoolDataRaw ? JSON.parse(schoolDataRaw) : null;
      setSchoolData(schoolData);
      console.log("=== ASYNC STORAGE ===");
      console.log("image:", schoolData?.logo);
      console.log("isAuthorized:", isAuthorized);
      console.log("schoolData completo:", schoolData);
      console.log("nombre:", schoolData?.name);
      console.log("id:", schoolData?.id);
      console.log("url:", schoolData?.tags);
      console.log("token:", schoolData?.token);
      console.log("mobilePin:", schoolData?.mobilePin);
      console.log("settings:", schoolData?.settings);
      console.log("====================");

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
  console.log(schoolData);

  return (
    <SafeAreaView style={styles.container}>
      <FormLogin name={schoolData?.name} image={schoolData?.logo} />

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
