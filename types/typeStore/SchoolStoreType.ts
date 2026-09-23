import { AppType, MenuTree } from "../../utils/resolveRoute";
import { MenuItem, RoleItem } from "../typesMenu/MenuTypes";

// ─── Tipos existente ───────────────────────────────────────

export interface SchoolSettings {
  isImageRequired?: boolean;
  isValidLocation?: boolean;
  toleranceWorkTimeIn?: number;
  toleranceWorkTimeOut?: number;
  toleranceLunchTimeIn?: number;
  toleranceLunchTimeOut?: number;
  // "Ver Botón" — minutos antes del horario en que el botón de acción se
  // hace visible. Distinto de toleranceWorkTimeIn/Out (que solo determina
  // la etiqueta Tardanza/Anticipada/A Tiempo). Confirmado por consulta
  // directa a schools.settings — no vienen declarados en el schema formal
  // del backend, solo existen como claves sueltas (additionalProperties).
  lblWorkTimeIn?: number;
  lblWorkTimeOut?: number;
  lblLunchTimeIn?: number;
  lblLunchTimeOut?: number;
  schoolLatitude?: number;
  schoolLongitude?: number;
  toleranceRadius?: number;
  radioPermitido?: number;
  cedula?: boolean;
  cedulaRequerida?: boolean;
  // Flags del módulo Usuarios — mismas claves que lee el mapStateToProps de
  // MtnUserCrud en el webapp. Ya vienen en `school.settings`; solo se tipan.
  // `isAccessControl` es el "companyIsTimeControlDefault" del webapp.
  isAccessControl?: boolean;
  isValidLocationDefault?: boolean;
  isImageRequiredDefault?: boolean;
  isWorkingLunch?: boolean;
  isWorkingLunchDefault?: boolean;
  // Horario de la escuela por día (arreglo de {weekDay, workEntryTime,
  // workExitTime, …}) — el `companySchedules` del webapp.
  schedulesAdd?: unknown;
  [key: string]: unknown;
}

export interface UserSchedule {
  id: number;
  weekDay: string;
  workEntryTime: string;
  workExitTime: string;
  lunchEntryTime: string | null;
  lunchExitTime: string | null;
  toleranceWorkTimeIn?: number;
  toleranceLunchTimeIn?: number;
  toleranceWorkTimeOut?: number;
  toleranceLunchTimeOut?: number;
  [key: string]: unknown;
}

export interface Address {
  latitude?: number;
  longitude?: number;
  // Campos de la dirección de un usuario (AdressEntity/MapAddressSelector del
  // webapp). Todos opcionales: una dirección "solo texto" trae únicamente
  // formattedAddress, y la de la sede usa solo latitude/longitude.
  id?: number;
  title?: string;
  province?: string;
  city?: string;
  sector?: string;
  zone?: string;
  street?: string;
  streetNumber?: string;
  building?: string;
  apartmentNumber?: string;
  postalCode?: string;
  phone?: string;
  referenceToArrive?: string;
  formattedAddress?: string;
  location?: { lat: number; lng: number } | Record<string, never>;
  [key: string]: unknown;
}

/**
 * Tag del colegio. `categoryId === 22` son los "tipos de usuario" que
 * alimentan el selector de register.tsx (ver IkarFlatList).
 */
export interface SchoolTag {
  id: number;
  name: string;
  categoryId: number;
  [key: string]: unknown;
}

export interface School {
  id: number;
  name: string;
  logo: string;
  tags?: SchoolTag[];
  email: string | null;
  phone: string;
  settings: SchoolSettings;
  schoolLatitude?: number;
  schoolLongitude?: number;
  latitude?: number;
  longitude?: number;
  toleranceRadius?: number;
  radioPermitido?: number;
  // La sede guarda su ubicación como objeto (no array, a diferencia de SchoolUser/User)
  address?: Address;
  [key: string]: unknown;
}

export interface UserInfo {
  id: number;
  email: string;
  fullName: string;
  nickName: string;
  phone: string;
  pin: string | null;
  cedula: string | null;
  schoolUsers?: SchoolUser[];
  [key: string]: unknown;
}

export interface SchoolUser {
  id: number;
  schoolId: number;
  userId: number;
  roleId: number;
  code: string;
  isActive: boolean;
  photourl: string | null;
  s3Photo: string | null;
  user: UserInfo;
  role: RoleItem;
  school: School;
  settings?: SchoolSettings;
  userSchedules?: UserSchedule[];
  latitude?: number;
  longitude?: number;
  toleranceRadius?: number;
  // Ubicación designada del usuario: arreglo (a diferencia de School.address, que es objeto)
  address?: Address[];
  [key: string]: unknown;
}

export interface User {
  id: number;
  schoolId: number;
  userId: number;
  roleId: number;
  code: string;
  isActive: boolean;
  photourl: string | null;
  s3Photo: string | null;
  user: UserInfo;
  role: RoleItem;
  school: School;
  settings?: SchoolSettings;
  userSchedules?: UserSchedule[];
  latitude?: number;
  longitude?: number;
  toleranceRadius?: number;
  address?: Address[];
  [key: string]: unknown;
}

