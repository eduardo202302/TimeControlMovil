// Imports relativos (no "@/"): tsconfig.jest.json no declara el alias.
import { AUTH_CARD_BACKGROUND, AUTH_TEXT } from "../constants/authColors";
import { ON_PRIMARY, PRIMARY_COLOR } from "../constants/colors";
import type {
  SchoolColors,
  SchoolSettings,
} from "../../types/typeStore/SchoolStoreType";

/**
 * Tema de las pantallas de acceso (login) derivado de la paleta de la
 * compañía — en la app, `lastCompany.colors` (ver useAuthTheme). Pinta el
 * botón principal, el título de la tarjeta y el acento de lo interactivo
 * (enlaces, checkbox, foco de inputs); el resto de la pantalla y los tokens
 * globales (PRIMARY_COLOR) no cambian. Una compañía sin colores — o con
 * colores inválidos — devuelve DEFAULT_AUTH_THEME (azul de marca FaceClass).
 */
export interface AuthTheme {
  buttonBackground: string;
  buttonText: string;
  titleColor: string;
  buttonShadowColor: string;
  /**
   * Enlaces, checkbox y borde de foco. Es el color del botón cuando se lee
   * sobre la tarjeta blanca (≥ 3:1, misma regla que titleColor); si no,
   * PRIMARY_COLOR.
   */
  accentColor: string;
}

export const DEFAULT_AUTH_THEME: AuthTheme = {
  buttonBackground: PRIMARY_COLOR,
  buttonText: ON_PRIMARY,
  titleColor: AUTH_TEXT,
  buttonShadowColor: PRIMARY_COLOR,
  accentColor: PRIMARY_COLOR,
};

/** Contraste mínimo (WCAG, texto grande / componentes de UI). */
export const MIN_CONTRAST = 3;

const BLACK = "#000000";

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#RGB` o `#RRGGBB`, sin importar mayúsculas. Descarta "undefined", "", "red"… */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

function toRgb(hex: string): [number, number, number] {
  const digits = hex.slice(1);
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((c) => c + c)
          .join("")
      : digits;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** Luminancia relativa WCAG 2.x (0 = negro, 1 = blanco). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Blanco o negro, el que más contraste tenga sobre `background`. */
function readableTextOn(background: string): string {
  return contrastRatio(background, ON_PRIMARY) >=
    contrastRatio(background, BLACK)
    ? ON_PRIMARY
    : BLACK;
}

export function resolveAuthTheme(
  school: { settings?: SchoolSettings | null } | null | undefined,
): AuthTheme {
  return resolveAuthThemeFromColors(school?.settings?.colors);
}

/**
 * Misma regla, a partir de la paleta suelta (p. ej. `lastCompany.colors`, que
 * ya no viaja dentro de `settings`).
 */
export function resolveAuthThemeFromColors(
  colors:
    | Pick<SchoolColors, "logoPrimary" | "logoPrimaryText" | "headerModal">
    | null
    | undefined,
): AuthTheme {
  if (!colors) return DEFAULT_AUTH_THEME;

  let { buttonBackground, buttonText, titleColor } = DEFAULT_AUTH_THEME;

  if (isHexColor(colors.logoPrimary)) {
    buttonBackground = colors.logoPrimary;
    buttonText =
      isHexColor(colors.logoPrimaryText) &&
      contrastRatio(colors.logoPrimary, colors.logoPrimaryText) >= MIN_CONTRAST
        ? colors.logoPrimaryText
        : readableTextOn(colors.logoPrimary);
  }

  if (
    isHexColor(colors.headerModal) &&
    contrastRatio(colors.headerModal, AUTH_CARD_BACKGROUND) >= MIN_CONTRAST
  ) {
    titleColor = colors.headerModal;
  }

  const accentColor =
    contrastRatio(buttonBackground, AUTH_CARD_BACKGROUND) >= MIN_CONTRAST
      ? buttonBackground
      : PRIMARY_COLOR;

  return {
    buttonBackground,
    buttonText,
    titleColor,
    buttonShadowColor: buttonBackground,
    accentColor,
  };
}
