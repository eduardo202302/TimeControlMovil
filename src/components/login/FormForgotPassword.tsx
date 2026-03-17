import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { validateUser } from "../../../api/Login/loginAuthentication";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { ValidateUser } from "../../../types/typesLogin/ForgotPasswordType";

interface FormLoginProps {
  name?: string;
  image?: string;
  onNext: () => void;
}

export default function FormForgotPassword({
  name,
  image,
  onNext,
}: FormLoginProps) {
  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "error" | "success";
  } | null>(null);
  const { urlColegio } = useSchoolStore();

  const valueDefault: ValidateUser = {
    user: "",
  };

  const { handleSubmit, control } = useForm<ValidateUser>({
    defaultValues: valueDefault,
  });

  const onSubmit = async (data: ValidateUser) => {
    const response = await validateUser(data);
    console.log("Respuesta de validación:", response);
    if (!response.success) {
      setMensaje({ texto: response.message, tipo: "error" });
      return;
    }
    onNext();
  };

  return (
    <View style={styles.phone}>
      <View style={styles.companies}>
        <View>
          <Text style={styles.logoCompanies}>FaceClass</Text>
        </View>
      </View>
      <View style={styles.logo}>
        {urlColegio && image ? (
          <Image
            source={{ uri: `${urlColegio}/${image}` }}
            style={{ width: 100, height: 100 }}
          />
        ) : null}
        <Text style={styles.logoTitle}>{name}</Text>
      </View>
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
      <View style={styles.card}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "600",
            color: "#3c5fa6",
            marginBottom: 8,
          }}
        >
          Cambiar Contraseña
        </Text>
        <Text
          style={{
            fontSize: 20,
            color: "#3c5fa6",
            marginBottom: 20,
          }}
        >
          Ingresar:
        </Text>

        <Controller
          name="user"
          control={control}
          rules={{ required: "El usuario es requerido" }}
          render={({ field, fieldState }) => (
            <>
              <View style={styles.inputGroup}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color="#9aa4b4"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Usuario / Email / Teléfono"
                  value={field.value}
                  onChangeText={field.onChange}
                  autoCapitalize="none"
                />
              </View>
              {fieldState.error && (
                <Text style={styles.errorText}>{fieldState.error.message}</Text>
              )}
            </>
          )}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleSubmit(onSubmit)}
        >
          <Text style={styles.buttonText}>Enviar</Text>
        </TouchableOpacity>

        <View style={styles.register}>
          <Text style={styles.registerText}>¿No tienes cuenta? </Text>
          <TouchableOpacity onPress={() => router.push("/register")}>
            <Text style={styles.registerLink}>Crear cuenta</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.register}>
          <Text style={styles.registerText}>¿tienes una cuenta? </Text>
          <TouchableOpacity onPress={() => router.push("/login")}>
            <Text style={styles.registerLink}>Inicia sesión</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
  phone: {
    width: "90%",
    maxWidth: 360,
    padding: 25,
    borderRadius: 32,
    backgroundColor: "#eef4ff",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 11,
    marginTop: 4,
    marginLeft: 4,
    marginBottom: 4,
  },
  logo: {
    alignItems: "center",
    marginBottom: 27,
  },
  logoTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#3c5fa6",
    marginTop: 10,
  },
  logoCompanies: {
    fontSize: 20,
    fontWeight: "600",
    color: "#3c5fa6",
    marginBottom: 16,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 40,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
    marginBottom: 14,
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 5,

    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    width: "90%",
    fontSize: 14,
  },
  options: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  rememberMe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rememberText: {
    fontSize: 13,
    color: "#555",
  },
  forgot: {
    fontSize: 13,
    color: "#4c6fbf",
  },
  button: {
    backgroundColor: "#2d5fd3",
    padding: 13,
    borderRadius: 10,
    marginTop: 18,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "500",
  },
  register: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 14,
  },
  registerText: {
    fontSize: 13,
    color: "#666",
  },
  registerLink: {
    fontSize: 13,
    color: "#4c6fbf",
    fontWeight: "500",
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
