// Imports relativos (no "@/"): tsconfig.jest.json no declara el alias.
import axios from "axios";
import { getMenuItems } from "../../api/menu/getMenuItems";
import {
  buildAttendancesToday,
  buildCompanySettings,
  useSchoolStore,
} from "../../store/useSchoolStore";
import type { MenuItem, RoleItem } from "../../types/typesMenu/MenuTypes";
import type {
  School,
  SchoolUser,
  User,
} from "../../types/typeStore/SchoolStoreType";
import { resolveMobilePath } from "../constants/mobileRoutes";
import { buildLastCompany } from "./lastCompany";
import { buildTodayHoliday } from "./punchRules";
import * as Storage from "./storage";

/**
 * Elegir / cambiar de empresa — lo comparten el login (FormLogin) y la opción
 * "Cambiar Empresa" del drawer.
 *
 * Calcado del webapp (Actions/authentication.js → chooseCompany y los
 * reducers de CHOOSE_COMPANY): POST /authentication/chooseschool devuelve un
 * token re-scopeado a la empresa y la snapshot del día (horarios, feriado,
 * asistencias, settings). Toda la app lee la empresa activa de
 * `user.user.schoolUsers[0]`, así que la elegida siempre queda primera.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Lo mínimo que CompanySelector pinta. `SchoolUser` (login) lo cumple tal
 * cual; las filas de GET /users/schools se mapean con `mapUserSchools`.
 */
export interface CompanyOption {
  id: number;
  schoolId: number;
  isActive?: boolean;
  school?: { id?: number; name?: string; logo?: string | null } | null;
  role?: { name?: string } | null;
}

/** `data` de chooseschool — objeto grande sin tipar en el backend. */
export type ChooseSchoolData = Record<string, unknown>;

export type ChooseSchoolResult =
  | { ok: true; token: string; data: ChooseSchoolData }
  /** `message`: el de `response.data.message` del backend, si vino. */
  | { ok: false; message: string | null };

/** Lo que la app lee del usuario de sesión para saber en qué empresa está. */
interface SessionUserLike {
  school?: { id?: number } | null;
  user?: { schoolUsers?: { schoolId?: number }[] | null } | null;
}

export const SWITCH_COMPANY_ERROR =
  "No se pudo cambiar de empresa. Intenta de nuevo.";
export const LOAD_COMPANIES_ERROR =
  "No se pudieron cargar tus empresas. Intenta de nuevo.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// ─── Funciones puras ─────────────────────────────────────────────────────────

/**
 * Empresa activa de la sesión: la de `schoolUsers[0]` (ver la nota de
 * arriba) y, si no hay, `user.school`. Es el `company.schoolId` del webapp.
 */
export function getActiveSchoolId(
  user: SessionUserLike | null | undefined,
): number | null {
  const id = user?.user?.schoolUsers?.[0]?.schoolId ?? user?.school?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

/**
 * Si se muestra "Cambiar Empresa" — misma condición que Header/index.jsx del
 * webapp: `companyId > 0 && schoolUsers.length > 1`.
 */
export function canChangeCompany(
  user: SessionUserLike | null | undefined,
): boolean {
  const schoolId = getActiveSchoolId(user) ?? 0;
  const count = user?.user?.schoolUsers?.length ?? 0;
  return schoolId > 0 && count > 1;
}

/**
 * Filas de GET /users/schools → opciones del selector. El backend devuelve
 * filas de `schools` (no de `schoolusers`): `id` ES el schoolId e `isActive`
 * es el de la empresa — el que el webapp usa para deshabilitar la tarjeta.
 */
export function mapUserSchools(raw: unknown): CompanyOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): CompanyOption[] => {
    if (!isRecord(item) || typeof item.id !== "number") return [];
    const name =
      typeof item.name === "string" && item.name.trim() !== ""
        ? item.name
        : undefined;
    return [
      {
        id: item.id,
        schoolId: item.id,
        isActive: item.isActive !== false,
        school: {
          id: item.id,
          name,
          logo: typeof item.logo === "string" ? item.logo : null,
        },
      },
    ];
  });
}

/** Cuerpo de la respuesta de chooseschool → token + data, o el mensaje de error. */
export function readChooseSchoolResponse(body: unknown): ChooseSchoolResult {
  const res = isRecord(body) ? body : {};
  const data = isRecord(res.data) ? res.data : null;
  const token = data?.token;
  if (res.success === true && data && typeof token === "string" && token) {
    return { ok: true, token, data };
  }
  const message =
    typeof res.message === "string" && res.message.trim() !== ""
      ? res.message
      : null;
  return { ok: false, message };
}

