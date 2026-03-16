interface SchoolStore {
  school: any | null;
  urlColegio: string | null;
  token: string | null;
  user: any | null;
  setSchool: (school: any) => void;
  setUrlColegio: (url: string) => void;
  setToken: (token: string) => void;
  setUser: (user: any) => void;
  clear: () => void;
}

export type { SchoolStore };

