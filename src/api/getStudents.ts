import axios from "axios";
import * as Storage from "../utils/storage";
import { decodeJWT } from "../utils/session";

export interface Student {
  id: number;
  fullName: string;
}

interface GetStudentsResponse {
  success: boolean;
  message: string;
  data: {
    items: Student[];
    count: number;
  };
}

export const getStudents = async (): Promise<Student[]> => {
  try {
    // 🔐 obtener datos guardados del login
    const url = await Storage.getItemAsync("urlColegio");
    const token = await Storage.getItemAsync("token");

    // 🔒 scope: solo los estudiantes del padre/tutor logueado
    const parentId = token ? decodeJWT(token).parentId : undefined;
    const hasValidParentId =
      typeof parentId === "number" && Number.isFinite(parentId);
    if (!hasValidParentId) {
      console.warn(
        "⚠️ getStudents: token sin parentId, no debería pasar para rol Padres/Tutores",
      );
    }

    // 🚀 petición al backend
    const response = await axios.get<GetStudentsResponse>(
      `${url}/students`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        ...(hasValidParentId && { params: { parentId } }),
      },
    );

    // 👇 devuelve solo la lista de estudiantes (respuesta paginada)
    return response.data.data?.items ?? [];

  } catch (error) {
    console.log("❌ Error al obtener estudiantes:", error);
    return [];
  }
};