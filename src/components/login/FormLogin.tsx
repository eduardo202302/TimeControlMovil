import { RADIUS_3XL, RADIUS_LG, useResponsive } from "@/constants/responsive";
import {
  AUTH_BANNER_ERROR_BG,
  AUTH_BANNER_ERROR_BORDER,
  AUTH_BANNER_ERROR_TEXT,
  AUTH_BANNER_SUCCESS_BG,
  AUTH_BANNER_SUCCESS_BORDER,
  AUTH_BANNER_SUCCESS_TEXT,
  AUTH_CARD_BACKGROUND,
  AUTH_ICON_BUTTON,
  AUTH_INPUT_BACKGROUND,
  AUTH_INPUT_BORDER,
  AUTH_INPUT_ICON,
  AUTH_LABEL,
  AUTH_MUTED_TEXT,
  AUTH_PLACEHOLDER,
  AUTH_REQUIRED,
  AUTH_TEXT,
} from "@/constants/authColors";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { loginAuthentication } from "../../../api/Login/loginAuthentication";
import { getMenuItems } from "../../../api/menu/getMenuItems";
import {
  buildAttendancesToday,
  useSchoolStore,
} from "../../../store/useSchoolStore";
import { resolveMobilePath } from "../../constants/mobileRoutes";
import { LoginType } from "../../../types/typesLogin/LoginType";
import { SchoolUser } from "../../../types/typeStore/SchoolStoreType";
import * as Storage from "../../utils/storage";
import AuthBrandHeader from "./AuthBrandHeader";
import CompanySelector from "./CompanySelector";
import { ERROR_COLOR, ON_PRIMARY } from "@/constants/colors";
import { SHADOW_LG, SHADOW_PRIMARY } from "@/constants/shadows";
import { useAuthTheme } from "@/hooks/useAuthTheme";
import type { AuthTheme } from "../../utils/authThemeRules";
import {
  buildSessionUser,
  commitSession,
  readChooseSchoolResponse,
  requestChooseSchool,
  type ChooseSchoolData,
} from "../../utils/chooseCompany";

