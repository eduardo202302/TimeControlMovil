import * as DocumentPicker from "expo-document-picker";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { NativeModules, TurboModuleRegistry } from "react-native";
import type { TaskerAttachment } from "../../../types/typesTasker/TaskerTypes";
import {
  fitTaskerAttachments,
  getDataUriFileBytes,
  getTaskerMediaKind,
  getTaskerVideoMaxSize,
  isTaskerVideoDurationValid,
  isTaskerVideoSourceSizeValid,
  TASKER_FILE_EMPTY_REASON,
  TASKER_FILE_UNREADABLE_REASON,
  TASKER_IMAGE_PROCESS_REASON,
  TASKER_VIDEO_BITRATE,
  TASKER_VIDEO_MAX_SECONDS,
  TASKER_VIDEO_PROCESS_REASON,
  TASKER_VIDEO_SOURCE_TOO_BIG_REASON,
  TASKER_VIDEO_TOO_LONG_REASON,
  TASKER_VIDEO_UNSUPPORTED_REASON,
  taskerNoRoomReason,
  type TaskerAttachmentRejection,
} from "../../utils/taskerRules";
import { compressToDataUrl } from "../users/pickUserPhoto";

/**
 * Adjuntos de Tasker (Reportar y Seguimiento):
 * - fotos: comprimidas a JPEG por compressToDataUrl (mismos parámetros que el webapp);
 * - videos (cámara, galería o "Archivo"): máx. 30 s, comprimidos a 540p / mp4
 *   con react-native-compressor; solo el comprimido se lee a base64;
 * - cualquier otro archivo: tal cual, si cabe en el tope (se mide sin leerlo).
 */

/**
 * react-native-compressor se carga recién al usarlo, y solo si el binario lo
 * trae: su import hace `TurboModuleRegistry.getEnforcing("Compressor")`, que
 * lanza en un APK compilado sin él. Sin el módulo, "Grabar video" no aparece
 * y los videos de la galería o de "Archivo" se rechazan con aviso.
 */
type CompressorModule = typeof import("react-native-compressor");
let compressorCache: CompressorModule | null | undefined;
function loadCompressor(): CompressorModule | null {
  if (compressorCache !== undefined) return compressorCache;
  compressorCache = null;
  try {
    const linked =
      TurboModuleRegistry.get("Compressor") != null || NativeModules.Compressor != null;
    if (linked) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      compressorCache = require("react-native-compressor") as CompressorModule;
    }
  } catch (error: any) {
    console.warn("react-native-compressor no está en el binario (recompilar):", error?.message);
  }
  return compressorCache;
}

export function isTaskerVideoSupported(): boolean {
  return loadCompressor() !== null;
}

export type TaskerAttachmentSource = "photo" | "video" | "gallery" | "file";

export type TaskerPickResult =
  | { status: "canceled" }
  | { status: "denied" }
  | { status: "done"; accepted: TaskerAttachment[]; rejected: TaskerAttachmentRejection[] };

/**
 * Selección en curso. La ventana la cancela al cerrarse o desmontarse
 * (cancelTaskerPickJob): corta la compresión y borra los temporales.
 */
export interface TaskerPickJob {
  canceled: boolean;
  cancellationId?: string;
  /** Archivos temporales (copias de los selectores y video comprimido). */
  tempUris: string[];
}

export function createTaskerPickJob(): TaskerPickJob {
  return { canceled: false, tempUris: [] };
}

/** Solo lo que está en el cache de la app: nunca el archivo original de la galería. */
function trackTemp(job: TaskerPickJob, uri: string) {
  const cache = FileSystemLegacy.cacheDirectory;
  if (cache && uri.startsWith(cache) && !job.tempUris.includes(uri)) job.tempUris.push(uri);
}

async function deleteTemps(job: TaskerPickJob) {
  const uris = job.tempUris.splice(0);
  await Promise.all(
    uris.map((uri) =>
      FileSystemLegacy.deleteAsync(uri, { idempotent: true }).catch((error: any) => {
        console.warn("pickTaskerAttachment: no se pudo borrar el temporal:", error?.message);
      }),
    ),
  );
}

export function cancelTaskerPickJob(job: TaskerPickJob) {
  if (job.canceled) return;
  job.canceled = true;
  if (job.cancellationId) {
    try {
      loadCompressor()?.Video.cancelCompression(job.cancellationId);
    } catch (error: any) {
      console.warn("pickTaskerAttachment: no se pudo cancelar la compresión:", error?.message);
    }
  }
  void deleteTemps(job);
}

/** Tamaño en disco sin leer el archivo; null si no se puede saber. */
async function getFileSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystemLegacy.getInfoAsync(uri);
    return info.exists && typeof info.size === "number" ? info.size : null;
  } catch {
    return null;
  }
}

function readBase64(uri: string): Promise<string> {
  return FileSystemLegacy.readAsStringAsync(uri, {
    encoding: FileSystemLegacy.EncodingType.Base64,
  });
}

/** El compresor devuelve a veces una ruta sin esquema. */
const toFileUri = (path: string) => (path.startsWith("file://") ? path : `file://${path}`);

