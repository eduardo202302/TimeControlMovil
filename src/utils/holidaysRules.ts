/**
 * Reglas y acceso a datos de "Días Feriados tc" (webapp:
 * src/Features/Adm/Holidays/index.jsx), consumido en mobile como POPUP desde
 * el drawer en vez de pantalla propia — ver DrawerMenu.tsx (handleNavigate
 * intercepta path==="/holidays").
 *
 * Es el MISMO catálogo (tabla `holidays`) que usa el reasonCode
 * `feriado_no_laborable` al rechazar una solicitud de permiso
 * (SolicitarPermisoForm.tsx) y el banner de "hoy es feriado" de
 * punchinout.tsx — cualquier feriado creado/editado/eliminado acá afecta
 * esos otros flujos automáticamente, vía el backend.
 *
 * Mismo criterio que adminPermissionRules.ts: vive fuera de `src/app/` (no se
 * registra como ruta de expo-router) y no importa react-native ni expo-*, así
 * que se testea con jest sin emulador.
 */

import axios from "axios";
import { permissionDateKey } from "./permissionRules";
import { toRDDateString } from "./punchRules";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Holiday {
  id: number;
  schoolId: number;
  admUserId: number;
  holidayDate: string;
  name: string;
  day: string;
  doublePayment: boolean;
  working: boolean;
  rangeHours: string;
  createdDate: string;
  applyLunch: boolean;
  isActive: boolean;
  /** Solo lo trae el GET (list/all/detail) — POST/PATCH no expanden la relación. */
  adminUser?: { user?: { fullName?: string } };
}

/** Filas por página — mismo valor que `rows` del defaultParams del webapp
 * (Holidays/index.jsx:23). */
export const HOLIDAYS_ROWS = 15;

/** Los 3 valores del dropdown de filtro del webapp (Holidays/index.jsx:278-282). */
export type HolidaysFilter = "true" | "false" | "all";

export const HOLIDAYS_FILTER_LABELS: Record<HolidaysFilter, string> = {
  true: "Activos",
  false: "Inactivos",
  all: "Todos",
};

// ─── Fecha ────────────────────────────────────────────────────────────────────

/**
 * Date del picker → "YYYY-MM-DD" en hora RD. Reusa `toRDDateString`, el mismo
 * helper de fecha corta que ya usa el resto de la app (p. ej. la validación
 * de `fromDate` en AdminPermissionCreateModal.tsx) — no se agrega moment.
 */
export function formatHolidayDate(date: Date): string {
  return toRDDateString(date);
}

/**
 * `holidayDate` puede volver con sufijo horario ("...T00:00:00.000Z") — el
 * mismo caso defensivo que ya cubre el webapp
 * (HolidaysCrud/index.jsx:129: `.split("T")[0]`). Reusa `permissionDateKey`,
 * que ya resuelve exactamente ese recorte para permissionDate.
 */
export function holidayDateKey(raw: string | null | undefined): string {
  return permissionDateKey(raw);
}

/**
 * ¿Editar/Eliminar visibles? Regla EXACTA del webapp
 * (Holidays/index.jsx:143,152 y HolidaysCrud/index.jsx:297): `holidayDate >=
 * hoy`, comparación lexicográfica de "YYYY-MM-DD" (que coincide con la
 * cronológica en ese formato). Un feriado ya pasado queda de solo lectura.
 */
export function isHolidayEditable(
  holidayDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const key = holidayDateKey(holidayDate);
  if (!key) return false;
  return key >= toRDDateString(now);
}

// ─── Día capitalizado ────────────────────────────────────────────────────────

/**
 * El backend manda `day` en español y minúscula ("lunes", "miércoles", …
 * ver getDayName en face-class-api/utils/methods.js). Mismo criterio de
 * capitalización que el webapp (Holidays/index.jsx:49).
 */