/**
 * Arma el usuario de sesión con el rol de la empresa elegida. Es la lógica
 * que vivía en `completeLogin` de FormLogin, sin cambios: `loginData` es la
 * respuesta del login (o, al cambiar de empresa, el usuario de sesión
 * actual — tiene la misma forma porque sale de acá).
 *
 * `schoolUsers` se reordena para que la elegida quede en [0], que es de
 * donde el resto de la app (horarios, settings, foto, permisos, geocerca)
 * lee la empresa activa.
 */
export function buildSessionUser(
  schoolUser: SchoolUser | null,
  // Forma de la respuesta del login: sin tipar, igual que en FormLogin.
  loginData: any,
  /** Respaldo de `school` si el elegido no trae — el `school` del store. */
  currentSchool: unknown,
): { user: User; selected: any } {
  const schoolUsers = loginData?.user?.schoolUsers ?? [];
  const selected =
    schoolUser ??
    schoolUsers[0] ??
    (loginData.userSchedules ? { school: loginData.school ?? {} } : null);

  const roleId = selected?.roleId ?? loginData?.roleId;
  const role = selected?.role ??
    loginData?.role ?? {
      id: roleId,
      name: selected?.role?.name ?? loginData?.roleName ?? "",
      permissions: {},
      menu: selected?.role?.menu ?? [],
      defaultMenu: selected?.role?.defaultMenu ?? null,
    };
  const schedules = selected?.userSchedules ?? loginData?.userSchedules ?? [];

  const selectedId = selected?.id ?? selected?.schoolId;
  const reorderedSchoolUsers = (loginData?.user?.schoolUsers ?? [])
    .slice()
    .sort((a: SchoolUser, b: SchoolUser) => {
      const aSelected = a?.id === selectedId || a?.schoolId === selectedId;
      const bSelected = b?.id === selectedId || b?.schoolId === selectedId;
      return (bSelected ? 1 : 0) - (aSelected ? 1 : 0);
    });

  const user = {
    ...loginData,
    user: {
      ...loginData?.user,
      schoolUsers: reorderedSchoolUsers,
    },
    roleId,
    role: {
      id: roleId,
      name: role?.name ?? "",
      permissions: {},
      menu: role?.menu ?? [],
      defaultMenu: role?.defaultMenu ?? null,
    },
    school: selected?.school ?? currentSchool ?? {},
    userSchedules: schedules,
  } as User;

  return { user, selected };
}

/**
 * Cambio de empresa desde el drawer: el schoolUser de la empresa elegida,
 * con lo fresco que trae chooseschool encima (school, role, userSchedules —
 * lo que el webapp toma de la respuesta), y el usuario de sesión actual con
 * esa entrada reemplazada. Se pasan tal cual a `buildSessionUser`.
 *
 * La foto NO viene en chooseschool (vive en `schoolusers.photourl`), así
 * que queda la de la entrada guardada desde el login, que ya es la de esa
 * empresa. null si el usuario no tiene la empresa en `schoolUsers`.
 */
export function prepareCompanySwitch(
  currentUser: User,
  schoolId: number,
  data: ChooseSchoolData,
): { loginData: User; schoolUser: SchoolUser } | null {
  const list = currentUser?.user?.schoolUsers ?? [];
  const entry = list.find((item) => item?.schoolId === schoolId);
  if (!entry) return null;

  // `menuItems` es el menú completo que chooseschool cuelga del rol — no se
  // guarda en cada schoolUser (el menú sale de getMenuItems, como en login).
  let role = entry.role;
  if (isRecord(data.role)) {
    const freshRole = { ...data.role };
    delete freshRole.menuItems;
    role = freshRole as unknown as RoleItem;
  }

  const schoolUser: SchoolUser = {
    ...entry,
    school: isRecord(data.school) ? (data.school as School) : entry.school,
    role,
    roleId: typeof role?.id === "number" ? role.id : entry.roleId,
    userSchedules: Array.isArray(data.userSchedules)
      ? (data.userSchedules as SchoolUser["userSchedules"])
      : entry.userSchedules,
  };

  const loginData = {
    ...currentUser,
    user: {
      ...currentUser.user,
      schoolUsers: list.map((item) => (item === entry ? schoolUser : item)),
    },
  } as User;

  return { loginData, schoolUser };
}

