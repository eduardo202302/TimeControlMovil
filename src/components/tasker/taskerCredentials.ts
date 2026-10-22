import * as Storage from "../../utils/storage";
import { useSchoolStore } from "../../../store/useSchoolStore";

/**
 * Token y servidor de la sesión, como las demás llamadas a FaceClass (misma
 * lectura que ReportFaultForm). Nunca lanza; sin sesión → null.
 */
export async function getTaskerCredentials(): Promise<{ token: string; urlColegio: string } | null> {
  try {
    const state = useSchoolStore.getState();
    const token = state.token ?? (await Storage.getItemAsync("token"));
    const urlColegio = state.urlColegio ?? (await Storage.getItemAsync("urlColegio"));
    return token && urlColegio ? { token, urlColegio } : null;
  } catch {
    return null;
  }
}
