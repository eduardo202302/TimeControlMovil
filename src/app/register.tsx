import IkarFlatList from "@/components/login/IkarFlatList";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
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
import { useSchoolStore } from "../../store/useSchoolStore";

export default function Register() {
  const [showPassword, setShowPassword] = useState(false);
  const [userType, setUserType] = useState("");
  const [nombre, setNombre] = useState("");
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [cedula, setCedula] = useState("");
  const [showAuth, setShowAuth] = useState(false);

  const { school, urlColegio } = useSchoolStore();
  const { name, logo } = school || {};

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

            <IkarFlatList
              data={school?.tags}
              label="Tipo de Usuario"
              placeholder="Seleccionar"
              value={userType}
              onValueChange={setUserType}
              labelColor="#050101bd"
              rowColor="#67a2d51a"
              searchIconColor="#091124b3"
              modalheight={500}
              panelColor="#dfeff2"
              required={true}
            />

            <InputField
              icon="person-outline"
              placeholder="Nombre Completo"
              value={nombre}
              onChangeText={setNombre}
            />
            <InputField
              icon="people-outline"
              placeholder="Usuario"
              value={nombreUsuario}
              onChangeText={setNombreUsuario}
            />
            <InputField
              icon="mail-outline"
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <InputField
              icon="call-outline"
              placeholder="Teléfono"
              value={telefono}
              onChangeText={setTelefono}
              keyboardType="phone-pad"
            />
            <InputField
              icon="lock-closed-outline"
              placeholder="Clave"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              rightIcon={
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color="#999"
                  />
                </TouchableOpacity>
              }
            />
            <InputField
              icon="card-outline"
              placeholder="Cédula"
              value={cedula}
              onChangeText={setCedula}
              keyboardType="numeric"
              required={false}
            />

            <TouchableOpacity
              style={styles.button}
              onPress={() => router.replace("/home")}
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
});
