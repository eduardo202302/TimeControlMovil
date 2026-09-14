/**
 * Reglas del formulario de Usuario (webapp: Maintenance/Users/Modals/MtnUserCrud
 * + SubComponents/UserBasicInfo, UserSettings y LastAbcencesAndTardiness).
 *
 * Mismo criterio que usersRules.ts: fuera de `src/app/`, sin react-native ni
 * expo-*, testeable con jest. El estado vive en useUserForm.ts; acá solo las
 * transformaciones puras que ese hook aplica.
 */

import axios from "axios";
import type { Address, SchoolSettings } from "../../types/typeStore/SchoolStoreType";
import type { UserCategory } from "./usersRules";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type UserFormMode = "add" | "edit" | "watch";

export interface UserRole {
  id: number;
  name: string;
  permissions?: {
    applyTimeControl?: boolean | null;
    applySchedule?: boolean | null;
    createExcuses?: boolean | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface UserFormTag {
  id: number;
  name: string;
  categoryId?: number | null;
  CategoryId?: number | null;
  category?: { id?: number; name?: string } | null;
  color?: string | null;
}

export type UserSettingKey =
  | "isTimeControl"
  | "isValidLocation"
  | "isImageRequired"
  | "isWorkingLunch"
  | "isCreateExcuses";

/** Mismo shape que `initializeFormData` del webapp (MtnUserCrud:122-145). */
export interface UserFormData {
  isActive: boolean;
  /** `user.photourl` — arreglo con 0 o 1 data-URL / URL. */
  photourl: string[];
  fullName: string;
  nickName: string;
  email: string;
  code: string;
  pin: string;
  phone: string;
  waId: string;
  password: string;
  /** Id del rol, o "" si no hay rol elegido. */
  role: number | "";
  cedula: string;
  isValidLocation: boolean;
  isImageRequired: boolean;
  isTimeControl: boolean;
  isWorkingLunch: boolean;
  isCreateExcuses: boolean;
  /** `schoolUser.address`: arreglo de 1 dirección, o null — nunca `[]`. */
  address: Address[] | null;
  tags: UserFormTag[];
  branchTagId: number | "";
  departmentTagId: number | "";
}

export type UserFormErrorKey = "fullName" | "email" | "phone" | "password" | "role" | "cedula" | "image";
export type UserFormErrors = Partial<Record<UserFormErrorKey, string>>;

/** Flags de la escuela que usa el formulario — nombres del mapStateToProps del webapp. */
export interface CompanyUserSettings {
  companyIsValidLocation: boolean;
  companyIsValidLocationDefault: boolean;
  companyIsImageRequired: boolean;
  companyIsImageRequiredDefault: boolean;
  companyIsTimeControlDefault: boolean;
  companyCedula: boolean;
  companyIsWorkingLunch: boolean;
  companyIsWorkingLunchDefault: boolean;
}

/** Registro de GET /users/:id — solo lo que consume el formulario. */
export interface UserDetail {
  id: number;
  isActive?: boolean | null;
  photourl?: string | null;
  code?: string | null;
  branchTagId?: number | null;
  departmentTagId?: number | null;
  address?: Address[] | null;
  role?: UserRole | null;
  tags?: UserFormTag[] | null;
  settings?: Partial<Record<UserSettingKey, boolean | null>> | null;
  user?: {
    fullName?: string | null;
    nickName?: string | null;
    email?: string | null;
    pin?: string | null;
    phone?: string | null;
    waId?: string | null;
    cedula?: string | number | null;
  } | null;
  userSchedules?: UserScheduleRecord[] | null;
  userAbsence?: UserAbsenceRecord | null;
  userLateness?: UserLatenessRecord | null;
  [key: string]: unknown;
}

/** Fila de `userSchedules` tal cual viene del backend (horas "HH:mm:ss"). */
export interface UserScheduleRecord {
  id?: number;
  weekDay?: string | null;
  workEntryTime?: string | null;
  workExitTime?: string | null;
  lunchEntryTime?: string | null;
  lunchExitTime?: string | null;
  [key: string]: unknown;
}

export interface UserAbsenceRecord {
  createdDate?: string | null;
  lastDate?: string | null;
  justified?: boolean | null;
  absence?: { state?: { name?: string | null; color?: string | null } | null } | null;
}

export interface UserLatenessRecord {
  createdDate?: string | null;
  lastDate?: string | null;
  overtime?: string | number | null;
  type?: string | null;
}

// ─── Settings de la escuela ──────────────────────────────────────────────────

/** Defaults idénticos a los `get(company, ..., default)` del webapp (MtnUserCrud:900-913). */
export function readCompanyUserSettings(
  settings: SchoolSettings | null | undefined,
): CompanyUserSettings {
  const s = settings ?? {};
  const flag = (value: unknown, fallback: boolean) =>
    value === undefined || value === null ? fallback : value === true;
  return {
    companyIsValidLocation: flag(s.isValidLocation, false),
    companyIsValidLocationDefault: flag(s.isValidLocationDefault, true),
    companyIsImageRequired: flag(s.isImageRequired, false),
    companyIsImageRequiredDefault: flag(s.isImageRequiredDefault, true),
    companyIsTimeControlDefault: flag(s.isAccessControl, false),
    companyCedula: flag(s.cedula, false),
    companyIsWorkingLunch: flag(s.isWorkingLunch, false),
    companyIsWorkingLunchDefault: flag(s.isWorkingLunchDefault, true),
  };
}

// ─── Estado inicial ──────────────────────────────────────────────────────────

export function buildEmptyUserForm(company: CompanyUserSettings): UserFormData {
  return {
    isActive: true,
    photourl: [],
    fullName: "",
    nickName: "",
    email: "",
    code: "",
    pin: "",
    phone: "",
    waId: "",
    password: "",
    role: "",
    cedula: "",
    isValidLocation: company.companyIsValidLocationDefault,
    isImageRequired: company.companyIsImageRequiredDefault,
    isTimeControl: company.companyIsTimeControlDefault,
    isWorkingLunch: company.companyIsWorkingLunchDefault,
    isCreateExcuses: false,
    address: null,
    tags: [],
    branchTagId: "",
    departmentTagId: "",
  };
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** Port de setUpFetchData del webapp (MtnUserCrud:300-340). */
export function buildUserFormFromDetail(
  detail: UserDetail,
  company: CompanyUserSettings,
): UserFormData {
  const settings = detail.settings ?? {};
  const pick = (key: UserSettingKey, fallback: boolean) =>
    settings[key] !== undefined && settings[key] !== null ? settings[key] === true : fallback;
  const roleId = detail.role?.id;
  return {
    isActive: detail.isActive ?? true,
    photourl: detail.photourl ? [String(detail.photourl)] : [],
    fullName: str(detail.user?.fullName),
    nickName: str(detail.user?.nickName),
    email: str(detail.user?.email),
    pin: str(detail.user?.pin),
    phone: str(detail.user?.phone),
    waId: str(detail.user?.waId),
    code: str(detail.code),
    cedula: str(detail.user?.cedula),
    role: typeof roleId === "number" ? roleId : "",
    password: "",
    isValidLocation: pick("isValidLocation", company.companyIsValidLocationDefault),
    isImageRequired: pick("isImageRequired", company.companyIsImageRequiredDefault),
    isTimeControl: pick("isTimeControl", company.companyIsTimeControlDefault),
    isWorkingLunch: pick("isWorkingLunch", company.companyIsWorkingLunchDefault),
    isCreateExcuses: pick(
      "isCreateExcuses",
      detail.role?.permissions?.createExcuses === true,
    ),
    address: Array.isArray(detail.address) && detail.address.length > 0 ? detail.address : null,
    tags: Array.isArray(detail.tags) ? detail.tags : [],
    branchTagId: typeof detail.branchTagId === "number" ? detail.branchTagId : "",
    departmentTagId: typeof detail.departmentTagId === "number" ? detail.departmentTagId : "",
  };
}

// ─── Permisos del rol seleccionado ───────────────────────────────────────────

function findRole(roles: UserRole[], roleId: number | ""): UserRole | undefined {
  if (roleId === "") return undefined;
  return roles.find((role) => Number(role.id) === Number(roleId));
}

/**
 * Los tres permisos salen de `role.permissions` del rol SELECCIONADO en el
 * dropdown. Defaults de frontend (el backend no los rellena):
 * applyTimeControl=false, applySchedule=true, createExcuses=false.
 * `applySchedule` además es false sin rol elegido (getRoleAppliesSchedule).
 */
export function resolveRoleCapabilities(roles: UserRole[], roleId: number | "") {
  const role = findRole(roles, roleId);
  const permissions = role?.permissions ?? {};
  return {
    canApplyTimeControl: permissions.applyTimeControl === true,
    canApplySchedule:
      roleId === "" ? false : (permissions.applySchedule ?? true) === true,
    canCreateExcuses: permissions.createExcuses === true,
  };
}

const TIME_CONTROL_RESET = {
  isValidLocation: false,
  isImageRequired: false,
  isTimeControl: false,
  isWorkingLunch: false,
} as const;

/** handlerInputs name==="role" del webapp (MtnUserCrud:345-353). */
export function applyRoleChange(
  form: UserFormData,
  roleId: number | "",
  roles: UserRole[],
): UserFormData {
  const { canApplyTimeControl, canCreateExcuses } = resolveRoleCapabilities(roles, roleId);
  return {
    ...form,
    role: roleId,
    isCreateExcuses: canCreateExcuses,
    ...(canApplyTimeControl ? {} : TIME_CONTROL_RESET),
  };
}

/** handleCheck del webapp: apagar TC apaga Ubicación e Imagen en cascada. */
export function applySettingToggle(
  form: UserFormData,
  key: UserSettingKey,
  value: boolean,
): UserFormData {
  if (key === "isTimeControl" && !value) {
    return { ...form, isTimeControl: false, isValidLocation: false, isImageRequired: false };
  }
  return { ...form, [key]: value };
}

export function sortRolesByName(roles: UserRole[]): UserRole[] {
  return roles.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

// ─── Formato / validación ────────────────────────────────────────────────────

/** Máscara 000-0000000-0 mientras se escribe (11 dígitos máx.). */
export function maskCedula(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
}

/** Máscara (809) 555-1234 mientras se escribe — mismo formato que phoneFormat del webapp. */
export function maskPhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(0, 11);
  if (digits.length === 11) {
    return digits.replace(/(\d{1})(\d{3})(\d{3})(\d{4})/, "$1 ($2) $3-$4");
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Whatsapp válido para República Dominicana. El webapp usa
 * `isValidPhoneNumber(value, "DO")` de libphonenumber-js, que no está en
 * este repo (y la app no tiene otro validador de teléfono: register.tsx solo
 * pide min 7). Se aplica la misma regla de numeración NANP que valida esa
 * librería para DO: códigos de área 809/829/849, 7 dígitos de abonado que no
 * empiezan en 0/1, con prefijo país "1" opcional.
 */
export function isValidRDPhone(raw: string | null | undefined): boolean {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return /^8[024]9[2-9]\d{6}$/.test(digits);
}

/** Joi `.email({ tlds: { allow: false } })` — formato local@dominio.tld sin validar TLD. */
export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

export interface ValidateUserFormArgs {
  form: UserFormData;
  mode: UserFormMode;
  isUserImageRequired: boolean;
}

/**
 * Port del schema Joi + chequeo de imagen de handlerSaved (MtnUserCrud:60-110,
 * 590-605). Regla ya decidida y replicada tal cual: con `isActive === false`
 * NO se valida nada (el webapp solo bloquea `if (formData.isActive && ...)`).
 */
export function validateUserForm({
  form,
  mode,
  isUserImageRequired,
}: ValidateUserFormArgs): UserFormErrors {
  if (!form.isActive) return {};
  const errors: UserFormErrors = {};

  if (form.fullName === "") errors.fullName = "Nombre completo es un campo requerido";
  else if (form.fullName.length < 6) errors.fullName = "Nombre debe tener mínimo 6 caracteres";

  if (form.email === "") errors.email = "Correo es un campo requerido";
  else if (!isValidEmail(form.email)) errors.email = "Correo no válido";

  if (form.phone === "") errors.phone = "Whatsapp es un campo requerido";
  else if (!isValidRDPhone(form.phone)) errors.phone = "Whatsapp no es válido";

  if (mode === "add") {
    if (form.password === "") errors.password = "Contraseña es un campo requerido";
    else if (form.password.length < 4) errors.password = "Contraseña debe tener mínimo 4 caracteres";
  }

  if (form.role === "") errors.role = "Rol es un campo requerido";

  const cedulaDigits = form.cedula.replace(/\D/g, "");
  if (form.cedula.trim() !== "" && cedulaDigits.length !== 9 && cedulaDigits.length !== 11) {
    errors.cedula = "La cédula debe tener 9 u 11 dígitos";
  }

  if (isUserImageRequired && form.photourl.length === 0) errors.image = "Foto es requerida";

  return errors;
}

// ─── Snapshot para "salir sin guardar" ───────────────────────────────────────

/**
 * Normalización equivalente a getCurrentData del webapp (trim, solo dígitos
 * en teléfono/cédula, "" → null, tags como ids) — dos formularios con el
 * mismo snapshot no tienen cambios que guardar.
 */
export function snapshotUserForm(form: UserFormData, mode: UserFormMode): string {
  const orNull = (value: string) => (value.trim() === "" ? null : value.trim());
  return JSON.stringify({
    fullName: form.fullName.trim(),
    nickName: orNull(form.nickName),
    pin: form.pin === "" ? null : form.pin,
    email: form.email.trim(),
    phone: form.phone.replace(/\D/g, ""),
    waId: orNull(form.waId),
    cedula: form.cedula.replace(/\D/g, "") || null,
    photourl: form.photourl,
    password: mode === "add" ? form.password : undefined,
    roleId: form.role,
    isActive: form.isActive,
    code: orNull(form.code),
    address: form.address,
    settings: {
      isTimeControl: form.isTimeControl,
      isValidLocation: form.isValidLocation,
      isImageRequired: form.isImageRequired,
      isWorkingLunch: form.isWorkingLunch,
      isCreateExcuses: form.isCreateExcuses,
    },
    tagIds: form.tags.map((tag) => tag.id),
    branchTagId: form.branchTagId === "" ? null : form.branchTagId,
    departmentTagId: form.departmentTagId === "" ? null : form.departmentTagId,
  });
}

// ─── Tags / Sucursal y Departamento ──────────────────────────────────────────

export function tagCategoryId(tag: UserFormTag | null | undefined): number | null {
  const raw = tag?.categoryId ?? tag?.CategoryId ?? tag?.category?.id;
  return raw === undefined || raw === null ? null : Number(raw);
}

function inCategory(tag: UserFormTag, categoryId: number): boolean {
  return String(tagCategoryId(tag)) === String(categoryId);
}

export function tagsOfCategory(tags: UserFormTag[], categoryId: number): UserFormTag[] {
  return tags.filter((tag) => inCategory(tag, categoryId));
}

/**
 * Sucursal/Departamento se identifican por substring del nombre de la
 * categoría, case-insensitive — mismo criterio frágil que findCatIdByName
 * del webapp, replicado tal cual.
 */
export function findCategoryIdByName(
  categories: UserCategory[],
  needle: "sucursal" | "departamento",
): number | null {
  const match = categories.find((category) =>
    String(category.name ?? "").toLowerCase().includes(needle),
  );
  return match ? match.id : null;
}

function toFormTag(tag: UserFormTag): UserFormTag {
  return { id: tag.id, name: tag.name, categoryId: tagCategoryId(tag) };
}

/**
 * computeDefValues del webapp: si el Def. está vacío y hay tags de su
 * categoría, toma el primero; si el tag del Def. ya no está seleccionado, lo
 * limpia (y cae al primero si queda alguno).
 */
export function computeDefTagIds(
  tags: UserFormTag[],
  categories: UserCategory[],
  current: { branchTagId: number | ""; departmentTagId: number | "" },
): { branchTagId: number | ""; departmentTagId: number | "" } {
  const pick = (categoryId: number | null, value: number | ""): number | "" => {
    if (categoryId == null) return value;
    const selected = tagsOfCategory(tags, categoryId);
    if (value !== "" && selected.some((tag) => tag.id === value)) return value;
    return selected.length > 0 ? selected[0].id : "";
  };
  return {
    branchTagId: pick(findCategoryIdByName(categories, "sucursal"), current.branchTagId),
    departmentTagId: pick(findCategoryIdByName(categories, "departamento"), current.departmentTagId),
  };
}

/**
 * handleTagChange del webapp: reemplaza los tags de `categoryId` por
 * `selectedIds` (en el orden de selección, así "el primero" es el primero
 * elegido) y recalcula los Def.
 */
export function applyCategoryTags(
  form: UserFormData,
  categoryId: number,
  selectedIds: number[],
  allTags: UserFormTag[],
  categories: UserCategory[],
): UserFormData {
  const others = form.tags.filter((tag) => !inCategory(tag, categoryId));
  const chosen = selectedIds
    .map((id) => allTags.find((tag) => tag.id === id && inCategory(tag, categoryId)))
    .filter((tag): tag is UserFormTag => Boolean(tag))
    .map(toFormTag);
  const tags = [...others, ...chosen];
  return { ...form, tags, ...computeDefTagIds(tags, categories, form) };
}

/** handleSelectAll del webapp. */
export function applySelectAllCategory(
  form: UserFormData,
  categoryId: number,
  checked: boolean,
  allTags: UserFormTag[],
  categories: UserCategory[],
): UserFormData {
  const ids = checked ? tagsOfCategory(allTags, categoryId).map((tag) => tag.id) : [];
  return applyCategoryTags(form, categoryId, ids, allTags, categories);
}

export function isAllCategorySelected(
  form: UserFormData,
  categoryId: number,
  allTags: UserFormTag[],
): boolean {
  const total = tagsOfCategory(allTags, categoryId).length;
  return total > 0 && total === tagsOfCategory(form.tags, categoryId).length;
}

// ─── Ult. Registros ──────────────────────────────────────────────────────────

const LATENESS_TYPE_LABELS: Record<string, string> = {
  InicioJornada: "Inicio Jornada",
  FinAlmuerzo: "Fin Almuerzo",
};

export function latenessTypeLabel(type: string | null | undefined): string {
  return LATENESS_TYPE_LABELS[String(type ?? "")] ?? String(type ?? "");
}

/** `formatDateTime(date, false)` del webapp → "DD/MM/AAAA" en hora local. */
export function formatRecordDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** Los "sin tardanza real" que filtra LastAbcencesAndTardiness:36-42 del webapp. */
const ZERO_OVERTIME: readonly (string | number)[] = ["0min", "0 min", "0", 0];

/**
 * Fecha a mostrar de la última Tardanza, o null si no hay que mostrarla —
 * mismo `hasDataLateness` del webapp: sin registro, o con overtime en cero
 * (el backend siempre arma `userLateness` con `overtime: "0min"` aunque no
 * haya tardanza, ver getUser en Users/handlers.js).
 */
export function latenessRecordDate(record: UserLatenessRecord | null | undefined): string | null {
  if (!record) return null;
  if (record.overtime != null && ZERO_OVERTIME.includes(record.overtime)) return null;
  return recordDate(record);
}

/** Fecha a mostrar del registro, o null si no hay registro (createdDate || lastDate). */
export function recordDate(
  record: { createdDate?: string | null; lastDate?: string | null } | null | undefined,
): string | null {
  const raw = record?.createdDate || record?.lastDate;
  return raw ? formatRecordDate(raw) || null : null;
}

// ─── Horarios ────────────────────────────────────────────────────────────────
// Port de Modals/scheduleUserPonch (index.jsx + helpers.js + staticData.js).

export const USER_WEEK_DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

/** Lun–Vie — LABORABLE_DAYS del webapp. */
const LABORABLE_DAYS = new Set<string>(USER_WEEK_DAYS.slice(0, 5));

export const SCHEDULE_FIELDS = [
  "workEntryTime",
  "workExitTime",
  "lunchEntryTime",
  "lunchExitTime",
] as const;
export type ScheduleField = (typeof SCHEDULE_FIELDS)[number];

/**
 * Una fila por día. Horas en "HH:mm" 24h o "" si está vacía. `id` es el id
 * numérico de `userSchedules` si el día ya existía en el backend, o
 * "day-<index>" si no (mismo criterio que createEmptyRow del webapp).
 */
export interface ScheduleRow {
  id: number | string;
  weekDay: string;
  workEntryTime: string;
  workExitTime: string;
  lunchEntryTime: string;
  lunchExitTime: string;
}

/** formatTimeValue del webapp: "08:00:00" / "…T08:00:00" → "08:00". */
export function formatScheduleTime(value: unknown): string {
  if (!value) return "";
  const raw = String(value);
  if (raw.includes("T")) return raw.split("T")[1]?.slice(0, 5) ?? "";
  if (raw.includes(":")) return raw.slice(0, 5);
  return raw;
}

function emptyScheduleRow(day: string, index: number): ScheduleRow {
  return {
    id: `day-${index}`,
    weekDay: day,
    workEntryTime: "",
    workExitTime: "",
    lunchEntryTime: "",
    lunchExitTime: "",
  };
}

export function createDefaultScheduleRows(): ScheduleRow[] {
  return USER_WEEK_DAYS.map((day, index) => emptyScheduleRow(day, index));
}

/** normalizeUserSchedules del webapp: siempre 7 filas Lunes…Domingo. */
export function normalizeUserSchedules(
  source: UserScheduleRecord[] | null | undefined,
): ScheduleRow[] {
  const list = Array.isArray(source) ? source : [];
  return USER_WEEK_DAYS.map((day, index) => {
    const match = list.find(
      (item) => String(item?.weekDay ?? "").toLowerCase() === day.toLowerCase(),
    );
    const row = emptyScheduleRow(day, index);
    if (!match) return row;
    return {
      id: typeof match.id === "number" ? match.id : row.id,
      weekDay: match.weekDay || day,
      workEntryTime: formatScheduleTime(match.workEntryTime),
      workExitTime: formatScheduleTime(match.workExitTime),
      lunchEntryTime: formatScheduleTime(match.lunchEntryTime),
      lunchExitTime: formatScheduleTime(match.lunchExitTime),
    };
  });
}

export function schedulesFromDetail(detail: UserDetail | null | undefined): ScheduleRow[] {
  return normalizeUserSchedules(detail?.userSchedules);
}

export type ScheduleBulkScope = "all" | "laborables";

/** handleApplyAll / handleApplyLaborables (y sus variantes de almuerzo). */
export function applyScheduleBulk(
  rows: ScheduleRow[],
  scope: ScheduleBulkScope,
  values: Partial<Pick<ScheduleRow, ScheduleField>>,
): ScheduleRow[] {
  return rows.map((row) =>
    scope === "all" || LABORABLE_DAYS.has(row.weekDay) ? { ...row, ...values } : row,
  );
}

/**
 * Trash de Jornada del webapp (handleClearAll): vacía las 7 filas completas.
 * Conserva el `id` numérico de cada día para que el diff lo mande a
 * schedulesDel (en el webapp createDefaultScheduleRows pierde el id, pero el
 * diff igual compara contra `initial`, que lo tiene).
 */
export function clearAllSchedules(rows: ScheduleRow[]): ScheduleRow[] {
  return rows.map((row) => ({
    ...row,
    workEntryTime: "",
    workExitTime: "",
    lunchEntryTime: "",
    lunchExitTime: "",
  }));
}

/** handleClearLunch del webapp. */
export function clearLunchSchedules(rows: ScheduleRow[]): ScheduleRow[] {
  return rows.map((row) => ({ ...row, lunchEntryTime: "", lunchExitTime: "" }));
}

/** formatTo12Hour del webapp: "13:05" → "1:05 PM". */
export function formatTo12Hour(time: string): string {
  if (!time) return "";
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${period}`;
}

export interface CompanyScheduleContext {
  /** `settings.schedulesAdd.workEntryTime` del webapp. */
  companyEntryTime: string;
  companyExitTime: string;
  /** `settings.schedulesAdd` — horario de la escuela por día. */
  companySchedules: UserScheduleRecord[];
}

/**
 * Mismo `get(company, "settings.schedulesAdd.workEntryTime", "")` que el
 * mapStateToProps de MtnUserCrud. Hoy el backend guarda `schedulesAdd` como
 * arreglo, así que la hora global queda "" y la validación contra la escuela
 * sale del horario por día — igual que en el webapp.
 */
export function readCompanyScheduleContext(
  settings: SchoolSettings | null | undefined,
): CompanyScheduleContext {
  const raw = settings?.schedulesAdd as unknown;
  if (Array.isArray(raw)) {
    return { companyEntryTime: "", companyExitTime: "", companySchedules: raw as UserScheduleRecord[] };
  }
  const obj = (raw ?? {}) as UserScheduleRecord;
  return {
    companyEntryTime: str(obj.workEntryTime),
    companyExitTime: str(obj.workExitTime),
    companySchedules: [],
  };
}

export type ScheduleValidation = { isValid: true } | { isValid: false; message: string };

/**
 * Port 1:1 de validateScheduleRows (helpers.js del webapp), mismo orden: la
 * primera regla que falla corta. `isScheduleRequired` = canApplyTimeControl
 * del rol seleccionado.
 */
export function validateScheduleRows(
  rows: ScheduleRow[],
  company: CompanyScheduleContext,
  { isScheduleRequired }: { isScheduleRequired: boolean },
): ScheduleValidation {
  const t12 = formatTo12Hour;
  const normalize = (time: unknown) => (time ? String(time).slice(0, 5) : "");
  const globalEntry = normalize(company.companyEntryTime);
  const globalExit = normalize(company.companyExitTime);
  const daily: Record<string, UserScheduleRecord> = {};
  for (const compRow of company.companySchedules) {
    if (compRow?.weekDay) daily[compRow.weekDay] = compRow;
  }
  const fail = (message: string): ScheduleValidation => ({ isValid: false, message });
  let hasValidDay = false;

  for (const row of rows) {
    const day = row.weekDay;
    const ws = row.workEntryTime || "";
    const we = row.workExitTime || "";
    const ls = row.lunchEntryTime || "";
    const le = row.lunchExitTime || "";
    const wsF = ws !== "";
    const weF = we !== "";
    const lsF = ls !== "";
    const leF = le !== "";

    if (wsF !== weF) return fail(`Completa la Entrada y Salida en ${day}.`);
    if (lsF !== leF) return fail(`Completa la Entrada y Salida de almuerzo en ${day}.`);

    if (wsF && weF && ws >= we) {
      return fail(
        `La hora de entrada el ${day} (${t12(ws)}) no puede ser mayor o igual a la hora de salida (${t12(we)}).`,
      );
    }

    if (lsF && leF) {
      if (ls >= le) {
        return fail(
          `La entrada al almuerzo el ${day} (${t12(ls)}) no puede ser mayor o igual a su salida (${t12(le)}).`,
        );
      }
      if (wsF && weF) {
        if (ls < ws) {
          return fail(
            `La entrada al almuerzo el ${day} (${t12(ls)}) no puede ser menor a la entrada al trabajo (${t12(ws)}).`,
          );
        }
        if (le > we) {
          return fail(
            `La salida del almuerzo el ${day} (${t12(le)}) no puede ser mayor a la salida del trabajo (${t12(we)}).`,
          );
        }
      } else {
        return fail(
          `Configura primero la Entrada y Salida el ${day}, antes de agregar almuerzo.`,
        );
      }
    }

    const companyDay = daily[day];
    if (company.companySchedules.length > 0 && (wsF || weF || lsF || leF)) {
      if (!companyDay) {
        return fail(`La compañía no tiene horario el ${day}. No puedes asignar horario ese día.`);
      }
      if (!normalize(companyDay.workEntryTime) && !normalize(companyDay.workExitTime)) {
        return fail(
          `La compañía no tiene horario de trabajo el ${day}. No puedes asignar horario ese día.`,
        );
      }
    }

    let dayEntry = globalEntry;
    let dayExit = globalExit;
    if (companyDay) {
      const specEntry = normalize(companyDay.workEntryTime);
      const specExit = normalize(companyDay.workExitTime);
      if (specEntry) dayEntry = specEntry;
      if (specExit) dayExit = specExit;
    }

    if (dayEntry) {
      if (wsF && ws < dayEntry) {
        return fail(
          `La hora de entrada el ${day} (${t12(ws)}) no puede ser menor al horario de entrada de la compañía en ese día (${t12(dayEntry)}).`,
        );
      }
      if (weF && we < dayEntry) {
        return fail(
          `La hora de salida en ${day} (${t12(we)}) no puede ser menor al horario de entrada de la compañía (${t12(dayEntry)}).`,
        );
      }
      if (lsF && ls < dayEntry) {
        return fail(
          `La hora de entrada al almuerzo en ${day} (${t12(ls)}) no puede ser menor al horario de entrada de la compañía (${t12(dayEntry)}).`,
        );
      }
      if (leF && le < dayEntry) {
        return fail(
          `La hora de salida del almuerzo en ${day} (${t12(le)}) no puede ser menor al horario de entrada de la compañía (${t12(dayEntry)}).`,
        );
      }
    }

    if (dayExit) {
      if (wsF && ws > dayExit) {
        return fail(
          `La hora de entrada en ${day} (${t12(ws)}) no puede ser mayor al horario de salida de la compañía (${t12(dayExit)}).`,
        );
      }
      if (weF && we > dayExit) {
        return fail(
          `La hora de salida el ${day} (${t12(we)}) no puede ser mayor al horario de salida de la compañía en ese día (${t12(dayExit)}).`,
        );
      }
      if (lsF && ls > dayExit) {
        return fail(
          `La hora de entrada al almuerzo en ${day} (${t12(ls)}) no puede ser mayor al horario de salida de la compañía (${t12(dayExit)}).`,
        );
      }
      if (leF && le > dayExit) {
        return fail(
          `La hora de salida del almuerzo en ${day} (${t12(le)}) no puede ser mayor al horario de salida de la compañía (${t12(dayExit)}).`,
        );
      }
    }

    if (wsF && weF) hasValidDay = true;
  }

  if (isScheduleRequired && !hasValidDay) {
    return fail("Debes configurar la Entrada y Salida en al menos un día.");
  }
  return { isValid: true };
}

export interface SchedulePayloadRow {
  weekDay: string;
  workEntryTime: string | null;
  workExitTime: string | null;
  lunchEntryTime: string | null;
  lunchExitTime: string | null;
}

export type SchedulePatchRow = { id: number } & Partial<Record<ScheduleField, string | null>>;

export interface ScheduleDiff {
  schedulesAdd: SchedulePayloadRow[];
  schedulesPatch: SchedulePatchRow[];
  schedulesDel: number[];
}

const isRowFilled = (row: ScheduleRow) => SCHEDULE_FIELDS.some((field) => row[field] !== "");
const nullIfEmpty = (value: string) => (value === "" ? null : value);

function toSchedulePayload(row: ScheduleRow): SchedulePayloadRow {
  return {
    weekDay: row.weekDay,
    workEntryTime: nullIfEmpty(row.workEntryTime),
    workExitTime: nullIfEmpty(row.workExitTime),
    lunchEntryTime: nullIfEmpty(row.lunchEntryTime),
    lunchExitTime: nullIfEmpty(row.lunchExitTime),
  };
}

/**
 * computeScheduleDiff del webapp, por día:
 *  - con datos y sin id del backend → schedulesAdd (fila completa);
 *  - con datos, con id y distinta → schedulesPatch con `id` + SOLO los campos
 *    cambiados (patchUser completa el resto con lo existente);
 *  - vacía, con id y antes con datos → schedulesDel.
 */
export function computeScheduleDiff(initialRows: ScheduleRow[], currentRows: ScheduleRow[]): ScheduleDiff {
  const byDay = (rows: ScheduleRow[]) => new Map(rows.map((row) => [row.weekDay, row]));
  const initialByDay = byDay(initialRows);
  const currentByDay = byDay(currentRows);
  const diff: ScheduleDiff = { schedulesAdd: [], schedulesPatch: [], schedulesDel: [] };

  USER_WEEK_DAYS.forEach((day, index) => {
    const baseline = emptyScheduleRow(day, index);
    const initial = initialByDay.get(day) ?? baseline;
    const current = currentByDay.get(day) ?? baseline;
    const hasId = typeof initial.id === "number";
    const changed = SCHEDULE_FIELDS.filter((field) => initial[field] !== current[field]);

    if (isRowFilled(current) && !hasId) {
      if (changed.length > 0) diff.schedulesAdd.push(toSchedulePayload(current));
    } else if (isRowFilled(current) && changed.length > 0) {
      const patch: SchedulePatchRow = { id: initial.id as number };
      changed.forEach((field) => {
        patch[field] = nullIfEmpty(current[field]);
      });
      diff.schedulesPatch.push(patch);
    } else if (!isRowFilled(current) && isRowFilled(initial) && hasId) {
      diff.schedulesDel.push(initial.id as number);
    }
  });

  return diff;
}

export function hasScheduleChanges(diff: ScheduleDiff): boolean {
  return diff.schedulesAdd.length + diff.schedulesPatch.length + diff.schedulesDel.length > 0;
}

// ─── Payload de guardado ─────────────────────────────────────────────────────

/** getUserSettingsForPayload del webapp: sin TC en el rol, los 4 settings de TC viajan en false. */
export function buildUserSettingsPayload(form: UserFormData, roles: UserRole[]) {
  const { canApplyTimeControl, canCreateExcuses } = resolveRoleCapabilities(roles, form.role);
  const isCreateExcuses = canCreateExcuses && form.isCreateExcuses === true;
  if (!canApplyTimeControl) {
    return {
      isValidLocation: false,
      isImageRequired: false,
      isTimeControl: false,
      isWorkingLunch: false,
      isCreateExcuses,
    };
  }
  return {
    isValidLocation: form.isValidLocation,
    isImageRequired: form.isImageRequired,
    isTimeControl: form.isTimeControl,
    isWorkingLunch: form.isWorkingLunch,
    isCreateExcuses,
  };
}

const digits = (value: string) => String(value ?? "").replace(/\D/g, "");
const trimOrNull = (value: string) => (value.trim() === "" ? null : value.trim());

interface PayloadArgs {
  form: UserFormData;
  roles: UserRole[];
  /** Solo se mandan horarios si el rol seleccionado aplica horario. */
  canApplySchedule: boolean;
  initialSchedules: ScheduleRow[];
  schedules: ScheduleRow[];
}

/**
 * POST /users — getCurrentData + buildPayload("Add") del webapp. Normaliza:
 * phone solo dígitos, cedula a entero, strings vacíos → null. `branchTagId`
 * y `departmentTagId` van top-level, igual que el webapp.
 */
export function buildCreateUserPayload({
  form,
  roles,
  canApplySchedule,
  initialSchedules,
  schedules,
}: PayloadArgs): Record<string, unknown> {
  const cedulaDigits = digits(form.cedula);
  const payload: Record<string, unknown> = {
    user: {
      fullName: form.fullName.trim(),
      nickName: trimOrNull(form.nickName),
      pin: form.pin === "" ? null : form.pin,
      email: form.email.trim(),
      phone: digits(form.phone),
      waId: trimOrNull(form.waId),
      cedula: form.cedula.trim() === "" || !cedulaDigits ? null : parseInt(cedulaDigits, 10),
      photourl: form.photourl,
      password: form.password,
    },
    schoolUser: {
      roleId: form.role,
      isActive: form.isActive,
      code: trimOrNull(form.code),
      address: Array.isArray(form.address) && form.address.length > 0 ? form.address : null,
      settings: buildUserSettingsPayload(form, roles),
    },
    tagIds: form.tags.map((tag) => tag.id),
    branchTagId: form.branchTagId === "" ? null : form.branchTagId,
    departmentTagId: form.departmentTagId === "" ? null : form.departmentTagId,
  };
  if (canApplySchedule) {
    const { schedulesAdd } = computeScheduleDiff(initialSchedules, schedules);
    if (schedulesAdd.length > 0) payload.schedulesAdd = schedulesAdd;
  }
  return payload;
}

/**
 * PATCH /users/:id — buildPayload("Edit") del webapp: solo lo cambiado en
 * `user` y `schoolUser`, salvo `schoolUser.settings` que viaja SIEMPRE
 * completo. Sin password. Cédula como string de dígitos (no entero).
 * tagIds = agregados, tagIdsD = quitados.
 */
export function buildPatchUserPayload({
  initialForm,
  form,
  roles,
  canApplySchedule,
  initialSchedules,
  schedules,
}: PayloadArgs & { initialForm: UserFormData }): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  const user: Record<string, unknown> = {};
  const cur = form;
  const ini = initialForm;

  if (cur.fullName.trim() !== ini.fullName.trim()) user.fullName = cur.fullName.trim();
  if (cur.nickName.trim() !== ini.nickName.trim()) user.nickName = trimOrNull(cur.nickName);
  if (cur.email.trim() !== ini.email.trim()) user.email = cur.email.trim();
  if (digits(cur.cedula) !== digits(ini.cedula)) {
    user.cedula = cur.cedula.trim() === "" ? null : digits(cur.cedula);
  }
  if (digits(cur.phone) !== digits(ini.phone)) user.phone = digits(cur.phone);
  if (cur.waId.trim() !== ini.waId.trim()) user.waId = trimOrNull(cur.waId);
  if (cur.pin !== ini.pin) user.pin = cur.pin === "" ? null : cur.pin;
  if (JSON.stringify(ini.photourl) !== JSON.stringify(cur.photourl)) {
    // [""] le indica a patchUser que borre la foto.
    user.photourl = cur.photourl.length === 0 ? [""] : cur.photourl;
  }

  const schoolUser: Record<string, unknown> = {};
  if (JSON.stringify(ini.address) !== JSON.stringify(cur.address)) schoolUser.address = cur.address;
  if (cur.role !== ini.role) schoolUser.roleId = cur.role;
  if (cur.isActive !== ini.isActive) schoolUser.isActive = cur.isActive;
  if (cur.code.trim() !== ini.code.trim()) schoolUser.code = trimOrNull(cur.code);
  schoolUser.settings = buildUserSettingsPayload(cur, roles);

  if (Object.keys(user).length > 0) changed.user = user;
  changed.schoolUser = schoolUser;

  const initialIds = ini.tags.map((tag) => tag.id);
  const currentIds = cur.tags.map((tag) => tag.id);
  const added = currentIds.filter((id) => !initialIds.includes(id));
  const removed = initialIds.filter((id) => !currentIds.includes(id));
  if (added.length > 0) changed.tagIds = added;
  if (removed.length > 0) changed.tagIdsD = removed;

  if (cur.branchTagId !== ini.branchTagId) {
    changed.branchTagId = cur.branchTagId === "" ? null : cur.branchTagId;
  }
  if (cur.departmentTagId !== ini.departmentTagId) {
    changed.departmentTagId = cur.departmentTagId === "" ? null : cur.departmentTagId;
  }

  if (canApplySchedule) {
    const diff = computeScheduleDiff(initialSchedules, schedules);
    if (diff.schedulesAdd.length > 0) changed.schedulesAdd = diff.schedulesAdd;
    if (diff.schedulesPatch.length > 0) changed.schedulesPatch = diff.schedulesPatch;
    if (diff.schedulesDel.length > 0) changed.schedulesDel = diff.schedulesDel;
  }

  return changed;
}

// ─── Tag inline (botón "+") ──────────────────────────────────────────────────

/** Validación de `name` del schema Joi de TagsCrud (trim, 2–100). */
export function validateTagName(name: string): string | null {
  const value = name.trim();
  if (!value) return "Nombre es un campo requerido";
  if (value.length < 2) return "Nombre debe tener mínimo 2 caracteres";
  if (value.length > 100) return "Nombre debe tener máximo 100 caracteres";
  return null;
}

/**
 * Body de POST /tags para un tag simple creado desde el "+": los defaults de
 * `initializeFormData` de TagsCrud (color #cccccc, fontColor #000000,
 * description "", settings en false). add/edit/delet/readonly/isUnique solo
 * viajan si la categoría es de estados, igual que getCurrentData. No se
 * mandan gotoTagsId (vacío en este flujo).
 */
export function buildSimpleTagPayload(
  name: string,
  category: Pick<UserCategory, "id" | "isStateType">,
): Record<string, unknown> {
  return {
    name: name.trim(),
    color: "#cccccc",
    fontColor: "#000000",
    description: "",
    categoryId: category.id,
    defaultTag: false,
    ...(category.isStateType
      ? { add: false, edit: false, delet: false, readonly: false, isUnique: false }
      : {}),
    settings: { is_autorized: false, isTimeDeduction: false },
  };
}

/**
 * apiData de TagsCrud en MtnUserCrud: agrega el tag nuevo a las opciones
 * (sin duplicar — el webapp lo agrega dos veces) y lo autoselecciona en su
 * categoría, recalculando los Def.
 */
export function applyCreatedTag(
  form: UserFormData,
  allTags: UserFormTag[],
  created: UserFormTag,
  categoryId: number,
  categories: UserCategory[],
): { form: UserFormData; allTags: UserFormTag[] } {
  const tag: UserFormTag = { ...created, categoryId: tagCategoryId(created) ?? categoryId };
  const nextAllTags = allTags.some((t) => t.id === tag.id) ? allTags : [...allTags, tag];
  const selected = tagsOfCategory(form.tags, categoryId).map((t) => t.id);
  const ids = selected.includes(tag.id) ? selected : [...selected, tag.id];
  return {
    form: applyCategoryTags(form, categoryId, ids, nextAllTags, categories),
    allTags: nextAllTags,
  };
}

// ─── Red ─────────────────────────────────────────────────────────────────────

interface AuthArgs {
  token: string;
  urlColegio: string;
}

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

function listFrom<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const items = (data as { items?: unknown })?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

/** GET /users/:id — incluye userAbsence/userLateness (Users/handlers.js getUser). */
export async function fetchUserDetail({
  token,
  urlColegio,
  id,
}: AuthArgs & { id: number }): Promise<UserDetail | null> {
  const response = await axios.get(`${urlColegio}/users/${id}`, authHeaders(token));
  if (!response.data?.success) return null;
  return (response.data.data ?? null) as UserDetail | null;
}

/**
 * GET /roles/all ordenado por nombre. Sin filtros propios: el endpoint ya
 * excluye Master (id 1) para quien no es Master.
 */
export async function fetchRolesAll({ token, urlColegio }: AuthArgs): Promise<UserRole[]> {
  const response = await axios.get(`${urlColegio}/roles/all`, authHeaders(token));
  if (!response.data?.success) return [];
  return sortRolesByName(listFrom<UserRole>(response.data.data));
}

/** GET /tags/all — opciones de los multi-select de categoría. */
export async function fetchTagsAll({ token, urlColegio }: AuthArgs): Promise<UserFormTag[]> {
  const response = await axios.get(`${urlColegio}/tags/all`, authHeaders(token));
  if (!response.data?.success) return [];
  return listFrom<UserFormTag>(response.data.data);
}

/** GET /user/generatePin → el pin como string ("" si no vino). */
export async function generateUserPin({ token, urlColegio }: AuthArgs): Promise<string> {
  const response = await axios.get(`${urlColegio}/user/generatePin`, authHeaders(token));
  if (!response.data?.success) return "";
  return str(response.data.data);
}

export interface UserMutationResult {
  ok: boolean;
  /** Mensaje del backend TAL CUAL (duplicados, cédula registrada, foto…). */
  message: string;
  /** Aviso de "usuario ya existía y se asignó a la entidad" (solo POST). */
  messageAlert: string | null;
  data: UserDetail | null;
}

function readErrorMessage(error: any, fallback: string): string {
  const raw = error?.response?.data?.message ?? error?.message;
  return typeof raw === "string" && raw.trim() !== "" ? raw : fallback;
}

function toMutationResult(body: any): UserMutationResult {
  return {
    ok: Boolean(body?.success),
    message: typeof body?.message === "string" ? body.message : "",
    messageAlert: typeof body?.messageAlert === "string" ? body.messageAlert : null,
    data: (body?.data ?? null) as UserDetail | null,
  };
}

/** POST /users. Mismo contrato {ok, message} que createHoliday. */
export async function createUser({
  token,
  urlColegio,
  payload,
}: AuthArgs & { payload: Record<string, unknown> }): Promise<UserMutationResult> {
  try {
    const response = await axios.post(`${urlColegio}/users`, payload, authHeaders(token));
    return toMutationResult(response.data);
  } catch (error: any) {
    console.error("createUser:", error?.response?.data?.message ?? error?.message);
    return {
      ok: false,
      message: readErrorMessage(error, "No se pudo guardar el usuario."),
      messageAlert: null,
      data: null,
    };
  }
}

/** PATCH /users/:id. */
export async function patchUser({
  token,
  urlColegio,
  id,
  payload,
}: AuthArgs & { id: number; payload: Record<string, unknown> }): Promise<UserMutationResult> {
  try {
    const response = await axios.patch(`${urlColegio}/users/${id}`, payload, authHeaders(token));
    return toMutationResult(response.data);
  } catch (error: any) {
    console.error("patchUser:", error?.response?.data?.message ?? error?.message);
    return {
      ok: false,
      message: readErrorMessage(error, "No se pudo modificar el usuario."),
      messageAlert: null,
      data: null,
    };
  }
}

export interface TagCreateResult {
  ok: boolean;
  message: string;
  data: UserFormTag | null;
}

/** POST /tags — devuelve el tag creado (insertAndFetch, con categoryId). */
export async function createTag({
  token,
  urlColegio,
  payload,
}: AuthArgs & { payload: Record<string, unknown> }): Promise<TagCreateResult> {
  try {
    const response = await axios.post(`${urlColegio}/tags`, payload, authHeaders(token));
    const body = response.data;
    const data = body?.data && typeof body.data.id === "number" ? (body.data as UserFormTag) : null;
    return {
      ok: Boolean(body?.success) && data !== null,
      message: typeof body?.message === "string" ? body.message : "",
      data,
    };
  } catch (error: any) {
    console.error("createTag:", error?.response?.data?.message ?? error?.message);
    return { ok: false, message: readErrorMessage(error, "No se pudo crear la etiqueta."), data: null };
  }
}
