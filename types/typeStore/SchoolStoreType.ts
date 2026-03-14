interface SchoolStore {
  school: any | null;
  urlColegio: string | null;
  token: string | null;
  setSchool: (school: any) => void;
  setUrlColegio: (url: string) => void;
  setToken: (token: string) => void;
  clear: () => void;
}

export type { SchoolStore };

