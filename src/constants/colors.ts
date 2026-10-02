/**
 * Tinte de fila "en alerta" (inactiva / vencida) — equivalente mobile del
 * `#ffcdd2` de setRowStyle del webapp. Mismos valores que `cardExpired` de
 * permissions.tsx.
 */
export const ROW_ALERT_TINT_BACKGROUND = "#FFF1F2";
export const ROW_ALERT_TINT_BORDER = "#FFCDD2";

/**
 * Tokens del patrón card/input/footer ya usado en HolidaysFormModal.tsx y
 * SolicitarPermisoForm.tsx (mismos hex, antes repetidos sueltos en cada
 * archivo) — centralizados acá para que parentsexcusesscreen.tsx y futuras
 * pantallas de Face Class no vuelvan a hardcodearlos.
 */
export const CARD_BACKGROUND = "#fff";
export const CARD_BORDER = "#E5E7EB";
export const INPUT_BORDER = "#D1D5DB";
export const TEXT_PRIMARY = "#111827";
export const TEXT_SECONDARY = "#374151";
export const TEXT_PLACEHOLDER = "#9CA3AF";
/** Íconos tenues: estados vacíos y elementos apagados. Mismo gris que INPUT_BORDER. */
export const ICON_SUBTLE = INPUT_BORDER;
export const PRIMARY_COLOR = "#2563EB";
/**
 * Tint suave de PRIMARY_COLOR para avatares/badges/íconos de fondo — el
 * "chip" azul claro que usan Tardanzas y otras pantallas. Valor fijo elegido
 * a mano (RGB 219, 234, 254), no una derivación calculada en runtime.
 */
export const PRIMARY_TINT_BACKGROUND = "#DBEAFE";
export const ERROR_COLOR = "#DC2626";
export const FOOTER_BORDER = "#F3F4F6";
/**
 * No estaba en la lista original del restyle — se agrega porque el aviso no
 * bloqueante de "adjuntos cerca del límite" necesitaba un color de atención
 * que no fuera ERROR_COLOR (ese es para errores duros, este aviso no bloquea
 * el envío). Mismo ámbar que ya usa `helperWarning` en
 * SolicitarPermisoForm.tsx — no es un color nuevo para la app, solo el
 * primero en centralizarse.
 */
export const WARNING_COLOR = "#B45309";

/**
 * Cinta oscura del header de Asistencia (docente) — el `--ribbon` /
 * `--fonstRibbon` de AttendanceForm en el webapp.
 *
 * En el webapp son configurables por colegio: App.jsx los inyecta en runtime
 * desde `entitySettings.colors`. Mobile todavía no lee esa paleta, así que acá
 * se fija el DEFAULT del backoffice (`DEFAULT_COMPANY_COLORS` de
 * defaultCompanyColors.js), que es lo que ve cualquier colegio que no la haya
 * personalizado. Si algún día mobile lee `entitySettings.colors`, estos dos
 * pasan a ser el fallback.
 */
export const RIBBON_BACKGROUND = "#2C315B";
export const RIBBON_TEXT = "#FFFFFF";
/** Texto secundario sobre la cinta (fecha, etiquetas) — blanco atenuado. */
export const RIBBON_TEXT_MUTED = "#C9CBE4";

/**
 * Rediseño v2 — fondo de pantalla y borde de cards/buscadores. CARD_BORDER
 * (el original) sigue vivo en inputs, filas de archivo y divisores.
 */
export const APP_BACKGROUND_V2 = "#E9EDF7";
export const CARD_BORDER_V2 = "#E6EAF0";

/**
 * Marca / acentos — hex que hoy están hardcodeados sueltos en pantallas y
 * componentes (HEADER_NAVY ×15, PRIMARY_700 ×19, PRIMARY_TINT_50 ×31,
 * TEXT_MUTED ×125). Se centralizan acá para que las fases siguientes los
 * reemplacen sin inventar valores nuevos.
 */
export const HEADER_NAVY = "#142157";
export const PRIMARY_700 = "#1D4ED8";
/** Un escalón más claro que PRIMARY_COLOR — acento de borde (bloque de descripción). */
export const PRIMARY_500 = "#3B82F6";
export const PRIMARY_TINT_50 = "#EFF6FF";
/** El tinte más claro del primario: celdas y zonas apenas resaltadas. */
export const PRIMARY_TINT_25 = "#F8FAFF";
/** Gris intermedio: entre TEXT_SECONDARY (#374151) y TEXT_PLACEHOLDER (#9CA3AF). */
export const TEXT_MUTED = "#6B7280";
/** Texto de párrafo (descripciones largas): entre TEXT_SECONDARY y TEXT_MUTED. */
export const TEXT_BODY = "#4B5563";
export const SUCCESS_COLOR = "#15803D";
export const ACCENT_VIOLET = "#7C3AED";
export const ACCENT_TEAL = "#0D9488";
/**
 * Ámbar para íconos/acentos. No confundir con WARNING_COLOR (#B45309), que es
 * el ámbar más oscuro para TEXTO de aviso — este es más claro y no da
 * contraste suficiente como color de texto sobre blanco.
 */
export const WARNING_ACCENT = "#D97706";

/**
 * Estados de los ponchadores (Registrar Acceso / ADM) — verde entrada, rojo
 * error, ámbar aviso, violeta días. Mismos hex que ya estaban sueltos en
 * ambas pantallas.
 *
 * SUCCESS_ACCENT es el verde de acción/ícono (botón Entrada, "A Tiempo");
 * SUCCESS_COLOR (#15803D) es otro verde, más oscuro — no son intercambiables.
 * Los *_TINT_* son el fondo/borde suave de pills, chips y círculos de ícono.
 * DANGER_TINT_* y no ERROR_TINT_*: ese nombre queda reservado para el banner
 * de error.
 */