const CANCELED = Symbol("canceled");
type Outcome = TaskerAttachment | TaskerAttachmentRejection | typeof CANCELED;

interface PickContext {
  /** Bytes de archivo que todavía caben en el tope. */
  roomBytes: number;
  maxBytes: number;
  job: TaskerPickJob;
  /** Progreso de la compresión del video (0–1). */
  onProgress: (progress: number) => void;
}

interface VideoInput {
  uri: string;
  /** Para el aviso: "el video" (cámara/galería) o el nombre del archivo. */
  name: string;
  durationMs?: number | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
}

/**
 * Peso y duración ANTES de comprimir; luego 540p (lado corto) a ~1.2 Mbps,
 * mp4 H.264/AAC. Solo el comprimido se lee a base64, y solo si cabe.
 */
async function processVideo(input: VideoInput, ctx: PickContext): Promise<Outcome> {
  const { job } = ctx;
  const reject = (reason: string): TaskerAttachmentRejection => ({ name: input.name, reason });
  const compressor = loadCompressor();
  if (!compressor) return reject(TASKER_VIDEO_UNSUPPORTED_REASON);

  const sourceBytes = input.sizeBytes ?? (await getFileSize(input.uri));
  if (!isTaskerVideoSourceSizeValid(sourceBytes)) return reject(TASKER_VIDEO_SOURCE_TOO_BIG_REASON);

  // "Archivo" no trae duración ni medidas: se leen de los metadatos (no del contenido).
  let { durationMs, width, height } = input;
  if (durationMs == null || !width || !height) {
    try {
      const meta = await compressor.getVideoMetaData(input.uri);
      if (durationMs == null && Number.isFinite(meta.duration)) durationMs = meta.duration * 1000;
      width = width || meta.width;
      height = height || meta.height;
    } catch (error: any) {
      console.warn("pickTaskerAttachment: sin metadatos del video:", error?.message);
    }
  }
  if (!isTaskerVideoDurationValid(durationMs)) return reject(TASKER_VIDEO_TOO_LONG_REASON);
  if (job.canceled) return CANCELED;

  try {
    ctx.onProgress(0);
    const output = toFileUri(
      await compressor.Video.compress(
        input.uri,
        {
          compressionMethod: "manual",
          maxSize: getTaskerVideoMaxSize(width, height),
          bitrate: TASKER_VIDEO_BITRATE,
          // Siempre se recomprime: así todo sale mp4 H.264/AAC (un .mov HEVC no se ve en la web).
          minimumFileSizeForCompress: 0,
          getCancellationId: (id) => {
            job.cancellationId = id;
          },
        },
        ctx.onProgress,
      ),
    );
    trackTemp(job, output);
    if (job.canceled) return CANCELED;

    const bytes = await getFileSize(output);
    if (bytes == null) return reject(TASKER_VIDEO_PROCESS_REASON);
    if (bytes === 0) return reject(TASKER_FILE_EMPTY_REASON);
    if (bytes > ctx.roomBytes) {
      return reject(taskerNoRoomReason(bytes, ctx.roomBytes, ctx.maxBytes, true));
    }
    const base64 = await readBase64(output);
    if (job.canceled) return CANCELED;
    const stamp = Date.now();
    return {
      id: `video-${stamp}`,
      name: `video-${stamp}.mp4`,
      mimeType: "video/mp4",
      dataUri: `data:video/mp4;base64,${base64}`,
      size: bytes,
    };
  } catch (error: any) {
    if (job.canceled) return CANCELED;
    console.error("pickTaskerAttachment (video):", error?.message ?? error);
    return reject(TASKER_VIDEO_PROCESS_REASON);
  }
}

async function processPhoto(uri: string, ctx: PickContext): Promise<Outcome> {
  const dataUrl = await compressToDataUrl(uri).catch((error: any) => {
    console.error("pickTaskerAttachment (foto):", error?.message ?? error);
    return null;
  });
  if (ctx.job.canceled) return CANCELED;
  if (!dataUrl) return { name: "la foto", reason: TASKER_IMAGE_PROCESS_REASON };
  const stamp = Date.now();
  const photo: TaskerAttachment = {
    id: `foto-${stamp}`,
    name: `foto-${stamp}.jpg`,
    mimeType: "image/jpeg",
    dataUri: dataUrl,
  };
  const fit = fitTaskerAttachments([photo], ctx.maxBytes - ctx.roomBytes, ctx.maxBytes);
  return fit.accepted[0] ?? { name: "la foto", reason: fit.rejected[0].reason };
}

