import { create } from "zustand";
import { SchoolStore } from "../types/typeStore/SchoolStoreType";
import { MenuItem, RoleItem } from "../types/typesMenu/MenuTypes";
import { resolveRoute } from "../utils/resolveRoute";

export const useSchoolStore = create<SchoolStore>((set) => ({
  // ─── Estado existente ───────────────────────────────────────────────────────
  school: null,
  urlColegio: null,
  token: null,
  user: null,
  tokenPassword: null,

  // ─── Estado nuevo para routing ──────────────────────────────────────────────
  app: null,
  initialPath: null,
  allowedMenuItems: [],
  menuTree: [],
  role: null,

  // ─── Acciones existentes (sin cambios) ──────────────────────────────────────
  setSchool: (school) => set({ school }),
  setUrlColegio: (url) => set({ urlColegio: url }),
  setToken: (token) => set({ token }),
  setUser: (user) => set({ user }),
  setTokenPassword: (tokenPassword) => set({ tokenPassword }),

  clear: () =>
    set({
      school: null,
      urlColegio: null,
      token: null,
      user: null,
      tokenPassword: null,
      app: null,
      initialPath: null,
      allowedMenuItems: [],
      menuTree: [],
      role: null,
    }),

  // ─── Cerrar sesión — conserva urlColegio y school para poder volver a login ─
  logout: () =>
    set({
      token: null,
      user: null,
      tokenPassword: null,
      app: null,
      initialPath: null,
      allowedMenuItems: [],
      menuTree: [],
      role: null,
    }),

  // ─── Acción nueva: resuelve app + ruta + menú tras el login ─────────────────
  setMenuResolution: (user, menuItems: MenuItem[]) => {
    const { app, initialPath, allowedItems, menuTree } = resolveRoute(
      user.roleId,
      user.role,
      menuItems,
    );
    set({
      user,
      app,
      initialPath,
      allowedMenuItems: allowedItems,
      menuTree,
    });
  },

  setRole: (role) => set({ role }),
}));