export default function FormLogin() {
  const { scale, verticalScale, font } = useResponsive();
  const theme = useAuthTheme();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font, theme),
    [scale, verticalScale, font, theme],
  );
  const inputStyles = useMemo(
    () => createLocalStyles(scale, verticalScale, font, theme),
    [scale, verticalScale, font, theme],
  );

  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "error" | "success";
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  const [companySelectorVisible, setCompanySelectorVisible] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{
    token: string;
    loginData: any;
    menuItems: any[];
    usuario: string;
    password: string;
  } | null>(null);

  const { urlColegio } = useSchoolStore();

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

  const completeLogin = useCallback(
    async (
      schoolUser: SchoolUser | null,
      loginData: any,
      token: string,
      menuItems: any[],
      usuario: string,
      password: string,
      // `res.data.data` de chooseschool; undefined si no hubo chooseschool
      // (o falló) — ahí no se tocan settings/asistencias/feriado y lastCompany
      // sale de selected.school.
      chooseSchoolData?: ChooseSchoolData,
      // Solo el login multi-compañía guardaba el token re-scopeado en el store.
      storeToken = false,
    ) => {
      const currentUrl =
        urlColegio ?? useSchoolStore.getState().urlColegio ?? "";

      // Persistir credenciales de "Recordarme"
      if (remember) {
        await Storage.setItemAsync("usuario", usuario ?? "");
        await Storage.setItemAsync("password", password ?? "");
        await Storage.setItemAsync("recordarme", "true");
      } else {
        await Storage.deleteItemAsync("usuario");
        await Storage.deleteItemAsync("password");
        await Storage.deleteItemAsync("recordarme");
      }

      // Usuario con el rol de la compañía elegida, y la elegida en
      // schoolUsers[0] (ver buildSessionUser).
      const { user: fullUser, selected } = buildSessionUser(
        schoolUser,
        loginData,
        useSchoolStore.getState().school,
      );

      // SecureStore + lastCompany + store (menú, token, snapshot del día).
      await commitSession({
        user: fullUser,
        selected,
        menuItems,
        token,
        urlColegio: currentUrl,
        chooseSchoolData,
        storeToken,
      });

      setMensaje({
        texto: "Autenticación exitosa. Redirigiendo...",
        tipo: "success",
      });

      router.replace(
        resolveMobilePath(
          useSchoolStore.getState().role?.defaultMenu?.path,
        ) as never,
      );
    },
    [remember, urlColegio],
  );

  const handleSelectCompany = async (schoolUser: SchoolUser) => {
    if (!pendingLogin) return;

    // El token de /login es ambiguo (sin schoolId) — los endpoints protegidos
    // por schoolStrategy lo rechazan. Hay que re-scopearlo a la compañía
    // elegida vía chooseschool antes de completar el login.
    try {
      const baseUrl = urlColegio ?? useSchoolStore.getState().urlColegio ?? "";
      const result = readChooseSchoolResponse(
        await requestChooseSchool(
          baseUrl,
          pendingLogin.token,
          schoolUser.schoolId,
        ),
      );
      if (!result.ok) {
        throw new Error("chooseschool no devolvió un token válido");
      }

      setCompanySelectorVisible(false);
      await completeLogin(
        schoolUser,
        pendingLogin.loginData,
        result.token,
        pendingLogin.menuItems,
        pendingLogin.usuario,
        pendingLogin.password,
        result.data,
        true,
      );
    } catch (error) {
      console.error("Error en chooseschool:", error);
      setMensaje({
        texto: "No se pudo seleccionar la compañía. Intenta de nuevo.",
        tipo: "error",
      });
    }
  };

  const handleCancelCompany = () => {
    setCompanySelectorVisible(false);
    setPendingLogin(null);
    setLoading(false);
  };

  const onSubmit = async (data: LoginType) => {
    setLoading(true);
    setMensaje(null);

    try {
      const response = await loginAuthentication(data);

      if (response.success) {
        const { token } = response.data;
        const schoolUsers = response.data.user?.schoolUsers ?? [];
        // Red de seguridad para la rama en que chooseschool falla y se entra
        // con el token de /login: ese endpoint publica la misma lista, pero
        // bajo `AttendancesToday` (con A mayúscula) y solo cuando el usuario
        // tiene una sola compañía. buildAttendancesToday lee ambas claves.
        // Si chooseschool sí responde, la captura de abajo la pisa con la
        // snapshot buena.
        useSchoolStore
          .getState()
          .setAttendancesToday(buildAttendancesToday(response.data));
        const currentUrl =
          urlColegio ?? useSchoolStore.getState().urlColegio ?? "";

        const [menuItems] = await Promise.all([
          getMenuItems(currentUrl, token),
        ]);

        if (schoolUsers.length > 1) {
          // Usuario pertenece a varias compañías → mostrar selector
          setPendingLogin({
            token,
            loginData: response.data,
            menuItems,
            usuario: data.usuario,
            password: data.password,
          });
          setCompanySelectorVisible(true);
        } else {
          // Una sola compañía → también se re-scopea vía chooseschool: el
          // token de /login es ambiguo (sin schoolId) y los endpoints
          // protegidos por schoolStrategy lo rechazan, y además es lo que
          // alimenta companySettings (categoryDefaultIds de excusas/permisos,
          // schedulesAdd, entryTime, exitTime). Si el re-scopeo falla, se
          // conserva el comportamiento anterior (entrar con el token de login).
          const schoolUser = schoolUsers[0] ?? null;
          if (schoolUser) {
            try {
              const baseUrl =
                urlColegio ?? useSchoolStore.getState().urlColegio ?? "";
              const result = readChooseSchoolResponse(
                await requestChooseSchool(baseUrl, token, schoolUser.schoolId),
              );
              if (result.ok) {
                await completeLogin(
                  schoolUser,
                  response.data,
                  result.token,
                  menuItems,
                  data.usuario,
                  data.password,
                  result.data,
                );
                return;
              }
              console.warn(
                "chooseschool sin éxito en una sola compañía; se sigue con el token de login",
              );
            } catch (error) {
              console.error("chooseschool (una sola compañía):", error);
            }
          }
          await completeLogin(
            schoolUser,
            response.data,
            token,
            menuItems,
            data.usuario,
            data.password,
          );
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
      <View style={styles.card}>
        <AuthBrandHeader />

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
                { color: mensaje.tipo === "error" ? AUTH_BANNER_ERROR_TEXT : AUTH_BANNER_SUCCESS_TEXT },
              ]}
            >
              {mensaje.texto}
            </Text>
          </View>
        )}

        <Text style={styles.cardTitle}>Iniciar Sesión</Text>

        <Controller
          name="usuario"
          control={control}
          rules={{ required: "El usuario es requerido" }}
          render={({ field, fieldState }) => (
            <>
              <InputField
                styles={inputStyles}
                icon="person-outline"
                placeholder="Usuario / Email / Telefono"
                value={field.value}
                onChangeText={field.onChange}
              />
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
              <InputField
                styles={inputStyles}
                icon="lock-closed-outline"
                placeholder="Contraseña"
                value={field.value}
                onChangeText={field.onChange}
                secureTextEntry={!showPassword}
                rightIcon={
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color={AUTH_ICON_BUTTON}
                    />
                  </TouchableOpacity>
                }
              />
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
            <View style={[styles.checkbox, remember && styles.checkboxChecked]}>
              {remember ? (
                <Ionicons name="checkmark" size={12} color={ON_PRIMARY} />
              ) : null}
            </View>
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

      <CompanySelector
        visible={companySelectorVisible}
        companies={pendingLogin?.loginData?.user?.schoolUsers ?? []}
        onSelect={handleSelectCompany}
        onCancel={handleCancelCompany}
      />
    </View>
  );
}

