import axios from "axios";
import * as Storage from "../utils/storage";

export const getStudents = async () => {
  try {
    // 🔐 obtener datos guardados del login
    const url = await Storage.getItemAsync("urlColegio");
    const token = await Storage.getItemAsync("token");

    // 🚀 petición al backend
    const response = await axios.get(`${url}/students`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // 👇 devuelve solo la data
    return response.data.data;

  } catch (error) {
    console.log("❌ Error al obtener estudiantes:", error);
    return [];
  }
};