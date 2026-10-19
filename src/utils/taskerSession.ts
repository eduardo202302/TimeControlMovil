// Imports relativos (no "@/"): tsconfig.jest.json no declara el alias.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTaskerCompanyConfig, getTaskerUserClients } from "../constants/taskerMock";
import type {
  TaskerCompanyConfig,
  TaskerUserClient,
} from "../../types/typesTasker/TaskerTypes";
import { parseStoredTaskerClients, parseStoredTaskerConfig } from "./taskerRules";

/**
 * Config de Tasker de la compañía y clientes del usuario, guardados en el
 * teléfono junto al resto de la sesión. Van en AsyncStorage y NO en
 * SecureStore: la lista de clientes con direcciones puede pasar de ~2 KB (el
 * tope de SecureStore en Android) y no contiene secretos.
 */
export const TASKER_CONFIG_STORAGE_KEY = "taskerConfig";
export const TASKER_CLIENTS_STORAGE_KEY = "taskerClients";

export interface TaskerSession {
  config: TaskerCompanyConfig;
  clients: TaskerUserClient[];
}

/**
 * Lee config y clientes de Tasker (hoy, del mock) y los guarda en el
 * teléfono. Al iniciar sesión y al cambiar de empresa. No toca el store: lo
 * hace quien arma la sesión, junto con lo demás. Si no se puede guardar, igual
 * devuelve los datos (el próximo arranque en frío los vuelve a cargar).
 */
export async function loadAndPersistTaskerSession(): Promise<TaskerSession> {
  const session: TaskerSession = {
    config: getTaskerCompanyConfig(),
    clients: getTaskerUserClients(),
  };
  try {
    await Promise.all([
      AsyncStorage.setItem(TASKER_CONFIG_STORAGE_KEY, JSON.stringify(session.config)),
      AsyncStorage.setItem(TASKER_CLIENTS_STORAGE_KEY, JSON.stringify(session.clients)),
    ]);
  } catch (error) {
    console.warn(
      "No se pudo guardar la sesión de Tasker:",
      error instanceof Error ? error.message : "error desconocido",
    );
  }
  return session;
}

/**
 * Arranque en frío: lo guardado si las dos claves son válidas; si falta alguna
 * o está corrupta (JSON inválido), se ignora y se vuelve a cargar.
 */
export async function restoreTaskerSession(): Promise<TaskerSession> {
  try {
    const [configRaw, clientsRaw] = await Promise.all([
      AsyncStorage.getItem(TASKER_CONFIG_STORAGE_KEY),
      AsyncStorage.getItem(TASKER_CLIENTS_STORAGE_KEY),
    ]);
    const config = parseStoredTaskerConfig(configRaw);
    const clients = parseStoredTaskerClients(clientsRaw);
    if (config && clients) return { config, clients };
  } catch {
    // Sin lectura posible: se recarga.
  }
  return loadAndPersistTaskerSession();
}

/** Limpieza de cierre de sesión. Nunca lanza. */
export async function clearTaskerSession(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(TASKER_CONFIG_STORAGE_KEY),
      AsyncStorage.removeItem(TASKER_CLIENTS_STORAGE_KEY),
    ]);
  } catch {
    // Lo que quede se pisa en el próximo inicio de sesión.
  }
}
