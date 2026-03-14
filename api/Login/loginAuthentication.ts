import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { LoginType } from "../../types/typesLogin/LoginType";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const api = axios.create({
  baseURL: "http://192.168.100.5:8600",
  headers: { "Content-Type": "application/json" },
});

const loginAuthentication = async (data: LoginType) => {
  const userName = data.usuario.trim(); // ← quita espacios
  const password = data.password.trim();
  try {
    const response = await api.post("/authentication/login", {
      userName,
      password,
    });
    const { success, data: responseData, message } = response.data;

    if (success) {
      await SecureStore.setItemAsync("token", responseData.token);
      await SecureStore.setItemAsync("user", JSON.stringify(responseData.user));
    }

    return { success, data: responseData, message };
  } catch (error) {
    console.error("Error en la autenticación:", error);
    throw new Error(
      "Error en la autenticación. Por favor, verifica tus credenciales.",
    );
  }
};

export { loginAuthentication };

