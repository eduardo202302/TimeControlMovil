import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { useSchoolStore } from "../../store/useSchoolStore";
import { LoginType } from "../../types/typesLogin/LoginType";

const loginAuthentication = async (data: LoginType) => {
  const urlSchool = useSchoolStore.getState().urlColegio;
  const userName = data.usuario.trim();
  const password = data.password.trim();

  const api = axios.create({
    baseURL: urlSchool || "",
    headers: { "Content-Type": "application/json" },
  });

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
    return {
      success: false,
      data: null,
      message: "Error de conexión. Verifica tu red.",
    };
  }
};

export { loginAuthentication };