export const SUCCESS_ACCENT = "#16A34A";
export const SUCCESS_TINT_BACKGROUND = "#DCFCE7";
export const SUCCESS_TINT_BORDER = "#BBF7D0";
export const DANGER_TINT_BACKGROUND = "#FEE2E2";
export const DANGER_TINT_BORDER = "#FECACA";
export const WARNING_TINT_BACKGROUND = "#FEF3C7";
export const WARNING_TINT_BORDER = "#FDE68A";
/** Texto sobre WARNING_TINT_BACKGROUND — más oscuro que WARNING_COLOR. */
export const WARNING_TEXT_STRONG = "#92400E";
export const VIOLET_TINT_BACKGROUND = "#EDE9FE";
/** Borde de los chips sobre PRIMARY_TINT_50. */
export const PRIMARY_TINT_BORDER = "#BFDBFE";
/** Tintes más claros que los *_TINT_BACKGROUND: filas de archivo nuevo, avisos. */
export const SUCCESS_TINT_50 = "#F0FDF4";
export const WARNING_TINT_50 = "#FFFBEB";
/** Círculo del ícono de resultado exitoso (Solicitar Permiso). */
export const OUTCOME_OK_BACKGROUND = "#ECFDF5";
/** Punto "en línea" / jornada iniciada y badge de conteo — verde más vivo que SUCCESS_ACCENT. */
export const ONLINE_DOT = "#22C55E";
/** Chip índigo (categorías y "+N" de Usuarios). */
export const INDIGO_TINT_BACKGROUND = "#E0E7FF";
export const INDIGO_TEXT = "#3730A3";

/**
 * Banner de error y superficies de peligro suave (cerrar sesión, eliminar,
 * archivo quitado). ERROR_TEXT es el rojo oscuro que va encima del tinte —
 * ERROR_COLOR (#DC2626) queda para errores de campo y acciones.
 */
export const ERROR_TINT_BACKGROUND = "#FEF2F2";
export const ERROR_TINT_BORDER = DANGER_TINT_BORDER;
export const ERROR_TEXT = "#B91C1C";

/** Íconos de acción de las filas (ver / editar) y rojo de eliminar. */
export const ICON_VIEW = "#2185D0";
export const ICON_EDIT = "#3F7EA3";
export const DANGER_ICON = "#B43333";
/** Ícono de limpiar dentro de un input. */
export const CLEAR_ICON = "#9AA4B4";
/** Punto de color de un tag que no trae color del backend. */
export const TAG_DOT_FALLBACK = "#CBD5E1";

/**
 * Chip de ícono de sección (título de card): cuadrito SÓLIDO del color del
 * tono con el ícono en blanco encima. El tono se elige por tipo de contenido
 * (info azul, detalles violeta, fechas teal, adjuntos ámbar, peligro rojo).
 */
export type SectionTone = "blue" | "violet" | "teal" | "amber" | "red";
export const SECTION_TONES: Record<SectionTone, string> = {
  blue: PRIMARY_COLOR,
  violet: ACCENT_VIOLET,
  teal: ACCENT_TEAL,
  amber: WARNING_ACCENT,
  red: ERROR_COLOR,
};
export const SECTION_ICON_COLOR = "#FFFFFF";

/** Fondo del overlay de diálogos, popups, sheets y drawer. */
export const OVERLAY_BACKDROP = "rgba(0,0,0,0.5)";
/** Fondo del visor de imagen a pantalla completa — casi opaco, no es un overlay de modal. */
export const OVERLAY_VIEWER = "rgba(0,0,0,0.92)";

/**
 * Texto, íconos y spinners sobre un fondo de color (botón primario, FAB,
 * segmento activo). Sobre el header navy se usa HEADER_TEXT.
 */
export const ON_PRIMARY = "#FFFFFF";
/** Texto secundario sobre un fondo de color. */
export const ON_PRIMARY_MUTED = "#E5E7EB";

/**
 * Header navy del shell (fondo HEADER_NAVY): texto/íconos en blanco y el
 * fondo translúcido del botón de menú — blanco al 8% para que se lea como
 * botón sin romper el bloque de color.
 */
export const HEADER_TEXT = "#FFFFFF";
export const HEADER_BUTTON_BACKGROUND = "rgba(255,255,255,0.08)";
/**
 * Botón de ícono ACTIVO sobre el header navy (p. ej. toggle ver/editar del
 * formulario de usuario): un escalón más opaco que HEADER_BUTTON_BACKGROUND.
 */
export const HEADER_BUTTON_ACTIVE_BACKGROUND = "rgba(255,255,255,0.2)";

/**
 * Campos de formulario — rediseño v2 (Fase 4). Fondo gris-azulado claro para
 * inputs/selects/textarea y filas de archivo; gris neutro para solo lectura.
 */
export const FIELD_BACKGROUND = "#F5F7FB";
export const FIELD_DISABLED_BACKGROUND = "#F3F4F6";
/** Fondo sutil de botones de acción dentro de filas (ver/editar/eliminar). */
export const SURFACE_SUBTLE = "#F9FAFB";

/** Adjuntos: zona de soltar archivos y botón "agregar archivo" (punteados). */
export const DROPZONE_BORDER = PRIMARY_TINT_BORDER;
export const DROPZONE_BACKGROUND = PRIMARY_TINT_25;
export const ADD_FILE_BORDER = "#93C5FD";

/** Pista del Switch apagado (encendido = PRIMARY_COLOR). */
export const SWITCH_TRACK_OFF = "#E5E7EB";
