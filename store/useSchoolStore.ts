import { create } from "zustand";
import {
  CompanySettings,
  SchoolStore,
} from "../types/typeStore/SchoolStoreType";
import { MenuItem } from "../types/typesMenu/MenuTypes";
import { resolveRoute } from "../utils/resolveRoute";

/**
 * `raw` es `school.settings` tal cual llega de chooseschool (objeto grande,
 * sin tipar en el backend). Extrae solo las claves de `CompanySettings` —
 * ver el comentario de esa interfaz para el porqué. Devuelve `null` si `raw`
 * no es un objeto, para que el caller decida no pisar el valor previo del
 * store con datos vacíos (p. ej. si `chooseschool` no trajo `school`).
 */
export function buildCompanySettings(raw: unknown): CompanySettings | null {
  if (!raw || typeof raw !== "object") return null;
  const settings = raw as Record<string, unknown>;
  return {
    categoryDefaultIds:
      (settings.categoryDefaultIds as Record<string, unknown>) ?? {},
    schedulesAdd: (settings.schedulesAdd as CompanySettings["schedulesAdd"]) ?? [],
    entryTime: typeof settings.entryTime === "string" ? settings.entryTime : "",
    exitTime: typeof settings.exitTime === "string" ? settings.exitTime : "",
    // Default decimal: la UI de Tardanzas decide 3 vs 4 luces con `=== 4` —
    // misma lectura que `get(company, "settings.daysLateAbsence", 3)` del
    // webapp. El backend usa su propio default (4) AL GUARDAR; no se duplica acá.
    daysLateAbsence:
      typeof settings.daysLateAbsence === "number" &&
      Number.isFinite(settings.daysLateAbsence)
        ? settings.daysLateAbsence
        : 3,
    // "Manual" muestra input de hora en Tardanzas; "Automatica" (o ausencia)
    // usa la hora del dispositivo. Valores reales del webapp (TrafficLight).
    tardinessMode:
      typeof settings.tardinessMode === "string" &&
      settings.tardinessMode.trim() !== ""
        ? settings.tardinessMode
        : "Automatica",
  };
}

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
  companySettings: null,

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
      companySettings: null,
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
      companySettings: null,
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
      role: user.role,
      app,
      initialPath,
      allowedMenuItems: allowedItems,
      menuTree,
    });
  },

  setRole: (role) => set({ role }),
  setCompanySettings: (companySettings) => set({ companySettings }),
}));
