import { pickAttachments } from "../permissions/pickAttachments";
import { pickUserPhoto, type UserPhotoSource } from "../users/pickUserPhoto";
import type { TaskerAttachment } from "../../../types/typesTasker/TaskerTypes";

/**
 * Adjuntos de Tasker: solo imágenes (comprimidas a JPEG por pickUserPhoto,
 * mismos parámetros que el webapp) y PDF.
 */

const PDF_MIME = "application/pdf";

export type PickTaskerPhotoResult =
  | { status: "ok"; attachment: TaskerAttachment }
  | { status: "canceled" }
  | { status: "denied" }
  | { status: "error" };

export async function pickTaskerPhoto(source: UserPhotoSource): Promise<PickTaskerPhotoResult> {
  const result = await pickUserPhoto(source);
  if (result.status !== "ok") return result;
  const stamp = Date.now();
  return {
    status: "ok",
    attachment: {
      id: `foto-${stamp}`,
      name: `foto-${stamp}.jpg`,
      mimeType: "image/jpeg",
      dataUri: result.dataUrl,
    },
  };
}

export interface PickTaskerPdfResult {
  canceled: boolean;
  accepted: TaskerAttachment[];
  /** Nombres (con motivo) de lo que no entró. */
  rejected: string[];
}

/** `usedBytes`: lo que ya pesan los adjuntos de la lista (ver pickAttachments). */
export async function pickTaskerPdf(usedBytes: number): Promise<PickTaskerPdfResult> {
  const result = await pickAttachments(usedBytes);
  if (result.canceled) return { canceled: true, accepted: [], rejected: [] };

  const accepted: TaskerAttachment[] = [];
  const rejected = [...result.rejected];
  for (const file of result.accepted) {
    if (file.mimeType === PDF_MIME) {
      accepted.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        dataUri: file.dataUri,
        size: file.size,
      });
    } else {
      rejected.push(`${file.name} (solo imágenes o PDF)`);
    }
  }
  return { canceled: false, accepted, rejected };
}
