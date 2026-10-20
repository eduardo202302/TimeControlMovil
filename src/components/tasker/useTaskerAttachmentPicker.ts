import { useCallback, useState } from "react";
import { ActionSheetIOS, Alert, Platform } from "react-native";
import type { UserPhotoSource } from "../users/pickUserPhoto";
import type { TaskerAttachment } from "../../../types/typesTasker/TaskerTypes";
import {
  fitTaskerAttachments,
  getDataUriFileBytes,
  type TaskerAttachmentLimit,
} from "../../utils/taskerRules";
import { pickTaskerPdf, pickTaskerPhoto } from "./pickTaskerAttachment";

type AttachmentSource = UserPhotoSource | "pdf";

const OPTIONS: { source: AttachmentSource; label: string }[] = [
  { source: "camera", label: "Tomar foto" },
  { source: "gallery", label: "Galería" },
  { source: "pdf", label: "Archivo PDF" },
];

/**
 * Menú "Tomar foto / Galería / Archivo PDF" de la ventana de comentarios
 * (Reportar Avería y Seguimiento). Los avisos de permiso y de error son los
 * mismos de la foto de Usuarios (UserBasicInfoTab).
 *
 * `limit`: tope de archivos reales de todo el envío (Reportar Avería), con lo
 * que ya pesan los otros comentarios. Aplica a fotos y PDF; los que no caben
 * se avisan como los rechazos del selector. Sin `limit` (Seguimiento), solo
 * los topes de pickAttachments.
 *
 * En iOS es un ActionSheet con "Cancelar"; en Android, un Alert de tres
 * botones (el máximo de Android) que se cierra tocando fuera.
 */
export function useTaskerAttachmentPicker(
  attachments: TaskerAttachment[],
  onAdd: (added: TaskerAttachment[]) => void,
  limit?: TaskerAttachmentLimit,
) {
  const [busy, setBusy] = useState(false);

  const pick = useCallback(
    async (source: AttachmentSource) => {
      /** Aplica el tope del envío (si hay) y avisa lo que no entró. */
      const addWithinLimit = (added: TaskerAttachment[], rejected: string[] = []) => {
        let accepted = added;
        const notAdded = [...rejected];
        if (limit) {
          const used =
            limit.usedElsewhere +
            attachments.reduce((sum, a) => sum + getDataUriFileBytes(a.dataUri), 0);
          const fit = fitTaskerAttachments(added, used, limit.maxBytes);
          accepted = fit.accepted;
          notAdded.push(...fit.rejected);
        }
        if (accepted.length > 0) onAdd(accepted);
        if (notAdded.length > 0) {
          Alert.alert("Adjuntos", `No se adjuntaron: ${notAdded.join(", ")}`);
        }
      };

      setBusy(true);
      try {
        if (source === "pdf") {
          const usedBytes = attachments.reduce((sum, a) => sum + a.dataUri.length, 0);
          const result = await pickTaskerPdf(usedBytes);
          if (result.canceled) return;
          addWithinLimit(result.accepted, result.rejected);
          return;
        }
        const result = await pickTaskerPhoto(source);
        if (result.status === "ok") addWithinLimit([result.attachment]);
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
    [attachments, onAdd, limit],
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
