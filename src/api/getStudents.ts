import axios from "axios";
import * as SecureStore from "expo-secure-store";

export const getStudents = async () => {
  try {
    //  obtener datos guardados del login
    const url = await SecureStore.getItemAsync("urlColegio");
    const token = await SecureStore.getItemAsync("token");

    //  petición al backend
    const response = await axios.get(`${url}/students`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    //  devuelve solo la data
    return response.data.data;

  } catch (error) {
    console.log(" Error al obtener estudiantes:", error);
    return [];
  }
};