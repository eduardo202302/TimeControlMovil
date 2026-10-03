import { useMemo } from "react";
import { useSchoolStore } from "../../store/useSchoolStore";
import {
  resolveAuthThemeFromColors,
  type AuthTheme,
} from "../utils/authThemeRules";

/**
 * Tema de las pantallas de acceso según la última compañía con la que se
 * entró en este dispositivo (`lastCompany.colors`). Sin lastCompany devuelve
 * DEFAULT_AUTH_THEME. No lee `school.settings.colors`: el `school` del PIN
 * puede agrupar varias compañías y no dice a cuál va a entrar el usuario.
 */
export function useAuthTheme(): AuthTheme {
  const colors = useSchoolStore((state) => state.lastCompany?.colors);
  return useMemo(() => resolveAuthThemeFromColors(colors), [colors]);
}
