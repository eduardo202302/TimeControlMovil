import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { loginAuthentication } from "../../../api/Login/loginAuthentication";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { LoginType } from "../../../types/typesLogin/LoginType";

interface FormLoginProps {
  name?: string;
  image?: string;
}

export default function FormLogin({ name, image }: FormLoginProps) {
  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "error" | "success";
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const { urlColegio } = useSchoolStore();

  const valueDefault: LoginType = {
    usuario: "",
    password: "",
  };

  const { handleSubmit, control, setValue } = useForm<LoginType>({
    defaultValues: valueDefault,
  });

  useEffect(() => {
    const cargarCredenciales = async () => {
      const usuarioGuardado = await SecureStore.getItemAsync("usuario");
      const passwordGuardado = await SecureStore.getItemAsync("password");
      const recordar = await SecureStore.getItemAsync("recordarme");

      if (recordar === "true" && usuarioGuardado && passwordGuardado) {
        setValue("usuario", usuarioGuardado);
        setValue("password", passwordGuardado);
        setRemember(true);
      }
    };
    cargarCredenciales();
  }, []);

  const onSubmit = async (data: LoginType) => {
    const response = await loginAuthentication(data);
    console.log("Respuesta de autenticación:", response);

    if (response.success) {
      router.push("/home");
      setMensaje({
        texto: "Autenticación exitosa. Redirigiendo...",
        tipo: "success",
      });
      if (remember) {
        await SecureStore.setItemAsync("usuario", data.usuario);
        await SecureStore.setItemAsync("password", data.password);
        await SecureStore.setItemAsync("recordarme", "true");
      } else {
        await SecureStore.deleteItemAsync("usuario");
        await SecureStore.deleteItemAsync("password");
        await SecureStore.deleteItemAsync("recordarme");
      }
    } else {
      setMensaje({
        texto:
          "Error en la autenticación. Por favor, verifica tus credenciales.",
        tipo: "error",
      });
      console.error(
        "Error en la autenticación. Por favor, verifica tus credenciales.",
      );
    }
  };

  return (
    <View style={styles.phone}>
      <View style={styles.companies}>
        <View>
          <Image
            source={require("../../../assets/images/logos/logoMini.png")}
            style={{ width: 100, height: 100 }}
          />
        </View>
        <View>
          <Text style={styles.logoTitle}>FaceClass</Text>
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
        <Text style={styles.cardTitle}>Iniciar Sesión</Text>

        <Controller
          name="usuario"
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

        <Controller
          name="password"
          control={control}
          rules={{ required: "La clave es requerida" }}
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
                  placeholder="Contraseña"
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
                <Text style={styles.errorText}>{fieldState.error.message}</Text>
              )}
            </>
          )}
        />

        <View style={styles.options}>
          <TouchableOpacity
            style={styles.rememberMe}
            onPress={() => setRemember(!remember)}
          >
            <Ionicons
              name={remember ? "checkbox" : "square-outline"}
              size={18}
              color="#4c6fbf"
            />
            <Text style={styles.rememberText}>Recordarme</Text>
          </TouchableOpacity>
          <TouchableOpacity>
            <Text style={styles.forgot}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleSubmit(onSubmit)}
        >
          <Text style={styles.buttonText}>Iniciar Sesión</Text>
        </TouchableOpacity>

        <View style={styles.register}>
          <Text style={styles.registerText}>¿No tienes cuenta? </Text>
          <TouchableOpacity onPress={() => router.push("/register")}>
            <Text style={styles.registerLink}>Crear cuenta</Text>
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
    marginTop: 6,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
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
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
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
