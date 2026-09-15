import axios from "axios";
import * as Storage from "../utils/storage";
import { decodeJWT } from "../utils/session";

/**
 * Mismo criterio de `fields` que `apiConfig.fields` de StudentsSelector en el
 * webapp. OJO: contra el backend real (Students/handlers.js →
 * utils.getTableQuery) `fields` solo alimenta el filtro de búsqueda "all"
 * (que esta pantalla no usa) — no es una proyección de columnas. Se manda
 * igual por paridad con el webapp, pero no limita ni agrega nada a la
 * respuesta: el backend siempre hace `.withGraphFetched('course')` y
 * devuelve la fila completa, tenga o no `fields`.
 */
const STUDENT_FIELDS = "fullName,code,id,photourl,course.fullName,course.listNumber";

/**
 * `course` es ManyToMany (un estudiante puede tener varias matrículas) —
 * confirmado en Students.js: `extra: ['date','status','listNumber']` cuelga
 * `listNumber` de cada curso vía la tabla `enrollments`. El webapp accede
 * siempre a `course[0]` (ClientSelectorModal.jsx), nunca a `course` como
 * objeto suelto — se tipa igual acá.
 */
export interface Student {
  id: number;
  fullName: string;
  code?: string | null;
  photourl?: string | null;
  course?: { fullName?: string | null; listNumber?: number | null }[];
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
        params: {
          fields: STUDENT_FIELDS,
          ...(hasValidParentId ? { parentId } : {}),
        },
      },
    );

    // 👇 devuelve solo la lista de estudiantes (respuesta paginada)
    return response.data.data?.items ?? [];

  } catch (error) {
    console.log("❌ Error al obtener estudiantes:", error);
    return [];
  }
};
