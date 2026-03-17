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
<<<<<<< HEAD
=======
import { getMenuItems } from "../../../api/menu/getMenuItems";
import { getRoleById } from "../../../api/Roles/getRoles";
>>>>>>> main
import { useSchoolStore } from "../../../store/useSchoolStore";
import { LoginType } from "../../../types/typesLogin/LoginType";

interface FormLoginProps {
  name?: string;
  image?: string;
}

<<<<<<< HEAD
=======
function decodeJWT(token: string): Record<string, any> {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

>>>>>>> main
export default function FormLogin({ name, image }: FormLoginProps) {
  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "error" | "success";
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
<<<<<<< HEAD
  const { urlColegio } = useSchoolStore();

  const valueDefault: LoginType = {
    usuario: "",
    password: "",
  };

  const { handleSubmit, control, setValue } = useForm<LoginType>({
    defaultValues: valueDefault,
=======
  const [loading, setLoading] = useState(false);

  const { urlColegio, setMenuResolution } = useSchoolStore();

  const { handleSubmit, control, setValue } = useForm<LoginType>({
    defaultValues: { usuario: "", password: "" },
>>>>>>> main
  });

  useEffect(() => {
    const cargarCredenciales = async () => {
      const usuarioGuardado = await SecureStore.getItemAsync("usuario");
      const passwordGuardado = await SecureStore.getItemAsync("password");
      const recordar = await SecureStore.getItemAsync("recordarme");
<<<<<<< HEAD

=======
>>>>>>> main
      if (recordar === "true" && usuarioGuardado && passwordGuardado) {
        setValue("usuario", usuarioGuardado);
        setValue("password", passwordGuardado);
        setRemember(true);
      }
    };
    cargarCredenciales();
  }, []);

  const onSubmit = async (data: LoginType) => {
<<<<<<< HEAD
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
=======
    setLoading(true);
    setMensaje(null);

    try {
      const response = await loginAuthentication(data);

      if (response.success) {
        const { token } = response.data;

        const currentUrl =
          urlColegio ?? useSchoolStore.getState().urlColegio ?? "";

        const jwtPayload = decodeJWT(token);

        // Llamar getMenuItems y getRoleById en paralelo
        const [menuItems, role] = await Promise.all([
          getMenuItems(currentUrl, token),
          getRoleById(currentUrl, token, jwtPayload.roleId),
        ]);

        // Armar user completo con menu real del rol
        const fullUser = {
          ...response.data,
          roleId: jwtPayload.roleId,
          role: {
            id: jwtPayload.roleId,
            name: jwtPayload.roleName,
            permissions: {},
            menu: role?.menu ?? [],
          },
          school: useSchoolStore.getState().school ?? {},
        };

        // Resolver app + ruta + árbol de menú
        setMenuResolution(fullUser as any, menuItems);

        const { initialPath, menuTree } = useSchoolStore.getState();
        console.log("initialPath:", initialPath);
        console.log("menuTree:", JSON.stringify(menuTree, null, 2));

        // Persistir en SecureStore
        await SecureStore.setItemAsync("isAuthorized", "true");
        await SecureStore.setItemAsync("token", token);
        await SecureStore.setItemAsync("urlColegio", currentUrl);
        await SecureStore.setItemAsync("user", JSON.stringify(fullUser));
        await SecureStore.setItemAsync("menuItems", JSON.stringify(menuItems));

        setMensaje({
          texto: "Autenticación exitosa. Redirigiendo...",
          tipo: "success",
        });

        router.replace((initialPath ?? "/entrada-salida") as never);

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
      }
    } catch (error) {
      console.error("Error en login:", error);
      setMensaje({
        texto: "Ocurrió un error. Intenta de nuevo.",
        tipo: "error",
      });
    } finally {
      setLoading(false);
>>>>>>> main
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
<<<<<<< HEAD
        {urlColegio && image ? (
          <Image
            source={{ uri: `${urlColegio}/${image}` }}
=======
        {urlColegio && name ? (
          <Image
            source={{ uri: `${urlColegio}/${name}` }}
>>>>>>> main
            style={{ width: 100, height: 100 }}
          />
        ) : null}
        <Text style={styles.logoTitle}>{name}</Text>
      </View>
<<<<<<< HEAD
=======

>>>>>>> main
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
<<<<<<< HEAD
=======

>>>>>>> main
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
<<<<<<< HEAD
          <TouchableOpacity>
=======
          <TouchableOpacity onPress={() => router.push("/forgotPassword")}>
>>>>>>> main
            <Text style={styles.forgot}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
<<<<<<< HEAD
          style={styles.button}
          onPress={handleSubmit(onSubmit)}
        >
          <Text style={styles.buttonText}>Iniciar Sesión</Text>
        </TouchableOpacity>

        <View style={styles.register}>
          <Text style={styles.registerText}>¿No tienes cuenta? </Text>
=======
          style={[styles.button, loading && { opacity: 0.7 }]}
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
          </Text>
        </TouchableOpacity>

        <View style={styles.register}>
          <Text style={styles.registerText}>¿No tienes cuenta?</Text>
>>>>>>> main
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
<<<<<<< HEAD
  logo: {
    alignItems: "center",
    marginBottom: 27,
  },
=======
  logo: { alignItems: "center", marginBottom: 27 },
>>>>>>> main
  logoTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#3c5fa6",
    marginTop: 6,
  },
<<<<<<< HEAD
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
  },
=======
  card: { backgroundColor: "white", borderRadius: 16, padding: 20 },
>>>>>>> main
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
<<<<<<< HEAD
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },
=======
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 10, fontSize: 14 },
>>>>>>> main
  options: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
<<<<<<< HEAD
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
=======
  rememberMe: { flexDirection: "row", alignItems: "center", gap: 6 },
  rememberText: { fontSize: 13, color: "#555" },
  forgot: { fontSize: 13, color: "#4c6fbf" },
>>>>>>> main
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
<<<<<<< HEAD
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
=======
  register: { flexDirection: "row", justifyContent: "center", marginTop: 14 },
  registerText: { fontSize: 13, color: "#666" },
  registerLink: { fontSize: 13, color: "#4c6fbf", fontWeight: "500" },
>>>>>>> main
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
<<<<<<< HEAD
  footerNote: {
    textAlign: "center",
    fontSize: 11,
    color: "#9ab0c8",
    marginTop: 14,
    lineHeight: 18,
  },
=======
>>>>>>> main
});