/**
 * Subconjunto de `school.settings` que necesitan los módulos de Face Class
 * (Excusas y Tardanzas): catálogo de categorías por defecto (`stateTagId` de
 * una excusa nueva sale de `categoryDefaultIds.catExcuseStatedId`, no lo
 * resuelve el backend solo), el horario laboral de la sede, para validar que un
 * rango de ausencia caiga solo en días hábiles — mismo criterio que
 * `isAbsenceRangeOnlyCompanyWorkingDays` en el webapp —, y las dos claves de
 * Tardanzas (umbral del semáforo y modo Manual/Automática). Deliberadamente NO
 * es el objeto `school`/`settings` completo (ver `SchoolSettings` arriba):
 * solo estas claves, para no depender de todo lo que `chooseschool` devuelva.
 */
export interface CompanySettings {
  categoryDefaultIds: Record<string, unknown>;
  schedulesAdd: UserSchedule[];
  entryTime: string;
  exitTime: string;
  /**
   * Umbral que decide las luces del semáforo de Tardanzas — misma lectura de
   * UI que el webapp (default 3). El backend usa su propio default (4) al
   * crear la tardanza; ver buildCompanySettings en store/useSchoolStore.ts.
   */
  daysLateAbsence: number;
  /** "Manual" (input de hora editable) | "Automatica" (hora del dispositivo). */
  tardinessMode: string;
  /**
   * Modo de toma de asistencia: "Manual" | "Docente" (valores del webapp).
   * Sin validación ni default en el backend — "" si no está configurado,
   * que en `resolveAttendanceGating` cae al caso por defecto (foto + manual).
   */
  attendanceMode: string;
}

/**
 * Item de `teacherAttendancesToday` — la lista de asistencias de HOY del
 * docente logueado. Llega en el NIVEL SUPERIOR de la respuesta de
 * `chooseschool` (hermano de `token` y `school`, NO anidado bajo `school`) y
 * la arma el backend filtrando `attendance.date` por `moment().format(
 * "YYYY-MM-DD")` con `orderBy schedule.startTime asc`.
 *
 * Es una SNAPSHOT: ni el webapp ni mobile tienen endpoint de refresco de la
 * lista completa — solo login/chooseschool la traen fresca (en mobile, el
 * poller de punchinout la refresca de paso al re-llamar chooseschool).
 *
 * OJO con los dos pares de horas, que NO son lo mismo:
 *   - `startTime`/`endTime` del nivel superior: la ventana REAL de la clase de
 *     hoy (fila de `attendance`). Es la que decide "¿está en curso ahora?".
 *   - `schedule.startTime`/`schedule.endTime`: el horario recurrente semanal.
 *     Solo para mostrar en la UI.
 * `schedule.weekday` es el nombre del día en español ("Lunes"), tal como lo
 * guardó el backend — no se recalcula desde `date`.
 */
export interface TeacherAttendanceToday {
  id: number;
  scheduleId?: number;
  date?: string | null;
  status?: string | null;
  notes?: string | null;
  createdDate?: string | null;
  /** Columna JSON — puede llegar como array o como string sin parsear. */
  photos?: unknown;
  statistics?: {
    presente?: number;
    tardanza?: number;
    ausente?: number;
    excusa?: number;
    total?: number;
    TardanzaEntrada?: number;
  } | null;
  /** Ventana real de hoy ("HH:MM" o "HH:MM:SS"). */
  startTime?: string | null;
  endTime?: string | null;
  schedule?: {
    id?: number;
    courseId?: number;
    subjectId?: number;
    teacherId?: number;
    /** Día en español ("Lunes"), no un índice. */
    weekday?: string | null;
    /** Horario recurrente — solo para mostrar, no para decidir "actual". */
    startTime?: string | null;
    endTime?: string | null;
    startAt?: string | null;
    endAt?: string | null;
    schoolId?: number;
    isActive?: boolean;
    subject?: { id?: number; name?: string | null; [key: string]: unknown } | null;
    course?: {
      id?: number;
      name?: string | null;
      section?: string | null;
      fullName?: string | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

// ─── Store type extendido ─────────────────────────────────────────────────────

export interface SchoolStore {
  // Campos existentes
  school: School | null;
  urlColegio: string | null;
  token: string | null;
  user: User | null;
  tokenPassword: string | null;

  // Campos nuevos para routing
  app: AppType | null;
  initialPath: string | null;
  allowedMenuItems: MenuItem[];
  menuTree: MenuTree[];
  role: RoleItem | null;

  // Campo nuevo — company.settings de chooseschool (ver CompanySettings)
  companySettings: CompanySettings | null;

  // Campo nuevo — teacherAttendancesToday de chooseschool (ver
  // TeacherAttendanceToday). Siempre array: [] cuando el usuario no es
  // docente o no tiene clases hoy, nunca null.
  attendancesToday: TeacherAttendanceToday[];

  // Acciones existentes
  setSchool: (school: School) => void;
  setUrlColegio: (url: string) => void;
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  setTokenPassword: (token: string) => void;
  clear: () => void;

  // Acción nueva
  setMenuResolution: (user: User, menuItems: MenuItem[]) => void;
  setRole: (role: RoleItem) => void;
  setCompanySettings: (companySettings: CompanySettings) => void;
  setAttendancesToday: (attendancesToday: TeacherAttendanceToday[]) => void;

  // Cerrar sesión
  logout: () => void;
}
