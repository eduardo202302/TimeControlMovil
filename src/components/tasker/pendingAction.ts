import { Alert } from "react-native";

/**
 * TEMPORAL (Tasker): todo botón que necesita el puente de face-class-api
 * llama acá mientras tanto. Al conectar, cada llamada se reemplaza por la
 * acción real — buscar los usos de showPendingAction.
 */
export function showPendingAction(): void {
  Alert.alert("Pendiente", "Esta acción se conecta en la siguiente fase.");
}
