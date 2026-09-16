import axios from "axios";
import * as Storage from "../utils/storage";

/**
 * Los estudiantes de TODA la escuela, para el selector del modal de creación
 * de excusas administrativas.
 *
 * El backend (Students/handlers.js → getTableStudents) filtra SIEMPRE por el
 * `schoolId` que trae el JWT — por eso este fetch NO manda `parentId` (el
 * admin ve la escuela entera, no solo sus hijos) y además `schoolId` no se
 * puede (ni se debe) mandar nunca desde el cliente: el backend lo saca del
 * JWT, así que un rol admin no podría ver estudiantes de otra escuela aunque
 * lo pidiera.
 *
 * OJO con el `all`: es el filtro de búsqueda del motor genérico de tablas
 * (getTableQuery) y viene del mismo `fields`. Sobre el backend real no es una
 * proyección de columnas — los datos que viajan los decide el
 * `.withGraphFetched('course')` del handler — pero se manda por paridad con el
 * webapp (StudentsSelector: `fields: [...], all: searchQuery`).
 */
const ADMIN_STUDENT_FIELDS =
  "fullName,code,id,photourl,course.fullName,course.listNumber";

/** Filas por página del selector. Fijo: el buscador del modal es client-side. */
export const ADMIN_STUDENTS_ROWS = 200;

/**
 * `course` es ManyToMany (Students.js: `extra: ['date','status','listNumber']`
 * cuelga `listNumber` de la tabla `enrollments`). Igual que el webapp
 * (ClientSelectorModal usa `course[0]`), se tipa como arreglo.
 */
export interface AdminStudent {
  id: number;
  fullName: string;
  code?: string | null;
  photourl?: string | null;
  course?: { fullName?: string | null; listNumber?: number | null }[];
}

export interface AdminStudentsPage {
  items: AdminStudent[];
  count: number;
}

/**
 * Fetch.. utilizado por el picker de estudiantes del modal admin de excusas.
 * Busca en el servidor cuando `search` trae texto ("all") y devuelve un chunk
 * de `ADMIN_STUDENTS_ROWS`; la lista completa (sin search) se cachea en el
 * modal y el filtrado de la sheet va client-side.
 */
export async function fetchAdminStudents({
  search = "",
  page = 1,
  rows = ADMIN_STUDENTS_ROWS,
}: {
  search?: string;
  page?: number;
  rows?: number;
} = {}): Promise<AdminStudentsPage> {
  try {
    // 🔐 obtener datos guardados del login
    const url = await Storage.getItemAsync("urlColegio");
    const token = await Storage.getItemAsync("token");

    if (!url || !token) return { items: [], count: 0 };

    // 🚀 petición al backend (deliberadamente SIN parentId: escuela completa)
    const response = await axios.get<{
      success: boolean;
      data?: { items?: AdminStudent[]; count?: number };
    }>(`${url}/students`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        fields: ADMIN_STUDENT_FIELDS,
        orderKey: "fullName",
        orderDir: "asc",
        page,
        rows,
        ...(search.trim() ? { all: search.trim() } : {}),
      },
    });

    if (!response.data?.success) return { items: [], count: 0 };

    const data = response.data.data;
    return {
      items: data?.items ?? [],
      count: typeof data?.count === "number" ? data.count : (data?.items?.length ?? 0),
    };
  } catch (error) {
    console.log("❌ Error al obtener estudiantes:", error);
    return { items: [], count: 0 };
  }
}