import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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
  AUTH_PLACEHOLDER,
  AUTH_REQUIRED,
  AUTH_SCREEN_BACKGROUND,
  AUTH_TEXT,
} from "@/constants/authColors";
import { registerUser } from "../../api/Login/loginAuthentication";
import { registerSchema } from "../../schema/registerSchema";
import { useSchoolStore } from "../../store/useSchoolStore";
import { RegisterType } from "../../types/typesLogin/RegisterType";
import { formatCedula, formatPhone } from "../../utils/metodos";
import * as Storage from "../utils/storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ERROR_COLOR } from "@/constants/colors";
import { SHADOW_LG, SHADOW_PRIMARY } from "@/constants/shadows";
import AuthBrandHeader from "@/components/login/AuthBrandHeader";
import { useAuthTheme } from "@/hooks/useAuthTheme";

export default function Register() {
  // Sin SafeAreaView: la raíz reserva la status bar con el inset (edge-to-edge).
  const insets = useSafeAreaInsets();
  // `school` (del PIN) sigue mandando en lo funcional: cédula visible y
  // requerida. La marca del encabezado sale de lastCompany (AuthBrandHeader).
  const { school } = useSchoolStore();
  const theme = useAuthTheme();
  const themed = useMemo(
    () => ({
      button: {
        shadowColor: theme.buttonShadowColor,
        backgroundColor: theme.buttonBackground,
      },
      buttonText: { color: theme.buttonText },
      cardTitle: { color: theme.titleColor },
    }),
    [theme],
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "error" | "success";
  } | null>(null);

  useEffect(() => {
    const check = async () => {
      const isAuthorized = await Storage.getItemAsync("isAuthorized");

      if (isAuthorized === "true") {
        setShowAuth(false);
      } else {
        setShowAuth(true);
      }
    };
    check();
  }, []);

  const valuesDefault: RegisterType = {
    fullName: "",
    nickName: "",
    email: "",
    phone: "",
    password: "",
    cedula: "",
  };

  const { handleSubmit, control } = useForm<RegisterType>({
    defaultValues: valuesDefault,
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterType) => {
    const response = await registerUser(data);
    console.log("Respuesta del registro:", response);
    if (response.success) {
      setMensaje({
        texto: "Registro exitoso. Redirigiendo al login...",
        tipo: "success",
      });

      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } else {
      setMensaje({
        texto: response.message || "Error en el registro.",
        tipo: "error",
      });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={0}
      style={{
        flex: 1,
        backgroundColor: AUTH_SCREEN_BACKGROUND,
        paddingTop: insets.top,
      }}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.phone}>
          <View style={styles.card}>
            <AuthBrandHeader />

            {mensaje && (
              <View
                style={[
                  styles.msg,
                  mensaje.tipo === "error"
                    ? styles.msgError
                    : styles.msgSuccess,
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
            <Text style={[styles.cardTitle, themed.cardTitle]}>
              Registro de Usuario
            </Text>
            <Controller
              name="fullName"
              control={control}
              rules={{ required: "El nombre es requerido" }}
              render={({ field, fieldState }) => (
                <>
                  <InputField
                    icon="person-outline"
                    placeholder="Nombre Completo"
                    value={field.value}
                    onChangeText={field.onChange}
                  />
                  {fieldState.error && (
                    <Text style={{ color: ERROR_COLOR, marginTop: 4 }}>
                      {fieldState.error.message}
                    </Text>
                  )}
                </>
              )}
            />
            <Controller
              name="nickName"
              control={control}
              render={({ field, fieldState }) => (
                <>
                  <InputField
                    icon="people-outline"
                    placeholder="Usuario"
                    value={field.value || ""}
                    onChangeText={field.onChange}
                    required={false}
                  />
                  {fieldState.error && (
                    <Text style={{ color: ERROR_COLOR, marginTop: 4 }}>
                      {fieldState.error.message}
                    </Text>
                  )}
                </>
              )}
            />
            <Controller
              name="email"
              control={control}
              rules={{ required: "El email es requerido" }}
              render={({ field, fieldState }) => (
                <>
                  <InputField
                    icon="mail-outline"
                    placeholder="Email"
                    value={field.value}
                    onChangeText={field.onChange}
                    keyboardType="email-address"
                  />
                  {fieldState.error && (
                    <Text style={{ color: ERROR_COLOR, marginTop: 4 }}>
                      {fieldState.error.message}
                    </Text>
                  )}
                </>
              )}
            />
            <Controller
              name="phone"
              control={control}
              rules={{ required: "El teléfono es requerido" }}
              render={({ field, fieldState }) => (
                <>
                  <InputField
                    icon="call-outline"
                    placeholder="Teléfono"
                    value={field.value}
                    onChangeText={(text) => {
                      field.onChange(formatPhone(text));
                    }}
                    keyboardType="phone-pad"
                  />
                  {fieldState.error && (
                    <Text style={{ color: ERROR_COLOR, marginTop: 4 }}>
                      {fieldState.error.message}
                    </Text>
                  )}
                </>
              )}
            />
            <Controller
              name="password"
              control={control}
              rules={{ required: "La contraseña es requerida" }}
              render={({ field, fieldState }) => (
                <>
                  <InputField
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
                          name={
                            showPassword ? "eye-off-outline" : "eye-outline"
                          }
                          size={15}
                          color={AUTH_ICON_BUTTON}
                        />
                      </TouchableOpacity>
                    }
                  />
                  {fieldState.error && (
                    <Text style={{ color: ERROR_COLOR, marginTop: 4 }}>
                      {fieldState.error.message}
                    </Text>
                  )}
                </>
              )}
            />
            {school?.settings.cedula && (
              <Controller
                name="cedula"
                control={control}
                rules={{
                  required: school?.settings.cedulaRequerida
                    ? "La cédula es requerida"
                    : false,
                }}
                render={({ field, fieldState }) => (
                  <>
                    <InputField
                      icon="card-outline"
                      placeholder="Cédula"
                      value={field.value || ""}
                      onChangeText={(text) => {
                        field.onChange(formatCedula(text));
                      }}
                      keyboardType="numeric"
                      required={school?.settings.cedulaRequerida}
                    />
                    {fieldState.error && (
                      <Text style={{ color: ERROR_COLOR, marginTop: 4 }}>
                        {fieldState.error.message}
                      </Text>
                    )}
                  </>
                )}
              />
            )}
            <TouchableOpacity
              style={[styles.button, themed.button]}
              onPress={handleSubmit(onSubmit)}
            >
              <Text style={[styles.buttonText, themed.buttonText]}>
                Regístrate
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.buttonOutline}
              onPress={() => router.back()}
            >
              <Text style={styles.buttonOutlineText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type InputFieldProps = {
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
  const { accentColor } = useAuthTheme();
  return (
    <View style={styles.labelGroup}>
      <Text style={styles.label}>
        {placeholder} {required && <Text style={styles.required}>*</Text>}
      </Text>
      <View
        style={[
          styles.inputGroup,
          focused && [styles.inputFocused, { borderColor: accentColor }],
        ]}
      >
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

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: AUTH_SCREEN_BACKGROUND,
  },
  phone: {
    width: "100%",
    maxWidth: 480,
    padding: 4,
  },
  card: {
    ...SHADOW_LG,
    borderRadius: 32,
    padding: 18,
    paddingTop: 26,
    marginHorizontal: -8,
    backgroundColor: AUTH_CARD_BACKGROUND,
  },
  // color: themed.cardTitle (useAuthTheme)
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 14,
  },
  labelGroup: {
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    color: AUTH_LABEL,
    marginBottom: 4,
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
    borderRadius: 12,
    paddingHorizontal: 10,
    backgroundColor: AUTH_INPUT_BACKGROUND,
  },
  // borderColor: accentColor (useAuthTheme) en InputField
  inputFocused: {
    borderWidth: 1.5,
  },
  inputIcon: {
    marginRight: 8,
  },
  clearButton: {
    marginLeft: 2,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: AUTH_TEXT,
  },
  // backgroundColor/shadowColor: themed.button (useAuthTheme)
  button: {
    ...SHADOW_PRIMARY,
    padding: 13,
    borderRadius: 12,
    marginTop: 16,
  },
  // color: themed.buttonText (useAuthTheme)
  buttonText: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonOutline: {
    padding: 13,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e24b4a",
  },
  buttonOutlineText: {
    color: "#e24b4a",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "500",
  },
  msg: { marginTop: 10, padding: 8, borderRadius: 6, alignItems: "center" },
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
  msgText: { fontSize: 12 },
});
