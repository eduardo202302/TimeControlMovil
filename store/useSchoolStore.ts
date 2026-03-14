// store/useSchoolStore.ts
import { create } from "zustand";
import { SchoolStore } from "../types/typeStore/SchoolStoreType";

export const useSchoolStore = create<SchoolStore>((set) => ({
  school: null,
  urlColegio: null,
  token: null,
  setSchool: (school) => set({ school }),
  setUrlColegio: (url) => set({ urlColegio: url }),
  setToken: (token) => set({ token }),
  clear: () => set({ school: null, urlColegio: null, token: null }),
}));
