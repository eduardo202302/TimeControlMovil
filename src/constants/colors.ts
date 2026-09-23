export const APP_BACKGROUND = "#e2e2e2";

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
