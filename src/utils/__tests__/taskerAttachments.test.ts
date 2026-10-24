import {
  fitTaskerAttachments,
  formatTaskerMb,
  formatTaskerRejections,
  formatTaskerVideoProgress,
  getAttachmentTypeLabel,
  getCommentAttachmentKind,
  getDataUriFileBytes,
  getFileExtension,
  getTaskerAttachmentHelper,
  getTaskerAttachmentRoom,
  getTaskerAttachmentUsedBytes,
  getTaskerMediaKind,
  getTaskerVideoMaxSize,
  isTaskerVideoDurationValid,
  isTaskerVideoSourceSizeValid,
  resolveTaskerAttachmentLimit,
  TASKER_ATTACHMENTS_MAX_BYTES,
  TASKER_VIDEO_BITRATE,
  TASKER_VIDEO_DURATION_TOLERANCE_MS,
  TASKER_VIDEO_MAX_SECONDS,
  TASKER_VIDEO_SHORT_SIDE,
  TASKER_VIDEO_SOURCE_MAX_BYTES,
  TASKER_VIDEO_SOURCE_TOO_BIG_REASON,
  TASKER_VIDEO_TOO_LONG_REASON,
  taskerNoRoomReason,
  toTaskerProgressPercent,
} from "../taskerRules";
import { TASKER_ATTACHMENTS_TOO_LARGE_ERROR, TASKR_TASK_MAX_BYTES } from "../taskerApi";

const MB = 1024 * 1024;

/** data-URI de un archivo de exactamente `bytes` bytes. */
const fileOf = (bytes: number, mime = "image/jpeg") =>
  `data:${mime};base64,${btoa("x".repeat(bytes))}`;
const attachment = (name: string, bytes: number, mime = "image/jpeg") => ({
  id: name,
  name,
  mimeType: mime,
  dataUri: fileOf(bytes, mime),
});

