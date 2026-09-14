import * as ImagePicker from "expo-image-picker";

/**
 * expo-image-manipulator se carga recién al procesar una foto, con require
 * protegido: su import hace `requireNativeModule("ExpoImageManipulator")`,
 * que lanza al evaluar el módulo si el dev client no se recompiló con la
 * dependencia — y con import estático eso tumbaba todo UserFormModal.
 */
type ManipulatorModule = typeof import("expo-image-manipulator");
function loadManipulator(): ManipulatorModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-image-manipulator") as ManipulatorModule;
  } catch (error: any) {
    console.warn("expo-image-manipulator no está en el binario (recompilar dev client):", error?.message);
    return null;
  }
}

/**
 * Mismos parámetros que `compressImage` del webapp (compressorjs en
 * Utils/index.js): quality 0.6 y lado mayor como máximo 1024px, manteniendo
 * la proporción. Sin recorte — el webapp tampoco lo tiene.
 */
const MAX_SIDE = 1024;
const QUALITY = 0.6;

export type UserPhotoSource = "camera" | "gallery";

export type PickUserPhotoResult =
  | { status: "ok"; dataUrl: string }
  | { status: "canceled" }
  | { status: "denied" }
  | { status: "error" };

async function compressToDataUrl(uri: string): Promise<string | null> {
  const manipulator = loadManipulator();
  if (!manipulator) return null;
  const { ImageManipulator, SaveFormat } = manipulator;
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  let target = original;
  const longest = Math.max(original.width, original.height);
  if (longest > MAX_SIDE) {
    const context = ImageManipulator.manipulate(original);
    context.resize(original.width >= original.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    target = await context.renderAsync();
    context.release();
  }
  const saved = await target.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG, base64: true });
  if (target !== original) target.release();
  original.release();
  return saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : null;
}

/**
 * Cámara: mismo flujo de permiso + launchCameraAsync que la identificación
 * por foto de adminpunchinout.tsx. Galería: mismo permiso que punchinout.tsx.
 * La compresión va con expo-image-manipulator antes de pasar a base64 (el
 * picker no redimensiona, solo baja calidad).
 */
export async function pickUserPhoto(source: UserPhotoSource): Promise<PickUserPhotoResult> {
  try {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") return { status: "denied" };

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    };
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return { status: "canceled" };

    const asset = result.assets[0];
    if (!asset?.uri) return { status: "error" };
    const dataUrl = await compressToDataUrl(asset.uri);
    return dataUrl ? { status: "ok", dataUrl } : { status: "error" };
  } catch (error: any) {
    console.error("pickUserPhoto:", error?.message ?? error);
    return { status: "error" };
  }
}
