import { AppType, MenuTree } from "../../utils/resolveRoute";
import { MenuItem, RoleItem } from "../typesMenu/MenuTypes";

// ─── Tipos existentes (no modificados) ───────────────────────────────────────

export interface School {
  id: number;
  name: string;
  logo: string;
  email: string | null;
  phone: string;
  settings: Record<string, unknown>;
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
  user: {
    id: number;
    email: string;
    fullName: string;
    nickName: string;
    phone: string;
    pin: string | null;
    cedula: string | null;
  };
  role: RoleItem;
  school: School;
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
}
