import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { resetPassword } from "../../../api/Login/loginAuthentication";
import { NewPasswordType } from "../../../types/typesLogin/ForgotPasswordType";
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
  AUTH_PLACEHOLDER,
  AUTH_REQUIRED,
  AUTH_TEXT,
} from "@/constants/authColors";
import { ERROR_COLOR } from "@/constants/colors";
import { SHADOW_LG, SHADOW_PRIMARY } from "@/constants/shadows";
import { useAuthTheme } from "@/hooks/useAuthTheme";
import type { AuthTheme } from "../../utils/authThemeRules";
import AuthBrandHeader from "./AuthBrandHeader";

export default function ResetPassword() {
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

  const [mensaje, setMensaje] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);

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
    <View style={styles.phone}>
      {/* Card */}
      <View style={styles.card}>
        {/* Marca (última compañía) */}
        <AuthBrandHeader />

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
                  color: mensaje.tipo === "error" ? AUTH_BANNER_ERROR_TEXT : AUTH_BANNER_SUCCESS_TEXT,
                },
              ]}
            >
              {mensaje.texto}
            </Text>
          </View>
        )}

        <Text style={styles.cardTitle}>Nueva Contraseña</Text>

        {/* Password */}
        <Controller
          name="password"
          control={control}
          rules={{ required: "La contraseña es requerida" }}
          render={({ field, fieldState }) => (
            <>
              <InputField
                styles={inputStyles}
                icon="lock-closed-outline"
                placeholder="Nueva contraseña"
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
                      size={18}
                      color={AUTH_ICON_BUTTON}
                    />
                  </TouchableOpacity>
                }
              />
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
              <InputField
                styles={inputStyles}
                icon="lock-closed-outline"
                placeholder="Confirmar contraseña"
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
                      size={18}
                      color={AUTH_ICON_BUTTON}
                    />
                  </TouchableOpacity>
                }
              />
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
      marginBottom: verticalScale(18),
    },
    phone: {
      width: "90%",
      maxWidth: 480,
      padding: scale(4),
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
    errorText: {
      color: ERROR_COLOR,
      textAlign: "center",
      marginBottom: verticalScale(10),
    },
    back: {
      marginTop: verticalScale(15),
      textAlign: "center",
      color: theme.accentColor,
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