// ─── Red ─────────────────────────────────────────────────────────────────────

/**
 * POST /authentication/chooseschool. `platform: "App"` es obligatorio: sin
 * él el token sale sin el claim de plataforma. Instancia de axios propia (sin
 * el interceptor global de 401): un fallo acá lo maneja quien llama, no debe
 * cerrar la sesión. Devuelve el cuerpo tal cual; lanza ante error de red.
 */
export async function requestChooseSchool(
  urlColegio: string,
  token: string,
  schoolId: number,
): Promise<unknown> {
  const rawAxios = axios.create();
  const res = await rawAxios.post(
    `${urlColegio}/authentication/chooseschool`,
    { schoolId },
    { headers: { Authorization: `Bearer ${token}`, platform: "App" } },
  );
  return res.data;
}

async function currentToken(): Promise<string | null> {
  return (
    useSchoolStore.getState().token ?? (await Storage.getItemAsync("token"))
  );
}

async function currentUrlColegio(): Promise<string> {
  return (
    useSchoolStore.getState().urlColegio ??
    (await Storage.getItemAsync("urlColegio")) ??
    ""
  );
}

/** GET /users/schools — la lista del selector, igual que ChooseCompany del webapp. */
export async function fetchUserCompanies(): Promise<
  { ok: true; companies: CompanyOption[] } | { ok: false; message: string }
> {
  try {
    const [urlColegio, token] = await Promise.all([
      currentUrlColegio(),
      currentToken(),
    ]);
    if (!urlColegio || !token) {
      return { ok: false, message: LOAD_COMPANIES_ERROR };
    }
    const res = await axios.get(`${urlColegio}/users/schools`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.data?.success) {
      return {
        ok: false,
        message:
          typeof res.data?.message === "string" && res.data.message
            ? res.data.message
            : LOAD_COMPANIES_ERROR,
      };
    }
    return { ok: true, companies: mapUserSchools(res.data.data) };
  } catch {
    return { ok: false, message: LOAD_COMPANIES_ERROR };
  }
}

// ─── Hidratación de la sesión ────────────────────────────────────────────────

/**
 * Snapshot del día que trae chooseschool en el nivel superior de `data`:
 * settings de la empresa, asistencias de hoy del docente y feriado. Las
 * asistencias y el feriado se guardan siempre (vacío/null es el valor
 * correcto, no el de la empresa anterior); los settings solo si vinieron.
 */
export function applyChooseSchoolSnapshot(data: ChooseSchoolData): void {
  const store = useSchoolStore.getState();
  const companySettings = buildCompanySettings(
    isRecord(data.school) ? data.school.settings : undefined,
  );
  if (companySettings) store.setCompanySettings(companySettings);
  store.setAttendancesToday(buildAttendancesToday(data));
  store.setTodayHoliday(buildTodayHoliday(data));
}

export interface CommitSessionInput {
  /** Usuario de sesión ya armado por `buildSessionUser`. */
  user: User;
  /** El schoolUser elegido — de él salen la foto y el respaldo de lastCompany. */
  selected: any;
  menuItems: MenuItem[];
  token: string;
  urlColegio: string;
  /**
   * `data` de chooseschool. Sin ella (login cuyo chooseschool falló) no se
   * tocan companySettings, asistencias ni feriado.
   */
  chooseSchoolData?: ChooseSchoolData;
  /** También guarda el token en el store (el login de una sola empresa no lo hacía). */
  storeToken?: boolean;
}

/**
 * Persiste la sesión de la empresa elegida: SecureStore (token, user, menú,
 * foto, urlColegio), la marca lastCompany del login y, AL FINAL y de un solo
 * golpe síncrono, el store.
 *
 * Ese orden importa al cambiar de empresa con la app abierta: cuando el
 * store cambia de empresa, (app)/_layout remonta las pantallas, y estas leen
 * el token y la foto de SecureStore — ya tienen que estar escritos. Y como
 * los `set` van sin `await` entre ellos, ninguna respuesta en vuelo puede
 * colarse a mitad (ver el guard del poller en punchinout.tsx).
 */