describe("adjuntos de Tasker", () => {
  describe("tope unificado de 7 MB (archivos reales)", () => {
    it("es 7 MB y, en base64 dentro del JSON, queda bajo la barrera de 9.5 MB", () => {
      expect(TASKER_ATTACHMENTS_MAX_BYTES).toBe(7 * MB);
      const base64Chars = Math.ceil(TASKER_ATTACHMENTS_MAX_BYTES / 3) * 4;
      // Margen para texto, dirección y claves del JSON.
      expect(TASKR_TASK_MAX_BYTES - base64Chars).toBeGreaterThan(100 * 1024);
    });
    it("el aviso de la última barrera (JSON) habla de 7 MB", () => {
      expect(TASKER_ATTACHMENTS_TOO_LARGE_ERROR).toContain("7 MB");
    });
    it("Seguimiento (sin tope del envío): 7 MB para el comentario solo", () => {
      expect(resolveTaskerAttachmentLimit()).toEqual({
        maxBytes: TASKER_ATTACHMENTS_MAX_BYTES,
        usedElsewhere: 0,
      });
    });
    it("Reportar: el tope del envío tal cual (con lo de los otros comentarios)", () => {
      const limit = { maxBytes: TASKER_ATTACHMENTS_MAX_BYTES, usedElsewhere: 3 * MB };
      expect(resolveTaskerAttachmentLimit(limit)).toBe(limit);
    });
    it("usado = otros comentarios + ventana, en bytes decodificados (no largo del base64)", () => {
      const limit = { maxBytes: 1000, usedElsewhere: 100 };
      const list = [attachment("a.jpg", 300), attachment("b.pdf", 200, "application/pdf")];
      expect(getTaskerAttachmentUsedBytes(limit, list)).toBe(600);
      expect(list[0].dataUri.length).toBeGreaterThan(300);
      expect(getTaskerAttachmentRoom(limit, list)).toBe(400);
    });
    it("lo que queda nunca es negativo", () => {
      expect(getTaskerAttachmentRoom({ maxBytes: 100, usedElsewhere: 90 }, [attachment("a", 50)])).toBe(0);
    });
    it("fitTaskerAttachments acepta justo en el tope y rechaza un byte más, con motivo", () => {
      expect(fitTaskerAttachments([attachment("ok.jpg", 400)], 600, 1000).accepted).toHaveLength(1);
      const over = fitTaskerAttachments([attachment("no.jpg", 401)], 600, 1000);
      expect(over.accepted).toEqual([]);
      expect(over.rejected[0].name).toBe("no.jpg");
    });
  });

  describe("formatTaskerMb y motivos de rechazo por peso", () => {
    it("un decimal; sin decimales si es entero", () => {
      expect(formatTaskerMb(7 * MB)).toBe("7");
      expect(formatTaskerMb(5.24 * MB)).toBe("5.2");
      expect(formatTaskerMb(0)).toBe("0");
      expect(formatTaskerMb(10)).toBe("0.1");
    });
    it("lo que pesa redondea hacia arriba y lo que queda hacia abajo: nunca iguales", () => {
      const room = 7 * MB - 90;
      expect(taskerNoRoomReason(room + 1, room)).toBe("pesa 7 MB y solo quedan 6.9 MB de los 7 MB");
    });
    it("video comprimido: lo dice", () => {
      expect(taskerNoRoomReason(4.5 * MB, 2 * MB, 7 * MB, true)).toBe(
        "pesa 4.5 MB ya comprimido y solo quedan 2 MB de los 7 MB",
      );
    });
    it("sin espacio, o menos de 0.1 MB", () => {
      expect(taskerNoRoomReason(MB, 0)).toBe("ya se usaron los 7 MB permitidos");
      expect(taskerNoRoomReason(MB, 1000)).toBe(
        "pesa 1 MB y solo quedan menos de 0.1 MB de los 7 MB",
      );
    });
    it("Reportar: 3 MB en otros comentarios + video de 4.5 MB → no entra", () => {
      const limit = { maxBytes: TASKER_ATTACHMENTS_MAX_BYTES, usedElsewhere: 3 * MB };
      expect(4.5 * MB).toBeGreaterThan(getTaskerAttachmentRoom(limit, []));
    });
    it("Seguimiento: un video de 30 s a 1.2 Mbps (~4.5 MB) entra solo", () => {
      const bytes = (TASKER_VIDEO_BITRATE / 8) * TASKER_VIDEO_MAX_SECONDS;
      expect(bytes).toBeLessThanOrEqual(getTaskerAttachmentRoom(resolveTaskerAttachmentLimit(), []));
    });
  });

  describe("formatTaskerRejections (aviso «Adjuntos»)", () => {
    it("uno → frase", () => {
      expect(formatTaskerRejections([{ name: "el video", reason: TASKER_VIDEO_TOO_LONG_REASON }])).toBe(
        "No se adjuntó el video: dura más de 30 s.",
      );
    });
    it("varios → lista", () => {
      expect(
        formatTaskerRejections([
          { name: "a.zip", reason: "está vacío" },
          { name: "b.mov", reason: TASKER_VIDEO_TOO_LONG_REASON },
        ]),
      ).toBe("No se adjuntaron:\n• a.zip: está vacío\n• b.mov: dura más de 30 s");
    });
  });

  describe("video: duración (30 s + 0.5 s de tolerancia) y peso original", () => {
    it("parámetros", () => {
      expect(TASKER_VIDEO_MAX_SECONDS).toBe(30);
      expect(TASKER_VIDEO_DURATION_TOLERANCE_MS).toBe(500);
      expect(TASKER_VIDEO_SHORT_SIDE).toBe(540);
      expect(TASKER_VIDEO_BITRATE).toBe(1_200_000);
    });
    it("hasta 30.5 s entra; un milisegundo más no", () => {
      expect(isTaskerVideoDurationValid(30_000)).toBe(true);
      expect(isTaskerVideoDurationValid(30_040)).toBe(true);
      expect(isTaskerVideoDurationValid(30_500)).toBe(true);
      expect(isTaskerVideoDurationValid(30_501)).toBe(false);
      expect(isTaskerVideoDurationValid(120_000)).toBe(false);
    });
    it("duración desconocida se deja pasar (la acota el peso comprimido)", () => {
      expect(isTaskerVideoDurationValid(null)).toBe(true);
      expect(isTaskerVideoDurationValid(undefined)).toBe(true);
      expect(isTaskerVideoDurationValid(Number.NaN)).toBe(true);
    });
    it("original de más de 200 MB no se comprime; desconocido pasa", () => {
      expect(isTaskerVideoSourceSizeValid(TASKER_VIDEO_SOURCE_MAX_BYTES)).toBe(true);
      expect(isTaskerVideoSourceSizeValid(TASKER_VIDEO_SOURCE_MAX_BYTES + 1)).toBe(false);
      expect(isTaskerVideoSourceSizeValid(undefined)).toBe(true);
      expect(TASKER_VIDEO_SOURCE_TOO_BIG_REASON).toBe("pesa más de 200 MB sin comprimir");
    });
  });

  describe("getTaskerVideoMaxSize (lado largo para 540p de lado corto)", () => {
    it("proporcional, horizontal o vertical", () => {
      expect(getTaskerVideoMaxSize(1920, 1080)).toBe(960);
      expect(getTaskerVideoMaxSize(1080, 1920)).toBe(960);
      expect(getTaskerVideoMaxSize(3840, 2160)).toBe(960);
      expect(getTaskerVideoMaxSize(1440, 1080)).toBe(720);
    });
    it("ya en 540p o menos: no se agranda", () => {
      expect(getTaskerVideoMaxSize(960, 540)).toBe(960);
      expect(getTaskerVideoMaxSize(640, 480)).toBe(640);
    });
    it("sin medidas → 960 (16:9)", () => {
      expect(getTaskerVideoMaxSize(null, 1080)).toBe(960);
      expect(getTaskerVideoMaxSize(0, 0)).toBe(960);
    });
  });

  describe("progreso", () => {
    it("0–1 → 0–100 entero, acotado", () => {
      expect(toTaskerProgressPercent(0)).toBe(0);
      expect(toTaskerProgressPercent(0.426)).toBe(43);
      expect(toTaskerProgressPercent(1.2)).toBe(100);
      expect(toTaskerProgressPercent(-1)).toBe(0);
      expect(toTaskerProgressPercent(Number.NaN)).toBe(0);
    });
    it("texto", () => {
      expect(formatTaskerVideoProgress(43)).toBe("Procesando video… 43 %");
    });
  });

  describe("getTaskerMediaKind (qué se eligió)", () => {
    it("video por type, mime o extensión (aunque venga como octet-stream)", () => {
      expect(getTaskerMediaKind({ type: "video" })).toBe("video");
      expect(getTaskerMediaKind({ mimeType: "video/quicktime" })).toBe("video");
      expect(getTaskerMediaKind({ mimeType: "application/octet-stream", name: "clip.MP4" })).toBe(
        "video",
      );
    });
    it("imagen por type (incluida Live Photo) o mime", () => {
      expect(getTaskerMediaKind({ type: "image" })).toBe("image");
      expect(getTaskerMediaKind({ type: "livePhoto" })).toBe("image");
      expect(getTaskerMediaKind({ mimeType: "image/png" })).toBe("image");
    });
    it("cualquier otra cosa → file (PDF, Office, zip, sin mime)", () => {
      expect(getTaskerMediaKind({ mimeType: "application/pdf", name: "a.pdf" })).toBe("file");
      expect(
        getTaskerMediaKind({
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ).toBe("file");
      expect(getTaskerMediaKind({ name: "datos.zip" })).toBe("file");
      expect(getTaskerMediaKind({})).toBe("file");
    });
  });

  describe("getFileExtension", () => {
    it("del último segmento, sin query ni hash, en minúscula", () => {
      expect(getFileExtension("informe.PDF")).toBe("pdf");
      expect(getFileExtension("https://x.test/a.b/informe.docx?v=2#p")).toBe("docx");
      expect(getFileExtension("uploads/tasks/4045/foto.jpg")).toBe("jpg");
    });
    it("sin extensión, carpeta con punto, nombre con punto y espacio o data-URI → ''", () => {
      expect(getFileExtension("https://x.test/files/sin-extension")).toBe("");
      expect(getFileExtension("https://x.test/a.b/archivo")).toBe("");
      expect(getFileExtension("Dr. Pérez informe")).toBe("");
      expect(getFileExtension(".env")).toBe("");
      expect(getFileExtension(fileOf(3))).toBe("");
    });
  });

  describe("getCommentAttachmentKind (visualización)", () => {
    it("local: imagen que el visor muestra → image", () => {
      expect(getCommentAttachmentKind(fileOf(3, "image/jpeg"))).toBe("image");
      expect(getCommentAttachmentKind(fileOf(3, "image/png"))).toBe("image");
      expect(getCommentAttachmentKind(fileOf(3, "image/webp"))).toBe("image");
    });
    it("local: video → video", () => {
      expect(getCommentAttachmentKind(fileOf(3, "video/mp4"))).toBe("video");
      expect(getCommentAttachmentKind(fileOf(3, "video/quicktime"))).toBe("video");
    });
    it("local: cualquier otro tipo → file (también imágenes que el visor no muestra)", () => {
      for (const mime of [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/octet-stream",
        "text/plain",
        "image/heic",
        "image/svg+xml",
      ]) {
        expect(getCommentAttachmentKind(fileOf(3, mime))).toBe("file");
      }
      expect(getCommentAttachmentKind("data:,hola")).toBe("file");
    });
    it("servidor: por la extensión de la ruta", () => {
      expect(getCommentAttachmentKind("https://x.test/taskr/downloads/a/foto.JPG")).toBe("remoteImage");
      expect(getCommentAttachmentKind("https://x.test/taskr/downloads/a/foto.png?t=1")).toBe(
        "remoteImage",
      );
      expect(getCommentAttachmentKind("https://x.test/taskr/downloads/a/clip.mp4")).toBe("remoteVideo");
      expect(getCommentAttachmentKind("https://x.test/taskr/downloads/a/clip.MOV#t")).toBe(
        "remoteVideo",
      );
      expect(getCommentAttachmentKind("https://x.test/taskr/downloads/a/informe.pdf")).toBe("remoteFile");
      expect(getCommentAttachmentKind("https://x.test/taskr/downloads/a/hoja.xlsx")).toBe("remoteFile");
    });
    it("servidor: ningún no-imagen cae en el visor (sin extensión, HEIC, SVG → remoteFile)", () => {
      for (const url of [
        "https://x.test/taskr/downloads/a/sin-extension",
        "https://x.test/taskr/downloads/a/foto.heic",
        "https://x.test/taskr/downloads/a/logo.svg",
        "https://x.test/taskr/downloads/a/datos.zip",
      ]) {
        expect(getCommentAttachmentKind(url)).toBe("remoteFile");
      }
    });
  });

  describe("getAttachmentTypeLabel (extensión en la miniatura de archivo)", () => {
    it("primero la del nombre", () => {
      expect(getAttachmentTypeLabel(fileOf(3, "application/octet-stream"), "plano.dwg")).toBe("DWG");
    });
    it("local sin nombre útil: por mime (tabla o subtipo corto)", () => {
      expect(getAttachmentTypeLabel(fileOf(3, "application/pdf"), "adjunto 1")).toBe("PDF");
      expect(
        getAttachmentTypeLabel(
          fileOf(3, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ),
      ).toBe("DOCX");
      expect(getAttachmentTypeLabel(fileOf(3, "application/json"))).toBe("JSON");
      expect(getAttachmentTypeLabel(fileOf(3, "text/plain"))).toBe("TXT");
    });
    it("servidor: la de la ruta", () => {
      expect(getAttachmentTypeLabel("https://x.test/a/hoja.xlsx", "adjunto 2 del comentario")).toBe(
        "XLSX",
      );
    });
    it("desconocido → '' (solo el ícono)", () => {
      expect(getAttachmentTypeLabel(fileOf(3, "application/octet-stream"))).toBe("");
      expect(getAttachmentTypeLabel("https://x.test/a/sin-extension")).toBe("");
    });
  });

  describe("texto de ayuda", () => {
    it("con y sin video en el binario", () => {
      expect(getTaskerAttachmentHelper(true)).toBe(
        "Fotos, videos (máx. 30 s) o archivos; hasta 7 MB en total.",
      );
      expect(getTaskerAttachmentHelper(false)).toBe("Fotos o archivos; hasta 7 MB en total.");
    });
  });

  it("getDataUriFileBytes mide un video en bytes reales", () => {
    expect(getDataUriFileBytes(fileOf(1234, "video/mp4"))).toBe(1234);
  });
});
