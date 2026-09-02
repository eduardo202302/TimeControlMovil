import axios from "axios";
import { router } from "expo-router";
import { useSchoolStore } from "../../store/useSchoolStore";
import * as Storage from "./storage";

/**
 * Decodifica el payload de un JWT (sin verificar firma). Útil para leer
 * `exp` y otros claims. Devuelve objeto vacío si no se puede decodificar.
 */
export function decodeJWT(token: string): Record<string, any> {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

/** Segundos desde la epoch de 1970 hasta ahora (mismo formato que `exp` de un JWT). */
function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Indica si un token JWT ya expiró. Si no tiene `exp` (o no se puede leer),
 * se considera válido (no bloquea). Un token sin exp lo maneja el backend.
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token);
  const exp = payload.exp;
  if (typeof exp !== "number") return false;
  return nowInSeconds() >= exp;
}

/**
 * Limpia TODAS las credenciales de sesión del SecureStore y del store.
 * `isAuthorized` NO se borra (es la autorización física del dispositivo,
 * no de la sesión del usuario).
 */
export async function clearSession(): Promise<void> {
  await Promise.all([
    Storage.deleteItemAsync("token"),
    Storage.deleteItemAsync("user"),
    Storage.deleteItemAsync("menuItems"),
    Storage.deleteItemAsync("photourl"),
    Storage.deleteItemAsync("s3Photo"),
  ]);
}

/** Cierra la sesión y redirige al login. Idempotente: seguro llamarla varias veces. */
export async function forceLogout(): Promise<void> {
  const { token } = useSchoolStore.getState();
  if (token !== null) {
    // Al pasar token a null, el observador en _layout redirige a /login
    useSchoolStore.getState().logout();
  }
  await clearSession();
  router.replace("/login");
}

let logoutInProgress = false;

/**
 * Registra un interceptor de respuesta global en axios. Si cualquier llamada
 * devuelve 401 (credenciales inválidas / token expirado), cierra la sesión de
 * forma segura e idempotente y vuelve al login.
 *
 * Debe llamarse UNA sola vez al arrancar la app (p. ej. en _layout).
 */
export function setupAxiosInterceptors(): void {
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status;
      // Sólo reaccionamos a errores de autorización. Los demás (red, 4xx, 5xx)
      // fluyen normalmente a cada catch local.
      if (status === 401) {
        if (!logoutInProgress) {
          logoutInProgress = true;
          forceLogout()
            .catch(() => {
              // ante cualquier fallo de limpieza igual intentamos redirigir
              router.replace("/login");
            })
            .finally(() => {
              logoutInProgress = false;
            });
        }
      }
      return Promise.reject(error);
    },
  );
}
