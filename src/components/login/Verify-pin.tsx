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
import { validatePin } from "../../../api/Login/loginAuthentication";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { ValidaPin } from "../../../types/typesLogin/ForgotPasswordType";

interface FormLoginProps {
  name?: string;
  image?: string;
  onNext: () => void; // función para avanzar al siguiente paso
}

const VerifyPin = ({ name, image, onNext }: FormLoginProps) => {
  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "error" | "success";
  } | null>(null);
  const { urlColegio } = useSchoolStore();

  const valueDefault: ValidaPin = {
    pin: "",
  };

  const { handleSubmit, control, setValue } = useForm<ValidaPin>({
    defaultValues: valueDefault,
  });

  const onSubmit = async (data: ValidaPin) => {
    const respoaense = await validatePin(data);
    console.log("Respuesta de validación PIN:", respoaense);
    if (!respoaense.success) {
      setMensaje({ texto: respoaense.message, tipo: "error" });
      return;
    }
    onNext(); // avanzar al siguiente paso después de enviar el formulario
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
                { color: mensaje.tipo === "error" ? "#b54a00" : "#0a6644" },
              ]}
            >
              {mensaje.texto}
            </Text>
          </View>
        )}

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cambiar Contraseña</Text>

          <Text
            style={{
              fontSize: 18,
              color: "#3c5fa6",
              marginBottom: 20,
            }}
          >
            Ingresar PIN:
          </Text>

          <Controller
            name="pin"
            control={control}
            rules={{ required: "El pin es requerido" }}
            render={({ field, fieldState }) => (
              <>
                <View style={styles.inputGroup}>
                  <Ionicons
                    name="key-outline"
                    size={12}
                    color="#9aa4b4"
                    style={styles.inputIcon}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="Código PIN"
                    value={field.value}
                    onChangeText={field.onChange}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>

                {fieldState.error && (
                  <Text style={styles.errorText}>
                    {fieldState.error.message}
                  </Text>
                )}
              </>
            )}
          />

          {/* Botón */}
          <TouchableOpacity
            style={styles.button}
            onPress={handleSubmit(onSubmit)}
          >
            <Text style={styles.buttonText}>Enviar</Text>
          </TouchableOpacity>

          {/* Volver */}
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};
export default VerifyPin;

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
    padding: 50,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#3c5fa6",
    marginBottom: 14,
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
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 15,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    width: "86%",
    paddingVertical: 10,
    letterSpacing: 4,
    textAlign: "center",
    fontSize: 18,
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
