import IkarFlatList from "@/components/login/IkarFlatList";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
<<<<<<< HEAD
import { registerUser } from "../../api/Login/registerUser";
=======
import { registerUser } from "../../api/Login/loginAuthentication";
>>>>>>> main
import { useSchoolStore } from "../../store/useSchoolStore";
import { RegisterType } from "../../types/typesLogin/RegisterType";
import { formatCedula, formatPhone } from "../../utils/metodos";

export default function Register() {
  const { school, urlColegio } = useSchoolStore();
  const { name, logo } = school || {};
  const [showPassword, setShowPassword] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
<<<<<<< HEAD
=======
  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "error" | "success";
  } | null>(null);
>>>>>>> main

  useEffect(() => {
    const check = async () => {
      const isAuthorized = await SecureStore.getItemAsync("isAuthorized");

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
    userType: 0,
    cedula: "",
  };

  const { handleSubmit, control } = useForm<RegisterType>({
    defaultValues: valuesDefault,
  });

  const onSubmit = async (data: RegisterType) => {
    const response = await registerUser(data);
<<<<<<< HEAD
    console.log("Form Data:", data);
=======
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
>>>>>>> main
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#dfe9ff" }}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.phone}>
          <View style={styles.companies}>
            <View>
              <Text style={styles.logoTitle}>FaceClass</Text>
            </View>
          </View>
          <View style={styles.logo}>
            <Image
              source={{ uri: `${urlColegio}/${logo}` }}
              style={{ width: 100, height: 100 }}
            />
            <Text style={styles.logoTitle}>{name}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Registro de Usuario</Text>
<<<<<<< HEAD
=======
            {mensaje && (
              <View style={{ marginBottom: 10 }}>
                <Text
                  style={{
                    color: mensaje.tipo === "error" ? "red" : "green",
                    textAlign: "center",
                  }}
                >
                  {mensaje.texto}
                </Text>
              </View>
            )}
>>>>>>> main
            <Controller
              name="userType"
              control={control}
              rules={{ required: "El usuario es requerido" }}
              render={({ field, fieldState }) => (
                <>
                  <IkarFlatList
                    data={school?.tags}
                    label="Tipo de Usuario"
                    placeholder="Seleccionar"
                    value={field.value}
                    onValueChange={field.onChange}
                    labelColor="#050101bd"
                    rowColor="#67a2d51a"
                    searchIconColor="#091124b3"
                    modalheight={500}
                    panelColor="#dfeff2"
                    required={true}
                  />
                  {fieldState.error && (
                    <Text style={{ color: "#e24b4a", marginTop: 4 }}>
                      {fieldState.error.message}
                    </Text>
                  )}
                </>
              )}
            />
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
                    <Text style={{ color: "#e24b4a", marginTop: 4 }}>
                      {fieldState.error.message}
                    </Text>
                  )}
                </>
              )}
            />
            <Controller
              name="nickName"
              control={control}
              rules={{ required: "El nombre de usuario es requerido" }}
              render={({ field, fieldState }) => (
                <>
                  <InputField
                    icon="people-outline"
                    placeholder="Usuario"
                    value={field.value}
                    onChangeText={field.onChange}
                  />
                  {fieldState.error && (
                    <Text style={{ color: "#e24b4a", marginTop: 4 }}>
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
                    <Text style={{ color: "#e24b4a", marginTop: 4 }}>
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
                    <Text style={{ color: "#e24b4a", marginTop: 4 }}>
                      {fieldState.error.message}
                    </Text>
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
                    icon="lock-closed-outline"
                    placeholder="Clave"
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
                    <Text style={{ color: "#e24b4a", marginTop: 4 }}>
                      {fieldState.error.message}
                    </Text>
                  )}
                </>
              )}
            />
            <Controller
              name="cedula"
              control={control}
              rules={{ required: false }}
              render={({ field, fieldState }) => (
                <>
                  <InputField
                    icon="card-outline"
                    placeholder="Cédula"
                    value={field.value}
                    onChangeText={(text) => {
                      field.onChange(formatCedula(text));
                    }}
                    keyboardType="numeric"
                    required={false}
                  />
                  {fieldState.error && (
                    <Text style={{ color: "#e24b4a", marginTop: 4 }}>
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
              <Text style={styles.buttonText}>Iniciar Sesión</Text>
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
    backgroundColor: "#dfe9ff",
  },
  companies: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  phone: {
    width: "100%",
    maxWidth: 360,
    padding: 25,
    borderRadius: 32,
    backgroundColor: "#eef4ff",
  },
  logo: {
    alignItems: "center",
    marginBottom: 20,
  },
  logoTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#3c5fa6",
    marginTop: 6,
  },
  card: {
    borderRadius: 33,
    padding: 20,
    backgroundColor: "white",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
    marginBottom: 14,
  },
  labelGroup: {
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    color: "#555",
    marginBottom: 4,
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
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f9fbff",
  },
  inputFocused: {
    borderColor: "#4c6fbf",
    borderWidth: 1.5,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: "#333",
  },
  button: {
    backgroundColor: "#2d5fd3",
    padding: 13,
    borderRadius: 10,
    marginTop: 16,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "500",
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
<<<<<<< HEAD
=======
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
>>>>>>> main
});
