import axios from "axios";
import { ClaveRegistroType } from "../types/typesAuthorization/claveRegistroType";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const api = axios.create({
  baseURL: `${API_URL}`,
  headers: { "Content-Type": "application/json" },
});

const authorization = async (data: ClaveRegistroType) => {
  const { claveRegistro } = data;
  try {
    const response = await api.get(`/schools/pin/${claveRegistro}`);
    if (!response) throw new Error("Error en la solicitud de autorización.");
    return response.data;
  } catch (error) {
    console.error("Error en la autorización:", error);
    throw new Error(
      "Error en la autorización. Por favor, verifica tu clave de registro.",
    );
  }
};

export { authorization };

