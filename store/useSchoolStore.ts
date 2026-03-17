import { create } from "zustand";
import { SchoolStore } from "../types/typeStore/SchoolStoreType";
<<<<<<< HEAD

export const useSchoolStore = create<SchoolStore>((set) => ({
=======
import { MenuItem } from "../types/typesMenu/MenuTypes";
import { resolveRoute } from "../utils/resolveRoute";

export const useSchoolStore = create<SchoolStore>((set) => ({
  // ─── Estado existente ───────────────────────────────────────────────────────
>>>>>>> main
  school: null,
  urlColegio: null,
  token: null,
  user: null,
<<<<<<< HEAD
=======
  tokenPassword: null,

  // ─── Estado nuevo para routing ──────────────────────────────────────────────
  app: null,
  initialPath: null,
  allowedMenuItems: [],
  menuTree: [],

  // ─── Acciones existentes (sin cambios) ──────────────────────────────────────
>>>>>>> main
  setSchool: (school) => set({ school }),
  setUrlColegio: (url) => set({ urlColegio: url }),
  setToken: (token) => set({ token }),
  setUser: (user) => set({ user }),
<<<<<<< HEAD
  clear: () => set({ school: null, urlColegio: null, token: null, user: null }),
=======
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
>>>>>>> main
}));
