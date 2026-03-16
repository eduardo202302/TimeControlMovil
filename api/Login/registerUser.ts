import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { useSchoolStore } from "../../store/useSchoolStore";
import { RegisterType } from "../../types/typesLogin/RegisterType";

const registerUser = async (data: RegisterType) => {
  const urlSchool = useSchoolStore.getState().urlColegio;
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
    schoolUser: {
      roleId: 1,
    },
    tagIds: [data.userType],
  };

  try {
    const response = await api.post("/users", payload);
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

export { registerUser };