export function capitalizeDay(day: string | null | undefined): string {
  const value = String(day ?? "");
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// ─── Horario (rangeHours) ────────────────────────────────────────────────────

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Date (solo importa hora/minuto) → "h:mm am|pm" — mismo formato que
 * `format24To12Short` del webapp (HolidaysCrud/index.jsx:19-28), pero desde
 * un Date del picker en vez de un string "HH:mm".
 */
export function formatTimeShort(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

/** El string que espera `rangeHours` en el payload, ej. "8:00 am - 5:00 pm". */
export function buildRangeHours(start: Date, end: Date): string {
  return `${formatTimeShort(start)} - ${formatTimeShort(end)}`;
}

/**
 * El inverso de `buildRangeHours` — para seedear los pickers de Inicio/Fin al
 * editar un feriado existente. `base` fija año/mes/día del Date resultante
 * (por defecto hoy); solo importa la hora/minuto que lee el picker.
 * `null` si el string no matchea el formato esperado.
 */
export function parseRangeHours(
  rangeHours: string | null | undefined,
  base: Date = new Date(),
): { start: Date; end: Date } | null {
  const raw = String(rangeHours ?? "").trim();
  const match = raw.match(
    /^(\d{1,2}):(\d{2})\s*(am|pm)\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)\s*$/i,
  );
  if (!match) return null;

  const to24 = (hStr: string, mStr: string, ap: string): [number, number] => {
    let h = parseInt(hStr, 10) % 12;
    if (ap.toLowerCase() === "pm") h += 12;
    return [h, parseInt(mStr, 10)];
  };

  const [sh, sm] = to24(match[1], match[2], match[3]);
  const [eh, em] = to24(match[4], match[5], match[6]);

  const start = new Date(base);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(base);
  end.setHours(eh, em, 0, 0);
  return { start, end };
}

// ─── Payload de creación/edición ─────────────────────────────────────────────

export interface HolidayFormInput {
  name: string;
  holidayDate: Date;
  working: boolean;
  startTime: Date | null;
  endTime: Date | null;
  applyLunch: boolean;
  doublePayment: boolean;
}

/**
 * El body que espera POST/PATCH /holidays. Si `working` es false,
 * rangeHours/applyLunch/doublePayment se resetean — mismo normalizado que
 * `getCurrentData` del webapp (HolidaysCrud/index.jsx:188-200).
 */
export function buildHolidayPayload(input: HolidayFormInput): Record<string, unknown> {
  const working = input.working;
  const rangeHours =
    working && input.startTime && input.endTime
      ? buildRangeHours(input.startTime, input.endTime)
      : "";
  return {
    name: input.name.trim(),
    holidayDate: formatHolidayDate(input.holidayDate),
    working,
    rangeHours,
    applyLunch: working ? input.applyLunch : false,
    doublePayment: working ? input.doublePayment : false,
  };
}

/** Normaliza lo que vuelve del backend antes de guardarlo en estado. */
function normalizeHoliday(raw: Holiday): Holiday {
  return { ...raw, holidayDate: holidayDateKey(raw.holidayDate) };
}

// ─── Red ─────────────────────────────────────────────────────────────────────

interface AuthArgs {
  token: string;
  urlColegio: string;
}

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

function readErrorMessage(error: any): string {
  const raw = error?.response?.data?.message ?? error?.message;
  return typeof raw === "string" && raw.trim() !== ""
    ? raw
    : "No se pudo completar la operación.";
}

function logFailure(label: string, error: any): void {
  console.error(label, error?.response?.data?.message ?? error?.message);
}

export interface HolidaysPage {
  items: Holiday[];
  /** Total de filas de la tabla, o null si el envelope no lo trajo. */
  count: number | null;
  hasMore: boolean;
}

/**
 * Una página de `/holidays` (tabla paginada, NO `/holidays/all`: ese trae
 * todo sin paginar y sin filtro de `isActive`, y el webapp no lo usa desde
 * ningún componente — no hay caso de uso que replicar en mobile).
 */
export async function fetchHolidaysPage({
  token,
  urlColegio,
  page = 1,
  rows = HOLIDAYS_ROWS,
  orderKey = "id",
  orderDir = "desc",
  isActive = "true",
}: AuthArgs & {
  page?: number;
  rows?: number;
  orderKey?: string;
  orderDir?: "asc" | "desc";
  isActive?: HolidaysFilter;
}): Promise<HolidaysPage> {
  const params: Record<string, string | number> = { page, rows, orderKey, orderDir };
  // "all" no manda el filtro — igual que el webapp (Holidays/index.jsx:38-40).
  if (isActive !== "all") params.isActive = isActive === "true" ? 1 : 0;

  const response = await axios.get(`${urlColegio}/holidays`, {
    ...authHeaders(token),
    params,
  });
  if (!response.data?.success) return { items: [], count: null, hasMore: false };

  const payload = (response.data.data ?? {}) as { items?: Holiday[]; count?: number };
  const rawCount = payload.count;
  const count = typeof rawCount === "number" ? rawCount : null;
  const items = (Array.isArray(payload.items) ? payload.items : []).map(normalizeHoliday);

  // Mismo criterio de hasMore que fetchAdminPermissionsPage: página llena y
  // el count (si vino) todavía no dice que se leyó todo.
  const hasMore = items.length >= rows && (count == null || page * rows < count);

  return { items, count, hasMore };
}

export interface HolidayMutationResult {
  ok: boolean;
  /** Mensaje del backend TAL CUAL — incluye "Ya existe un feriado para esa
   * fecha" en ER_DUP_ENTRY (Holiday/handlers.js:97-101,135-139), sin
   * reescribirlo del lado del cliente. */
  message: string;
  data: Holiday | null;
}

export async function createHoliday({
  token,
  urlColegio,
  payload,
}: AuthArgs & { payload: Record<string, unknown> }): Promise<HolidayMutationResult> {
  try {
    const response = await axios.post(`${urlColegio}/holidays`, payload, authHeaders(token));
    return {
      ok: Boolean(response.data?.success),
      message: response.data?.message ?? "",
      data: response.data?.data ?? null,
    };
  } catch (error: any) {
    logFailure("createHoliday:", error);
    return { ok: false, message: readErrorMessage(error), data: null };
  }
}

export async function patchHoliday({
  token,
  urlColegio,
  id,
  payload,
}: AuthArgs & {
  id: number;
  payload: Record<string, unknown>;
}): Promise<HolidayMutationResult> {
  try {
    const response = await axios.patch(
      `${urlColegio}/holidays/${id}`,
      payload,
      authHeaders(token),
    );
    return {
      ok: Boolean(response.data?.success),
      message: response.data?.message ?? "",
      data: response.data?.data ?? null,
    };
  } catch (error: any) {
    logFailure("patchHoliday:", error);
    return { ok: false, message: readErrorMessage(error), data: null };
  }
}

export interface HolidayDeleteResult {
  ok: boolean;
  message: string;
}

export async function deleteHoliday({
  token,
  urlColegio,
  id,
}: AuthArgs & { id: number }): Promise<HolidayDeleteResult> {
  try {
    const response = await axios.delete(`${urlColegio}/holidays/${id}`, authHeaders(token));
    return {
      ok: Boolean(response.data?.success),
      message: response.data?.message ?? "",
    };
  } catch (error: any) {
    logFailure("deleteHoliday:", error);
    return { ok: false, message: readErrorMessage(error) };
  }
}
