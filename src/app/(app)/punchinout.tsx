import ImageViewerModal from "@/components/ui/ImageViewerModal";
import SectionIcon from "@/components/ui/SectionIcon";
import {
  ACCENT_VIOLET,
  CARD_BACKGROUND,
  CARD_BORDER,
  DANGER_TINT_BACKGROUND,
  DANGER_TINT_BORDER,
  ERROR_COLOR,
  ERROR_TEXT,
  FIELD_DISABLED_BACKGROUND,
  FOOTER_BORDER,
  HEADER_NAVY,
  ICON_SUBTLE,
  ON_PRIMARY,
  ONLINE_DOT,
  PRIMARY_700,
  PRIMARY_COLOR,
  PRIMARY_TINT_25,
  PRIMARY_TINT_50,
  PRIMARY_TINT_BACKGROUND,
  PRIMARY_TINT_BORDER,
  SECTION_ICON_COLOR,
  SUCCESS_ACCENT,
  SUCCESS_TINT_BACKGROUND,
  SUCCESS_TINT_BORDER,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  VIOLET_TINT_BACKGROUND,
  WARNING_ACCENT,
  WARNING_TEXT_STRONG,
  WARNING_TINT_BACKGROUND,
  WARNING_TINT_BORDER,
} from "@/constants/colors";
import {
  MAX_CONTENT_WIDTH,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  RADIUS_SM,
  RADIUS_XL,
  useResponsive,
} from "@/constants/responsive";
import { tintedShadow } from "@/constants/shadows";
import {
  ALERT_BANNER,
  CARD_FORM,
  CATEGORY_BTN_ACTIVE,
  CATEGORY_BTN_SURFACE,
  DIALOG_OVERLAY,
  FIELD_SURFACE,
  FOOTER_BTN_SAVE,
  POPUP_CARD,
} from "@/styles/surfaces";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  buildAttendancesToday,
  buildCompanySettings,
  useSchoolStore,
} from "../../../store/useSchoolStore";
import type {
  School,
  SchoolSettings,
  SchoolUser,
  UserSchedule,
} from "../../../types/typeStore/SchoolStoreType";
import {
  buildTodayHoliday,
  findLastJornadaPunch,
  findOpenDayPunch,
  findOpenDayPunchForUser,
  formatLateDuration,
  getApprovedPermissionsToday,
  getBreakTagCategoryId,
  getLateMinutes,
  getNewestPunch,
  getPendingOpenDayDate,
  getPunchBreakTagName,
  getPunchPhotoUrl,
  getPunctuality,
  getRDDayIndex,
  getScheduleForDay,
  getStatusColor,
  isAlmuerzoButtonVisible,
  isAlmuerzoVisible,
  isBreakVisible,
  isJornadaEndType,
  isJornadaStartType,
  isJornadaVisible,
  isNonWorkingHoliday,
  isRejectedJornadaAttempt,
  RD_UTC_OFFSET,
  resolvePunchTypeForApi,
  resolveSelectedCategory,
  tagsOfCategory,
  toRD,
  toRDDateString,
  WEEK_DAYS,
  type PunchEvent,
  type Tag,
  type ToleranceConfig,
  type UserDayPermission,
} from "../../utils/punchRules";
import * as Storage from "../../utils/storage";
import { getActiveSchoolId } from "../../utils/chooseCompany";

type Category = "Jornada" | "Almuerzo" | "Break";

interface PunchPayload {
  type: string;
  photourl?: string[];
  schedule?: UserSchedule;
  latitude?: number;
  longitude?: number;
  createdDate?: string;
  recordedDate?: string;
  nextDayExit?: boolean;
  tagId?: number;
}

const MONTH_NAMES: Record<number, string> = {
  0: "enero",
  1: "febrero",
  2: "marzo",
  3: "abril",
  4: "mayo",
  5: "junio",
  6: "julio",
  7: "agosto",
  8: "septiembre",
  9: "octubre",
  10: "noviembre",
  11: "diciembre",
};

const CATEGORY_ICONS: Record<Category, keyof typeof Ionicons.glyphMap> = {
  Jornada: "briefcase-outline",
  Almuerzo: "restaurant-outline",
  Break: "cafe-outline",
};

const PUNCH_TYPE_MAP: Record<Category, { inicio: string; fin: string }> = {
  Jornada: { inicio: "InicioJornada", fin: "FinJornada" },
  Almuerzo: { inicio: "InicioAlmuerzo", fin: "FinAlmuerzo" },
  Break: { inicio: "InicioBreak", fin: "FinBreak" },
};

// Sesión máxima antes de forzar relogin en la primera Entrada Jornada del día,
// para confirmar permisos/settings que un admin pudo haber cambiado.
const SESSION_MAX_HOURS_FOR_FIRST_ENTRY = 12;
const HISTORY_COLLAPSED_LIMIT = 3;
/** Pulsos del parpadeo del ponche recién registrado en el Historial del Día */
const BLINK_PULSES = 5;

/** Logo de Time Control (solo el ícono, sin texto) — título de la card Hora Actual. */
const TIME_CONTROL_LOGO = require("../../../assets/images/logos/logopeq.png");
/** Proporción del PNG (652×411). */
const TIME_CONTROL_LOGO_ASPECT = 652 / 411;
/**
 * Fracción del ancho que el PNG trae en blanco a la derecha (el dibujo
 * termina en x≈580 de 652). Se compensa con un marginRight negativo para
 * alinear el dibujo con el borde derecho del contenido de la card.
 */
const TIME_CONTROL_LOGO_RIGHT_INSET = 71 / 652;

function decodeJWT(token: string): Record<string, any> {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function to12h(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "a.m." : "p.m.";
  return `${h12}:${pad(m)} ${ampm}`;
}

/** "08:45 a. m." — modal / registros */
function formatRDTimeShort(date: Date): string {
  const { hours, minutes } = toRD(date);
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours < 12 ? "a. m." : "p. m.";
  return `${pad(h12)}:${pad(minutes)} ${ampm}`;
}

/** "martes, 17 de marzo de 2026" */
function formatRDDate(date: Date): string {
  const { weekDay, day, month, year } = toRD(date);
  return `${WEEK_DAYS[weekDay]}, ${day} de ${MONTH_NAMES[month]} de ${year}`;
}

/** "Miércoles 8 de agosto" — reloj compacto, sin año */
function formatRDDateShort(date: Date): string {
  const { weekDay, day, month } = toRD(date);
  return `${WEEK_DAYS[weekDay]} ${day} de ${MONTH_NAMES[month]}`;
}

// ─── Helpers de negocio ───────────────────────────────────────────────────────

function getTodaySchedule(
  schedules: UserSchedule[],
  now: Date,
): UserSchedule | null {
  const todayName = WEEK_DAYS[getRDDayIndex(now)];
  return schedules.find((s) => s.weekDay === todayName) ?? null;
}

function getPunchTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    InicioJornada: "Inicio Jornada",
    FinJornada: "Fin Jornada",
    InicioJornadaAdicional: "Inicio Jornada Adicional",
    FinJornadaAdicional: "Fin Jornada Adicional",
    InicioJornadaFH: "Inicio Jornada FH",
    FinJornadaFH: "Fin Jornada FH",
    InicioAlmuerzo: "Entrada Almuerzo",
    FinAlmuerzo: "Salida Almuerzo",
    InicioBreak: "Inicio Break",
    FinBreak: "Fin Break",
  };
  return labels[type] ?? type;
}

/** Deriva la categoría (Jornada/Almuerzo/Break) a partir del punch.type, para
 * reutilizar el mismo ícono de CATEGORY_ICONS que ya usan los botones de
 * arriba — así el historial usa la misma forma que la persona ya asocia con
 * cada categoría al ponchear. */
function getPunchCategory(type: string): Category {
  if (type.includes("Jornada")) return "Jornada";
  if (type.includes("Almuerzo")) return "Almuerzo";
  return "Break";
}

/**
 * Estado a mostrar para un punch, con la misma cadena de prioridad en
 * todos los lugares que lo necesitan (historial del día, pill del último
 * ponche): horas extras > error de imagen / fuera de área > puntualidad
 * local (corrige estados erróneos del backend) > permiso (ignora flags
 * lateEntry/earlyExit) > flags del backend > status del backend.
 */
function getDisplayStatus(
  punch: PunchEvent,
  userSchedules: UserSchedule[],
  tolerances: ToleranceConfig,
): string {
  const hasOvertime = parseFloat(String(punch.overtime ?? 0)) > 0;
  // Solo FinJornada puede generar horas extras
  const isJornadaOvertime = punch.type === "FinJornada" && hasOvertime;
  const punctuality = getPunctuality(punch, userSchedules, tolerances);
  return isJornadaOvertime
    ? "Horas extras"
    : punch.status === "Error de Imagen"
      ? "Error de Imagen"
      : punch.status === "Fuera de área"
        ? "Fuera de área"
        : punctuality !== null
          ? punctuality
          : punch.permissionId != null
            ? punch.status || "A Tiempo"
            : punch.lateEntry
              ? "Tardanza"
              : punch.earlyExit
                ? "Anticipada"
                : punch.status || "A Tiempo";
}

function isJornadaActiva(punches: PunchEvent[]): boolean {
  return isJornadaStartType(findLastJornadaPunch(punches)?.type ?? "");
}

// ─────────────────────────────────────────────────────────────────────────────

/** Distancia en metros entre dos coordenadas (fórmula de Haversine). */
const getDistanceInMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371e3; // Radio de la Tierra en metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Obtiene las coordenadas actuales con un timeout de 10s.
 * Si el GPS no responde a tiempo, se aborta (null) en lugar de
 * dejar la promesa colgada y el botón en carga infinita.
 */
const getCurrentCoordinates = async (): Promise<{
  latitude: number;
  longitude: number;
} | null> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permiso Denegado",
        "Se requiere acceso a la ubicación para registrar el ponche dentro del área permitida.",
      );
      return null;
    }

    const location = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);

    if (!location) {
      Alert.alert(
        "Error de Ubicación",
        "No se pudo obtener tu ubicación en el tiempo esperado. Asegúrate de tener el GPS activado y buena señal.",
      );
      return null;
    }

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    Alert.alert(
      "Error de Ubicación",
      "No se pudo obtener tu ubicación actual. Asegúrate de tener el GPS activado.",
    );
    return null;
  }
};

/**
 * Variante silenciosa de getCurrentCoordinates(), para vistas de solo
 * lectura (ej. bloque "Ubicación" de la card de Perfil). No pide permiso
 * (solo lo lee) ni muestra Alert — si algo falla, simplemente no hay
 * coordenadas y el bloque que las consume no se muestra.
 */
const getCurrentCoordinatesSilent = async (): Promise<{
  latitude: number;
  longitude: number;
} | null> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const location = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);

    if (!location) return null;

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch {
    return null;
  }
};

/**
 * Permisos aprobados/pendientes del día. Nunca lanza: si falla, devuelve []
 * para no romper el render del ponchador (el interceptor global de axios ya se
 * encarga de la sesión expirada).
 */
