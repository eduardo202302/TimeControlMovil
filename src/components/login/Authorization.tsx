import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { authorization } from "../../../api/authorization";
import { ClaveRegistroType } from "../../../types/typesAuthorization/claveRegistroType";

const Authorization = ({ onClose }: { onClose: () => void }) => {
  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "error" | "success";
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCard, setShowCard] = useState(true);
  const valueDefault: ClaveRegistroType = { claveRegistro: "" };

  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const ripple3 = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;

  const { handleSubmit, control } = useForm<ClaveRegistroType>({
    defaultValues: valueDefault,
  });

  const onSubmit = async (data: ClaveRegistroType) => {
    if (!data.claveRegistro.trim()) {
      setMensaje({
        texto: "Por favor ingrese su clave de registro.",
        tipo: "error",
      });
      return;
    }
    try {
      const response = await authorization(data);
      setLoading(true);
      if (response.data) {
        setMensaje({
          texto: "Dispositivo autorizado correctamente.",
          tipo: "success",
        });
        setTimeout(() => {
          setShowCard(false);
          onClose();
        }, 500);
      } else {
        setMensaje({ texto: "Clave de registro inválida.", tipo: "error" });
        return;
      }
    } catch (error) {
      setMensaje({ texto: "Clave de registro inválida.", tipo: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const createRipple = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );

    createRipple(ripple1, 0).start();
    createRipple(ripple2, 650).start();
    createRipple(ripple3, 1300).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.2,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  const getRippleStyle = (anim: Animated.Value) => ({
    transform: [
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.55, 1.55],
        }),
      },
    ],
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
  });

  if (!showCard) return null;

  return (
    <View style={styles.card}>
      <View style={styles.stripe} />
      <View style={styles.cardHead}>
        <View style={styles.rippleWrap}>
          <Animated.View style={[styles.ripple, getRippleStyle(ripple1)]} />
          <Animated.View style={[styles.ripple, getRippleStyle(ripple2)]} />
          <Animated.View style={[styles.ripple, getRippleStyle(ripple3)]} />
          <View style={styles.iconCore}>
            <Ionicons name="document-text-outline" size={32} color="#ff9800" />
          </View>
          <View style={styles.errBadge}>
            <Ionicons name="close" size={12} color="#fff" />
          </View>
        </View>
        <Text style={styles.cardTitle}>Dispositivo no registrado</Text>
        <Text style={styles.cardSub}>ACCESO DENEGADO</Text>
      </View>

      <View style={styles.statusBar}>
        <Animated.View style={[styles.dot, { opacity: blink }]} />
        <Text style={styles.statusTxt}>DISPOSITIVO NO AUTORIZADO</Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color="#f57c00"
            style={{ marginTop: 2 }}
          />
          <Text style={styles.infoText}>
            Solicita tu{" "}
            <Text style={{ fontWeight: "bold" }}>Clave de Registro</Text> al
            administrador del sistema de tu empresa, para habilitar este
            dispositivo.
          </Text>
        </View>

        <Text style={styles.inputLabel}>Clave de Registro</Text>
        <Controller
          name="claveRegistro"
          control={control}
          rules={{ required: "La clave es requerida" }}
          render={({ field, fieldState }) => (
            <>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="lock-closed-outline"
                  size={16}
                  color="#9ab0c8"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Ingrese tu Clave"
                  placeholderTextColor="#9ab0c8"
                  onChangeText={field.onChange}
                  value={field.value}
                />
              </View>
              {fieldState.error && (
                <Text style={styles.errorText}>{fieldState.error.message}</Text>
              )}
            </>
          )}
        />

        <TouchableOpacity
          style={[styles.sendBtn, loading && { backgroundColor: "#0a6644" }]}
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.sendBtnText}>Verificando...</Text>
            </>
          ) : (
            <>
              <Ionicons name="send-outline" size={16} color="#fff" />
              <Text style={styles.sendBtnText}>Enviar clave</Text>
            </>
          )}
        </TouchableOpacity>

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

        <Text style={styles.footerNote}>
          ¿No tiene su clave? Contacte a su{"\n"}administrador de sistemas.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  stripe: { height: 10, backgroundColor: "#f57c00" },
  cardHead: {
    backgroundColor: "#0f1e42",
    paddingBottom: 22,
    alignItems: "center",
  },
  rippleWrap: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
    marginBottom: 14,
  },
  ripple: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: "rgba(255,138,0,0.7)",
  },
  iconCore: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "#1a2a52",
    borderWidth: 2.5,
    borderColor: "#f57c00",
    alignItems: "center",
    justifyContent: "center",
  },
  errBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#f57c00",
    borderWidth: 2.5,
    borderColor: "#0f1e42",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  cardSub: {
    color: "#ffb74d",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.8,
  },
  statusBar: {
    backgroundColor: "#1c0f00",
    borderTopWidth: 1,
    borderTopColor: "#4a2800",
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#f57c00" },
  statusTxt: {
    color: "#ffb74d",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 11,
    marginTop: 4,
    marginLeft: 4,
    marginBottom: 4,
  },
  cardBody: { backgroundColor: "#fff", padding: 20 },
  infoBox: {
    backgroundColor: "#fff8f0",
    borderWidth: 1,
    borderColor: "#ffcc80",
    borderRadius: 8,
    padding: 12,
    marginBottom: 18,
    flexDirection: "row",
    gap: 10,
  },
  infoText: { fontSize: 13, color: "#5a2d00", lineHeight: 20, flex: 1 },
  inputLabel: {
    fontSize: 12,
    color: "#5a7a9a",
    marginBottom: 5,
    fontWeight: "500",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#ccd6e0",
    borderRadius: 7,
    paddingHorizontal: 12,
    height: 48,
  },
  input: { flex: 1, fontSize: 14, color: "#111", letterSpacing: 1 },
  inputIcon: { marginRight: 8 },
  sendBtn: {
    backgroundColor: "#1B3A6B",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
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
  footerNote: {
    textAlign: "center",
    fontSize: 11,
    color: "#9ab0c8",
    marginTop: 14,
    lineHeight: 18,
  },
});

export default Authorization;
