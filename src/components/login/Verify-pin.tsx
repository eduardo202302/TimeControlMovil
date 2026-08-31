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
import { validatePin } from "../../../api/Login/loginAuthentication";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { ValidaPin } from "../../../types/typesLogin/ForgotPasswordType";
import {
  RADIUS_MD,
  RADIUS_XL,
  RADIUS_3XL,
  useResponsive,
} from "@/constants/responsive";

interface FormLoginProps {
  name?: string;
  image?: string;
  onNext: () => void; // función para avanzar al siguiente paso
}

const VerifyPin = ({ name, image, onNext }: FormLoginProps) => {
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

  const valueDefault: ValidaPin = {
    pin: "",
  };

  const { handleSubmit, control, setValue } = useForm<ValidaPin>({
    defaultValues: valueDefault,
  });

  const onSubmit = async (data: ValidaPin) => {
    const respoaense = await validatePin(data);
    console.log("Respuesta de validación PIN:", respoaense);
    if (!respoaense.success) {
      setMensaje({ texto: respoaense.message, tipo: "error" });
      return;
    }
    onNext(); // avanzar al siguiente paso después de enviar el formulario
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.phone}>
        {/* Header empresa */}
        <View style={styles.companies}>
          <Text style={styles.logoCompanies}>FaceClass</Text>
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
                { color: mensaje.tipo === "error" ? "#b54a00" : "#0a6644" },
              ]}
            >
              {mensaje.texto}
            </Text>
          </View>
        )}

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cambiar Contraseña</Text>

          <Text style={styles.pinLabel}>Ingresar PIN:</Text>

          <Controller
            name="pin"
            control={control}
            rules={{ required: "El pin es requerido" }}
            render={({ field, fieldState }) => (
              <>
                <View style={styles.inputGroup}>
                  <Ionicons
                    name="key-outline"
                    size={12}
                    color="#9aa4b4"
                    style={styles.inputIcon}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="Código PIN"
                    value={field.value}
                    onChangeText={field.onChange}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>

                {fieldState.error && (
                  <Text style={styles.errorText}>
                    {fieldState.error.message}
                  </Text>
                )}
              </>
            )}
          />

          {/* Botón */}
          <TouchableOpacity
            style={styles.button}
            onPress={handleSubmit(onSubmit)}
          >
            <Text style={styles.buttonText}>Enviar</Text>
          </TouchableOpacity>

          {/* Volver */}
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};
export default VerifyPin;

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
    logoCompanies: {
      fontSize: font(20),
      fontWeight: "600",
      color: "#3c5fa6",
      marginBottom: verticalScale(16),
    },
    logoTitle: {
      fontSize: font(20),
      fontWeight: "600",
      color: "#3c5fa6",
      marginTop: verticalScale(10),
    },
    card: {
      backgroundColor: "white",
      borderRadius: RADIUS_XL,
      padding: scale(50),
    },
    cardTitle: {
      fontSize: font(17),
      fontWeight: "600",
      color: "#3c5fa6",
      marginBottom: verticalScale(14),
    },
    pinLabel: {
      fontSize: font(18),
      color: "#3c5fa6",
      marginBottom: verticalScale(20),
    },
    logo: {
      alignItems: "center",
      marginBottom: verticalScale(27),
    },
    /** Tamaño fijo: iconografía de logo, no contenido — mismo criterio que avatarContainer en DrawerMenu.tsx. */
    logoImage: { width: 100, height: 100 },
    /** Ancho ideal de formulario, no un cap de emergencia — no tokenizar. */
    phone: {
      width: "90%",
      maxWidth: 360,
      padding: scale(25),
      borderRadius: RADIUS_3XL,
      backgroundColor: "#eef4ff",
    },
    inputGroup: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#ddd",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      marginBottom: verticalScale(15),
    },
    inputIcon: {
      marginRight: scale(8),
    },
    input: {
      width: "86%",
      paddingVertical: verticalScale(10),
      letterSpacing: 4,
      textAlign: "center",
      fontSize: font(18),
    },
    button: {
      backgroundColor: "#2d5fd3",
      padding: scale(14),
      borderRadius: RADIUS_MD,
    },
    buttonText: {
      color: "white",
      textAlign: "center",
      fontWeight: "600",
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
