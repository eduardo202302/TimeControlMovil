import { useMemo } from "react";
import { useSchoolStore } from "../../store/useSchoolStore";
import { resolveAuthTheme, type AuthTheme } from "../utils/authThemeRules";

/** Tema de las pantallas de acceso según los colores de la compañía actual. */
export function useAuthTheme(): AuthTheme {
  const school = useSchoolStore((state) => state.school);
  return useMemo(() => resolveAuthTheme(school), [school]);
}
