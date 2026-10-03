import { RADIUS_3XL, RADIUS_LG, useResponsive } from "@/constants/responsive";
import {
  AUTH_BANNER_ERROR_BG,
  AUTH_BANNER_ERROR_BORDER,
  AUTH_BANNER_ERROR_TEXT,
  AUTH_BANNER_SUCCESS_BG,
  AUTH_BANNER_SUCCESS_BORDER,
  AUTH_BANNER_SUCCESS_TEXT,
  AUTH_BRAND,
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
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { validateUser } from "../../../api/Login/loginAuthentication";
import { ValidateUser } from "../../../types/typesLogin/ForgotPasswordType";
import { ERROR_COLOR, PRIMARY_700 } from "@/constants/colors";
import { SHADOW_LG, SHADOW_PRIMARY } from "@/constants/shadows";
import { useAuthTheme } from "@/hooks/useAuthTheme";
import type { AuthTheme } from "../../utils/authThemeRules";
import AuthBrandHeader from "./AuthBrandHeader";

interface FormForgotPasswordProps {
  onNext: () => void;
}

export default function FormForgotPassword({ onNext }: FormForgotPasswordProps) {
  const { scale, verticalScale, font } = useResponsive();
  const theme = useAuthTheme();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font, theme),
    [scale, verticalScale, font, theme],
  );
  const inputStyles = useMemo(
    () => createLocalStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "error" | "success";
  } | null>(null);

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
        <Text style={styles.formTitle}>Cambiar Contraseña</Text>
        <Text style={styles.formSubtitle}>Ingresar:</Text>

        <Controller
          name="user"
          control={control}
          rules={{ required: "El usuario es requerido" }}
          render={({ field, fieldState }) => (
            <>
              <InputField
                styles={inputStyles}
                icon="person-outline"
                placeholder="Usuario"
                value={field.value}
                onChangeText={field.onChange}
              />
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
      borderColor: PRIMARY_700,
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
    logoCompanies: {
      fontSize: font(20),
      fontWeight: "600",
      color: AUTH_BRAND,
      marginBottom: verticalScale(16),
    },
    card: {
      ...SHADOW_LG,
      backgroundColor: AUTH_CARD_BACKGROUND,
      borderRadius: RADIUS_3XL,
      padding: scale(18),
      paddingTop: scale(26),
      marginHorizontal: -scale(8),
    },
    formTitle: {
      fontSize: font(17),
      fontWeight: "600",
      color: theme.titleColor,
      marginBottom: verticalScale(8),
    },
    formSubtitle: {
      fontSize: font(14),
      color: AUTH_MUTED_TEXT,
      marginBottom: verticalScale(14),
    },
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
    register: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: verticalScale(14),
    },
    registerText: { fontSize: font(13), color: AUTH_MUTED_TEXT },
    registerLink: { fontSize: font(13), color: PRIMARY_700, fontWeight: "600" },
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
