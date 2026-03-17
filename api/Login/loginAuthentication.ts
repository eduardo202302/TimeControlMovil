import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { useSchoolStore } from "../../store/useSchoolStore";
import {
  ValidaPin,
  ValidateUser,
} from "../../types/typesLogin/ForgotPasswordType";
import { LoginType } from "../../types/typesLogin/LoginType";
import { RegisterType } from "../../types/typesLogin/RegisterType";

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

const registerUser = async (data: RegisterType) => {
  const urlSchool = useSchoolStore.getState().urlColegio;
  const dataSchool = useSchoolStore.getState().school;
  const api = axios.create({
    baseURL: urlSchool || "",
    headers: { "Content-Type": "application/json" },
  });

  const payload = {
    user: {
      fullName: data.fullName,
      nickName: data.nickName,
      email: data.email,
      phone: data.phone,
      password: data.password,
      cedula: data.cedula || null,
    },
    tagIds: [data.userType],
    token: dataSchool?.token,
  };

  try {
    const response = await api.post("/authentication/register", payload);
    const { success, data: responseData, message } = response.data;

    if (success) {
      await SecureStore.setItemAsync("token", responseData.token);
      await SecureStore.setItemAsync("user", JSON.stringify(responseData.user));
    }

    return { success, data: responseData, message };
  } catch (error) {
    console.error("Error en el registro:", error);
    return {
      success: false,
      data: null,
      message: "Error de conexión. Verifica tu red.",
    };
  }
};

const validateUser = async (user: ValidateUser) => {
  try {
    const urlSchool = useSchoolStore.getState().urlColegio;
    const api = axios.create({
      baseURL: urlSchool || "",
      headers: { "Content-Type": "application/json" },
    });
    const response = await api.post("/authentication/forgotpassword", {
      userName: user.user.trim(),
    });
    return response.data;
  } catch (error) {
    console.error("Error al validar el usuario:", error);
    return { success: false, message: "Error de conexión. Verifica tu red." };
  }
};

const validatePin = async (pin: ValidaPin) => {
  try {
    const urlSchool = useSchoolStore.getState().urlColegio;

    const api = axios.create({
      baseURL: urlSchool || "",
      headers: { "Content-Type": "application/json" },
    });
    const response = await api.post("/authentication/verifypin", {
      pin: pin.pin.trim(),
    });
    useSchoolStore.getState().setTokenPassword(response.data.data);
    console.log("Token de validación PIN almacenado:", response.data.data);

    return response.data;
  } catch (error) {
    console.error("Error al validar el PIN:", error);
    return { success: false, message: "Error de conexión. Verifica tu red." };
  }
};

const resetPassword = async (data: { password: string }) => {
  try {
    const urlSchool = useSchoolStore.getState().urlColegio;
    const token = useSchoolStore.getState().tokenPassword;

    const api = axios.create({
      baseURL: urlSchool || "",
      headers: { "Content-Type": "application/json" },
    });

    const response = await api.post("/authentication/resetpassword", {
      password: data.password.trim(),
      token: token,
    });

    console.log("Respuesta de reset password (API):", response.data);
    return response.data;
  } catch (error) {
    console.error("Error al restablecer la contraseña:", error);
    return { success: false, message: "Error de conexión. Verifica tu red." };
  }
};

export {
  loginAuthentication,
  registerUser,
  resetPassword,
  validatePin,
  validateUser
};

