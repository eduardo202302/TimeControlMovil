// Imports relativos (no "@/"): tsconfig.jest.json no declara el alias.
import { isHexColor } from "./authThemeRules";

/**
 * Marca de la última compañía con la que se inició sesión en este
 * dispositivo. Solo sirve para pintar las pantallas de acceso (logo, nombre y
 * colores) ANTES de que el usuario vuelva a entrar — el login sin esto no
 * sabe a qué compañía va a entrar el usuario, porque el PIN de registro puede
 * agrupar varias.
 *
 * Deliberadamente mínima: ni tokens ni `settings` completo — se guarda en
 * SecureStore y sobrevive al logout, así que no debe llevar nada sensible.
 */
export interface LastCompanyColors {
  logoPrimary?: string;
  logoPrimaryText?: string;
  headerModal?: string;
}

export interface LastCompany {
  v: 1;
  schoolId: number | null;
  name: string;
  /** Ruta relativa tal como la devuelve el backend (no la URI completa). */
  logo: string | null;
  colors: LastCompanyColors;
  /** Servidor al que pertenece — la URI del logo se arma con este. */
  urlColegio: string;
}

export const LAST_COMPANY_VERSION = 1;

/** Clave propia en SecureStore — no la tocan logout() ni clearSession(). */
export const LAST_COMPANY_STORAGE_KEY = "lastCompany";

const COLOR_KEYS = ["logoPrimary", "logoPrimaryText", "headerModal"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** "", "null", "undefined" o algo que no sea string → null. */
export function normalizeLogo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "undefined") {
    return null;
  }
  return trimmed;
}

/** Solo las tres claves del tema, y solo si son hex válidos. */
function pickColors(raw: unknown): LastCompanyColors {
  const source = asRecord(raw);
  const colors: LastCompanyColors = {};
  if (!source) return colors;
  for (const key of COLOR_KEYS) {
    const value = source[key];
    if (isHexColor(value)) colors[key] = value;
  }
  return colors;
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeSchoolId(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Arma el registro a partir del `school` de chooseschool (o el de
 * `schoolUser.school` como respaldo). Devuelve null si no hay nombre o no
 * hay urlColegio: sin eso no hay nada útil que mostrar.
 */
export function buildLastCompany(
  school: unknown,
  urlColegio: string | null | undefined,
): LastCompany | null {
  const source = asRecord(school);
  const name = normalizeName(source?.name);
  if (!source || !name || !urlColegio) return null;
  return {
    v: LAST_COMPANY_VERSION,
    schoolId: normalizeSchoolId(source.id),
    name,
    logo: normalizeLogo(source.logo),
    colors: pickColors(asRecord(source.settings)?.colors),
    urlColegio,
  };
}

/** JSON con SOLO las claves de LastCompany — nada extra se cuela a SecureStore. */
export function serializeLastCompany(company: LastCompany): string {
  return JSON.stringify({
    v: LAST_COMPANY_VERSION,
    schoolId: normalizeSchoolId(company.schoolId),
    name: company.name,
    logo: normalizeLogo(company.logo),
    colors: pickColors(company.colors),
    urlColegio: company.urlColegio,
  });
}

/**
 * null si el JSON es inválido, si `v` no es 1, si falta `name` o si falta
 * `urlColegio`. Los colores inválidos se descartan uno a uno y el logo se
 * normaliza (sin tirar el registro completo).
 */
export function parseLastCompany(
  raw: string | null | undefined,
): LastCompany | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const data = asRecord(parsed);
  if (!data || data.v !== LAST_COMPANY_VERSION) return null;
  const name = normalizeName(data.name);
  if (!name) return null;
  if (typeof data.urlColegio !== "string" || data.urlColegio === "") {
    return null;
  }
  return {
    v: LAST_COMPANY_VERSION,
    schoolId: normalizeSchoolId(data.schoolId),
    name,
    logo: normalizeLogo(data.logo),
    colors: pickColors(data.colors),
    urlColegio: data.urlColegio,
  };
}

function sameServer(a: string, b: string): boolean {
  const strip = (url: string) => url.trim().replace(/\/+$/, "");
  return strip(a) === strip(b);
}

/**
 * Lo guardado en SecureStore, validado contra el servidor actual del
 * dispositivo: si el urlColegio no coincide (otro PIN / otro servidor), la
 * marca guardada no aplica y se devuelve null.
 */
export function resolveLastCompany(
  stored: string | null | undefined,
  currentUrlColegio: string | null | undefined,
): LastCompany | null {
  const company = parseLastCompany(stored);
  if (!company || !currentUrlColegio) return null;
  return sameServer(company.urlColegio, currentUrlColegio) ? company : null;
}