/** Cualquier archivo de "Archivo" que no sea video: se mide sin leerlo; si cabe, va tal cual. */
async function processFile(
  asset: DocumentPicker.DocumentPickerAsset,
  index: number,
  ctx: PickContext,
): Promise<Outcome> {
  const reject = (reason: string): TaskerAttachmentRejection => ({ name: asset.name, reason });
  const bytes = asset.size ?? (await getFileSize(asset.uri));
  if (bytes == null) return reject(TASKER_FILE_UNREADABLE_REASON);
  if (bytes === 0) return reject(TASKER_FILE_EMPTY_REASON);
  if (bytes > ctx.roomBytes) return reject(taskerNoRoomReason(bytes, ctx.roomBytes, ctx.maxBytes));
  try {
    // En web el picker ya devuelve el base64; en nativo se lee de la copia en cache.
    const base64 = asset.base64 ?? (await readBase64(asset.uri));
    if (ctx.job.canceled) return CANCELED;
    const mimeType = asset.mimeType || "application/octet-stream";
    const dataUri = `data:${mimeType};base64,${base64}`;
    if (getDataUriFileBytes(dataUri) === 0) return reject(TASKER_FILE_EMPTY_REASON);
    return {
      id: `${asset.name}-${asset.lastModified ?? Date.now()}-${index}`,
      name: asset.name,
      mimeType,
      dataUri,
      size: bytes,
    };
  } catch (error: any) {
    if (ctx.job.canceled) return CANCELED;
    console.error("pickTaskerAttachment (archivo):", error?.message ?? error);
    return reject(TASKER_FILE_UNREADABLE_REASON);
  }
}

/** Junta lo que entró y lo que no, descontando del tope lo que va entrando. */
function createCollector(ctx: PickContext) {
  const accepted: TaskerAttachment[] = [];
  const rejected: TaskerAttachmentRejection[] = [];
  return {
    /** false = cancelado. */
    add(outcome: Outcome): boolean {
      if (outcome === CANCELED) return false;
      if ("dataUri" in outcome) {
        accepted.push(outcome);
        ctx.roomBytes -= getDataUriFileBytes(outcome.dataUri);
      } else {
        rejected.push(outcome);
      }
      return true;
    },
    result: (): TaskerPickResult => ({ status: "done", accepted, rejected }),
  };
}

async function pickFromCameraOrGallery(
  source: "photo" | "video" | "gallery",
  ctx: PickContext,
): Promise<TaskerPickResult> {
  const fromCamera = source !== "gallery";
  const permission = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.status !== "granted") return { status: "denied" };

  const mediaTypes: ImagePicker.MediaType[] =
    source === "photo"
      ? ["images"]
      : source === "video"
        ? ["videos"]
        : isTaskerVideoSupported()
          ? ["images", "videos"]
          : ["images"];
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes,
    allowsEditing: false,
    quality: 1,
    videoMaxDuration: TASKER_VIDEO_MAX_SECONDS,
  };
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return { status: "canceled" };
  const asset = result.assets[0];
  const collector = createCollector(ctx);
  if (!asset?.uri) {
    collector.add({
      name: source === "video" ? "el video" : "la foto",
      reason: source === "video" ? TASKER_VIDEO_PROCESS_REASON : TASKER_IMAGE_PROCESS_REASON,
    });
    return collector.result();
  }

  trackTemp(ctx.job, asset.uri);
  const kind = getTaskerMediaKind({ type: asset.type, mimeType: asset.mimeType, name: asset.fileName });
  const outcome =
    kind === "video"
      ? await processVideo(
          {
            uri: asset.uri,
            name: "el video",
            durationMs: asset.duration,
            sizeBytes: asset.fileSize,
            width: asset.width,
            height: asset.height,
          },
          ctx,
        )
      : await processPhoto(asset.uri, ctx);
  return collector.add(outcome) ? collector.result() : { status: "canceled" };
}

async function pickFiles(ctx: PickContext): Promise<TaskerPickResult> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: "*/*",
  });
  if (result.canceled) return { status: "canceled" };

  for (const asset of result.assets ?? []) trackTemp(ctx.job, asset.uri);
  const collector = createCollector(ctx);
  const assets = result.assets ?? [];
  for (let index = 0; index < assets.length; index++) {
    const asset = assets[index];
    const kind = getTaskerMediaKind({ mimeType: asset.mimeType, name: asset.name });
    const outcome =
      kind === "video"
        ? await processVideo({ uri: asset.uri, name: asset.name, sizeBytes: asset.size }, ctx)
        : await processFile(asset, index, ctx);
    if (!collector.add(outcome)) return { status: "canceled" };
  }
  return collector.result();
}

/**
 * "Tomar foto" / "Grabar video" (máx. 30 s) / "Galería" (fotos y videos) /
 * "Archivo" (cualquier tipo, varios a la vez). `usedBytes`/`maxBytes`: el
 * tope de 7 MB de archivos reales con lo ya adjuntado. Siempre borra los
 * temporales que quedaron en el cache.
 */
export async function pickTaskerAttachments(
  source: TaskerAttachmentSource,
  {
    usedBytes,
    maxBytes,
    job,
    onProgress,
  }: { usedBytes: number; maxBytes: number; job: TaskerPickJob; onProgress: (progress: number) => void },
): Promise<TaskerPickResult> {
  const ctx: PickContext = { roomBytes: Math.max(0, maxBytes - usedBytes), maxBytes, job, onProgress };
  try {
    const result =
      source === "file" ? await pickFiles(ctx) : await pickFromCameraOrGallery(source, ctx);
    return job.canceled ? { status: "canceled" } : result;
  } finally {
    await deleteTemps(job);
  }
}