async function fetchTodayPermissions(
  baseUrl: string,
  schoolUserId: number,
  token: string,
): Promise<UserDayPermission[]> {
  try {
    const response = await axios.get(
      `${baseUrl}/userdaypermissions/today/${schoolUserId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    console.log("TODAY PERMISSIONS RESPONSE:", {
      clientTimestamp: new Date().toISOString(),
      data: response.data,
    });
    if (response.data?.success) {
      return (response.data.data as UserDayPermission[]) ?? [];
    }
    return [];
  } catch (error: any) {
    console.error(
      "fetchTodayPermissions:",
      error?.response?.data?.message ?? error?.message,
    );
    return [];
  }
}

/**
 * Respaldo para cuando /punches/today no trae el InicioJornada abierto (ver
 * fetchOpenDayFallback más abajo): GET /punches/opendays devuelve los
 * InicioJornada sin cerrar de TODA la escuela, sin filtro de usuario en el
 * backend — se filtra client-side por schoolUserId. Nunca lanza: si falla, se
 * cae al estado de error del modal en vez de adivinar la fecha.
 */
async function fetchOpenDayPunch(
  baseUrl: string,
  schoolUserId: number,
  token: string,
): Promise<PunchEvent | null> {
  try {
    const response = await axios.get(`${baseUrl}/punches/opendays`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("OPEN DAYS RESPONSE:", {
      clientTimestamp: new Date().toISOString(),
      data: response.data,
    });
    if (!response.data?.success) return null;
    const data: PunchEvent[] = response.data.data ?? [];
    return findOpenDayPunchForUser(data, schoolUserId);
  } catch (error: any) {
    console.error(
      "fetchOpenDayPunch:",
      error?.response?.data?.message ?? error?.message,
    );
    return null;
  }
}

export default function PunchInOut() {
  const { isTablet, font, scale } = useResponsive();
  const [now, setNow] = useState(new Date());
  const [selectedCategory, setSelectedCategory] = useState<Category>("Jornada");
  const [punches, setPunches] = useState<PunchEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPunches, setLoadingPunches] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [phoneImagen, setPhoneImagen] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [historyShowAll, setHistoryShowAll] = useState(false);
  /** Foto de un ponche del historial abierta en el visor, o null. */
  const [punchPhotoUri, setPunchPhotoUri] = useState<string | null>(null);
  const [tolerancesExpanded, setTolerancesExpanded] = useState(true);
  // Parpadeo del ponche recién registrado (solo inicios de jornada)
  const [blinkPunchId, setBlinkPunchId] = useState<number | null>(null);
  const blinkRequestedRef = useRef(false);
  const blinkOpacity = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const [nextDayExitModal, setNextDayExitModal] = useState(false);
  const [nextDayExitPunch, setNextDayExitPunch] = useState<PunchEvent | null>(
    null,
  );
  const [nextDayExitTime, setNextDayExitTime] = useState("");
  const [submittingExit, setSubmittingExit] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState(() => new Date());
  const [breakTags, setBreakTags] = useState<Tag[]>([]);
  const [selectedBreakTagId, setSelectedBreakTagId] = useState<number | null>(
    null,
  );
  const [breakTagModalVisible, setBreakTagModalVisible] = useState(false);
  const [permissions, setPermissions] = useState<UserDayPermission[]>([]);
  const [permissionInfoModal, setPermissionInfoModal] = useState(false);
  const [currentLocationInfo, setCurrentLocationInfo] = useState<{
    address: string;
    withinArea: boolean;
  } | null>(null);

  const { user, urlColegio, logout, todayHoliday } = useSchoolStore();

  // El login devuelve los horarios en user.schoolUsers[0].userSchedules
  const schoolUser: SchoolUser | undefined = user?.user?.schoolUsers?.[0];
  const userSchedules: UserSchedule[] =
    schoolUser?.userSchedules ?? user?.userSchedules ?? [];
  const todaySchedule = getTodaySchedule(userSchedules, now);
  const jornadaIniciada = isJornadaActiva(punches);
  const nonWorkingHoliday = isNonWorkingHoliday(todayHoliday, now);
  const lastPunch = punches[punches.length - 1];

  // Configuración de la escuela (school.settings) y del usuario (schoolUser.settings)
  const [schoolSettings, setSchoolSettings] = useState<
    SchoolSettings | undefined
  >(() => schoolUser?.school?.settings ?? user?.school?.settings);
  const schoolUserSettings = schoolUser?.settings;
  // Los settings son individuales por usuario (schoolUserSettings) — esa es la
  // fuente de verdad. schoolSettings (sede) es solo el default general cuando
  // el usuario no tiene el campo configurado. NUNCA usar AND entre ambos: un
  // usuario con isImageRequired=false explícito no debe heredar el true de la sede.
  const isImageRequired: boolean = Boolean(
    schoolUserSettings?.isImageRequired ?? schoolSettings?.isImageRequired,
  );
  const isValidLocation: boolean = Boolean(
    schoolUserSettings?.isValidLocation ?? schoolSettings?.isValidLocation,
  );

  /**
   * Categoría de los "Motivos del break", de la config de la escuela
   * (settings.categoryDefaultIds.catBreakTypeId) — la misma fuente que usa el
   * backend para su propio listado de break tags.
   *
   * Se lee SOLO de schoolSettings, no de schoolUserSettings: categoryDefaultIds
   * es configuración de la sede, no tiene contraparte por usuario.
   *
   * Antes se filtraba por el nombre "Tipos de Break", que es apenas el `label`
   * con el que se siembra esa entrada: coincidía por casualidad y se rompía
   * apenas una escuela renombrara su categoría.
   */
  const breakTagCategoryId = useMemo(
    () => getBreakTagCategoryId(schoolSettings),
    [schoolSettings],
  );

  // Tolerancias de tiempo: usuario → sede → default UX (1 min jornada, 5 min almuerzo)
  const tolWorkIn =
    schoolUserSettings?.toleranceWorkTimeIn ??
    schoolSettings?.toleranceWorkTimeIn ??
    1;
  const tolWorkOut =
    schoolUserSettings?.toleranceWorkTimeOut ??
    schoolSettings?.toleranceWorkTimeOut ??
    1;
  const tolLunchIn =
    schoolUserSettings?.toleranceLunchTimeIn ??
    schoolSettings?.toleranceLunchTimeIn ??
    5;
  const tolLunchOut =
    schoolUserSettings?.toleranceLunchTimeOut ??
    schoolSettings?.toleranceLunchTimeOut ??
    5;

  const lastPunchDisplayStatus = lastPunch
    ? getDisplayStatus(lastPunch, userSchedules, {
        workIn: tolWorkIn,
        workOut: tolWorkOut,
        lunchIn: tolLunchIn,
        lunchOut: tolLunchOut,
      })
    : null;

  // "Ver Botón" — minutos antes del horario en que el botón de acción se
  // hace VISIBLE (distinto de tolWorkIn/etc., que solo decide la etiqueta
  // Tardanza/Anticipada/A Tiempo). Campos confirmados por consulta directa
  // a la BD: lblWorkTimeIn/lblWorkTimeOut/lblLunchTimeIn/lblLunchTimeOut.
  // Si no está configurado, cae al valor de Tolerancia (comportamiento
  // idéntico al actual — sin ventana "Anticipada" visible — para no
  // romper cuentas que aún no configuraron "Ver Botón").
  const btnVisWorkIn =
    schoolUserSettings?.lblWorkTimeIn ??
    schoolSettings?.lblWorkTimeIn ??
    tolWorkIn;
  const btnVisWorkOut =
    schoolUserSettings?.lblWorkTimeOut ??
    schoolSettings?.lblWorkTimeOut ??
    tolWorkOut;
  const btnVisLunchIn =
    schoolUserSettings?.lblLunchTimeIn ??
    schoolSettings?.lblLunchTimeIn ??
    tolLunchIn;
  const btnVisLunchOut =
    schoolUserSettings?.lblLunchTimeOut ??
    schoolSettings?.lblLunchTimeOut ??
    tolLunchOut;

  // Geocerca: coordenadas de la sede y radio permitido (metros, default 200m)
  const schoolObj: School | undefined = schoolUser?.school ?? user?.school;
  const schoolLatitude: number = Number(
    schoolObj?.schoolLatitude ??
      schoolObj?.latitude ??
      schoolObj?.address?.latitude ??
      schoolSettings?.schoolLatitude,
  );
  const schoolLongitude: number = Number(
    schoolObj?.schoolLongitude ??
      schoolObj?.longitude ??
      schoolObj?.address?.longitude ??
      schoolSettings?.schoolLongitude,
  );
  const geofenceRadiusMeters: number = Number(
    schoolSettings?.toleranceRadius ??
      schoolSettings?.radioPermitido ??
      schoolObj?.toleranceRadius ??
      schoolObj?.radioPermitido ??
      200,
  );

  // ── Resolución jerárquica de geocerca ────────────────────────────────────
  // Prioridad: coordenadas del usuario (schoolUser → user) → fallback a sede/empresa
  type GeofenceSource = "USER_CUSTOM_LOCATION" | "COMPANY_HEADQUARTERS";

  interface GeofenceTarget {
    targetLatitude: number;
    targetLongitude: number;
    source: GeofenceSource;
    radius: number;
  }

  const getTargetGeofenceLocation = (): GeofenceTarget => {
    // La ubicación designada del usuario vive en address[0] (arreglo), no en
    // latitude/longitude sueltos — forma distinta a la de School.address (objeto).
    const userLat = Number(
      schoolUser?.address?.[0]?.latitude ?? user?.address?.[0]?.latitude,
    );
    const userLng = Number(
      schoolUser?.address?.[0]?.longitude ?? user?.address?.[0]?.longitude,
    );
    const hasUserLocation =
      !isNaN(userLat) && !isNaN(userLng) && userLat !== 0 && userLng !== 0;

    if (hasUserLocation) {
      return {
        targetLatitude: userLat,
        targetLongitude: userLng,
        source: "USER_CUSTOM_LOCATION",
        radius: Number(
          schoolUser?.toleranceRadius ??
            user?.toleranceRadius ??
            geofenceRadiusMeters,
        ),
      };
    }

    // Fallback a la empresa / sede
    return {
      targetLatitude: schoolLatitude,
      targetLongitude: schoolLongitude,
      source: "COMPANY_HEADQUARTERS",
      radius: geofenceRadiusMeters,
    };
  };

  const getToken = useCallback(async (): Promise<string | null> => {
    const storeToken = useSchoolStore.getState().token;
    if (storeToken) return storeToken;
    return await Storage.getItemAsync("token");
  }, []);

  const forceLogout = useCallback(async () => {
    // Limpiar SecureStore y store, luego navegar a login directamente
    await Promise.all([
      Storage.deleteItemAsync("token"),
      Storage.deleteItemAsync("user"),
      Storage.deleteItemAsync("menuItems"),
      // isAuthorized NO se borra — es la autorización del dispositivo físico,
      // no de la sesión del usuario.
    ]);
    logout();
    router.replace("/login");
  }, [logout]);

  // Interceptor — detecta sesión expirada en cualquier llamada axios
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const status = error?.response?.status;
        const message: string = error?.response?.data?.message ?? "";
        const isExpired =
          status === 401 ||
          message.toLowerCase().includes("expir") ||
          message.toLowerCase().includes("unauthorized") ||
          message.toLowerCase().includes("sesión");

        if (isExpired) {
          Alert.alert(
            "Sesión expirada",
            "Tienes cambios en el horario, inicia sesión nuevamente.",
            [{ text: "Aceptar", onPress: forceLogout }],
            { cancelable: false },
          );
        }
        return Promise.reject(error);
      },
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [forceLogout]);

  // ── Polling: detecta cambios de horario en tiempo real ──────────────────────
  useEffect(() => {
    const initialSchedulesJson = JSON.stringify(userSchedules);
    const schoolId = schoolUser?.schoolId ?? (user as any)?.school?.id;
    const baseUrl = urlColegio;
    let alertShown = false;

    if (!schoolId || !baseUrl) return;

    const checkScheduleChange = async () => {
      if (alertShown) return;
      try {
        // Leer token directo de SecureStore — evita race condition con el store
        const token = await Storage.getItemAsync("token");
        if (!token) return;

        const rawAxios = axios.create();
        const res = await rawAxios.post(
          `${baseUrl}/authentication/chooseschool`,
          { schoolId },
          { headers: { Authorization: `Bearer ${token}`, platform: "App" } },
        );

        if (!res.data?.success) return;
        // Respuesta de una empresa que ya no es la activa (el usuario cambió
        // de empresa con esta petición en vuelo): no debe pisar el store.
        if (getActiveSchoolId(useSchoolStore.getState().user) !== schoolId) {
          return;
        }

        const freshSchedules: UserSchedule[] =
          res.data?.data?.userSchedules ?? [];

        // Mantener los settings frescos del backend (tolerancias, etc.)
        const freshSettings = (res.data?.data?.school ?? res.data?.school)
          ?.settings as SchoolSettings | undefined;
        if (freshSettings) {
          setSchoolSettings(freshSettings);
          const companySettings = buildCompanySettings(freshSettings);
          if (companySettings) {
            useSchoolStore.getState().setCompanySettings(companySettings);
          }
        }

        // `teacherAttendancesToday` (nivel superior de `data`, hermano de
        // token/school). Este poller es el ÚNICO refresco de la snapshot
        // mientras dura la sesión: ni el backend ni el webapp tienen un
        // endpoint que devuelva la lista completa otra vez.
        useSchoolStore
          .getState()
          .setAttendancesToday(buildAttendancesToday(res.data?.data));
        // Mismo refresco para el feriado de hoy.
        useSchoolStore
          .getState()
          .setTodayHoliday(buildTodayHoliday(res.data?.data));

        // Comparar solo los campos relevantes (ignorar createdDate y campos extra)
        const normalize = (s: UserSchedule[]) =>
          s
            .map(
              (x) =>
                `${x.weekDay}|${x.workEntryTime}|${x.workExitTime}|${x.lunchEntryTime ?? ""}|${x.lunchExitTime ?? ""}`,
            )
            .sort()
            .join(";");

        if (
          normalize(freshSchedules) !==
          normalize(JSON.parse(initialSchedulesJson))
        ) {
          alertShown = true;
          Alert.alert(
            "Horario actualizado",
            "Un administrador modificó tu horario. Debes iniciar sesión nuevamente para aplicar los cambios.",
            [{ text: "Aceptar", onPress: forceLogout }],
            { cancelable: false },
          );
        }
      } catch {
        // Silencioso — errores de red no deben desloguear
      }
    };

    checkScheduleChange();
    const schedulePoller = setInterval(checkScheduleChange, 10_000);
    return () => clearInterval(schedulePoller);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlColegio, forceLogout, user]);

  // Reloj en tiempo real — tick cada segundo
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      const foto = await Storage.getItemAsync("photourl");
      console.log("photourl:", foto);
      setPhoneImagen(foto);
    };
    loadData();
  }, []);

  // Motivo de break no debe sobrevivir un cambio de categoría — evita que un
  // motivo elegido para un Break anterior quede preseleccionado en el siguiente.
  useEffect(() => {
    setSelectedBreakTagId(null);
  }, [selectedCategory]);

  /**
   * Sincroniza los ponches de hoy y resuelve la jornada abierta pendiente.
   * Devuelve el punch real del InicioJornada sin cerrar (o null si no lo pudo
   * determinar) para que quien la llame no tenga que adivinar su fecha.
   */
  const fetchTodayPunches =
    useCallback(async (): Promise<PunchEvent | null> => {
      try {
        setLoadingPunches(true);
        const token = await getToken();
        if (!urlColegio || !token) return null;
        const response = await axios.get(`${urlColegio}/punches/today`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log("TODAY PUNCHES RESPONSE:", {
          clientTimestamp: new Date().toISOString(),
          data: response.data,
        });
        if (!response.data.success) return null;
        const data: PunchEvent[] = response.data.data ?? [];
        setPunches(data);
        const pending = findOpenDayPunch(data);
        if (pending) {
          setNextDayExitPunch(pending);
          setNextDayExitModal(true);
        } else {
          setNextDayExitModal(false);
          setNextDayExitPunch(null);
        }
        return pending;
      } catch (error: any) {
        console.error(
          "fetchTodayPunches:",
          error?.response?.data?.message ?? error?.message,
        );
        return null;
      } finally {
        setLoadingPunches(false);
        setRefreshing(false);
      }
    }, [urlColegio, getToken]);

  useEffect(() => {
    fetchTodayPunches();
  }, [fetchTodayPunches]);

  // fetchTodayPunches no devuelve la lista: el pedido de parpadeo se resuelve
  // cuando llegan los ponches nuevos.
  useEffect(() => {
    if (!blinkRequestedRef.current) return;
    blinkRequestedRef.current = false;
    const newest = getNewestPunch(punches);
    if (newest) setBlinkPunchId(newest.id);
  }, [punches]);

  // Scroll al final cuando el layout ya se pintó, y parpadeo al terminar el
  // scroll: BLINK_PULSES pulsos 0 → 0.35 → 0.
  useEffect(() => {
    if (blinkPunchId == null) return;
    let animation: Animated.CompositeAnimation | null = null;
    const scrollTimer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
    const blinkTimer = setTimeout(() => {
      const pulse = Animated.sequence([
        Animated.timing(blinkOpacity, {
          toValue: 0.35,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(blinkOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]);
      animation = Animated.loop(pulse, { iterations: BLINK_PULSES });
      animation.start(({ finished }) => {
        if (finished) setBlinkPunchId(null);
      });
    }, 500);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(blinkTimer);
      animation?.stop();
      blinkOpacity.setValue(0);
    };
  }, [blinkPunchId, blinkOpacity]);

  // Motivos de Break se traen frescos cada vez que se abre la pantalla — no se
  // cachean entre sesiones, mismo criterio ya usado para settings de la sede.
  const fetchBreakTags = useCallback(async () => {
    try {
      const token = await getToken();
      if (!urlColegio || !token) return;
      const response = await axios.get(`${urlColegio}/tags/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) {
        const allTags: Tag[] = response.data.data ?? [];
        setBreakTags(tagsOfCategory(allTags, breakTagCategoryId));
      }
    } catch (error: any) {
      console.error(
        "fetchBreakTags:",
        error?.response?.data?.message ?? error?.message,
      );
    }
    // `breakTagCategoryId` en las deps a propósito: schoolSettings se refresca
    // por poller, así que si los tags se piden antes de que llegue la config,
    // el efecto vuelve a correr cuando la categoría queda resuelta.
  }, [urlColegio, getToken, breakTagCategoryId]);

  useEffect(() => {
    fetchBreakTags();
  }, [fetchBreakTags]);

  // Permisos del día — igual que los motivos de Break, se refrescan al entrar a
  // la pantalla y en el pull-to-refresh. Un fallo aquí no bloquea el ponchador.
  const loadTodayPermissions = useCallback(async () => {
    const token = await getToken();
    const schoolUserId = schoolUser?.id ?? user?.id;
    if (!urlColegio || !token || !schoolUserId) return;
    setPermissions(
      await fetchTodayPermissions(urlColegio, schoolUserId, token),
    );
  }, [urlColegio, getToken, schoolUser?.id, user?.id]);

  useEffect(() => {
    loadTodayPermissions();
  }, [loadTodayPermissions]);

  // Ubicación EN VIVO del dispositivo (card de Perfil) — solo lectura, no
  // forma parte del flujo de ponchar. Independiente de las coordenadas del
  // último ponche: el webapp muestra la posición actual evaluada contra la
  // geocerca, no la de un ponche histórico (que puede no tener coords si se
  // hizo desde canal Web). Silenciosa: si el permiso de foreground no está
  // ya otorgado, no se pide (nada de Alert) y el bloque no aparece.
  // Se re-evalúa con isValidLocation y con cada refresh de `punches` (mismo
  // trigger que fetchTodayPunches ya usa tras ponchar / pull-to-refresh /
  // montaje) para no agregar un poll dedicado nuevo.
  useEffect(() => {
    let cancelled = false;

    const resolveCurrentLocation = async () => {
      if (!isValidLocation) {
        setCurrentLocationInfo(null);
        return;
      }

      const coords = await getCurrentCoordinatesSilent();
      if (cancelled) return;
      if (!coords) {
        setCurrentLocationInfo(null);
        return;
      }

      try {
        const [geocoded] = await Location.reverseGeocodeAsync(coords);
        if (cancelled) return;

        const street =
          geocoded?.street ?? geocoded?.name ?? "Ubicación desconocida";
        const city = geocoded?.city ?? geocoded?.subregion ?? geocoded?.region;
        const address = city ? `${street}, ${city}` : street;

        const target = getTargetGeofenceLocation();
        const distance = getDistanceInMeters(
          coords.latitude,
          coords.longitude,
          target.targetLatitude,
          target.targetLongitude,
        );

        setCurrentLocationInfo({
          address,
          withinArea: distance <= target.radius,
        });
      } catch {
        if (!cancelled) setCurrentLocationInfo(null);
      }
    };

    resolveCurrentLocation();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValidLocation, punches]);

  const getNextPunchType = (category: Category): "inicio" | "fin" => {
    if (category === "Jornada") {
      // Cualquiera de los 3 tipos de jornada (normal, Adicional, FH)
      const lastJornada = [...punches]
        .reverse()
        .find(
          (p) =>
            (isJornadaStartType(p.type) || isJornadaEndType(p.type)) &&
            !isRejectedJornadaAttempt(p),
        );
      return lastJornada && isJornadaStartType(lastJornada.type)
        ? "fin"
        : "inicio";
    }
    const types = PUNCH_TYPE_MAP[category];
    const last = [...punches]
      .reverse()
      .find(
        (p) =>
          (p.type === types.inicio || p.type === types.fin) &&
          p.status !== "Error de Imagen" &&
          p.status !== "Fuera de área",
      );
    if (!last) return "inicio";
    return last.type === types.inicio ? "fin" : "inicio";
  };

  const isInicio = getNextPunchType(selectedCategory) === "inicio";

  // \u00daNICA fuente de la fecha de la jornada pendiente, le\u00edda del punch real.
  // La comparten sus tres consumos: el texto del modal, la hora sugerida y la
  // fecha del payload de cierre. null = no se pudo determinar \u2192 el modal abre
  // en estado de error y no deja cerrar, en vez de adivinar "hoy - 1 d\u00eda" y
  // que el backend rechace por fecha que no coincide.
  const pendingPunchDate = useMemo(
    () => getPendingOpenDayDate(nextDayExitPunch),
    [nextDayExitPunch],
  );

  const handleSubmitNextDayExit = async () => {
    if (!nextDayExitTime.trim()) {
      Alert.alert("Error", "Por favor ingresa la hora de salida.");
      return;
    }
    const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d$/;
    if (!timeRegex.test(nextDayExitTime.trim())) {
      Alert.alert("Error", "Formato inv\u00e1lido. Usa HH:MM (ej: 17:30)");
      return;
    }
    if (!pendingPunchDate) {
      Alert.alert(
        "Error",
        "No se pudo determinar la jornada pendiente, contacta a soporte.",
      );
      return;
    }
    const token = await getToken();
    if (!urlColegio || !token) return;
    setSubmittingExit(true);
    try {
      const [rawHour, rawMinute] = nextDayExitTime.trim().split(":");
      const hour = pad(Number(rawHour));
      const minute = pad(Number(rawMinute));

      // El día sale del punch real, normalizado a RD una sola vez; la hora, del
      // selector. Nunca de "hoy - 1 día".
      const baseDateStr = toRDDateString(pendingPunchDate);
      const finalDateTime = `${baseDateStr}T${hour}:${minute}:00${RD_UTC_OFFSET}`;

      const payload = {
        type: "FinJornada" as const,
        createdDate: finalDateTime,
        recordedDate: finalDateTime,
        nextDayExit: true,
      };

      console.log("PAYLOAD NEXT DAY EXIT:", {
        type: "FinJornada",
        createdDate: finalDateTime,
        nextDayExit: true,
      });

      const response = await axios.post(`${urlColegio}/punches`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      console.log("RESPUESTA BACKEND:", response.data);
      if (response.data.success) {
        setNextDayExitModal(false);
        setNextDayExitTime("");
        setNextDayExitPunch(null);
        await fetchTodayPunches();
      } else {
        Alert.alert("Error", response.data.message ?? "Intenta de nuevo.");
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message ?? "Error de conexi\u00f3n.";
      Alert.alert("Error", typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setSubmittingExit(false);
    }
  };

  const handleTimeChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === "android") {
        setShowTimePicker(false);
        if (event.type !== "set" || !date) return;
      }
      if (!date) return;
      const { hours, minutes } = toRD(date);
      setSelectedTime(date);
      setNextDayExitTime(`${pad(hours)}:${pad(minutes)}`);
    },
    [],
  );

  const isSubmittingRef = useRef(false);

  const handleRegister = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      const token = await getToken();
      if (!urlColegio || !token) {
        Alert.alert("Error", "No hay conexión activa.");
        return;
      }
      if (
        !jornadaIniciada &&
        (selectedCategory === "Almuerzo" || selectedCategory === "Break")
      ) {
        Alert.alert("Acción no permitida", "Debes iniciar la jornada primero.");
        return;
      }

      const types = PUNCH_TYPE_MAP[selectedCategory];
      const type = isInicio ? types.inicio : types.fin;

      // Motivo de break obligatorio solo cuando la escuela tiene la categoría
      // "Tipos de Break" configurada. Si breakTags viene vacío, es una decisión
      // temporal explícita: no bloquear el Break hasta que se defina qué hacer
      // con escuelas sin esta categoría configurada.
      if (
        type === "InicioBreak" &&
        breakTags.length > 0 &&
        !selectedBreakTagId
      ) {
        Alert.alert("Motivo requerido", "Selecciona el motivo del break.");
        return;
      }

      // Si hay una jornada del día anterior sin cerrar, ese modal debe resolverse
      // primero — el relogin por sesión vieja es el segundo paso, no el primero,
      // cuando ambos casos coinciden.
      const hasPendingOpenDay =
        nextDayExitModal || findOpenDayPunch(punches) !== null;

      // Antes de la primera Entrada Jornada del día: si la sesión actual lleva
      // más de SESSION_MAX_HOURS_FOR_FIRST_ENTRY horas abierta, forzar relogin
      // para confirmar permisos/settings que un admin pudo haber cambiado desde
      // entonces. Solo aplica a esta transición — no a Almuerzo/Break/salida.
      const isFirstJornadaEntryToday =
        type === "InicioJornada" &&
        !punches.some((p) => p.type === "InicioJornada") &&
        !hasPendingOpenDay;

      if (isFirstJornadaEntryToday) {
        const jwtPayload = decodeJWT(token);
        const iat = jwtPayload?.iat;
        if (typeof iat === "number") {
          const hoursSinceLogin = (Date.now() / 1000 - iat) / 3600;
          if (hoursSinceLogin > SESSION_MAX_HOURS_FOR_FIRST_ENTRY) {
            console.warn(
              "BLOQUEO: Sesión desactualizada antes de la primera Entrada Jornada",
              { hoursSinceLogin, iat },
            );
            Alert.alert(
              "Sesión desactualizada",
              "Debes iniciar sesión nuevamente para confirmar tus permisos de hoy.",
              [{ text: "Aceptar", onPress: forceLogout }],
              { cancelable: false },
            );
            return;
          }
        }
      }

      // La foto solo se exige en InicioJornada — no en Almuerzo/Break ni en
      // ninguna salida — confirmado con negocio.
      const imageRequiredForType = isImageRequired && type === "InicioJornada";
      const locationRequired = isValidLocation;

      console.log("CONFIG SEDE:", {
        isImageRequired: schoolSettings?.isImageRequired,
        isValidLocation: schoolSettings?.isValidLocation,
        schoolUserIsImageRequired: schoolUserSettings?.isImageRequired,
        schoolUserIsValidLocation: schoolUserSettings?.isValidLocation,
        imageRequiredForType,
        locationRequired,
      });
      console.log("SCHEDULE SELECCIONADO:", todaySchedule);
      console.log("TOLERANCIAS:", {
        tolWorkIn,
        tolWorkOut,
        tolLunchIn,
        tolLunchOut,
      });

      // ── 1) Validación de UBICACIÓN + GEOCERCA (si la institución la exige) ───
      // Solo bloquea si faltan coordenadas (propias o de referencia) — error de
      // configuración. Estar fuera del radio permitido YA NO aborta el ponche:
      // se envía igual con las coordenadas reales y el backend decide, marcando
      // el punch con status "Fuera de área" cuando corresponde.
      let coords: { latitude: number; longitude: number } | null = null;
      if (locationRequired) {
        coords = await getCurrentCoordinates();
        if (!coords) {
          console.warn(
            "BLOQUEO: Ubicación requerida sin coordenadas — se aborta el ponche",
          );
          return;
        }
        console.log("COORDENADAS OBTENIDAS:", coords);

        // Resolución jerárquica de geocerca: usuario → sede/empresa
        const targetGeo = getTargetGeofenceLocation();
        const hasValidTarget =
          Number.isFinite(targetGeo.targetLatitude) &&
          Number.isFinite(targetGeo.targetLongitude) &&
          targetGeo.targetLatitude !== 0 &&
          targetGeo.targetLongitude !== 0;

        if (hasValidTarget) {
          const distanceMeters = getDistanceInMeters(
            coords.latitude,
            coords.longitude,
            targetGeo.targetLatitude,
            targetGeo.targetLongitude,
          );
          const dentroDeGeocerca = distanceMeters <= targetGeo.radius;

          console.log("🎯 REFERENCIA DE GEOCERCA APLICADA:", {
            source: targetGeo.source,
            targetCoords: {
              lat: targetGeo.targetLatitude,
              lng: targetGeo.targetLongitude,
            },
            userRealCoords: coords,
            distanceMeters: Math.round(distanceMeters),
            maxRadius: targetGeo.radius,
            dentroDeGeocerca,
          });

          // Fuera de geocerca: ya NO se bloquea del lado cliente — el ponche se
          // envía igual (con las coordenadas reales) y el backend decide,
          // devolviendo status "Fuera de área" en la respuesta si corresponde.
        } else {
          // isValidLocation es una exigencia explícita — sin coordenadas de
          // referencia (ni usuario ni sede) no se puede validar, así que se
          // bloquea el ponche en vez de omitir la validación en silencio.
          console.error(
            "BLOQUEO GEOCERCA: Sin coordenadas de referencia (usuario ni sede) para validar — se aborta el ponche",
            {
              source: targetGeo.source,
              schoolLatitude,
              schoolLongitude,
              targetGeo,
            },
          );
          Alert.alert(
            "Error de Configuración",
            "No se pudo determinar el área permitida, contacta al administrador.",
          );
          return;
        }
      }

      // ── 2) Validación de FOTO (si es obligatoria) ─────────────────────────────
      // Bloqueo estricto: si la captura falla, se cancela o no hay base64,
      // se aborta inmediatamente y NO se envía el POST /punches.
      let photo: ImagePicker.ImagePickerAsset | null = null;
      if (imageRequiredForType) {
        try {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            console.warn(
              "BLOQUEO: Permiso de cámara denegado — se aborta el ponche",
            );
            Alert.alert(
              "Permiso requerido",
              "Necesitas permitir el acceso a la cámara para registrar tu asistencia.",
            );
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: false,
            quality: 0.4,
            base64: true,
            cameraType: ImagePicker.CameraType.front,
          });
          if (result.canceled) {
            console.warn(
              "BLOQUEO: Captura cancelada por el usuario — se aborta el ponche",
            );
            Alert.alert(
              "Foto requerida",
              "Debes tomar una foto para registrar la jornada.",
            );
            return;
          }
          photo = result.assets[0] ?? null;
        } catch (error) {
          console.error("ERROR CAPTURA IMAGEN:", error);
          Alert.alert(
            "Error de Imagen",
            "No se pudo capturar la imagen. Intenta de nuevo.",
          );
          return;
        }

        // Sin base64 → no se puede adjuntar la foto → abortar sin POST
        if (!photo?.base64) {
          console.warn(
            "BLOQUEO: Foto obligatoria sin base64 — se aborta el ponche",
          );
          Alert.alert(
            "Foto requerida",
            "Debes tomar una foto para registrar la jornada.",
          );
          return;
        }

        console.log("DATOS IMAGEN CAPTURADA:", {
          photourl: [photo.base64],
          uri: photo.uri,
          mimeType: photo.mimeType,
          width: photo.width,
          height: photo.height,
          fileSize: photo.fileSize,
        });
      }

      // ── 3) Ambas validaciones resueltas → construir payload y enviar ──────────
      // El tipo que viaja al backend: InicioJornadaFH con un FH vigente, y el
      // Fin que corresponda al inicio abierto. `type` sigue siendo el tipo base.
      const sendNow = new Date();
      const apiType = resolvePunchTypeForApi(
        type,
        punches,
        permissions,
        sendNow,
      );
      // Re-chequeo con el feriado fresco del store: cubre el arranque en frío
      // (el poller aún no lo trajo) y un FH que venció durante foto/GPS.
      const freshHoliday = useSchoolStore.getState().todayHoliday;
      if (
        type === "InicioJornada" &&
        isNonWorkingHoliday(freshHoliday, sendNow) &&
        apiType !== "InicioJornadaFH"
      ) {
        Alert.alert(
          "Día no laborable",
          `Hoy es día no laborable (${freshHoliday?.name ?? ""}). Solo puedes registrar entrada con un permiso Fuera de Horario vigente.`,
        );
        return;
      }

      setLoading(true);
      try {
        const payload: PunchPayload = { type: apiType };
        if (photo?.base64) payload.photourl = [photo.base64];
        if (todaySchedule) payload.schedule = todaySchedule;
        if (coords) {
          payload.latitude = coords.latitude;
          payload.longitude = coords.longitude;
        }
        if (type === "InicioBreak" && selectedBreakTagId) {
          payload.tagId = selectedBreakTagId;
        }

        console.log("PUNCH REQUEST:", {
          type,
          apiType,
          clientTimestamp: new Date().toISOString(),
          payload,
        });

        const response = await axios.post(`${urlColegio}/punches`, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        console.log("PUNCH RESPONSE:", {
          type,
          clientTimestamp: new Date().toISOString(),
          status: response.status,
          data: response.data,
        });

        // El backend valida la geocerca del lado servidor y, si el ponche cae
        // fuera del área permitida, lo registra igual con status "Fuera de
        // área" (success sigue en true) — se sincroniza y se avisa, sin tratarlo
        // como error.
        //
        // Un inicio de jornada exitoso colapsa las tolerancias y resalta su
        // fila en el historial. La bandera se activa ANTES del fetch: el efecto
        // sobre [punches] la consume en cuanto fetchTodayPunches hace setPunches.
        const isSuccessfulStart =
          response.data?.success === true && isJornadaStartType(apiType);
        if (isSuccessfulStart) {
          setTolerancesExpanded(false);
          setHistoryExpanded(true);
          blinkRequestedRef.current = true;
        }

        if (response.data?.status === "Fuera de área") {
          await fetchTodayPunches();
          Alert.alert(
            "Ponche Registrado",
            "Tu ponche quedó registrado como 'Fuera de área' porque no estabas dentro del rango permitido.",
          );
          return;
        }

        if (response.data.success) {
          if (type === "InicioBreak") setSelectedBreakTagId(null);
          await fetchTodayPunches();
        } else {
          const msg: string = response.data.message ?? "Intenta de nuevo.";
          const lowerMsg = msg.toLowerCase();

          // El backend pudo registrar el intento con "Error de Imagen"; sincronizar
          // para que el botón de entrada vuelva a quedar visible y habilitado.
          await fetchTodayPunches();

          // El backend rechazó por foto no coincidente con el perfil — interpretar
          // su respuesta con un mensaje claro en vez del Alert genérico.
          const imageMismatchRejected =
            isImageRequired &&
            (response.data.status === "Error de Imagen" ||
              lowerMsg.includes("imagen"));

          if (imageMismatchRejected) {
            console.warn(
              "BLOQUEO POST-VALIDACIÓN: El backend rechazó el ponche por foto no coincidente con el perfil",
              { message: msg, response: response.data },
            );
            Alert.alert(
              "Foto No Válida",
              "La foto no coincide con tu perfil. Intenta de nuevo con una foto más clara.",
            );
            return;
          }

          if (
            lowerMsg.includes("inicio de jornada activo") ||
            lowerMsg.includes("cerrar la jornada")
          ) {
            // Jornada anterior sin cerrar → mostrar modal, sin Alert genérico.
            // El backend rechaza sin devolver el punch original, así que primero
            // se resuelve contra el servidor cuál es la jornada abierta: su fecha
            // real es la única que aceptará el cierre. /punches/today solo
            // refleja los ponches de HOY, así que si no trae el pendiente se cae
            // a /punches/opendays (toda la escuela, filtrado client-side por
            // schoolUserId). Sin ninguno de los dos, el modal abre en estado de
            // error en vez de adivinar "ayer" — caso realmente excepcional.
            const schoolUserIdForOpenDay = schoolUser?.id ?? user?.id;
            const pendingOpenDay =
              (await fetchTodayPunches()) ??
              (schoolUserIdForOpenDay
                ? await fetchOpenDayPunch(
                    urlColegio,
                    schoolUserIdForOpenDay,
                    token,
                  )
                : null);
            if (pendingOpenDay) setNextDayExitPunch(pendingOpenDay);
            setNextDayExitModal(true);
            return;
          } else if (lowerMsg.includes("cambios en el horario")) {
            Alert.alert(
              "Horario modificado",
              msg,
              [{ text: "Aceptar", onPress: forceLogout }],
              { cancelable: false },
            );
            return;
          } else {
            Alert.alert("Error", msg);
          }
        }
      } catch (error: any) {
        const rawMsg = error?.response?.data?.message ?? "Error de conexión.";
        const msg: string =
          typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg);
        // Sincronizar igualmente en errores de red/servidor para no dejar la UI trabada
        const pendingFromToday = await fetchTodayPunches();
        const lowerMsg = msg.toLowerCase();
        if (
          lowerMsg.includes("inicio de jornada activo") ||
          lowerMsg.includes("cerrar la jornada")
        ) {
          // Jornada anterior sin cerrar → mostrar modal, sin Alert genérico.
          // El fetchTodayPunches de arriba ya intentó resolver el punch real;
          // si no lo encontró, se cae a /punches/opendays antes de abrir el
          // modal en estado de error.
          const schoolUserIdForOpenDay = schoolUser?.id ?? user?.id;
          const pendingOpenDay =
            pendingFromToday ??
            (schoolUserIdForOpenDay
              ? await fetchOpenDayPunch(
                  urlColegio,
                  schoolUserIdForOpenDay,
                  token,
                )
              : null);
          if (pendingOpenDay) setNextDayExitPunch(pendingOpenDay);
          setNextDayExitModal(true);
          return;
        }
        Alert.alert("Error", msg);
      } finally {
        setLoading(false);
      }
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const visibleCategories = (
    ["Jornada", "Break", "Almuerzo"] as Category[]
  ).filter((cat) => {
    if (!jornadaIniciada && (cat === "Almuerzo" || cat === "Break"))
      return false;
    if (cat === "Almuerzo")
      return isAlmuerzoVisible(
        now,
        todaySchedule,
        btnVisLunchIn,
        btnVisLunchOut,
        punches,
        permissions,
        todayHoliday,
      );
    if (cat === "Break") return isBreakVisible(punches, now, todaySchedule);
    if (cat === "Jornada")
      return isJornadaVisible(
        now,
        todaySchedule,
        getNextPunchType("Jornada") === "inicio",
        btnVisWorkIn,
        btnVisWorkOut,
        punches,
        permissions,
        todayHoliday,
      );
    return true;
  });

  // Si la categoría seleccionada deja de ser visible → pasar a la primera
  // visible. Con una sola visible la fila de categorías se oculta, así que
  // esa acción tiene que quedar seleccionada para que su botón aparezca.
  // Depende de la clave y no del array: visibleCategories se recrea en cada
  // render y `now` cambia cada segundo.
  const visibleCategoriesKey = visibleCategories.join("|");
  useEffect(() => {
    const next = resolveSelectedCategory(selectedCategory, visibleCategories);
    if (next !== selectedCategory) setSelectedCategory(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleCategories queda cubierto por visibleCategoriesKey
  }, [visibleCategoriesKey, selectedCategory]);

  // Los dos consumos de UI leen la MISMA pendingPunchDate que usa el payload.
  const pendingDate = pendingPunchDate ? formatRDDate(pendingPunchDate) : "";

  // Hora de salida sugerida: horario del USUARIO correspondiente al día que
  // quedó pendiente (no necesariamente el de "hoy" — la jornada abierta pudo
  // ser un día distinto, con otro workExitTime). Se recalcula solo con
  // userSchedules, así que si un admin cambia el horario, la sugerencia se
  // actualiza automáticamente al relogin.
  const pendingSchedule = pendingPunchDate
    ? getScheduleForDay(userSchedules, pendingPunchDate)
    : null;
  const suggestedExitTime = pendingSchedule?.workExitTime ?? null;

  const handleUseSuggestedExitTime = () => {
    if (!suggestedExitTime) return;
    const [h, m] = suggestedExitTime.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    setSelectedTime(d);
    setNextDayExitTime(`${pad(h)}:${pad(m)}`);
  };

  // Permisos aprobados de hoy: mientras exista al menos uno, el indicador de
  // permiso del perfil se mantiene visible todo el día, se haya usado el
  // permiso o no.
  const approvedPermissionsToday = getApprovedPermissionsToday(permissions);

  // Logo de Hora Actual: más alto que el SectionIcon (scale(32)), pero el
  // exceso se descuenta con marginBottom negativo para que la fila del título
  // nunca crezca; ancho por la proporción del PNG.
  const timeControlLogoHeight = scale(40);
  const timeControlLogoOverflow = timeControlLogoHeight - scale(32);
  const timeControlLogoWidth = Math.round(
    timeControlLogoHeight * TIME_CONTROL_LOGO_ASPECT,
  );

  return (
    <View style={{ flex: 1 }}>
      <Modal
        visible={nextDayExitModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.ndModalOverlay}>
          <View style={styles.ndModalCard}>
            <View style={styles.ndModalHeaderRow}>
              <View style={styles.ndModalHeaderLeft}>
                <View style={styles.ndModalIconWrap}>
                  <Ionicons
                    name="time-outline"
                    size={22}
                    color={WARNING_ACCENT}
                  />
                </View>
                <Text style={styles.ndModalTitle}>Jornada Incompleta</Text>
              </View>
              <TouchableOpacity
                onPress={() => setNextDayExitModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={TEXT_PLACEHOLDER} />
              </TouchableOpacity>
            </View>
            <View style={styles.ndModalBody}>
              {pendingPunchDate ? (
                <>
                  <Text style={styles.ndModalMsg}>
                    No completaste la salida del día{" "}
                    <Text style={{ fontWeight: "700" }}>{pendingDate}</Text>.
                    Esto afecta tu puntuación del mes. Selecciona la hora a la
                    que saliste para cerrar la jornada.
                  </Text>

                  <TouchableOpacity
                    style={styles.ndTimeBtn}
                    onPress={() => setShowTimePicker(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="time-outline"
                      size={20}
                      color={WARNING_ACCENT}
                    />
                    <Text
                      style={[
                        styles.ndTimeBtnText,
                        nextDayExitTime && styles.ndTimeBtnTextValue,
                      ]}
                    >
                      {nextDayExitTime
                        ? to12h(nextDayExitTime)
                        : "Seleccionar hora de salida"}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      color={TEXT_PLACEHOLDER}
                    />
                  </TouchableOpacity>

                  {suggestedExitTime && (
                    <TouchableOpacity
                      style={styles.ndSuggestionRow}
                      onPress={handleUseSuggestedExitTime}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="bulb-outline"
                        size={16}
                        color={PRIMARY_COLOR}
                      />
                      <Text style={styles.ndSuggestionText}>
                        Hora sugerida según tu horario:{" "}
                        <Text style={styles.ndSuggestionTextValue}>
                          {to12h(suggestedExitTime)}
                        </Text>
                      </Text>
                      <Text style={styles.ndSuggestionAction}>Usar</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                // Sin fecha real no se ofrece cerrar: adivinarla garantiza el
                // rechazo del backend y deja al usuario reintentando a ciegas.
                <View style={styles.ndErrorRow}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={20}
                    color={ERROR_TEXT}
                  />
                  <Text style={styles.ndErrorText}>
                    No se pudo determinar la jornada pendiente, contacta a
                    soporte.
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.ndModalBtn,
                (submittingExit || !pendingPunchDate) &&
                  styles.ndModalBtnDisabled,
              ]}
              onPress={handleSubmitNextDayExit}
              disabled={submittingExit || !pendingPunchDate}
              activeOpacity={0.85}
            >
              {submittingExit ? (
                <ActivityIndicator color={ON_PRIMARY} size="small" />
              ) : (
                <Text style={styles.ndModalBtnText}>Cerrar Jornada</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={breakTagModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBreakTagModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.ndModalOverlay}
          activeOpacity={1}
          onPress={() => setBreakTagModalVisible(false)}
        >
          <View style={styles.ndModalCard}>
            <View style={styles.ndModalHeader}>
              <View style={styles.ndModalIconWrap}>
                <Ionicons
                  name="cafe-outline"
                  size={22}
                  color={WARNING_ACCENT}
                />
              </View>
              <Text style={styles.ndModalTitle}>Motivo del Break</Text>
            </View>
            {breakTags.map((tag) => (
              <TouchableOpacity
                key={tag.id}
                style={styles.breakTagOption}
                onPress={() => {
                  setSelectedBreakTagId(tag.id);
                  setBreakTagModalVisible(false);
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.breakTagOptionText}>{tag.name}</Text>
                {selectedBreakTagId === tag.id && (
                  <Ionicons name="checkmark" size={18} color={PRIMARY_COLOR} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={permissionInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setPermissionInfoModal(false)}
      >
        <View style={styles.ndModalOverlay}>
          <View style={styles.ndModalCard}>
            <View style={styles.ndModalHeaderRow}>
              <View style={styles.ndModalHeaderLeft}>
                <View style={styles.permissionModalIconWrap}>
                  <MaterialCommunityIcons
                    name="alpha-p"
                    size={40}
                    color={PRIMARY_COLOR}
                  />
                </View>
                <Text style={styles.ndModalTitle}>Permiso programado</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPermissionInfoModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={TEXT_PLACEHOLDER} />
              </TouchableOpacity>
            </View>
            <View style={styles.ndModalBody}>
              {approvedPermissionsToday.map((permission, index) => (
                <View key={permission.id}>
                  {index > 0 && <View style={styles.permissionItemDivider} />}
                  <Text style={styles.permissionItemAction}>
                    {permission.actionTag?.name ?? "Permiso"}
                  </Text>
                  <Text style={styles.permissionItemTime}>
                    {to12h(permission.fromTime)} – {to12h(permission.toTime)}
                  </Text>
                  {!!permission.actionTag?.description?.trim() && (
                    <Text style={styles.permissionItemText}>
                      {permission.actionTag.description.trim()}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={styles.ndModalBtn}
              onPress={() => setPermissionInfoModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.ndModalBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {showTimePicker && (
        <DateTimePicker
          value={selectedTime}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleTimeChange}
        />
      )}
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.content,
          isTablet && styles.contentTablet,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchTodayPunches();
              loadTodayPermissions();
            }}
            colors={[PRIMARY_COLOR]}
          />
        }
      >
        {/* ── Reloj ── */}
        <View style={styles.clockFloatCard}>
          <View style={styles.sectionHeaderRow}>
            <SectionIcon tone="green">
              <Ionicons
                name="time-outline"
                size={18}
                color={SECTION_ICON_COLOR}
              />
            </SectionIcon>
            <Text style={styles.sectionHeaderText}>Hora Actual</Text>
            <Image
              source={TIME_CONTROL_LOGO}
              style={{
                height: timeControlLogoHeight,
                width: timeControlLogoWidth,
                marginLeft: "auto",
                marginRight: -Math.floor(
                  timeControlLogoWidth * TIME_CONTROL_LOGO_RIGHT_INSET,
                ),
                // Ocupa en el layout lo mismo que el SectionIcon: el exceso
                // de alto sobresale hacia abajo, sobre el margen del título.
                marginBottom: -timeControlLogoOverflow,
                // Sube el logo sin cambiar el alto de la fila ni mover el
                // reloj de abajo.
                position: "relative",
                top: -scale(4),
              }}
              resizeMode="contain"
              accessibilityLabel="Time Control"
            />
          </View>
          <View style={styles.clockCard}>
            <View style={styles.clockTimeGroup}>
              <Text
                style={[
                  styles.clockTime,
                  { fontSize: font(isTablet ? 24 : 20) },
                ]}
              >
                {formatRDTimeShort(now).split(" ")[0]}
              </Text>
              <Text
                style={[
                  styles.clockAmPm,
                  { fontSize: font(isTablet ? 13 : 11) },
                ]}
              >
                {" "}
                {formatRDTimeShort(now).split(" ").slice(1).join(" ")}
              </Text>
            </View>
            <View style={styles.clockDivider} />
            <Text
              style={[
                styles.clockDateCompact,
                { fontSize: font(isTablet ? 16 : 14) },
              ]}
            >
              {formatRDDateShort(now)}
            </Text>
          </View>
        </View>

        {/* ── Perfil + Horario ── */}
        <View style={styles.profileFloatCard}>
          <View style={styles.sectionHeaderToggle}>
            <View style={styles.sectionHeaderToggleLabel}>
              <SectionIcon tone="blue">
                <Ionicons
                  name="person-circle-outline"
                  size={18}
                  color={SECTION_ICON_COLOR}
                />
              </SectionIcon>
              <Text style={styles.sectionHeaderText}>Perfil</Text>
            </View>
            {approvedPermissionsToday.length > 0 && (
              <TouchableOpacity
                onPress={() => setPermissionInfoModal(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={styles.permissionBadge}>
                  <MaterialCommunityIcons
                    name="alpha-p"
                    size={20}
                    color={PRIMARY_COLOR}
                  />
                </View>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.profileRow}>
            {/* Avatar */}
            <View style={styles.avatarWrap}>
              <View style={styles.avatarFallback}>
                {phoneImagen ? (
                  <Image
                    source={{
                      uri: `https://timecontrol.wsmax.net:8600/${phoneImagen}`,
                    }}
                    style={styles.avatarImage}
                    onError={(e) =>
                      console.log("Error imagen:", e.nativeEvent.error)
                    }
                    onLoad={() => console.log("Imagen cargó OK")}
                  />
                ) : (
                  <Ionicons name="person" size={34} color={TEXT_PLACEHOLDER} />
                )}
              </View>
              <View
                style={[
                  styles.avatarStatusDot,
                  {
                    backgroundColor: jornadaIniciada
                      ? ONLINE_DOT
                      : TEXT_PLACEHOLDER,
                  },
                ]}
              />
            </View>

            {/* Info */}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {user?.user.fullName}
              </Text>

              {/* Último ponche registrado */}
              <View
                style={[
                  styles.lastPunchPill,
                  {
                    paddingHorizontal: isTablet ? 12 : 9,
                    paddingVertical: isTablet ? 5 : 4,
                  },
                  !lastPunch
                    ? styles.lastPunchPillNeutral
                    : lastPunchDisplayStatus === "Error de Imagen" ||
                        lastPunchDisplayStatus === "Fuera de área"
                      ? styles.lastPunchPillError
                      : lastPunchDisplayStatus === "Tardanza"
                        ? styles.lastPunchPillLate
                        : lastPunchDisplayStatus === "Anticipada"
                          ? styles.lastPunchPillEarly
                          : lastPunch.type.startsWith("Inicio")
                            ? styles.lastPunchPillEntry
                            : styles.lastPunchPillExit,
                ]}
              >
                <Ionicons
                  name={
                    lastPunchDisplayStatus === "Error de Imagen" ||
                    lastPunchDisplayStatus === "Fuera de área"
                      ? "alert-circle-outline"
                      : "time-outline"
                  }
                  size={isTablet ? 14 : 12}
                  color={
                    !lastPunch
                      ? TEXT_MUTED
                      : lastPunchDisplayStatus === "Error de Imagen" ||
                          lastPunchDisplayStatus === "Fuera de área"
                        ? ERROR_COLOR
                        : lastPunchDisplayStatus === "Tardanza"
                          ? ERROR_COLOR
                          : lastPunchDisplayStatus === "Anticipada"
                            ? WARNING_ACCENT
                            : lastPunch.type.startsWith("Inicio")
                              ? SUCCESS_ACCENT
                              : PRIMARY_COLOR
                  }
                />
                <Text
                  style={[
                    styles.lastPunchPillText,
                    {
                      fontSize: font(isTablet ? 14 : 12),
                      color: !lastPunch
                        ? TEXT_MUTED
                        : lastPunchDisplayStatus === "Error de Imagen" ||
                            lastPunchDisplayStatus === "Fuera de área"
                          ? ERROR_COLOR
                          : lastPunchDisplayStatus === "Tardanza"
                            ? ERROR_COLOR
                            : lastPunchDisplayStatus === "Anticipada"
                              ? WARNING_ACCENT
                              : lastPunch.type.startsWith("Inicio")
                                ? SUCCESS_ACCENT
                                : PRIMARY_COLOR,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {lastPunch
                    ? `${getPunchTypeLabel(lastPunch.type)} · ${formatRDTimeShort(new Date(lastPunch.createdDate))}`
                    : "Sin ponches hoy"}
                </Text>
              </View>
            </View>
          </View>

          {isValidLocation && currentLocationInfo && (
            <View
              style={[
                styles.locationBlock,
                currentLocationInfo.withinArea
                  ? styles.locationBlockWithin
                  : styles.locationBlockOutside,
              ]}
            >
              <View style={styles.locationHeaderRow}>
                <Ionicons
                  name="location-outline"
                  size={13}
                  color={TEXT_MUTED}
                />
                <Text style={styles.locationHeaderText}>Ubicación</Text>
              </View>
              <Text style={styles.locationAddressText} numberOfLines={2}>
                {currentLocationInfo.address}
              </Text>
              <View style={styles.locationStatusRow}>
                <Ionicons
                  name="location-outline"
                  size={13}
                  color={
                    currentLocationInfo.withinArea
                      ? SUCCESS_ACCENT
                      : ERROR_COLOR
                  }
                />
                <Text
                  style={[
                    styles.locationStatusText,
                    {
                      color: currentLocationInfo.withinArea
                        ? SUCCESS_ACCENT
                        : ERROR_COLOR,
                    },
                  ]}
                >
                  {currentLocationInfo.withinArea
                    ? "Dentro de área"
                    : "Fuera de área"}
                </Text>
              </View>
            </View>
          )}

          {todaySchedule ? (
            <View style={styles.scheduleTable}>
              <View
                style={[
                  styles.scheduleTableCol,
                  { paddingHorizontal: isTablet ? 8 : 5 },
                  styles.scheduleChipWork,
                ]}
              >
                <View style={styles.scheduleTableRow}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={PRIMARY_COLOR}
                  />
                  <Text
                    style={[styles.scheduleTableHeader, { color: PRIMARY_700 }]}
                  >
                    Horario
                  </Text>
                </View>
                <Text
                  style={[
                    styles.scheduleTableValue,
                    { fontSize: font(isTablet ? 13 : 11) },
                  ]}
                  numberOfLines={1}
                >
                  {to12h(todaySchedule.workEntryTime)} –{" "}
                  {to12h(todaySchedule.workExitTime)}
                </Text>
              </View>
              {todaySchedule.lunchEntryTime && (
                <View
                  style={[
                    styles.scheduleTableCol,
                    { paddingHorizontal: isTablet ? 8 : 5 },
                    styles.scheduleChipLunch,
                  ]}
                >
                  <View style={styles.scheduleTableRow}>
                    <Ionicons
                      name="restaurant-outline"
                      size={14}
                      color={WARNING_ACCENT}
                    />
                    <Text
                      style={[
                        styles.scheduleTableHeader,
                        { color: WARNING_TEXT_STRONG },
                      ]}
                    >
                      Almuerzo
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.scheduleTableValue,
                      { fontSize: font(isTablet ? 13 : 11) },
                    ]}
                    numberOfLines={1}
                  >
                    {to12h(todaySchedule.lunchEntryTime)} –{" "}
                    {to12h(todaySchedule.lunchExitTime ?? "")}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.profileScheduleRow}>
              <Ionicons
                name="warning-outline"
                size={13}
                color={WARNING_ACCENT}
              />
              <Text
                style={[styles.profileScheduleText, { color: WARNING_ACCENT }]}
              >
                Sin horario configurado
              </Text>
            </View>
          )}
        </View>

        {/* ── Categoría + Botón registrar (bloque unificado) ── */}
        <View style={styles.floatCard}>
          <View style={styles.sectionHeaderRow}>
            <SectionIcon tone="blue">
              <Ionicons
                name="swap-horizontal-outline"
                size={18}
                color={SECTION_ICON_COLOR}
              />
            </SectionIcon>
            <Text style={styles.sectionHeaderText}>Reg. Entrada / Salida</Text>
          </View>
          {nonWorkingHoliday && !jornadaIniciada && (
            <View style={styles.holidayNotice}>
              <Ionicons
                name="calendar-outline"
                size={18}
                color={WARNING_TEXT_STRONG}
              />
              <Text
                style={[
                  styles.holidayNoticeText,
                  { fontSize: font(isTablet ? 14 : 12) },
                ]}
              >
                {`Hoy ${formatRDDate(now)} es día no laborable motivo a ${todayHoliday?.name ?? ""}.`}
              </Text>
            </View>
          )}
          {visibleCategories.length > 1 && (
            <View style={styles.categories}>
              {visibleCategories.map((cat) => {
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryBtn,
                      selectedCategory === cat && styles.categoryBtnActive,
                    ]}
                    onPress={() => setSelectedCategory(cat)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={CATEGORY_ICONS[cat]}
                      size={18}
                      color={
                        selectedCategory === cat ? ON_PRIMARY : PRIMARY_700
                      }
                    />
                    <Text
                      style={[
                        styles.categoryText,
                        selectedCategory === cat && styles.categoryTextActive,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.85}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {selectedCategory === "Break" && isInicio && breakTags.length > 0 && (
            <View
              style={[
                styles.breakTagWrap,
                // Sin fila de categorías encima, el margen inferior del
                // header ya separa.
                visibleCategories.length <= 1 && { marginTop: 0 },
              ]}
            >
              <Text style={styles.breakTagLabel}>Motivo del Break</Text>
              <TouchableOpacity
                style={styles.breakTagSelector}
                onPress={() => setBreakTagModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.breakTagSelectorText,
                    selectedBreakTagId != null &&
                      styles.breakTagSelectorTextValue,
                  ]}
                >
                  {selectedBreakTagId
                    ? breakTags.find((t) => t.id === selectedBreakTagId)?.name
                    : "Selecciona un motivo"}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={TEXT_PLACEHOLDER}
                />
              </TouchableOpacity>
            </View>
          )}

          {(selectedCategory === "Break" ||
            (selectedCategory === "Jornada" &&
              isJornadaVisible(
                now,
                todaySchedule,
                getNextPunchType("Jornada") === "inicio",
                btnVisWorkIn,
                btnVisWorkOut,
                punches,
                permissions,
                todayHoliday,
              )) ||
            (selectedCategory === "Almuerzo" &&
              isAlmuerzoButtonVisible(
                now,
                todaySchedule,
                getNextPunchType("Almuerzo") === "inicio",
                btnVisLunchIn,
                btnVisLunchOut,
                punches,
                permissions,
                todayHoliday,
              ))) && (
            <TouchableOpacity
              style={[
                styles.registerBtn,
                // Sin fila de categorías ni motivo de break encima, el
                // margen inferior del header / aviso de feriado ya separa.
                visibleCategories.length <= 1 &&
                  !(
                    selectedCategory === "Break" &&
                    isInicio &&
                    breakTags.length > 0
                  ) && { marginTop: 0 },
                !isInicio && styles.registerBtnExit,
                loading && styles.registerBtnBusy,
              ]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={ON_PRIMARY} size="small" />
              ) : (
                <>
                  <Ionicons
                    name={isInicio ? "log-in-outline" : "log-out-outline"}
                    size={26}
                    color={ON_PRIMARY}
                  />
                  <View style={styles.registerTextWrap}>
                    <Text style={styles.registerBtnText}>
                      {isInicio ? "Entrada" : "Salida"}
                    </Text>
                    <Text style={styles.registerBtnSub}>
                      ({selectedCategory})
                    </Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* ── Tolerancias de visibilidad de botones ── */}
        <View style={styles.floatCard}>
          <TouchableOpacity
            style={styles.sectionHeaderToggle}
            onPress={() => setTolerancesExpanded((prev) => !prev)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeaderToggleLabel}>
              <SectionIcon tone="sky">
                <Ionicons
                  name="hourglass-outline"
                  size={18}
                  color={SECTION_ICON_COLOR}
                />
              </SectionIcon>
              <Text style={styles.sectionHeaderText}>
                Tiempo para mostrar acciones
              </Text>
            </View>
            <View style={styles.historyChevronBtn}>
              <Ionicons
                name={tolerancesExpanded ? "chevron-up" : "chevron-down"}
                size={16}
                color={PRIMARY_COLOR}
              />
            </View>
          </TouchableOpacity>
          {tolerancesExpanded && (
            <View style={styles.toleranceGrid}>
              <View
                style={[
                  styles.toleranceCell,
                  isTablet && styles.toleranceCellTablet,
                ]}
              >
                <Text
                  style={[styles.toleranceCellLabel, styles.toleranceLabelIn]}
                >
                  Entrada Jornada
                </Text>
                <Text style={styles.toleranceCellValue}>
                  {btnVisWorkIn} min antes
                </Text>
              </View>
              <View
                style={[
                  styles.toleranceCell,
                  isTablet && styles.toleranceCellTablet,
                ]}
              >
                <Text
                  style={[styles.toleranceCellLabel, styles.toleranceLabelIn]}
                >
                  Entrada Almuerzo
                </Text>
                <Text style={styles.toleranceCellValue}>
                  {btnVisLunchIn} min antes
                </Text>
              </View>
              <View
                style={[
                  styles.toleranceCell,
                  isTablet && styles.toleranceCellTablet,
                ]}
              >
                <Text
                  style={[styles.toleranceCellLabel, styles.toleranceLabelOut]}
                >
                  Salida Jornada
                </Text>
                <Text style={styles.toleranceCellValue}>
                  {btnVisWorkOut} min antes
                </Text>
              </View>
              <View
                style={[
                  styles.toleranceCell,
                  isTablet && styles.toleranceCellTablet,
                ]}
              >
                <Text
                  style={[styles.toleranceCellLabel, styles.toleranceLabelOut]}
                >
                  Salida Almuerzo
                </Text>
                <Text style={styles.toleranceCellValue}>
                  {btnVisLunchOut} min antes
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Registros del día ── */}
        <View style={styles.floatCard}>
          <TouchableOpacity
            style={styles.sectionHeaderToggle}
            onPress={() => setHistoryExpanded(!historyExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeaderToggleLabel}>
              <SectionIcon tone="green">
                <Ionicons
                  name="list-outline"
                  size={18}
                  color={SECTION_ICON_COLOR}
                />
              </SectionIcon>
              <Text style={styles.sectionHeaderText}>Historial del Día</Text>
            </View>
            <View style={styles.historyChevronBtn}>
              <Ionicons
                name={historyExpanded ? "chevron-up" : "chevron-down"}
                size={16}
                color={PRIMARY_COLOR}
              />
            </View>
          </TouchableOpacity>
          {historyExpanded && (
            <>
              {loadingPunches ? (
                <ActivityIndicator
                  color={PRIMARY_COLOR}
                  style={{ marginVertical: 16 }}
                />
              ) : punches.length === 0 ? (
                <View style={styles.emptyPunches}>
                  <Ionicons name="time-outline" size={32} color={ICON_SUBTLE} />
                  <Text style={styles.emptyText}>Sin registros hoy</Text>
                </View>
              ) : (
                [...punches]
                  .reverse()
                  .slice(
                    0,
                    historyShowAll ? undefined : HISTORY_COLLAPSED_LIMIT,
                  )
                  .map((punch) => {
                    const tolerances = {
                      workIn: tolWorkIn,
                      workOut: tolWorkOut,
                      lunchIn: tolLunchIn,
                      lunchOut: tolLunchOut,
                    };
                    const displayStatus = getDisplayStatus(
                      punch,
                      userSchedules,
                      tolerances,
                    );
                    const lateMinutes = getLateMinutes(
                      punch,
                      userSchedules,
                      tolerances,
                    );
                    const isJornadaOvertime = displayStatus === "Horas extras";
                    const isLateBadge =
                      displayStatus === "Tardanza" ||
                      displayStatus === "Error de Imagen" ||
                      displayStatus === "Fuera de área";
                    const isEarlyBadge = displayStatus === "Anticipada";
                    const breakTagName = getPunchBreakTagName(punch);
                    const photoUrl = getPunchPhotoUrl(punch, urlColegio);
                    const punchIconColor = isLateBadge
                      ? ERROR_COLOR
                      : isEarlyBadge
                        ? WARNING_ACCENT
                        : punch.type.startsWith("Inicio")
                          ? SUCCESS_ACCENT
                          : isJornadaOvertime
                            ? PRIMARY_COLOR
                            : SUCCESS_ACCENT;

                    return (
                      <View key={punch.id} style={styles.punchRow}>
                        <View
                          style={[
                            styles.punchIcon,
                            isLateBadge
                              ? styles.punchIconError
                              : isEarlyBadge
                                ? styles.punchIconEarly
                                : punch.type.startsWith("Inicio")
                                  ? styles.punchIconEntry
                                  : isJornadaOvertime
                                    ? styles.punchIconOvertime
                                    : styles.punchIconExitOnTime,
                          ]}
                        >
                          <Ionicons
                            name={CATEGORY_ICONS[getPunchCategory(punch.type)]}
                            size={16}
                            color={punchIconColor}
                          />
                        </View>
                        <View style={styles.punchInfo}>
                          <Text style={styles.punchType}>
                            {getPunchTypeLabel(punch.type)}
                          </Text>
                          <View style={styles.punchBadgeRow}>
                            {isJornadaOvertime ? (
                              /* Solo FinJornada con overtime → "Horas extras" */
                              <View style={styles.badgeOvertime}>
                                <Text style={styles.badgeOvertimeText}>
                                  Horas extras
                                </Text>
                              </View>
                            ) : (
                              /* Resto → status normal (almuerzo/break fuera de horario = Tardanza) */
                              displayStatus && (
                                <View
                                  style={[
                                    styles.punchBadge,
                                    isLateBadge
                                      ? styles.badgeLate
                                      : isEarlyBadge
                                        ? styles.badgeEarly
                                        : styles.badgeOnTime,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.punchBadgeText,
                                      { color: getStatusColor(displayStatus) },
                                    ]}
                                  >
                                    {displayStatus}
                                  </Text>
                                </View>
                              )
                            )}
                            {/* Duración de la tardanza (solo móvil) */}
                            {displayStatus === "Tardanza" &&
                              lateMinutes != null &&
                              lateMinutes > 0 && (
                                <View
                                  style={[styles.punchBadge, styles.badgeLate]}
                                >
                                  <Text
                                    style={[
                                      styles.punchBadgeText,
                                      { color: getStatusColor("Tardanza") },
                                    ]}
                                  >
                                    {formatLateDuration(lateMinutes)}
                                  </Text>
                                </View>
                              )}
                            {!!breakTagName && (
                              <View
                                style={[styles.punchBadge, styles.badgeNeutral]}
                              >
                                <Text
                                  style={[
                                    styles.punchBadgeText,
                                    { color: TEXT_MUTED },
                                  ]}
                                >
                                  {breakTagName}
                                </Text>
                              </View>
                            )}
                            {punch.permissionId != null && (
                              <View style={styles.permissionBadgeSmall}>
                                <MaterialCommunityIcons
                                  name="alpha-p"
                                  size={16}
                                  color={PRIMARY_COLOR}
                                />
                              </View>
                            )}
                            {(punch.hasOpenDay === true ||
                              (punch.hasOpenDay as unknown) === "true") && (
                              <View style={styles.openDayBadgeSmall}>
                                <Ionicons
                                  name="lock-open-outline"
                                  size={16}
                                  color={ACCENT_VIOLET}
                                />
                              </View>
                            )}
                            {/* Foto del ponche — también en "Error de Imagen", igual que el webapp */}
                            {photoUrl != null && (
                              <TouchableOpacity
                                style={styles.punchPhotoBtn}
                                onPress={() => setPunchPhotoUri(photoUrl)}
                                accessibilityRole="button"
                                accessibilityLabel="Ver imagen"
                              >
                                <Ionicons
                                  name="image-outline"
                                  size={16}
                                  color={TEXT_MUTED}
                                />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                        <Text style={styles.punchTime}>
                          {formatRDTimeShort(new Date(punch.createdDate))}
                        </Text>
                        {punch.id === blinkPunchId && (
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              styles.punchRowBlink,
                              {
                                backgroundColor: punchIconColor,
                                opacity: blinkOpacity,
                              },
                            ]}
                          />
                        )}
                      </View>
                    );
                  })
              )}
              {punches.length > HISTORY_COLLAPSED_LIMIT && (
                <TouchableOpacity
                  style={styles.historyToggleBtn}
                  onPress={() => setHistoryShowAll(!historyShowAll)}
                >
                  <Text style={styles.historyToggleText}>
                    {historyShowAll
                      ? "Ver menos"
                      : `Ver todos (${punches.length})`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <ImageViewerModal
        uri={punchPhotoUri}
        onClose={() => setPunchPhotoUri(null)}
      />
    </View>
  );
}

/** Lado del avatar de perfil. Fuente única para el View contenedor y la Image. */
const AVATAR_SIZE = 78;

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 40 },
  /**
   * Centra y limita el contenido en tablet. Sin esto el árbol entero hereda el
   * ancho del device y los bloques de 2 columnas se estiran (auditoría 4.4).
   * `width: "100%"` es necesario porque alignSelf: "center" en un
   * contentContainer haría que el contenido colapse a su ancho intrínseco.
   */
  contentTablet: {
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    width: "100%",
  },
  /* ── Clock ── */
  clockFloatCard: {
    ...CARD_FORM,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    marginTop: 8,
  },
  clockCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  clockTimeGroup: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  clockDivider: {
    width: 1,
    height: 22,
    backgroundColor: PRIMARY_TINT_BORDER,
    marginHorizontal: 16,
  },
  clockTime: {
    color: PRIMARY_700,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  clockAmPm: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 4,
    color: HEADER_NAVY,
  },
  clockDateCompact: {
    color: PRIMARY_COLOR,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  avatarWrap: { flexShrink: 0, position: "relative" },
  avatarStatusDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: CARD_BACKGROUND,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: PRIMARY_TINT_50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: PRIMARY_TINT_BORDER,
  },
  profileInfo: { flex: 1, justifyContent: "center", gap: 4 },
  profileName: {
    fontSize: 25,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    letterSpacing: 0.1,
  },
  profileScheduleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  profileScheduleText: { fontSize: 12, color: TEXT_MUTED },
  lastPunchPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS_PILL,
  },
  lastPunchPillEntry: { backgroundColor: SUCCESS_TINT_BACKGROUND },
  lastPunchPillExit: { backgroundColor: PRIMARY_TINT_50 },
  lastPunchPillNeutral: { backgroundColor: FIELD_DISABLED_BACKGROUND },
  lastPunchPillError: { backgroundColor: DANGER_TINT_BACKGROUND },
  lastPunchPillLate: { backgroundColor: DANGER_TINT_BACKGROUND },
  lastPunchPillEarly: { backgroundColor: WARNING_TINT_BACKGROUND },
  lastPunchPillText: { fontSize: 14, fontWeight: "700" },
  locationBlock: {
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
    marginBottom: 8,
  },
  locationBlockWithin: {
    backgroundColor: SUCCESS_TINT_BACKGROUND,
    borderColor: SUCCESS_TINT_BORDER,
  },
  locationBlockOutside: {
    backgroundColor: DANGER_TINT_BACKGROUND,
    borderColor: DANGER_TINT_BORDER,
  },
  locationHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationHeaderText: { fontSize: 12, fontWeight: "700", color: TEXT_MUTED },
  locationAddressText: { fontSize: 13, color: TEXT_SECONDARY },
  locationStatusRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationStatusText: { fontSize: 12, fontWeight: "700" },
  scheduleTable: { flexDirection: "row", gap: 8 },
  scheduleTableCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
  },
  scheduleChipWork: {
    backgroundColor: PRIMARY_TINT_50,
    borderColor: PRIMARY_TINT_BORDER,
  },
  scheduleChipLunch: {
    backgroundColor: WARNING_TINT_BACKGROUND,
    borderColor: WARNING_TINT_BORDER,
  },
  scheduleTableRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  scheduleTableHeader: { fontSize: 12, fontWeight: "700", color: TEXT_MUTED },
  scheduleTableValue: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
  },

  /* ── Floating label card ── */
  floatCard: {
    ...CARD_FORM,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    marginTop: 8,
  },
  profileFloatCard: {
    ...CARD_FORM,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    marginTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  sectionHeaderText: { fontSize: 15, fontWeight: "700", color: TEXT_PRIMARY },
  sectionHeaderToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionHeaderToggleLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historyChevronBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: PRIMARY_TINT_50,
    alignItems: "center",
    justifyContent: "center",
  },
  historyToggleBtn: {
    alignSelf: "center",
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  historyToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: PRIMARY_COLOR,
  },
  toleranceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  toleranceCell: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: PRIMARY_TINT_25,
    borderRadius: RADIUS_MD,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  /**
   * En tablet los 4 items (Entrada/Salida × Jornada/Almuerzo) son homogéneos y
   * entran en una sola fila: 4 × 23% = 92% + 3 gaps de 8px caben en los 648dp
   * útiles del contenedor capado a MAX_CONTENT_WIDTH.
   *
   * `alignItems: "center"` es el fix real del hallazgo: con la celda ya ancha,
   * sin centrar, el label quedaba pegado a la izquierda con la caja vacía a la
   * derecha. Mismo patrón que scheduleTableCol, que por eso sí se veía bien.
   */
  toleranceCellTablet: {
    flexBasis: "23%",
    alignItems: "center",
  },
  toleranceCellLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: TEXT_MUTED,
    marginBottom: 1,
  },
  // Mismo verde/rojo que los botones Entrada / Salida (registerBtn*).
  toleranceLabelIn: { color: SUCCESS_ACCENT },
  toleranceLabelOut: { color: ERROR_COLOR },
  toleranceCellValue: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT_MUTED,
  },
  holidayNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: WARNING_TINT_BACKGROUND,
    borderWidth: 1,
    borderColor: WARNING_TINT_BORDER,
    borderRadius: RADIUS_LG,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  holidayNoticeText: {
    flex: 1,
    fontWeight: "600",
    color: WARNING_TEXT_STRONG,
  },
  categories: { flexDirection: "row", gap: 8 },
  categoryBtn: {
    ...CATEGORY_BTN_SURFACE,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 52,
    paddingHorizontal: 6,
  },
  categoryBtnActive: { ...CATEGORY_BTN_ACTIVE },
  categoryText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: PRIMARY_700,
  },
  categoryTextActive: { color: ON_PRIMARY },
  registerBtn: {
    ...tintedShadow(SUCCESS_ACCENT),
    borderRadius: RADIUS_LG,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 12,
    backgroundColor: SUCCESS_ACCENT,
  },
  registerBtnExit: {
    ...tintedShadow(ERROR_COLOR),
    backgroundColor: ERROR_COLOR,
  },
  // Sin sombra mientras envía: en Android la elevation se transparenta a
  // través de un fondo con opacity < 1.
  registerBtnBusy: {
    opacity: 0.7,
    shadowColor: "transparent",
    elevation: 0,
  },
  registerTextWrap: { alignItems: "center" },
  registerBtnText: {
    color: ON_PRIMARY,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  registerBtnSub: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    marginTop: 1,
  },
  emptyPunches: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 14, color: TEXT_PLACEHOLDER },
  punchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: FOOTER_BORDER,
  },
  // Card redondeada (radio de CARD_ROW) un poco más ancha que la fila, sin
  // tocar el ícono, el texto ni la línea divisoria.
  punchRowBlink: {
    position: "absolute",
    top: 2,
    bottom: 2,
    left: -8,
    right: -8,
    borderRadius: RADIUS_XL,
  },
  punchIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  punchIconEntry: { backgroundColor: SUCCESS_TINT_BACKGROUND },
  punchIconExitOnTime: { backgroundColor: SUCCESS_TINT_BACKGROUND },
  punchIconOvertime: { backgroundColor: PRIMARY_TINT_BACKGROUND },
  punchIconEarly: { backgroundColor: WARNING_TINT_BACKGROUND },
  punchIconError: { backgroundColor: DANGER_TINT_BACKGROUND },
  punchInfo: { flex: 1, gap: 4 },
  punchType: { fontSize: 13, fontWeight: "700", color: TEXT_PRIMARY },
  /* alignItems center: sin él, el botón de foto (28) estira los pills al alto
   * de la línea. */
  punchBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  punchBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS_PILL,
  },
  badgeOnTime: { backgroundColor: SUCCESS_TINT_BACKGROUND },
  badgeLate: { backgroundColor: DANGER_TINT_BACKGROUND },
  badgeEarly: { backgroundColor: WARNING_TINT_BACKGROUND },
  /** Pill neutro para el tipo de break (punch.tag?.name) — mismo tono gris
   * que lastPunchPillNeutral, reusado como fondo para este badge. */
  badgeNeutral: { backgroundColor: FIELD_DISABLED_BACKGROUND },
  punchBadgeText: { fontSize: 11, fontWeight: "700" },
  badgeOvertime: {
    backgroundColor: PRIMARY_TINT_50,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS_PILL,
  },
  badgeOvertimeText: { fontSize: 11, fontWeight: "700", color: PRIMARY_COLOR },
  punchTime: { fontSize: 12, fontWeight: "600", color: TEXT_MUTED },
  /* Indicador de permiso */
  permissionBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PRIMARY_COLOR,
    backgroundColor: PRIMARY_TINT_50,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionBadgeSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PRIMARY_COLOR,
    backgroundColor: PRIMARY_TINT_50,
    alignItems: "center",
    justifyContent: "center",
  },
  /* Botón "Ver imagen" del historial. Lado fijo de 28 (sin escalar): es la
   * caja 28×28 de actionIconBox en el Timeline del webapp. Fondo: el token
   * existente más cercano a su #f1f5f9 (mismo gris que badgeNeutral). */
  punchPhotoBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS_SM,
    backgroundColor: FIELD_DISABLED_BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
  },
  /* Indicador de jornada pendiente de cerrar (hasOpenDay) */
  openDayBadgeSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ACCENT_VIOLET,
    backgroundColor: VIOLET_TINT_BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionModalIconWrap: {
    width: 42,
    height: 42,
    borderRadius: RADIUS_LG,
    backgroundColor: PRIMARY_TINT_50,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionItemDivider: {
    height: 1,
    backgroundColor: CARD_BORDER,
    marginBottom: 16,
  },
  permissionItemAction: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  permissionItemTime: {
    fontSize: 14,
    fontWeight: "600",
    color: PRIMARY_COLOR,
    marginTop: 2,
  },
  permissionItemText: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontStyle: "italic",
    lineHeight: 20,
    marginTop: 6,
  },
  /* NextDayExit Modal */
  ndModalOverlay: {
    ...DIALOG_OVERLAY,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  ndModalCard: {
    ...POPUP_CARD,
    width: "100%",
    maxWidth: 400,
    padding: 24,
  },
  ndModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  ndModalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  ndModalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ndModalIconWrap: {
    width: 42,
    height: 42,
    borderRadius: RADIUS_LG,
    backgroundColor: WARNING_TINT_BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
  },
  ndModalTitle: { fontSize: 18, fontWeight: "700", color: TEXT_PRIMARY },
  ndModalBody: { gap: 16 },
  ndModalMsg: { fontSize: 14, color: TEXT_MUTED, lineHeight: 22 },
  ndTimeBtn: {
    ...FIELD_SURFACE,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  ndTimeBtnText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: TEXT_PLACEHOLDER,
  },
  ndTimeBtnTextValue: { color: TEXT_PRIMARY },
  ndSuggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: PRIMARY_TINT_50,
    borderRadius: RADIUS_MD,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ndSuggestionText: {
    flex: 1,
    fontSize: 12,
    color: PRIMARY_700,
  },
  ndSuggestionTextValue: {
    fontWeight: "700",
  },
  ndSuggestionAction: {
    fontSize: 12,
    fontWeight: "700",
    color: PRIMARY_COLOR,
    textDecorationLine: "underline",
  },
  ndModalBtn: {
    ...FOOTER_BTN_SAVE,
    marginTop: 8,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  // Sin sombra: en Android la elevation se transparenta a través de un fondo
  // con opacity < 1.
  ndModalBtnDisabled: {
    opacity: 0.5,
    shadowColor: "transparent",
    elevation: 0,
  },
  ndModalBtnText: { fontSize: 16, fontWeight: "700", color: ON_PRIMARY },
  ndErrorRow: {
    ...ALERT_BANNER,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ndErrorText: { flex: 1, fontSize: 13, color: ERROR_TEXT, lineHeight: 20 },
  /* Break tag selector */
  breakTagWrap: { marginTop: 12 },
  breakTagLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT_MUTED,
    marginBottom: 6,
  },
  breakTagSelector: {
    ...FIELD_SURFACE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  breakTagSelectorText: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_PLACEHOLDER,
  },
  breakTagSelectorTextValue: { color: TEXT_PRIMARY },
  breakTagOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: FOOTER_BORDER,
  },
  breakTagOptionText: { fontSize: 15, fontWeight: "600", color: TEXT_PRIMARY },
});
