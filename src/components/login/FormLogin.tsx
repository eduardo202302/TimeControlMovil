import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
import { getMenuItems } from "../../../api/menu/getMenuItems";
import { getRoleById } from "../../../api/Roles/getRoles";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { LoginType } from "../../../types/typesLogin/LoginType";
import * as Storage from "../../utils/storage";
import {
  RADIUS_MD,
  RADIUS_SM,
  RADIUS_XL,
  RADIUS_3XL,
  useResponsive,
} from "@/constants/responsive";

interface FormLoginProps {
  name?: string;
  image?: string;
}

function decodeJWT(token: string): Record<string, any> {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

export default function FormLogin({ name, image }: FormLoginProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "error" | "success";
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  const { urlColegio, setMenuResolution, setRole } = useSchoolStore();

  const { handleSubmit, control, setValue } = useForm<LoginType>({
    defaultValues: { usuario: "", password: "" },
  });

  useEffect(() => {
    const cargarCredenciales = async () => {
      const usuarioGuardado = await Storage.getItemAsync("usuario");
      const passwordGuardado = await Storage.getItemAsync("password");
      const recordar = await Storage.getItemAsync("recordarme");
      if (recordar === "true" && usuarioGuardado && passwordGuardado) {
        setValue("usuario", usuarioGuardado);
        setValue("password", passwordGuardado);
        setRemember(true);
      }
    };
    cargarCredenciales();
  }, []);

  const onSubmit = async (data: LoginType) => {
    setLoading(true);
    setMensaje(null);

    try {
      const response = await loginAuthentication(data);

      if (response.success) {
        const { token } = response.data;
        const schedules =
          response.data.user?.schoolUsers?.[0]?.userSchedules ??
          response.data.userSchedules ??
          [];

        const currentUrl =
          urlColegio ?? useSchoolStore.getState().urlColegio ?? "";

        const jwtPayload = decodeJWT(token);

        // Llamar getMenuItems y getRoleById en paralelo
        const [menuItems, role] = await Promise.all([
          getMenuItems(currentUrl, token),
          getRoleById(currentUrl, token, jwtPayload.roleId), // Guardar el rol en el store
        ]);
        if (role) {
          setRole(role);
        }

        // Armar user completo con menu real del rol
        const fullUser = {
          ...response.data,
          roleId: jwtPayload.roleId,
          role: {
            id: jwtPayload.roleId,
            name: jwtPayload.roleName,
            permissions: {},
            menu: role?.menu ?? [],
            defaultMenu: role?.defaultMenu ?? null,
          },
          school: useSchoolStore.getState().school ?? {},
          userSchedules: schedules,
        };

        // Resolver app + ruta + árbol de menú
        setMenuResolution(fullUser as any, menuItems);

        // Persistir en SecureStore
        await Storage.setItemAsync("isAuthorized", "true");
        await Storage.setItemAsync("token", token);
        await Storage.setItemAsync("urlColegio", currentUrl);
        await Storage.setItemAsync("user", JSON.stringify(fullUser));
        await Storage.setItemAsync("menuItems", JSON.stringify(menuItems));

        setMensaje({
          texto: "Autenticación exitosa. Redirigiendo...",
          tipo: "success",
        });

        router.replace((useSchoolStore.getState().role?.defaultMenu?.path ?? "/login") as never);

        if (remember) {
          await Storage.setItemAsync("usuario", data.usuario);
          await Storage.setItemAsync("password", data.password);
          await Storage.setItemAsync("recordarme", "true");
        } else {
          await Storage.deleteItemAsync("usuario");
          await Storage.deleteItemAsync("password");
          await Storage.deleteItemAsync("recordarme");
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
    }
  };

  return (
    <View style={styles.phone}>
      <View style={styles.companies}>
        <View>
          <Image
            source={require("../../../assets/images/logos/logoMini.png")}
            style={styles.logoImage}
          />
        </View>
        <View>
          <Text style={styles.logoTitle}>FaceClass</Text>
        </View>
      </View>
      <View style={styles.logo}>
        {urlColegio && name ? (
          <Image
            source={{ uri: `${urlColegio}/${image}` }}
            style={styles.logoImage}
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
          <TouchableOpacity onPress={() => router.push("/forgotPassword")}>
            <Text style={styles.forgot}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
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
          <TouchableOpacity onPress={() => router.push("/register")}>
            <Text style={styles.registerLink}>Crear cuenta</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    companies: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    /** Ancho ideal de formulario, no un cap de emergencia — no tokenizar. */
    phone: {
      width: "90%",
      maxWidth: 360,
      padding: scale(25),
      borderRadius: RADIUS_3XL,
      backgroundColor: "#eef4ff",
    },
    errorText: {
      color: "#EF4444",
      fontSize: font(11),
      marginTop: verticalScale(4),
      marginLeft: scale(4),
      marginBottom: verticalScale(4),
    },
    logo: { alignItems: "center", marginBottom: verticalScale(27) },
    /** Tamaño fijo: iconografía de logo, no contenido — mismo criterio que avatarContainer en DrawerMenu.tsx. */
    logoImage: { width: 100, height: 100 },
    logoTitle: {
      fontSize: font(20),
      fontWeight: "600",
      color: "#3c5fa6",
      marginTop: verticalScale(6),
    },
    card: {
      backgroundColor: "white",
      borderRadius: RADIUS_XL,
      padding: scale(20),
    },
    cardTitle: {
      fontSize: font(17),
      fontWeight: "600",
      color: "#333",
      marginBottom: verticalScale(14),
    },
    inputGroup: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#ddd",
      borderRadius: RADIUS_SM,
      paddingHorizontal: scale(10),
      marginBottom: verticalScale(12),
    },
    inputIcon: { marginRight: scale(8) },
    input: { flex: 1, paddingVertical: verticalScale(10), fontSize: font(14) },
    options: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: verticalScale(4),
    },
    rememberMe: { flexDirection: "row", alignItems: "center", gap: scale(6) },
    rememberText: { fontSize: font(13), color: "#555" },
    forgot: { fontSize: font(13), color: "#4c6fbf" },
    button: {
      backgroundColor: "#2d5fd3",
      padding: scale(13),
      borderRadius: RADIUS_MD,
      marginTop: verticalScale(18),
    },
    buttonText: {
      color: "white",
      textAlign: "center",
      fontSize: font(15),
      fontWeight: "500",
    },
    register: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: verticalScale(14),
    },
    registerText: { fontSize: font(13), color: "#666" },
    registerLink: { fontSize: font(13), color: "#4c6fbf", fontWeight: "500" },
    msg: {
      marginTop: verticalScale(10),
      padding: scale(8),
      borderRadius: scale(6),
      alignItems: "center",
    },
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
    msgText: { fontSize: font(12) },
  });
}
