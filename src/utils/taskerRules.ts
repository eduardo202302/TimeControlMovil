/**
 * Reglas de presentación de Tasker (Reportar Avería y Seguimiento), calcadas
 * del producto original. Funciones puras: no importan react-native ni expo-*,
 * así que se testean con jest sin emulador.
 *
 * Los imports son relativos (no `@/`) porque jest no resuelve ese alias.
 */

import type {
  TaskerActivity,
  TaskerAddress,
  TaskerAttachment,
  TaskerAddressConfig,
  TaskerAddressDraft,
  TaskerComment,
  TaskerCommentPayload,
  TaskerReportAddress,
  TaskerReportConfig,
  TaskerReportErrors,
  TaskerTask,
} from "../../types/typesTasker/TaskerTypes";
import type { CompanySettings } from "../../types/typeStore/SchoolStoreType";
import {
  ACCENT_VIOLET,
  DANGER_TINT_BACKGROUND,
  ERROR_TEXT,
  INDIGO_TEXT,
  INDIGO_TINT_BACKGROUND,
  PRIMARY_700,
  PRIMARY_TINT_BACKGROUND,
  SUCCESS_COLOR,
  SUCCESS_TINT_BACKGROUND,
  VIOLET_TINT_BACKGROUND,
  WARNING_TEXT_STRONG,
  WARNING_TINT_BACKGROUND,
} from "../constants/colors";
import {
  TASKER_STATE_CANCELLED,
  TASKER_STATE_COMPLETED,
} from "../constants/taskerMock";
import { geocodeLocation, type GeocodeResult, type LatLng } from "./addressRules";

const pad2 = (n: number) => String(n).padStart(2, "0");

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * "DD/MM/YYYY hh:mm:ss A" en hora local. Las fechas de Tasker vienen sin zona
 * ("2026-10-06T09:58:11"), que el motor JS interpreta como hora local.
 * Vacía o inválida → "".
 */
export function formatTaskerDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  const hours = date.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return (
    `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad2(hour12)}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())} ` +
    (hours < 12 ? "AM" : "PM")
  );
}

/** Tiempo transcurrido: "Xs" | "Xm Ys" | "Xh Ym Zs" | "Xd Xh Ym Zs". */
export function formatElapsed(fromMs: number, nowMs: number): string {
  const total = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Solo los cambios de estado, del más reciente al más viejo (id descendente). */
export function getStateActivities(activities: TaskerActivity[]): TaskerActivity[] {
  return activities.filter((a) => a.type === "state").sort((a, b) => b.id - a.id);
}

/**
 * Duración a mostrar en una fila del historial. `stateId` es el estado ACTUAL
 * del ticket: si ya terminó, una actividad sin `time` no se pinta.
 */
export function getActivityTime(
  activity: TaskerActivity,
  stateId: number,
  nowMs: number,
): string | null {
  if (activity.time) return activity.time;
  if (stateId !== TASKER_STATE_COMPLETED && stateId !== TASKER_STATE_CANCELLED) {
    const begin = toDate(activity.beginDate);
    return begin ? formatElapsed(begin.getTime(), nowMs) : null;
  }
  return null;
}

/** "inicio" o "inicio - fin" si la actividad ya cerró. */
export function formatActivityRange(activity: TaskerActivity): string {
  const begin = formatTaskerDate(activity.beginDate);
  return activity.endDate ? `${begin} - ${formatTaskerDate(activity.endDate)}` : begin;
}

export type CommentOrder = "desc" | "asc";

/** Copia ordenada por createdDate. Por defecto, el más reciente primero. */
export function sortComments(
  comments: TaskerComment[],
  order: CommentOrder = "desc",
): TaskerComment[] {
  const time = (c: TaskerComment) => toDate(c.createdDate)?.getTime() ?? 0;
  return [...comments].sort((a, b) =>
    order === "desc" ? time(b) - time(a) : time(a) - time(b),
  );
}

// ─── Comentarios de Seguimiento ─────────────────────────────────────────────

/** "Agregar" del formulario: con texto (sin contar espacios) o con adjuntos. */
export function canSubmitComment(text: string, attachments: TaskerAttachment[]): boolean {
  return text.trim().length > 0 || attachments.length > 0;
}

/** "YYYY-MM-DDTHH:mm:ss" en hora local, el mismo formato sin zona de Tasker. */
function toTaskerLocalIso(date: Date): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  );
}

/**
 * Comentario que se pinta al momento, sin esperar al servidor. Como Tasker,
 * el autor es task.addUser (el solicitante), no quien escribe. El id es
 * negativo para no chocar con los del servidor.
 */
