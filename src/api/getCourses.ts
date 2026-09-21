import axios from "axios";
import {
  buildCourseSearchParams,
  COURSE_PAGE_SIZE,
  toCourseOption,
  type CourseOption,
} from "../utils/attendanceRules";

export interface SearchCoursesResult {
  items: CourseOption[];
  count: number;
}

/**
 * GET /courses con los mismos params que el selector "Seleccionar
 * Curso/Sección" de Asistencia Adm. en el webapp (ver
 * buildCourseSearchParams): solo cursos con una clase en curso AHORA
 * (`activeAttendance: "1"`), ordenados por nombre y paginados de a 12. Nunca
 * lanza — un fallo deja la lista vacía (mismo patrón que searchStudents).
 */
export const searchCourses = async (
  query: string,
  { token, urlColegio }: { token: string; urlColegio: string },
  page = 1,
): Promise<SearchCoursesResult> => {
  try {
    const response = await axios.get(`${urlColegio}/courses`, {
      headers: { Authorization: `Bearer ${token}` },
      params: buildCourseSearchParams({ query, page, rows: COURSE_PAGE_SIZE }),
    });
    if (!response.data?.success) return { items: [], count: 0 };
    const data = response.data.data ?? {};
    const items = (Array.isArray(data.items) ? data.items : [])
      .map(toCourseOption)
      .filter((c: CourseOption | null): c is CourseOption => c !== null);
    const count = typeof data.count === "number" ? data.count : items.length;
    return { items, count };
  } catch (error: any) {
    console.error("searchCourses:", error?.response?.data?.message ?? error?.message);
    return { items: [], count: 0 };
  }
};
