import { AppType, MenuTree } from "../../utils/resolveRoute";
import { MenuItem, RoleItem } from "../typesMenu/MenuTypes";

// ─── Tipos existente ───────────────────────────────────────

export interface SchoolSettings {
  isImageRequired?: boolean;
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

export interface School {
  id: number;
  name: string;
  logo: string;
  email: string | null;
  phone: string;
  settings: SchoolSettings;
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

  // Acciones existentes
  setSchool: (school: School) => void;
  setUrlColegio: (url: string) => void;
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  setTokenPassword: (token: string) => void;
  clear: () => void;

  // Acción nueva
  setMenuResolution: (user: User, menuItems: MenuItem[]) => void;

  // Cerrar sesión
  logout: () => void;
}