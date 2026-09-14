/**
 * Reglas y acceso a datos del módulo "Usuarios" (webapp:
 * src/Features/Maintenance/Users/index.jsx + SubComponents/UserCard).
 *
 * Mismo criterio que holidaysRules.ts: vive fuera de `src/app/` (no se
 * registra como ruta de expo-router) y no importa react-native ni expo-*, así
 * que se testea con jest sin emulador.
 */

import axios from "axios";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface UserCategory {
  id: number;
  name: string;
  order: number | null;
  ShowInUser?: boolean | null;
  /** Categoría de estados — define qué flags manda POST /tags (TagsCrud). */
  isStateType?: boolean | null;
}

export interface UserTagRef {
  id?: number;
  name?: string | null;
  categoryId?: number | null;
  /** Variante en PascalCase que el webapp también contempla (Users/index.jsx:40). */
  CategoryId?: number | null;
  category?: { id?: number; name?: string } | null;
}

export interface SchoolUserRow {
  id: number;
  code?: string | null;
  isActive: boolean;
  role?: { id?: number; name?: string | null } | null;
  user?: {
    fullName?: string | null;
    nickName?: string | null;
    cedula?: string | null;
    phone?: string | null;
    waId?: string | null;
    email?: string | null;
  } | null;
  tags?: UserTagRef[] | null;
  settings?: {
    isTimeControl?: boolean | null;
    isImageRequired?: boolean | null;
    isValidLocation?: boolean | null;
    isWorkingLunch?: boolean | null;
  } | null;
}

/** Filas por página — mismo `rows` del defaultParams del webapp (Users/index.jsx:72). */
export const USERS_ROWS = 15;

/** Mismo debounce que el buscador de la tabla del webapp. */
export const USERS_SEARCH_DEBOUNCE_MS = 1000;

/** Los 3 valores del dropdown de estado del webapp (Users/index.jsx:167-171). */
export type UsersStatusFilter = "all" | "1" | "0";

export const USERS_STATUS_OPTIONS: { value: UsersStatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "1", label: "Activo" },
  { value: "0", label: "Inactivo" },
];

// ─── Categorías ──────────────────────────────────────────────────────────────

/**
 * Filtra `ShowInUser === true` y ordena por `order` con los null al final —
 * mismo resultado que setUpCategories del webapp (Users/index.jsx:79-90),
 * pero sin mutar el array de entrada y con un comparador consistente cuando
 * ambos `order` son null.
 */
export function selectUserCategories(raw: unknown): UserCategory[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown })?.items)
      ? (raw as { items: unknown[] }).items
      : [];
  return (list as UserCategory[])
    .filter((category) => category?.ShowInUser === true)
    .slice()
    .sort((a, b) => {
      const ao = a.order ?? null;
      const bo = b.order ?? null;
      if (ao === null && bo === null) return 0;
      if (ao === null) return 1;
      if (bo === null) return -1;
      return ao - bo;
    });
}

/**
 * `fields` de GET /users: un `tags.name` por categoría visible, en notación
 * de punto (el backend no acepta `tags:name`). Afecta solo el WHERE del
 * filtro `all` — ver nota de EMPLOYEE_SEARCH_FIELDS en adminPunchRules.ts.
 */
export function buildUserFields(categories: UserCategory[]): string {
  return [
    "id",
    ...categories.map(() => "tags.name"),
    "role.name",
    "user.fullName",
    "isActive",
    "user.nickName",
    "user.cedula",
    "user.phone",
    "user.waId",
    "user.email",
    "code",
  ].join(",");
}

/** Nombres de los tags del usuario que pertenecen a `categoryId` (processItems del webapp). */
export function userTagNamesForCategory(
  tags: UserTagRef[] | null | undefined,
  categoryId: number,
): string[] {
  return (tags ?? [])
    .filter((tag) => {
      const tagCategoryId = tag?.categoryId ?? tag?.CategoryId ?? tag?.category?.id;
      return String(tagCategoryId) === String(categoryId);
    })
    .map((tag) => String(tag?.name ?? ""))
    .filter((name) => name !== "");
}

// ─── Formato de display ──────────────────────────────────────────────────────

/** Port de `phoneFormat` del webapp (Utils/formats.js:4-16). */
export function displayPhone(raw: string | null | undefined): string {
  const clean = String(raw ?? "").replace(/[^\d]/g, "");
  if (clean.length === 10) return clean.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
  if (clean.length === 11) return clean.replace(/(\d{1})(\d{3})(\d{3})(\d{4})/, "$1 ($2) $3-$4");
  return clean;
}

/** Port de `RNCFormat` del webapp (Utils/formats.js:158-170). */
export function displayCedula(raw: string | null | undefined): string {
  const clean = String(raw ?? "").replace(/[^\d]/g, "");
  if (clean.length === 9) return clean.replace(/(\d{3})(\d{5})(\d{1})/, "$1-$2-$3");
  if (clean.length === 11) return clean.replace(/(\d{3})(\d{7})(\d{1})/, "$1-$2-$3");
  return clean;
}

// ─── Red ─────────────────────────────────────────────────────────────────────

interface AuthArgs {
  token: string;
  urlColegio: string;
}

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/** GET /categories/all → categorías con `ShowInUser`, ordenadas. */
export async function getUserCategories({ token, urlColegio }: AuthArgs): Promise<UserCategory[]> {
  const response = await axios.get(`${urlColegio}/categories/all`, authHeaders(token));
  if (!response.data?.success) return [];
  return selectUserCategories(response.data.data);
}

export interface UsersPage {
  items: SchoolUserRow[];
  /** Total de filas filtradas, o null si el envelope no lo trajo. */
  count: number | null;
  hasMore: boolean;
}

export async function fetchUsers({
  token,
  urlColegio,
  page = 1,
  rows = USERS_ROWS,
  orderKey = "id",
  orderDir = "desc",
  isActive = "1",
  search,
  categories,
}: AuthArgs & {
  page?: number;
  rows?: number;
  orderKey?: string;
  orderDir?: "asc" | "desc";
  isActive?: UsersStatusFilter;
  search?: string;
  /** Si la pantalla ya las tiene cargadas, se evita repetir /categories/all en cada página. */
  categories?: UserCategory[];
}): Promise<UsersPage> {
  const resolvedCategories = categories ?? (await getUserCategories({ token, urlColegio }));

  const params: Record<string, string | number> = {
    page,
    rows,
    orderKey,
    orderDir,
    fields: buildUserFields(resolvedCategories),
  };
  // "all" no manda el filtro — igual que el webapp (Users/index.jsx:99).
  if (isActive !== "all") params.isActive = isActive;
  const term = String(search ?? "").trim();
  if (term) params.all = term;

  const response = await axios.get(`${urlColegio}/users`, {
    ...authHeaders(token),
    params,
  });
  if (!response.data?.success) return { items: [], count: null, hasMore: false };

  const payload = (response.data.data ?? {}) as { items?: SchoolUserRow[]; count?: number };
  const count = typeof payload.count === "number" ? payload.count : null;
  const items = Array.isArray(payload.items) ? payload.items : [];

  // Mismo criterio de hasMore que fetchHolidaysPage.
  const hasMore = items.length >= rows && (count == null || page * rows < count);

  return { items, count, hasMore };
}