type InputFieldProps = {
  styles: any;
  icon: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: any;
  rightIcon?: React.ReactNode;
  required?: boolean;
};

function InputField({
  styles,
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  rightIcon,
  required = true,
}: InputFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.labelGroup}>
      <Text style={styles.label}>
        {placeholder} {required && <Text style={styles.required}>*</Text>}
      </Text>
      <View style={[styles.inputGroup, focused && styles.inputFocused]}>
        <Ionicons
          name={icon as any}
          size={18}
          color={AUTH_INPUT_ICON}
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={AUTH_PLACEHOLDER}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize="none"
        />
        {value ? (
          <TouchableOpacity
            onPress={() => onChangeText("")}
            style={styles.clearButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={12} color={AUTH_ICON_BUTTON} />
          </TouchableOpacity>
        ) : null}
        {rightIcon}
      </View>
    </View>
  );
}

function createLocalStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
  theme: AuthTheme,
) {
  return StyleSheet.create({
    labelGroup: {
      marginBottom: verticalScale(10),
    },
    label: {
      fontSize: font(13),
      color: AUTH_LABEL,
      marginBottom: verticalScale(4),
      fontWeight: "500",
    },
    required: {
      color: AUTH_REQUIRED,
    },
    inputGroup: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: AUTH_INPUT_BORDER,
      borderRadius: RADIUS_LG,
      paddingHorizontal: scale(10),
      backgroundColor: AUTH_INPUT_BACKGROUND,
    },
    inputFocused: {
      borderColor: theme.accentColor,
      borderWidth: 1.5,
    },
    inputIcon: {
      marginRight: scale(8),
    },
    clearButton: {
      marginLeft: scale(2),
    },
    input: {
      flex: 1,
      paddingVertical: verticalScale(10),
      fontSize: font(14),
      color: AUTH_TEXT,
    },
  });
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
  theme: AuthTheme,
) {
  return StyleSheet.create({
    phone: {
      width: "90%",
      maxWidth: 480,
      padding: scale(4),
    },
    errorText: {
      color: ERROR_COLOR,
      fontSize: font(11),
      marginTop: verticalScale(4),
      marginLeft: scale(4),
      marginBottom: verticalScale(4),
    },
    card: {
      ...SHADOW_LG,
      backgroundColor: AUTH_CARD_BACKGROUND,
      borderRadius: RADIUS_3XL,
      padding: scale(18),
      paddingTop: scale(26),
      marginHorizontal: -scale(8),
    },
    cardTitle: {
      fontSize: font(17),
      fontWeight: "600",
      color: theme.titleColor,
      marginBottom: verticalScale(14),
    },
    options: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: verticalScale(4),
    },
    rememberMe: { flexDirection: "row", alignItems: "center", gap: scale(6) },
    // Caja propia (no el glifo "checkbox" de Ionicons) para poder pintar
    // fondo y borde con el acento y el check en ON_PRIMARY. 16 ≈ la caja
    // visible del antiguo ícono de 18.
    checkbox: {
      width: 16,
      height: 16,
      borderRadius: scale(4),
      borderWidth: 1.5,
      borderColor: theme.accentColor,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxChecked: { backgroundColor: theme.accentColor },
    rememberText: { fontSize: font(13), color: AUTH_LABEL },
    forgot: { fontSize: font(13), color: theme.accentColor },
    button: {
      ...SHADOW_PRIMARY,
      shadowColor: theme.buttonShadowColor,
      backgroundColor: theme.buttonBackground,
      padding: scale(13),
      borderRadius: RADIUS_LG,
      marginTop: verticalScale(18),
    },
    buttonText: {
      color: theme.buttonText,
      textAlign: "center",
      fontSize: font(15),
      fontWeight: "600",
    },
    // gap: separa "¿No tienes cuenta?" de "Crear cuenta" (son dos nodos en
    // fila, el espacio no puede ir dentro del texto).
    register: {
      flexDirection: "row",
      justifyContent: "center",
      gap: scale(4),
      marginTop: verticalScale(14),
    },
    registerText: { fontSize: font(13), color: AUTH_MUTED_TEXT },
    registerLink: {
      fontSize: font(13),
      color: theme.accentColor,
      fontWeight: "600",
    },
    msg: {
      marginTop: verticalScale(10),
      padding: scale(8),
      borderRadius: scale(6),
      alignItems: "center",
    },
    msgError: {
      backgroundColor: AUTH_BANNER_ERROR_BG,
      borderWidth: 1,
      borderColor: AUTH_BANNER_ERROR_BORDER,
    },
    msgSuccess: {
      backgroundColor: AUTH_BANNER_SUCCESS_BG,
      borderWidth: 1,
      borderColor: AUTH_BANNER_SUCCESS_BORDER,
    },
    msgText: { fontSize: font(12) },
  });
}
