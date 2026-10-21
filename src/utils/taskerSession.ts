// Imports relativos (no "@/"): tsconfig.jest.json no declara el alias.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TaskerSession } from "../../types/typesTasker/TaskerTypes";
import {
  mapTaskerSession,
  mergeDefaultAddressDuplicates,
  TASKER_DISCONNECTED_CONFIG,
} from "./taskerApi";
import { parseStoredTaskerClients, parseStoredTaskerConfig } from "./taskerRules";

export type { TaskerSession };

/**
 * Config de Tasker de la compañía y clientes del usuario, guardados en el
 * teléfono junto al resto de la sesión. Van en AsyncStorage y NO en
 * SecureStore: la lista de clientes con direcciones puede pasar de ~2 KB (el
 * tope de SecureStore en Android) y no contiene secretos.
 *
 * Las claves llevan versión: se sube cuando cambia la forma o los datos, así
 * lo de una versión anterior nunca se lee (queda en claves que ya no se
 * consultan y se borran al arrancar). v3: datos reales de chooseschool (v2
 * eran los de ejemplo).
 */
export const TASKER_STORAGE_VERSION = "v3";
export const TASKER_CONFIG_STORAGE_KEY = `taskerConfig:${TASKER_STORAGE_VERSION}`;
export const TASKER_CLIENTS_STORAGE_KEY = `taskerClients:${TASKER_STORAGE_VERSION}`;
/** Claves de versiones anteriores: sin sufijo y v2 (datos de ejemplo). */
export const TASKER_LEGACY_STORAGE_KEYS = [
  "taskerConfig",
  "taskerClients",
  "taskerConfig:v2",
  "taskerClients:v2",
] as const;

/** Sin datos de Tasker: no conectada y sin clientes (Reportar se oculta). */
function disconnectedSession(): TaskerSession {
  return { config: { ...TASKER_DISCONNECTED_CONFIG }, clients: [] };
}

/**
 * Saca config y clientes de Tasker del `data` de chooseschool
 * (mapTaskerSession) y los guarda en el teléfono. Al iniciar sesión y al
 * cambiar de empresa. Sin `data` (chooseschool falló) → no conectada. No toca
 * el store: lo hace quien arma la sesión, junto con lo demás. Si no se puede
 * guardar, igual devuelve los datos.
 */
export async function persistTaskerSession(chooseSchoolData: unknown): Promise<TaskerSession> {
  const session = mapTaskerSession(chooseSchoolData);
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
 * Arranque en frío: lo guardado si las dos claves son válidas. Si falta alguna
 * o está corrupta, no hay de dónde volver a leerlo (solo viene en
 * chooseschool): queda no conectada hasta el próximo inicio de sesión o
 * cambio de empresa. No escribe nada. Lo guardado antes de la fusión de
 * duplicados (mergeDefaultAddressDuplicates) se fusiona al leerlo.
 */
export async function restoreTaskerSession(): Promise<TaskerSession> {
  try {
    const [configRaw, clientsRaw] = await Promise.all([
      AsyncStorage.getItem(TASKER_CONFIG_STORAGE_KEY),
      AsyncStorage.getItem(TASKER_CLIENTS_STORAGE_KEY),
    ]);
    const config = parseStoredTaskerConfig(configRaw);
    const clients = parseStoredTaskerClients(clientsRaw);
    if (config && clients) return { config, clients: clients.map(mergeDefaultAddressDuplicates) };
  } catch {
    // Sin lectura posible: igual que sin datos.
  }
  return disconnectedSession();
}

/**
 * Arranque: borra las claves de versiones anteriores si quedaron de una
 * instalación anterior. Nunca lanza (si no se puede, igual nadie las lee).
 */
export async function removeLegacyTaskerStorage(): Promise<void> {
  try {
    await Promise.all(TASKER_LEGACY_STORAGE_KEYS.map((key) => AsyncStorage.removeItem(key)));
  } catch {
    // Se reintenta en el próximo arranque.
  }
}

/** Limpieza de cierre de sesión (claves con versión). Nunca lanza. */
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
