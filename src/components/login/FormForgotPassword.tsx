import {
  RADIUS_3XL,
  RADIUS_MD,
  RADIUS_XL,
  useResponsive,
} from "@/constants/responsive";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
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
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );
  const inputStyles = useMemo(
    () => createLocalStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

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
        {urlColegio && image ? (
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
    companies: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    phone: {
      width: "90%",
      maxWidth: 480,
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
    logoImage: { width: 100, height: 100 },
    logoTitle: {
      fontSize: font(20),
      fontWeight: "600",
      color: "#3c5fa6",
      marginTop: verticalScale(6),
    },
    logoCompanies: {
      fontSize: font(20),
      fontWeight: "600",
      color: "#3c5fa6",
      marginBottom: verticalScale(16),
    },
    card: {
      backgroundColor: "white",
      borderRadius: RADIUS_XL,
      padding: scale(18),
      marginHorizontal: -scale(12),
    },
    formTitle: {
      fontSize: font(17),
      fontWeight: "600",
      color: "#333",
      marginBottom: verticalScale(8),
    },
    formSubtitle: {
      fontSize: font(14),
      color: "#666",
      marginBottom: verticalScale(14),
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