export function buildLocalComment({
  text,
  attachments,
  task,
  now,
}: {
  text: string;
  attachments: TaskerAttachment[];
  task: Pick<TaskerTask, "addUser">;
  now: Date;
}): TaskerComment {
  return {
    id: -now.getTime(),
    addUser: { name: task.addUser.name },
    createdDate: toTaskerLocalIso(now),
    comment: text.trim(),
    images: attachments.map((a) => a.dataUri),
  };
}

/** Cuerpo que Tasker manda al agregar un comentario. */
export function buildCommentPayload(
  text: string,
  attachments: TaskerAttachment[],
): TaskerCommentPayload {
  return {
    taskComments: [
      {
        comment: text.trim(),
        images: attachments.map((a) => a.dataUri),
        localAttachments: [],
      },
    ],
  };
}

/**
 * Qué es un adjunto de comentario: data-URI de imagen (se abre en el visor),
 * data-URI de otro tipo (PDF, no se abre) o ruta guardada en el servidor.
 */
export function getCommentAttachmentKind(value: string): "image" | "file" | "server" {
  if (/^data:image\//i.test(value)) return "image";
  if (/^data:/i.test(value)) return "file";
  return "server";
}

export interface AddressField {
  key: keyof TaskerAddress;
  label: string;
  value: string;
}

const ADDRESS_FIELDS: { key: keyof TaskerAddress; label: string }[] = [
  { key: "title", label: "Título" },
  { key: "province", label: "Provincia" },
  { key: "city", label: "Ciudad" },
  { key: "sector", label: "Sector" },
  { key: "zone", label: "Zona" },
  { key: "street", label: "Calle" },
  { key: "streetNumber", label: "Número" },
  { key: "building", label: "Edificio" },
  { key: "apartmentNumber", label: "N° de Apartamento" },
  { key: "latitude", label: "Latitud" },
  { key: "longitude", label: "Longitud" },
  { key: "referenceToArrive", label: "Referencias para llegar" },
  { key: "whoReceives", label: "Quién recibe" },
  { key: "restrictions", label: "Restricciones" },
];

/** Campos de la dirección en orden de Tasker, sin los vacíos. */
export function getAddressFields(address: TaskerAddress | null): AddressField[] {
  if (!address) return [];
  return ADDRESS_FIELDS.flatMap(({ key, label }) => {
    const raw = address[key];
    const value = raw == null ? "" : String(raw).trim();
    return value ? [{ key, label, value }] : [];
  });
}

export interface ChipTone {
  background: string;
  text: string;
}

/** Paleta fija de chips de tag: se elige por posición, no por el color del tag. */
const TAG_CHIP_TONES: ChipTone[] = [
  { background: DANGER_TINT_BACKGROUND, text: ERROR_TEXT },
  { background: PRIMARY_TINT_BACKGROUND, text: PRIMARY_700 },
  { background: SUCCESS_TINT_BACKGROUND, text: SUCCESS_COLOR },
  { background: VIOLET_TINT_BACKGROUND, text: ACCENT_VIOLET },
  { background: WARNING_TINT_BACKGROUND, text: WARNING_TEXT_STRONG },
  { background: INDIGO_TINT_BACKGROUND, text: INDIGO_TEXT },
];

export function getTagChipTone(position: number): ChipTone {
  const n = TAG_CHIP_TONES.length;
  return TAG_CHIP_TONES[((position % n) + n) % n];
}

/** Respaldo de Tasker cuando el estado no trae un color válido. */
export const TASKER_STATE_COLOR_FALLBACK = "#ccc";
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** Opacidad del fondo del chip de estado ("muy atenuado"). */
const STATE_CHIP_ALPHA = 0.14;

/** Punto y fondo del chip de estado a partir de state.color. */
export function getStateChipColors(color: string | null | undefined): {
  dot: string;
  background: string;
} {
  const dot = color && HEX_COLOR.test(color) ? color : TASKER_STATE_COLOR_FALLBACK;
  // "#ccc" se expande a 6 dígitos para poder leer los canales.
  const hex = dot === TASKER_STATE_COLOR_FALLBACK ? "cccccc" : dot.slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return { dot, background: `rgba(${r},${g},${b},${STATE_CHIP_ALPHA})` };
}

/** 10 dígitos → "(809) 555-0100"; cualquier otra cosa, sin cambios. */
export function formatPhone(value: string | null | undefined): string {
  if (value == null) return "";
  const match = /^(\d{3})(\d{3})(\d{4})$/.exec(value);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : value;
}

export function buildMapsUrl(lat: number | string, lng: number | string): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** Iniciales para el avatar de un comentario ("Jeremy Domínguez" → "JD"). */
export function getInitials(name: string | null | undefined): string {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/**
 * Respaldos de la config de Reportar Avería cuando la compañía no trae las
 * claves en school.settings (el backend no les pone default). Los usa
 * buildCompanySettings (store/useSchoolStore.ts) y resolveTaskerReportConfig.
 */
export const TASKER_SERVICE_NAME_LABEL_FALLBACK = "Servicio";
export const TASKER_DESCRIPTION_REQUIRED_FALLBACK = true;

/** Config de Reportar Avería a partir de companySettings (null → respaldos). */
export function resolveTaskerReportConfig(
  companySettings: CompanySettings | null,
): TaskerReportConfig {
  if (!companySettings) {
    return {
      serviceNameLabel: TASKER_SERVICE_NAME_LABEL_FALLBACK,
      isDescriptionRequired: TASKER_DESCRIPTION_REQUIRED_FALLBACK,
    };
  }
  return {
    serviceNameLabel: companySettings.serviceNameLabel,
    isDescriptionRequired: companySettings.isDescriptionRequired,
  };
}

/** Validación de "Guardar y enviar", con los textos de Tasker. */
export function validateReport(
  values: { typeId: number | null | undefined; description: string },
  config: TaskerReportConfig,
): TaskerReportErrors {
  const errors: TaskerReportErrors = {};
  if (values.typeId == null) errors.typeId = "Tipo es un campo requerido";
  if (config.isDescriptionRequired && !values.description.trim()) {
    errors.description = "La descripción es un campo requerido";
  }
  return errors;
}

// ─── Direcciones de Reportar Avería (MapAddressSelector de Tasker) ──────────
// Calcado de Tasker, rarezas incluidas, salvo las excepciones E1–E4 marcadas.

/** Campos del borrador, en el orden de la ventana (postalCode sin input). */
export const TASKER_ADDRESS_DRAFT_FIELDS: (keyof TaskerAddressDraft)[] = [
  "title",
  "province",
  "city",
  "sector",
  "zone",
  "street",
  "streetNumber",
  "building",
  "apartmentNumber",
  "referenceToArrive",
  "whoReceives",
  "restrictions",
  "postalCode",
];

/** Los que deshabilitan "Seleccionar" mientras falten. */
export const TASKER_REQUIRED_ADDRESS_FIELDS: (keyof TaskerAddressDraft)[] = [
  "province",
  "city",
  "sector",
  "street",
  "streetNumber",
];

export function emptyTaskerAddressDraft(): TaskerAddressDraft {
  return TASKER_ADDRESS_DRAFT_FIELDS.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {} as TaskerAddressDraft);
}

/** Carga de la ventana: cada campo de la dirección o "". */
export function taskerDraftFromAddress(
  address: TaskerAddress | null | undefined,
): TaskerAddressDraft {
  const draft = emptyTaskerAddressDraft();
  if (!address) return draft;
  TASKER_ADDRESS_DRAFT_FIELDS.forEach((key) => {
    const value = address[key];
    draft[key] = value == null ? "" : String(value);
  });
  return draft;
}

export function isTaskerAddressComplete(draft: TaskerAddressDraft): boolean {
  return TASKER_REQUIRED_ADDRESS_FIELDS.every((key) => draft[key].trim().length > 0);
}

function toCoordinate(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Punto inicial de la ventana: `location` de la dirección.
 * EXCEPCIÓN E2: al editar una dirección sin `location`, Tasker deja latitude y
 * longitude en undefined. Aquí, si no hay location pero sí latitude/longitude,
 * se usan esas. Sin ninguna de las dos → null.
 */
export function resolveTaskerInitialPoint(
  address: TaskerAddress | null | undefined,
): LatLng | null {
  if (!address) return null;
  const loc = address.location;
  if (typeof loc?.lat === "number" && typeof loc?.lng === "number") {
    return { lat: loc.lat, lng: loc.lng };
  }
  const lat = toCoordinate(address.latitude);
  const lng = toCoordinate(address.longitude);
  return lat !== null && lng !== null ? { lat, lng } : null;
}

/**
 * geocodeDataHandler de Tasker: SOBRESCRIBE estos 9 campos, con "" si Google
 * no trae el componente, aunque el usuario ya hubiera escrito algo. No toca
 * title, referenceToArrive, whoReceives ni restrictions.
 */
export function applyTaskerGeocode(
  draft: TaskerAddressDraft,
  result: GeocodeResult,
): TaskerAddressDraft {
  const components = Array.isArray(result.address_components) ? result.address_components : [];
  const pick = (type: string) =>
    components.find((component) => component.types?.includes(type))?.long_name ?? "";
  return {
    ...draft,
    province: pick("administrative_area_level_1"),
    city: pick("locality"),
    sector: pick("neighborhood") || pick("sublocality_level_1"),
    zone: pick("administrative_area_level_2"),
    street: pick("route"),
    streetNumber: pick("street_number"),
    postalCode: pick("postal_code"),
    building: pick("establishment"),
    apartmentNumber: pick("subpremise"),
  };
}

/** "Calle Número, Zona, Sector, Ciudad, Provincia" sin los vacíos (Zona antes que Sector, como Tasker). */
export function formatTaskerAddress(draft: TaskerAddressDraft): string {
  const streetLine = [draft.street.trim(), draft.streetNumber.trim()].filter(Boolean).join(" ");
  return [streetLine, draft.zone, draft.sector, draft.city, draft.province]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * handlerSelect de Tasker: conserva todas las claves de `previous` (al
 * editar) y pisa con el borrador, formattedAddress, address y coordenadas.
 * Las coordenadas son las del RESULTADO de Google (geometry.location), no las
 * del punto tocado; sin resultado, las del punto inicial. No se redondean.
 *
 * EXCEPCIÓN E4: una dirección nueva a la que no se le tocó el mapa ni el
 * buscador (sin resultado y sin punto inicial) se guarda SIN coordenadas
 * (latitude/longitude null). Tasker le pone las del centro de Santo Domingo;
 * aquí no, a propósito, para no guardar una ubicación falsa.
 */
export function buildTaskerAddress({
  previous,
  draft,
  geocode,
  initialPoint,
}: {
  previous: TaskerAddress | null | undefined;
  draft: TaskerAddressDraft;
  geocode: GeocodeResult | null | undefined;
  initialPoint: LatLng | null | undefined;
}): TaskerAddress {
  const { location: _previousLocation, ...rest } = previous ?? ({} as Partial<TaskerAddress>);
  const point = geocodeLocation(geocode) ?? initialPoint ?? null;
  const title = draft.title.trim() ? draft.title : draft.sector.trim() ? draft.sector : draft.city;
  return {
    ...rest,
    ...draft,
    title,
    formattedAddress: formatTaskerAddress(draft),
    address: geocode?.formatted_address || previous?.address || "",
    ...(point
      ? { location: { lat: point.lat, lng: point.lng }, latitude: point.lat, longitude: point.lng }
      : { latitude: null, longitude: null }),
  };
}

/**
 * EXCEPCIÓN E1: en Tasker toda dirección nueva recibe id 2 (error de tipeo) y
 * editar o borrar una se lleva a las demás. Aquí: lista vacía → 1; si no, el
 * id mayor + 1.
 */
export function nextTaskerAddressId(list: TaskerReportAddress[]): number {
  return list.reduce((max, a) => Math.max(max, a.id), 0) + 1;
}

/** La nueva entra al final, marcada; las demás quedan sin marcar. */
export function addTaskerAddress(
  list: TaskerReportAddress[],
  address: TaskerAddress,
): TaskerReportAddress[] {
  const added: TaskerReportAddress = {
    ...address,
    id: nextTaskerAddressId(list),
    order: list.length + 1,
    selected: true,
  };
  return [...list.map((a) => ({ ...a, selected: false })), added];
}

/** Reemplaza por id y ordena por order. */
export function updateTaskerAddress(
  list: TaskerReportAddress[],
  address: TaskerReportAddress,
): TaskerReportAddress[] {
  return list.map((a) => (a.id === address.id ? address : a)).sort((a, b) => a.order - b.order);
}

/** Quita por id y renumera order 1..N. Si era la principal, no queda ninguna. */
export function removeTaskerAddress(
  list: TaskerReportAddress[],
  id: number,
): TaskerReportAddress[] {
  return list.filter((a) => a.id !== id).map((a, index) => ({ ...a, order: index + 1 }));
}

/** Marca esa y desmarca las demás; si ya estaba marcada, no queda ninguna. */
export function toggleTaskerAddressSelected(
  list: TaskerReportAddress[],
  id: number,
): TaskerReportAddress[] {
  const wasSelected = list.some((a) => a.id === id && a.selected);
  return list.map((a) => ({ ...a, selected: !wasSelected && a.id === id }));
}

export function getSelectedTaskerAddress(
  list: TaskerReportAddress[],
): TaskerReportAddress | undefined {
  return list.find((a) => a.selected === true);
}

/**
 * Quién Recibe y Restricciones. Único punto a cambiar cuando el backend
 * exponga addressSugestion.receiver y addressSugestion.restrictions.
 */
export function resolveTaskerAddressConfig(): TaskerAddressConfig {
  return { showWhoReceives: false, showRestrictions: false };
}