export async function commitSession({
  user,
  selected,
  menuItems,
  token,
  urlColegio,
  chooseSchoolData,
  storeToken = false,
}: CommitSessionInput): Promise<void> {
  await Storage.setItemAsync("isAuthorized", "true");
  await Storage.setItemAsync("token", token);

  // Marca de la compañía para pintar el login la próxima vez. Nunca debe
  // bloquear: cualquier fallo se ignora.
  try {
    const lastCompany =
      buildLastCompany(chooseSchoolData?.school, urlColegio) ??
      buildLastCompany(selected?.school, urlColegio);
    if (lastCompany) {
      await useSchoolStore.getState().setLastCompany(lastCompany);
    }
  } catch (error) {
    console.warn(
      "No se pudo guardar lastCompany:",
      error instanceof Error ? error.message : "error desconocido",
    );
  }

  await Storage.setItemAsync("urlColegio", urlColegio);
  await Storage.setItemAsync("user", JSON.stringify(user));
  await Storage.setItemAsync("menuItems", JSON.stringify(menuItems));

  // Foto del usuario en la empresa elegida.
  const selectedPhoto = selected?.photourl;
  const selectedS3Photo = selected?.s3Photo;
  if (selectedPhoto) {
    await Storage.setItemAsync("photourl", selectedPhoto);
  } else {
    await Storage.deleteItemAsync("photourl");
  }
  if (selectedS3Photo) {
    await Storage.setItemAsync("s3Photo", selectedS3Photo);
  } else {
    await Storage.deleteItemAsync("s3Photo");
  }

  // ── Store: todo junto, sin awaits en el medio ──
  const store = useSchoolStore.getState();
  if (storeToken) store.setToken(token);
  if (chooseSchoolData) applyChooseSchoolSnapshot(chooseSchoolData);
  // Resuelve app + ruta + árbol de menú con el rol de la empresa elegida.
  store.setMenuResolution(user, menuItems);
}

/** Menú para la nueva sesión: el catálogo de /menu/all (público, igual que en login). */
async function loadMenuItems(
  urlColegio: string,
  token: string,
): Promise<MenuItem[]> {
  const fresh = await getMenuItems(urlColegio, token);
  if (fresh.length > 0) return fresh;
  // Sin red para el catálogo: se reusa el guardado, que no depende de la empresa.
  try {
    const stored = JSON.parse((await Storage.getItemAsync("menuItems")) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export type SwitchCompanyResult =
  | { ok: true; path: string }
  | { ok: false; message: string };

/**
 * "Cambiar Empresa" del drawer. Si algo falla ANTES de persistir (red,
 * success:false, empresa ajena) no se toca nada: la sesión sigue en la
 * empresa actual. Con éxito devuelve la ruta de inicio del rol nuevo
 * (`resolveMobilePath(role.defaultMenu)`, igual que el login).
 */
export async function switchCompany(
  schoolId: number,
): Promise<SwitchCompanyResult> {
  const [urlColegio, token] = await Promise.all([
    currentUrlColegio(),
    currentToken(),
  ]);
  const { user: currentUser, school } = useSchoolStore.getState();
  if (!urlColegio || !token || !currentUser) {
    return { ok: false, message: SWITCH_COMPANY_ERROR };
  }

  let body: unknown;
  try {
    body = await requestChooseSchool(urlColegio, token, schoolId);
  } catch {
    return { ok: false, message: SWITCH_COMPANY_ERROR };
  }

  const result = readChooseSchoolResponse(body);
  if (!result.ok) {
    return { ok: false, message: result.message ?? SWITCH_COMPANY_ERROR };
  }

  const prepared = prepareCompanySwitch(currentUser, schoolId, result.data);
  if (!prepared) return { ok: false, message: SWITCH_COMPANY_ERROR };

  const { user, selected } = buildSessionUser(
    prepared.schoolUser,
    prepared.loginData,
    school,
  );
  const menuItems = await loadMenuItems(urlColegio, result.token);

  try {
    await commitSession({
      user,
      selected,
      menuItems,
      token: result.token,
      urlColegio,
      chooseSchoolData: result.data,
      storeToken: true,
    });
  } catch {
    // Solo puede fallar escribiendo SecureStore, antes de tocar el store: la
    // pantalla sigue en la empresa actual.
    return { ok: false, message: SWITCH_COMPANY_ERROR };
  }

  return {
    ok: true,
    path: resolveMobilePath(useSchoolStore.getState().role?.defaultMenu?.path),
  };
}
