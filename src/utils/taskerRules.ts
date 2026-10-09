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
  TaskerComment,
  TaskerReportConfig,
  TaskerReportErrors,
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
