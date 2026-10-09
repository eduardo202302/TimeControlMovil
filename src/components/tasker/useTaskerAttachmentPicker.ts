import { useCallback, useState } from "react";
import { ActionSheetIOS, Alert, Platform } from "react-native";
import type { UserPhotoSource } from "../users/pickUserPhoto";
import type { TaskerAttachment } from "../../../types/typesTasker/TaskerTypes";
import { pickTaskerPdf, pickTaskerPhoto } from "./pickTaskerAttachment";

type AttachmentSource = UserPhotoSource | "pdf";

const OPTIONS: { source: AttachmentSource; label: string }[] = [
  { source: "camera", label: "Tomar foto" },
  { source: "gallery", label: "Galería" },
  { source: "pdf", label: "Archivo PDF" },
];

/**
 * Menú "Tomar foto / Galería / Archivo PDF" compartido por Reportar Avería y
 * el formulario de comentarios. Los avisos de permiso y de error son los
 * mismos de la foto de Usuarios (UserBasicInfoTab).
 *
 * En iOS es un ActionSheet con "Cancelar"; en Android, un Alert de tres
 * botones (el máximo de Android) que se cierra tocando fuera.
 */
export function useTaskerAttachmentPicker(
  attachments: TaskerAttachment[],
  onAdd: (added: TaskerAttachment[]) => void,
) {
  const [busy, setBusy] = useState(false);

  const pick = useCallback(
    async (source: AttachmentSource) => {
      setBusy(true);
      try {
        if (source === "pdf") {
          const usedBytes = attachments.reduce((sum, a) => sum + a.dataUri.length, 0);
          const result = await pickTaskerPdf(usedBytes);
          if (result.canceled) return;
          if (result.accepted.length > 0) onAdd(result.accepted);
          if (result.rejected.length > 0) {
            Alert.alert("Adjuntos", `No se adjuntaron: ${result.rejected.join(", ")}`);
          }
          return;
        }
        const result = await pickTaskerPhoto(source);
        if (result.status === "ok") onAdd([result.attachment]);
        else if (result.status === "denied") {
          Alert.alert(
            "Permiso requerido",
            source === "camera"
              ? "Necesitas permitir el acceso a la cámara para tomar la foto."
              : "Necesitas permitir el acceso a la galería para adjuntar la foto.",
          );
        } else if (result.status === "error") {
          Alert.alert("Error de Imagen", "No se pudo procesar la imagen.");
        }
      } catch (error: any) {
        console.error("useTaskerAttachmentPicker:", error?.message ?? error);
        Alert.alert("Adjuntos", "No se pudo abrir el selector de archivos.");
      } finally {
        setBusy(false);
      }
    },
    [attachments, onAdd],
  );

  const openPicker = useCallback(() => {
    if (busy) return;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...OPTIONS.map((o) => o.label), "Cancelar"], cancelButtonIndex: OPTIONS.length },
        (index) => {
          if (index < OPTIONS.length) pick(OPTIONS[index].source);
        },
      );
      return;
    }
    Alert.alert(
      "Adjuntar",
      undefined,
      OPTIONS.map((o) => ({ text: o.label, onPress: () => pick(o.source) })),
      { cancelable: true },
    );
  }, [busy, pick]);

  return { busy, openPicker };
}
