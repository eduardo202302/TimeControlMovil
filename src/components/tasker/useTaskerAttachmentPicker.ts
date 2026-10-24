import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import type { TaskerAttachment } from "../../../types/typesTasker/TaskerTypes";
import {
  formatTaskerRejections,
  getTaskerAttachmentUsedBytes,
  resolveTaskerAttachmentLimit,
  toTaskerProgressPercent,
  type TaskerAttachmentLimit,
} from "../../utils/taskerRules";
import {
  cancelTaskerPickJob,
  createTaskerPickJob,
  isTaskerVideoSupported,
  pickTaskerAttachments,
  type TaskerAttachmentSource,
  type TaskerPickJob,
} from "./pickTaskerAttachment";
import type { TaskerAttachmentOption } from "./TaskerAttachmentSheet";

const OPTIONS: TaskerAttachmentOption[] = [
  { source: "photo", label: "Tomar foto", icon: "camera-outline" },
  { source: "video", label: "Grabar video", icon: "videocam-outline" },
  { source: "gallery", label: "Galería (fotos y videos)", icon: "images-outline" },
  { source: "file", label: "Archivo", icon: "document-attach-outline" },
];

/** Sin el compresor en el binario: sin "Grabar video" y la galería solo con fotos. */
const OPTIONS_WITHOUT_VIDEO: TaskerAttachmentOption[] = OPTIONS.flatMap((o) =>
  o.source === "video" ? [] : o.source === "gallery" ? [{ ...o, label: "Galería" }] : [o],
);

const DENIED_MESSAGES: Record<Exclude<TaskerAttachmentSource, "file">, string> = {
  photo: "Necesitas permitir el acceso a la cámara para tomar la foto.",
  video: "Necesitas permitir el acceso a la cámara para grabar el video.",
  gallery: "Necesitas permitir el acceso a la galería para adjuntar la foto o el video.",
};

/** iOS: si el sheet no avisa onDismiss, la selección arranca igual pasado este tiempo. */
const IOS_DISMISS_FALLBACK_MS = 700;

/**
 * Menú "Adjuntar" (Tomar foto / Grabar video / Galería / Archivo) de la
 * ventana de comentarios de Reportar Avería y Seguimiento. Devuelve las props
 * del sheet (TaskerAttachmentSheet) para que la ventana lo dibuje.
 *
 * Tope: 7 MB de archivos reales. `limit` (Reportar) trae lo que ya pesan los
 * otros comentarios del envío; sin él (Seguimiento), los 7 MB son del
 * comentario solo (resolveTaskerAttachmentLimit). Lo que no entra se avisa
 * con su motivo.
 *
 * `busy`: eligiendo o procesando (la ventana no deja guardar). `progress`:
 * porcentaje de la compresión del video en curso (null si no hay). Al
 * desmontarse la ventana se cancela la compresión y se borran temporales.
 */
export function useTaskerAttachmentPicker(
  attachments: TaskerAttachment[],
  onAdd: (added: TaskerAttachment[]) => void,
  limit?: TaskerAttachmentLimit,
) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [videoSupported] = useState(isTaskerVideoSupported);
  const jobRef = useRef<TaskerPickJob | null>(null);
  /** iOS: lo elegido en el sheet, a la espera de que termine de cerrarse. */
  const pendingRef = useRef<TaskerAttachmentSource | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      pendingRef.current = null;
      if (jobRef.current) cancelTaskerPickJob(jobRef.current);
    },
    [],
  );

  const pick = useCallback(
    async (source: TaskerAttachmentSource) => {
      const effectiveLimit = resolveTaskerAttachmentLimit(limit);
      const job = createTaskerPickJob();
      jobRef.current = job;
      setBusy(true);
      try {
        const result = await pickTaskerAttachments(source, {
          usedBytes: getTaskerAttachmentUsedBytes(effectiveLimit, attachments),
          maxBytes: effectiveLimit.maxBytes,
          job,
          onProgress: (value) => {
            if (!job.canceled) setProgress(toTaskerProgressPercent(value));
          },
        });
        // Ventana cerrada mientras procesaba: no se agrega ni se avisa nada.
        if (job.canceled || result.status === "canceled") return;
        if (result.status === "denied") {
          if (source !== "file") Alert.alert("Permiso requerido", DENIED_MESSAGES[source]);
          return;
        }
        if (result.accepted.length > 0) onAdd(result.accepted);
        if (result.rejected.length > 0) {
          Alert.alert("Adjuntos", formatTaskerRejections(result.rejected));
        }
      } catch (error: any) {
        if (job.canceled) return;
        console.error("useTaskerAttachmentPicker:", error?.message ?? error);
        Alert.alert("Adjuntos", "No se pudo abrir el selector de archivos.");
      } finally {
        if (jobRef.current === job) jobRef.current = null;
        setBusy(false);
        setProgress(null);
      }
    },
    [attachments, onAdd, limit],
  );

  const runPending = useCallback(() => {
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
    fallbackRef.current = null;
    const source = pendingRef.current;
    pendingRef.current = null;
    if (source) void pick(source);
  }, [pick]);

  const openPicker = useCallback(() => {
    if (!busy) setSheetVisible(true);
  }, [busy]);

  const closeSheet = useCallback(() => {
    pendingRef.current = null;
    setSheetVisible(false);
  }, []);

  const selectOption = useCallback(
    (source: TaskerAttachmentSource) => {
      setSheetVisible(false);
      if (Platform.OS !== "ios") {
        void pick(source);
        return;
      }
      // iOS no presenta la cámara/galería mientras el Modal se está cerrando.
      pendingRef.current = source;
      fallbackRef.current = setTimeout(runPending, IOS_DISMISS_FALLBACK_MS);
    },
    [pick, runPending],
  );

  const sheet = useMemo(
    () => ({
      visible: sheetVisible,
      options: videoSupported ? OPTIONS : OPTIONS_WITHOUT_VIDEO,
      onSelect: selectOption,
      onClose: closeSheet,
      onDismiss: runPending,
    }),
    [sheetVisible, videoSupported, selectOption, closeSheet, runPending],
  );

  return { busy, progress, videoSupported, openPicker, sheet };
}
