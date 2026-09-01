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
                  placeholderTextColor="#9aa4b4"
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
    logo: {
      alignItems: "center",
      marginBottom: verticalScale(27),
    },
    /** Tamaño fijo: iconografía de logo, no contenido — mismo criterio que avatarContainer en DrawerMenu.tsx. */
    logoImage: { width: 100, height: 100 },
    logoTitle: {
      fontSize: font(20),
      fontWeight: "600",
      color: "#3c5fa6",
      marginTop: verticalScale(10),
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
      padding: scale(40),
    },
    formTitle: {
      fontSize: font(20),
      fontWeight: "600",
      color: "#3c5fa6",
      marginBottom: verticalScale(8),
    },
    formSubtitle: {
      fontSize: font(20),
      color: "#3c5fa6",
      marginBottom: verticalScale(20),
    },
    inputGroup: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#ddd",
      borderRadius: RADIUS_SM,
      paddingHorizontal: scale(5),

      marginBottom: verticalScale(12),
    },
    inputIcon: {
      marginRight: scale(8),
    },
    input: {
      width: "90%",
      fontSize: font(14),
      color: "#111",
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
    registerText: {
      fontSize: font(13),
      color: "#666",
    },
    registerLink: {
      fontSize: font(13),
      color: "#4c6fbf",
      fontWeight: "500",
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
