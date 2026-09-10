import * as DocumentPicker from "expo-document-picker";
import * as FileSystemLegacy from "expo-file-system/legacy";
import type { PermissionAttachment } from "../timeoff/RevisionFinalModal";

/** Tope por archivo antes de convertirlo a base64 — el data-URI pesa ~1.34x. */
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Tope del cuerpo completo. El límite real del PATCH/POST es 20 MB
 * (routes.js, payload.maxBytes); se corta en 18 MB por lo que el cliente no
 * puede medir (headers, escapes del JSON). Mismo criterio que
 * SolicitarPermisoForm.
 */
export const MAX_PAYLOAD_BYTES = 18 * 1024 * 1024;

/** El backend descarta cualquier adjunto de 100 chars o menos. */
const MIN_DATA_URI_LENGTH = 100;

export interface PickAttachmentsResult {
  canceled: boolean;
  accepted: PermissionAttachment[];
  /** Nombres (con motivo) de lo que no entró. */
  rejected: string[];
}

/**
 * Abre el selector y devuelve los archivos ya como data-URI.
 *
 * `usedBytes` es lo que ya pesa el request: se descuenta archivo por archivo
 * dentro de la misma tanda para aceptar los que caben y rechazar solo los que
 * desbordan.
 */
export async function pickAttachments(usedBytes: number): Promise<PickAttachmentsResult> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: "*/*",
  });
  if (result.canceled) return { canceled: true, accepted: [], rejected: [] };

  const accepted: PermissionAttachment[] = [];
  const rejected: string[] = [];
  let budget = usedBytes;

  for (const asset of result.assets ?? []) {
    try {
      if (asset.size && asset.size > MAX_ATTACHMENT_BYTES) {
        rejected.push(`${asset.name} (supera 5 MB)`);
        continue;
      }
      // En web el picker ya devuelve el base64; en nativo se lee del cache.
      const base64 =
        asset.base64 ??
        (await FileSystemLegacy.readAsStringAsync(asset.uri, {
          encoding: FileSystemLegacy.EncodingType.Base64,
        }));
      const mimeType = asset.mimeType || "application/octet-stream";
      const dataUri = `data:${mimeType};base64,${base64}`;
      if (dataUri.length <= MIN_DATA_URI_LENGTH) {
        rejected.push(`${asset.name} (archivo vacío o ilegible)`);
        continue;
      }
      if (budget + dataUri.length > MAX_PAYLOAD_BYTES) {
        rejected.push(`${asset.name} (supera el límite total de 20MB)`);
        continue;
      }
      budget += dataUri.length;
      accepted.push({
        id: `${asset.name}-${asset.lastModified ?? Date.now()}-${accepted.length}`,
        name: asset.name,
        size: asset.size,
        mimeType,
        dataUri,
      });
    } catch (error: any) {
      console.error("pickAttachments/read:", error?.message);
      rejected.push(`${asset.name} (no se pudo leer)`);
    }
  }

  return { canceled: false, accepted, rejected };
}
