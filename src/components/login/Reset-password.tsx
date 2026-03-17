import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { resetPassword } from "../../../api/Login/loginAuthentication";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { NewPasswordType } from "../../../types/typesLogin/ForgotPasswordType";

export default function ResetPassword({
  name,
  image,
}: {
  name?: string;
  image?: string;
}) {
  const [mensaje, setMensaje] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { urlColegio } = useSchoolStore();

  const ValuesDefault = {
    password: "",
    confirmPassword: "",
  };

  const { control, handleSubmit } = useForm<NewPasswordType>({
    defaultValues: ValuesDefault,
  });

  const onSubmit = async (data: NewPasswordType) => {
    if (data.password !== data.confirmPassword) {
      setMensaje({
        texto: "Las contraseñas no coinciden",
        tipo: "error",
      });
      return;
    }

    const response = await resetPassword({ password: data.password });

    console.log("Respuesta de reset password:", response);

    if (!response.success) {
      setMensaje({
        texto: response.message || "Error al restablecer la contraseña",
        tipo: "error",
      });
      return;
    }

    setMensaje({
      texto: "Contraseña actualizada correctamente",
      tipo: "success",
    });

    setTimeout(() => {
      router.replace("/login");
    }, 500);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.phone}>
        {/* Header empresa */}
        <View style={styles.companies}>
          <Text style={styles.logoCompanies}>FaceClass</Text>
        </View>

        {/* Logo colegio */}
        <View style={styles.logo}>
          {urlColegio && image ? (
            <Image
              source={{ uri: `${urlColegio}/${image}` }}
              style={{ width: 100, height: 100 }}
            />
          ) : null}

          <Text style={styles.logoTitle}>{name}</Text>
        </View>

        {/* Mensaje */}
        {mensaje && (
          <View
            style={[
              styles.msg,
              mensaje.tipo === "error" ? styles.msgError : styles.msgSuccess,
            ]}
          >
            <Text
              style={[
                styles.msgText,
                {
                  color: mensaje.tipo === "error" ? "#b54a00" : "#0a6644",
                },
              ]}
            >
              {mensaje.texto}
            </Text>
          </View>
        )}

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nueva Contraseña</Text>

          {/* Password */}
          <Controller
            name="password"
            control={control}
            rules={{ required: "La contraseña es requerida" }}
            render={({ field, fieldState }) => (
              <>
                <View style={styles.inputGroup}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color="#9aa4b4"
                    style={styles.inputIcon}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="Nueva contraseña"
                    secureTextEntry={!showPassword}
                    value={field.value}
                    onChangeText={field.onChange}
                  />

                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color="#999"
                    />
                  </TouchableOpacity>
                </View>

                {fieldState.error && (
                  <Text style={styles.errorText}>
                    {fieldState.error.message}
                  </Text>
                )}
              </>
            )}
          />

          {/* Confirm password */}
          <Controller
            name="confirmPassword"
            control={control}
            rules={{ required: "Confirma la contraseña" }}
            render={({ field, fieldState }) => (
              <>
                <View style={styles.inputGroup}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color="#9aa4b4"
                    style={styles.inputIcon}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="Confirmar contraseña"
                    secureTextEntry={!showPassword}
                    value={field.value}
                    onChangeText={field.onChange}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color="#999"
                    />
                  </TouchableOpacity>
                </View>

                {fieldState.error && (
                  <Text style={styles.errorText}>
                    {fieldState.error.message}
                  </Text>
                )}
              </>
            )}
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleSubmit(onSubmit)}
          >
            <Text style={styles.buttonText}>Cambiar contraseña</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/login")}>
            <Text style={styles.back}>Volver al login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#dfe9ff",
    justifyContent: "center",
    alignItems: "center",
  },
  companies: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logoCompanies: {
    fontSize: 20,
    fontWeight: "600",
    color: "#3c5fa6",
    marginBottom: 16,
  },
  logoTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#3c5fa6",
    marginTop: 10,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 40,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#3c5fa6",
    marginBottom: 18,
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#555",
    marginBottom: 20,
  },
  logo: {
    alignItems: "center",
    marginBottom: 27,
  },
  phone: {
    width: "90%",
    maxWidth: 360,
    padding: 25,
    borderRadius: 32,
    backgroundColor: "#eef4ff",
  },
  authContainer: {
    width: "100%",
    maxWidth: 350,
    padding: 24,
    backgroundColor: "white",
    borderRadius: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    textAlign: "center",
    color: "#555",
    marginBottom: 20,
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    width: "80%",
    paddingVertical: 10,
  },
  button: {
    backgroundColor: "#2d5fd3",
    padding: 14,
    borderRadius: 10,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontWeight: "600",
  },
  errorText: {
    color: "red",
    textAlign: "center",
    marginBottom: 10,
  },

  back: {
    marginTop: 15,
    textAlign: "center",
    color: "#2d5fd3",
  },
  msg: { marginTop: 10, padding: 8, borderRadius: 6, alignItems: "center" },
  msgError: {
    backgroundColor: "#fff8f0",
    borderWidth: 1,
    borderColor: "#ffcc80",
  },
  msgSuccess: {
    backgroundColor: "#f0faf5",
    borderWidth: 1,
    borderColor: "#a8dfc4",
  },
  msgText: { fontSize: 12 },
  footerNote: {
    textAlign: "center",
    fontSize: 11,
    color: "#9ab0c8",
    marginTop: 14,
    lineHeight: 18,
  },
});
