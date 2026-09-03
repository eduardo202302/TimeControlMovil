import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
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
import {
  RADIUS_MD,
  RADIUS_XL,
  RADIUS_3XL,
  useResponsive,
} from "@/constants/responsive";

export default function ResetPassword({
  name,
  image,
}: {
  name?: string;
  image?: string;
}) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );
  const inputStyles = useMemo(
    () => createLocalStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

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
        texto: "Las contraseÃ±as no coinciden",
        tipo: "error",
      });
      return;
    }

    const response = await resetPassword({ password: data.password });

    console.log("Respuesta de reset password:", response);

    if (!response.success) {
      setMensaje({
        texto: response.message || "Error al restablecer la contraseÃ±a",
        tipo: "error",
      });
      return;
    }

    setMensaje({
      texto: "ContraseÃ±a actualizada correctamente",
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
          <Image
            source={require("../../../assets/images/logos/logoMini.png")}
            style={styles.logoImage}
          />
          <Text style={styles.logoTitle}>FaceClass</Text>
        </View>

        {/* Logo colegio */}
        <View style={styles.logo}>
          {urlColegio && image ? (
            <Image
              source={{ uri: `${urlColegio}/${image}` }}
              style={styles.logoImage}
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
          <Text style={styles.cardTitle}>Nueva ContraseÃ±a</Text>

          {/* Password */}
          <Controller
            name="password"
            control={control}
            rules={{ required: "La contraseÃ±a es requerida" }}
            render={({ field, fieldState }) => (
              <>
                <InputField
                  styles={inputStyles}
                  icon="lock-closed-outline"
                  placeholder="Nueva contraseÃ±a"
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
                        color="#999"
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
            rules={{ required: "Confirma la contraseÃ±a" }}
            render={({ field, fieldState }) => (
              <>
                <InputField
                  styles={inputStyles}
                  icon="lock-closed-outline"
                  placeholder="Confirmar contraseÃ±a"
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
                        color="#999"
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
            <Text style={styles.buttonText}>Cambiar contraseÃ±a</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/login")}>
            <Text style={styles.back}>Volver al login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
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
          color="#9aa4b4"
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#bbb"
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
            <Ionicons name="close-circle" size={12} color="#999" />
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
      color: "#555",
      marginBottom: verticalScale(4),
      fontWeight: "500",
    },
    required: {
      color: "#e24b4a",
    },
    inputGroup: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#ddd",
      borderRadius: scale(8),
      paddingHorizontal: scale(10),
      backgroundColor: "#f9fbff",
    },
    inputFocused: {
      borderColor: "#4c6fbf",
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
      color: "#333",
    },
  });
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
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
    logoTitle: {
      fontSize: font(20),
      fontWeight: "600",
      color: "#3c5fa6",
      marginTop: verticalScale(6),
    },
    card: {
      backgroundColor: "white",
      borderRadius: RADIUS_XL,
      padding: scale(18),
      marginHorizontal: -scale(12),
    },
    cardTitle: {
      fontSize: font(17),
      fontWeight: "600",
      color: "#333",
      marginBottom: verticalScale(18),
    },
    logo: { alignItems: "center", marginBottom: verticalScale(27) },
    logoImage: { width: 100, height: 100 },
    phone: {
      width: "90%",
      maxWidth: 480,
      padding: scale(25),
      borderRadius: RADIUS_3XL,
      backgroundColor: "#eef4ff",
    },
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
    errorText: {
      color: "red",
      textAlign: "center",
      marginBottom: verticalScale(10),
    },
    back: {
      marginTop: verticalScale(15),
      textAlign: "center",
      color: "#2d5fd3",
    },
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

