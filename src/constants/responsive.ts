import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

/**
 * Fundación responsive — TimeControlMovil.
 *
 * La app es portrait-only en teléfono y tablet (app.json > orientation:
 * "portrait", replicado en AndroidManifest). Eso significa que el ancho de
 * ventana casi nunca cambia en runtime; aun así usamos useWindowDimensions()
 * en vez de Dimensions.get() por dos motivos:
 *
 *   1. iPad con supportsTablet: true habilita Split View / Slide Over, donde
 *      la ventana SÍ se redimensiona en vivo aunque la orientación no cambie.
 *   2. Dimensions.get() en scope de módulo se evalúa una sola vez al cargar el
 *      bundle y queda congelado — el bug que ya tiene DrawerMenu.tsx.
 */

// ─── Breakpoint ──────────────────────────────────────────────────────────────

/**
 * 600dp = el `sw600dp` canónico de Android. Elegido sobre 768 porque un tablet
 * de 8" en portrait mide ~600dp y quedaría clasificado como teléfono con un
 * umbral más alto. En portrait-only, un tablet de 10" ronda los 800dp.
 */
export const BREAKPOINT_TABLET = 600;

/**
 * Ancho máximo del contenido en tablet. Sin esto, el árbol entero hereda el
 * ancho completo del device y los bloques de 2 columnas de punchinout.tsx se
 * estiran a ~500dp cada uno para mostrar texto de 13px (hallazgo 4.1/4.4 de la
 * auditoría FASE A).
 *
 * 680 está calibrado sobre esas tiles: 680 - (16 * 2 de padding) = 648 útiles,
 * menos el gap de 8 → ~320dp por columna. Es el ancho de una tile en un
 * teléfono grande, o sea la proporción que ya está validada en diseño.
 */
export const MAX_CONTENT_WIDTH = 680;

// ─── Bases de escalado ───────────────────────────────────────────────────────

/** iPhone 11/12/13/14 estándar — el device sobre el que se diseñaron los layouts actuales. */
const GUIDELINE_BASE_WIDTH = 375;
const GUIDELINE_BASE_HEIGHT = 812;

/**
 * Techo del factor de escala. Sin él, un tablet de 1024dp daría 1024/375 =
 * 2.73x y los paddings/tipografías se dispararían.
 *
 * El cap es GLOBAL, no condicionado a `isTablet`, y eso es deliberado: si sólo
 * aplicara en tablet habría un salto invertido en la frontera — un teléfono de
 * 599dp escalaría 1.60x y un tablet de 600dp bajaría de golpe a 1.15x, o sea
 * los elementos se harían MÁS CHICOS al pasar a pantalla más grande. Con el cap
 * global la función es monótona y continua.
 *
 * En la práctica ningún teléfono lo toca: el más ancho (iPhone 16 Pro Max,
 * 440dp) da 1.173x, apenas por encima. Sólo los tablets quedan clampeados.
 */
const MAX_SCALE = 1.15;

/** Piso, para que un dispositivo chico (320dp → 0.85x) no vuelva el texto ilegible. */
const MIN_SCALE = 0.85;

/** Cuánto del escalado se le aplica a la tipografía. Ver `font()`. */
const FONT_SCALE_FACTOR = 0.3;

const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max);

// ─── Escala tipográfica ──────────────────────────────────────────────────────

/**
 * Derivada del histograma real del repo (auditoría FASE A), no inventada.
 * Frecuencias sobre todo `src/` tras borrar el cluster muerto:
 *
 *   11 ×22 · 12 ×44 · 13 ×30 · 14 ×36 · 15 ×17 · 16 ×10
 *   17 ×8  · 18 ×12 · 20 ×11 · 22 ×3  · 24 ×2  · 25 ×1
 *
 * XXL es 25 y no 28: 25 es el valor más grande que existe en la app
 * (punchinout.tsx, el reloj). 28 no aparece en ningún archivo.
 *
 * ⚠️ Para B.2/B.3 — 12 (×44) y 14 (×36) son los dos tamaños MÁS usados del
 * repo y no caen en esta escalera. Migrarlos exige una decisión explícita
 * (12 → XS 11 o SM 13; 14 → SM 13 o MD 15), no un redondeo automático.
 * No los mapees a ciegas.
 */
export const FONT_XS = 11;
export const FONT_SM = 13;
export const FONT_MD = 15;
export const FONT_LG = 18;
export const FONT_XL = 22;
export const FONT_XXL = 25;

// ─── Escala de radios ────────────────────────────────────────────────────────

/**
 * Igual que arriba, tomada del histograma real:
 *   8 ×21 · 10 ×28 · 12 ×24 · 16 ×8 · 20 ×17 · 32 ×5
 *
 * Los valores sueltos 31/33/39/48 son círculos (size / 2 de un avatar o botón)
 * — no son radios de diseño y no deben tokenizarse: se calculan desde el lado.
 */
export const RADIUS_SM = 8;
export const RADIUS_MD = 10;
export const RADIUS_LG = 12;
export const RADIUS_XL = 16;
export const RADIUS_2XL = 20;
export const RADIUS_3XL = 32;
/** Para pills: un radio grande y arbitrario que Yoga clampea al 50% del lado. */
export const RADIUS_PILL = 999;

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface Responsive {
  width: number;
  height: number;
  isTablet: boolean;
  /** Escala horizontal: anchos, paddings, gaps, radios. */
  scale: (size: number) => number;
  /** Escala vertical: alturas y paddings verticales que deben seguir al alto de pantalla. */
  verticalScale: (size: number) => number;
  /** Escala moderada para tipografía. */
  font: (size: number) => number;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isTablet = width >= BREAKPOINT_TABLET;

    const widthFactor = clamp(
      width / GUIDELINE_BASE_WIDTH,
      MIN_SCALE,
      MAX_SCALE,
    );
    const heightFactor = clamp(
      height / GUIDELINE_BASE_HEIGHT,
      MIN_SCALE,
      MAX_SCALE,
    );

    const scale = (size: number) => Math.round(size * widthFactor);
    const verticalScale = (size: number) => Math.round(size * heightFactor);

    /**
     * Moderate scale: el texto crece sólo un 30% de lo que crece el
     * contenedor. Un contenedor a 1.15x lleva su texto a 1.045x — así los
     * bloques respiran en tablet sin que la tipografía se vuelva titular.
     */
    const font = (size: number) =>
      Math.round(size + (size * widthFactor - size) * FONT_SCALE_FACTOR);

    return { width, height, isTablet, scale, verticalScale, font };
  }, [width, height]);
}
