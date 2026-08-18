import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useSchoolStore } from "../../../store/useSchoolStore";
import type {
  School,
  SchoolSettings,
  SchoolUser,
  UserSchedule,
} from "../../../types/typeStore/SchoolStoreType";
import * as Storage from "../../utils/storage";

type Category = "Jornada" | "Almuerzo" | "Break";

interface PunchEvent {
  id: number;
  type: string;
  status: string;
  createdDate: string;
  lateEntry?: boolean;
  earlyExit?: boolean;
  overtime?: number | string;
  toleranceMinutes?: number | null;
  hasOpenDay?: boolean | string;
  openDayDate?: string;
  date?: string;
}

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

interface Tag {
  id: number;
  name: string;
  category?: { id?: number; name?: string } | null;
}

const BREAK_TAG_CATEGORY_NAME = "Tipos de Break";

// Santo Domingo = UTC-4, fijo, sin cambio de horario de verano

const WEEK_DAYS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

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

function decodeJWT(token: string): Record<string, any> {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

function toRD(date: Date) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const rd = new Date(utc - 4 * 60 * 60 * 1000);

  return {
    year: rd.getFullYear(),
    month: rd.getMonth(),
    day: rd.getDate(),
    hours: rd.getHours(),
    minutes: rd.getMinutes(),
    seconds: rd.getSeconds(),
    weekDay: rd.getDay(),
  };
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

/** "08:45:32 a. m." — reloj principal */
function formatRDTime(date: Date): string {
  const { hours, minutes, seconds } = toRD(date);
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours < 12 ? "a. m." : "p. m.";
  return `${pad(h12)}:${pad(minutes)}:${pad(seconds)} ${ampm}`;
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

/** Minutos desde medianoche  */
function getRDMinutes(date: Date): number {
  const { hours, minutes } = toRD(date);
  return hours * 60 + minutes;
}

/** Día de la semana en RD */
function getRDDayIndex(date: Date): number {
  return toRD(date).weekDay;
}

function timeStrToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
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
    InicioJornada: "Entrada Jornada",
    FinJornada: "Salida Jornada",
    InicioAlmuerzo: "Entrada Almuerzo",
    FinAlmuerzo: "Salida Almuerzo",
    InicioBreak: "Inicio Break",
    FinBreak: "Fin Break",
  };
  return labels[type] ?? type;
}

function getStatusColor(status: string): string {
  if (status === "Tardanza") return "#DC2626";
  if (status === "Anticipada") return "#D97706";
  if (status === "Error de Imagen") return "#DC2626";
  return "#16A34A";
}

function getStatusIcon(status: string): keyof typeof Ionicons.glyphMap {
  if (status === "Tardanza") return "warning-outline";
  if (status === "Anticipada") return "time-outline";
  return "checkmark-circle-outline";
}

function getStatusLabel(status: string): string {
  if (status === "Tardanza") return "Tardanza";
  if (status === "Anticipada") return "Salida anticipada";
  if (status === "A Tiempo") return "A tiempo";
  return status;
}

function isJornadaActiva(punches: PunchEvent[]): boolean {
  const last = [...punches]
    .reverse()
    .find(
      (p) =>
        (p.type === "InicioJornada" || p.type === "FinJornada") &&
        p.status !== "Error de Imagen" &&
        !p.hasOpenDay &&
        p.hasOpenDay !== ("true" as any),
    );
  return last?.type === "InicioJornada";
}

function isJornadaVisible(
  now: Date,
  schedule: UserSchedule | null,
  isInicio: boolean,
  tolWorkIn: number,
  tolWorkOut: number,
  punches: PunchEvent[],
): boolean {
  // Sin horario -> ocultar siempre
  if (!schedule) return false;

  const current = getRDMinutes(now);
  // Los intentos rechazados por imagen no cuentan como jornada iniciada
  const lastJornada = [...punches]
    .reverse()
    .find(
      (p) =>
        (p.type === "InicioJornada" || p.type === "FinJornada") &&
        p.status !== "Error de Imagen" &&
        !p.hasOpenDay &&
        p.hasOpenDay !== ("true" as any),
    );

  if (isInicio) {
    // Ya poncho entrada -> ocultar (jornada activa)
    if (lastJornada?.type === "InicioJornada") return false;
    // Ya salio hoy -> ocultar
    if (lastJornada?.type === "FinJornada") return false;
    // Sin ponche -> visible desde N min antes de entrada (tolerancia), sin limite superior
    const entryStart = timeStrToMinutes(schedule.workEntryTime) - tolWorkIn;
    return current >= entryStart;
  } else {
    // Ya salio hoy -> ocultar
    if (lastJornada?.type === "FinJornada") return false;
    // Visible desde N min antes de salida, sin limite superior (horas extras)
    const exitStart = timeStrToMinutes(schedule.workExitTime) - tolWorkOut;
    return current >= exitStart;
  }
}

function isAlmuerzoVisible(
  now: Date,
  schedule: UserSchedule | null,
  tolLunchIn: number,
  tolLunchOut: number,
  punches: PunchEvent[],
): boolean {
  if (!schedule) return false;

  const lastAlmuerzo = [...punches]
    .reverse()
    .find((p) => p.type === "InicioAlmuerzo" || p.type === "FinAlmuerzo");

  if (lastAlmuerzo?.type === "InicioAlmuerzo") return true;
  if (lastAlmuerzo?.type === "FinAlmuerzo") return false;

  if (!schedule.lunchEntryTime || !schedule.lunchExitTime) return false;

  const current = getRDMinutes(now);
  const windowStart = timeStrToMinutes(schedule.lunchEntryTime) - tolLunchIn;
  const windowEnd = timeStrToMinutes(schedule.lunchExitTime) + tolLunchOut;

  return current >= windowStart && current <= windowEnd;
}

// ─── Puntualidad del ponche ──────────────────────────────────────────────────

interface ToleranceConfig {
  workIn: number;
  workOut: number;
  lunchIn: number;
  lunchOut: number;
}

type PunctualityStatus = "Tardanza" | "Anticipada" | "A Tiempo";

function getScheduleForDay(
  schedules: UserSchedule[],
  date: Date,
): UserSchedule | null {
  const dayName = WEEK_DAYS[getRDDayIndex(date)];
  return schedules.find((s) => s.weekDay === dayName) ?? null;
}

/**
 * Calcula la puntualidad del ponche comparando la hora registrada (en RD)
 * contra el horario del día correspondiente. Devuelve null cuando no hay
 * horario aplicable (ej. Break, días sin schedule) para dejar que la UI
 * use el estado que devuelva el backend.
 */
function getPunctuality(
  punch: PunchEvent,
  schedules: UserSchedule[],
  defaults: ToleranceConfig,
): PunctualityStatus | null {
  const punchDate = new Date(punch.createdDate);
  const schedule = getScheduleForDay(schedules, punchDate);
  if (!schedule) return null;

  const punchMinutes = getRDMinutes(punchDate);

  switch (punch.type) {
    case "InicioJornada":
      return punchMinutes >
        timeStrToMinutes(schedule.workEntryTime) +
          (schedule.toleranceWorkTimeIn ?? defaults.workIn)
        ? "Tardanza"
        : "A Tiempo";
    case "FinJornada":
      return punchMinutes <
        timeStrToMinutes(schedule.workExitTime) -
          (schedule.toleranceWorkTimeOut ?? defaults.workOut)
        ? "Anticipada"
        : "A Tiempo";
    case "InicioAlmuerzo":
      if (!schedule.lunchEntryTime) return null;
      return punchMinutes >
        timeStrToMinutes(schedule.lunchEntryTime) +
          (schedule.toleranceLunchTimeIn ?? defaults.lunchIn)
        ? "Tardanza"
        : "A Tiempo";
    case "FinAlmuerzo":
      if (!schedule.lunchExitTime) return null;
      return punchMinutes >
        timeStrToMinutes(schedule.lunchExitTime) +
          (schedule.toleranceLunchTimeOut ?? defaults.lunchOut)
        ? "Tardanza"
        : "A Tiempo";
    default:
      return null;
  }
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

export default function PunchInOut() {
  const [now, setNow] = useState(new Date());
  const [selectedCategory, setSelectedCategory] = useState<Category>("Jornada");
  const [punches, setPunches] = useState<PunchEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPunches, setLoadingPunches] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [phoneImagen, setPhoneImagen] = useState<string | null>(null);
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

  const { user, urlColegio, logout } = useSchoolStore();

  // El login devuelve los horarios en user.schoolUsers[0].userSchedules
  const schoolUser: SchoolUser | undefined = user?.user?.schoolUsers?.[0];
  const userSchedules: UserSchedule[] =
    schoolUser?.userSchedules ?? user?.userSchedules ?? [];
  const todaySchedule = getTodaySchedule(userSchedules, now);
  const jornadaIniciada = isJornadaActiva(punches);

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

  // Datos del usuario autenticado
  const userName: string = (user as any)?.name
    ? `${(user as any).name}${(user as any)?.lastName ? " " + (user as any).lastName : ""}`
    : ((user as any)?.username ?? "Usuario");
  const userCode: string =
    (user as any)?.code ?? (user as any)?.employeeCode ?? "";

  const getToken = useCallback(async (): Promise<string | null> => {
    const storeToken = useSchoolStore.getState().token;
    if (storeToken) return storeToken;
    return await Storage.getItemAsync("token");
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert("Cerrar sesión", "¿Estás seguro de que deseas cerrar sesión?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          await Promise.all([
            Storage.deleteItemAsync("token"),
            Storage.deleteItemAsync("user"),
            Storage.deleteItemAsync("menuItems"),
            // isAuthorized NO se borra — es la autorización del dispositivo físico
          ]);
          logout();
          router.replace("/login");
        },
      },
    ]);
  }, [logout]);

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
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!res.data?.success) return;

        const freshSchedules: UserSchedule[] =
          res.data?.data?.userSchedules ?? [];

        // Mantener los settings frescos del backend (tolerancias, etc.)
        const freshSettings = (res.data?.data?.school ?? res.data?.school)
          ?.settings as SchoolSettings | undefined;
        if (freshSettings) setSchoolSettings(freshSettings);

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

  // Si la categoría seleccionada deja de ser visible → volver a Jornada
  useEffect(() => {
    if (
      selectedCategory === "Almuerzo" &&
      !isAlmuerzoVisible(now, todaySchedule, tolLunchIn, tolLunchOut, punches)
    ) {
      setSelectedCategory("Jornada");
    }
  }, [now, punches, todaySchedule, selectedCategory]);

  // Motivo de break no debe sobrevivir un cambio de categoría — evita que un
  // motivo elegido para un Break anterior quede preseleccionado en el siguiente.
  useEffect(() => {
    setSelectedBreakTagId(null);
  }, [selectedCategory]);

  const fetchTodayPunches = useCallback(async () => {
    try {
      setLoadingPunches(true);
      const token = await getToken();
      if (!urlColegio || !token) return;
      const response = await axios.get(`${urlColegio}/punches/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("TODAY PUNCHES RESPONSE:", {
        clientTimestamp: new Date().toISOString(),
        data: response.data,
      });
      if (response.data.success) {
        const data: PunchEvent[] = response.data.data ?? [];
        setPunches(data);
        const pending = data.find(
          (p) => p.hasOpenDay === true || p.hasOpenDay === ("true" as any),
        );
        if (pending) {
          setNextDayExitPunch(pending);
          setNextDayExitModal(true);
        } else {
          setNextDayExitModal(false);
          setNextDayExitPunch(null);
        }
      }
    } catch (error: any) {
      console.error(
        "fetchTodayPunches:",
        error?.response?.data?.message ?? error?.message,
      );
    } finally {
      setLoadingPunches(false);
      setRefreshing(false);
    }
  }, [urlColegio, getToken]);

  useEffect(() => {
    fetchTodayPunches();
  }, [fetchTodayPunches]);

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
        setBreakTags(
          allTags.filter(
            (tag) => tag.category?.name === BREAK_TAG_CATEGORY_NAME,
          ),
        );
      }
    } catch (error: any) {
      console.error(
        "fetchBreakTags:",
        error?.response?.data?.message ?? error?.message,
      );
    }
  }, [urlColegio, getToken]);

  useEffect(() => {
    fetchBreakTags();
  }, [fetchBreakTags]);

  const getNextPunchType = (category: Category): "inicio" | "fin" => {
    const types = PUNCH_TYPE_MAP[category];
    const last = [...punches]
      .reverse()
      .find(
        (p) =>
          (p.type === types.inicio || p.type === types.fin) &&
          p.status !== "Error de Imagen",
      );
    if (!last) return "inicio";
    return last.type === types.inicio ? "fin" : "inicio";
  };

  const isInicio = getNextPunchType(selectedCategory) === "inicio";

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
    const token = await getToken();
    if (!urlColegio || !token) return;
    setSubmittingExit(true);
    try {
      let baseDateStr = "";

      const raw =
        nextDayExitPunch?.openDayDate ??
        nextDayExitPunch?.createdDate ??
        nextDayExitPunch?.date ??
        "";
      if (raw) {
        baseDateStr = String(raw).split("T")[0];
      } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yyyy = yesterday.getFullYear();
        const mm = String(yesterday.getMonth() + 1).padStart(2, "0");
        const dd = String(yesterday.getDate()).padStart(2, "0");
        baseDateStr = `${yyyy}-${mm}-${dd}`;
      }

      const [rawHour, rawMinute] = nextDayExitTime.trim().split(":");
      const hour = pad(Number(rawHour));
      const minute = pad(Number(rawMinute));

      const finalDateTime = `${baseDateStr}T${hour}:${minute}:00-04:00`;

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

  const handleRegister = async () => {
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
    if (type === "InicioBreak" && breakTags.length > 0 && !selectedBreakTagId) {
      Alert.alert("Motivo requerido", "Selecciona el motivo del break.");
      return;
    }

    // Si hay una jornada del día anterior sin cerrar, ese modal debe resolverse
    // primero — el relogin por sesión vieja es el segundo paso, no el primero,
    // cuando ambos casos coinciden.
    const hasPendingOpenDay =
      nextDayExitModal ||
      punches.some(
        (p) => p.hasOpenDay === true || p.hasOpenDay === ("true" as any),
      );

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
    // Pre-validación antes del POST: si el usuario está fuera del radio permitido
    // se aborta inmediatamente, sin ejecutar la captura de foto ni el axios.post.
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

        if (!dentroDeGeocerca) {
          console.warn(
            "BLOQUEO GEOCERCA: Usuario fuera del radio permitido — se aborta el ponche",
            {
              source: targetGeo.source,
              distanceMeters: Math.round(distanceMeters),
              maxRadius: targetGeo.radius,
            },
          );
          Alert.alert(
            "Ubicación No Válida",
            targetGeo.source === "USER_CUSTOM_LOCATION"
              ? "Te encuentras fuera del área permitida para registrar tu asistencia. Acércate a la ubicación asignada."
              : "Te encuentras fuera del área permitida para registrar tu asistencia. Acércate a la institución.",
          );
          return;
        }
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
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          console.warn(
            "BLOQUEO: Permiso de galería denegado — se aborta el ponche",
          );
          Alert.alert(
            "Permiso requerido",
            "Necesitas permitir el acceso a la galería para registrar tu asistencia.",
          );
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 0.4,
          base64: true,
        });
        if (result.canceled) {
          console.warn(
            "BLOQUEO: Captura cancelada por el usuario — se aborta el ponche",
          );
          Alert.alert(
            "Foto requerida",
            "Debes seleccionar una foto para registrar la jornada.",
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
          "Debes seleccionar una foto para registrar la jornada.",
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
    setLoading(true);
    try {
      const payload: PunchPayload = { type };
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

      if (response.data.success) {
        if (type === "InicioBreak") setSelectedBreakTagId(null);
        await fetchTodayPunches();
      } else {
        const msg: string = response.data.message ?? "Intenta de nuevo.";
        const lowerMsg = msg.toLowerCase();

        // Post-validación: si el backend rechaza por ubicación fuera de área,
        // no se actualiza el historial y se lanza la alerta correspondiente.
        const outOfAreaRejected =
          isValidLocation &&
          (response.data.isOutOfArea === true ||
            response.data.status === "OUT_OF_AREA" ||
            lowerMsg.includes("fuera de área") ||
            lowerMsg.includes("fuera del área") ||
            lowerMsg.includes("fuera del area") ||
            lowerMsg.includes("out of area"));

        if (outOfAreaRejected) {
          console.warn(
            "BLOQUEO POST-VALIDACIÓN: El backend rechazó el ponche por ubicación fuera de área",
            { message: msg, response: response.data },
          );
          Alert.alert(
            "Ubicación No Válida",
            "Te encuentras fuera del área permitida para registrar tu asistencia. Acércate a la institución.",
          );
          return;
        }

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
          // Jornada del día anterior sin cerrar → mostrar modal, sin Alert genérico
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
      await fetchTodayPunches();
      const lowerMsg = msg.toLowerCase();
      if (
        lowerMsg.includes("inicio de jornada activo") ||
        lowerMsg.includes("cerrar la jornada")
      ) {
        // Jornada del día anterior sin cerrar → mostrar modal, sin Alert genérico
        setNextDayExitModal(true);
        return;
      }
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
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
        tolLunchIn,
        tolLunchOut,
        punches,
      );
    if (cat === "Jornada") return true;
    return true;
  });

  const pendingDate = nextDayExitPunch
    ? formatRDDate(
        new Date(nextDayExitPunch.openDayDate ?? nextDayExitPunch.createdDate),
      )
    : "";

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
            <View style={styles.ndModalHeader}>
              <View style={styles.ndModalIconWrap}>
                <Ionicons name="time-outline" size={22} color="#D97706" />
              </View>
              <Text style={styles.ndModalTitle}>Jornada Incompleta</Text>
            </View>
            <View style={styles.ndModalBody}>
              <Text style={styles.ndModalMsg}>
                No completaste la salida{" "}
                {pendingDate ? (
                  <>
                    del día{" "}
                    <Text style={{ fontWeight: "700" }}>{pendingDate}</Text>
                  </>
                ) : (
                  "de la jornada anterior"
                )}
                . Esto afecta tu puntuación del mes. Selecciona la hora a la que
                saliste para cerrar la jornada.
              </Text>

              <TouchableOpacity
                style={styles.ndTimeBtn}
                onPress={() => setShowTimePicker(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="time-outline" size={20} color="#D97706" />
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
                <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>

            </View>
            <TouchableOpacity
              style={[styles.ndModalBtn, submittingExit && { opacity: 0.7 }]}
              onPress={handleSubmitNextDayExit}
              disabled={submittingExit}
              activeOpacity={0.85}
            >
              {submittingExit ? (
                <ActivityIndicator color="#fff" size="small" />
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
                <Ionicons name="cafe-outline" size={22} color="#D97706" />
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
                  <Ionicons name="checkmark" size={18} color="#2563EB" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
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
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchTodayPunches();
            }}
            colors={["#2563EB"]}
          />
        }
      >
        {/* ── Reloj ── */}
        <View style={styles.floatCard}>
          <View style={styles.floatLabel}>
            <Ionicons name="time-outline" size={14} color="#2563EB" />
            <Text style={styles.floatLabelText}>Hora Actual</Text>
          </View>
          <View style={styles.clockCard}>
            <View style={styles.clockTextWrap}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                }}
              >
                <Text style={styles.clockTime}>
                  {formatRDTime(now).split(" ")[0]}
                </Text>
                <Text style={styles.clockAmPm}>
                  {" "}
                  {formatRDTime(now).split(" ").slice(1).join(" ")}
                </Text>
              </View>
              <Text style={styles.clockDate}>{formatRDDate(now)}</Text>
            </View>
          </View>
        </View>

        {/* ── Perfil + Horario ── */}
        <View style={styles.floatCard}>
          <View style={styles.floatLabel}>
            <Ionicons name="person-circle-outline" size={14} color="#2563EB" />
            <Text style={styles.floatLabelText}>Perfil - Time Control</Text>
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
                    style={{ width: 62, height: 62, borderRadius: 31 }}
                    onError={(e) =>
                      console.log("Error imagen:", e.nativeEvent.error)
                    }
                    onLoad={() => console.log("Imagen cargó OK")}
                  />
                ) : (
                  <Ionicons name="person" size={28} color="#9CA3AF" />
                )}
              </View>
            </View>

            {/* Info */}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {user?.user.fullName}
              </Text>

              {todaySchedule ? (
                <View style={styles.scheduleTable}>
                  <View style={styles.scheduleTableCol}>
                    <View style={styles.scheduleTableRow}>
                      <Ionicons name="time-outline" size={13} color="#2563EB" />
                      <Text style={styles.scheduleTableHeader}>Horario</Text>
                    </View>
                    <Text style={styles.scheduleTableValue}>
                      {to12h(todaySchedule.workEntryTime)} –
                    </Text>
                    <Text style={styles.scheduleTableValue}>
                      {to12h(todaySchedule.workExitTime)}
                    </Text>
                  </View>
                  {todaySchedule.lunchEntryTime && (
                    <View style={styles.scheduleTableCol}>
                      <View style={styles.scheduleTableRow}>
                        <Ionicons
                          name="restaurant-outline"
                          size={13}
                          color="#D97706"
                        />
                        <Text style={styles.scheduleTableHeader}>Almuerzo</Text>
                      </View>
                      <Text style={styles.scheduleTableValue}>
                        {to12h(todaySchedule.lunchEntryTime)} –
                      </Text>
                      <Text style={styles.scheduleTableValue}>
                        {to12h(todaySchedule.lunchExitTime ?? "")}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.profileScheduleRow}>
                  <Ionicons name="warning-outline" size={13} color="#D97706" />
                  <Text
                    style={[styles.profileScheduleText, { color: "#D97706" }]}
                  >
                    Sin horario configurado
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Categoría + Botón registrar (bloque unificado) ── */}
        <View style={styles.floatCard}>
          <View style={styles.floatLabel}>
            <Ionicons
              name="swap-horizontal-outline"
              size={14}
              color="#2563EB"
            />
            <Text style={styles.floatLabelText}>Reg. Entrada / Salida</Text>
          </View>
          <View style={styles.categories}>
            {visibleCategories.map((cat) => {
              const hasActive = getNextPunchType(cat) === "fin";
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
                    size={22}
                    color={selectedCategory === cat ? "#fff" : "#2563EB"}
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      selectedCategory === cat && styles.categoryTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                  {hasActive && <View style={styles.activeDot} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedCategory === "Break" && isInicio && breakTags.length > 0 && (
            <View style={styles.breakTagWrap}>
              <Text style={styles.breakTagLabel}>Motivo del break</Text>
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
                <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          {(selectedCategory !== "Jornada" ||
            isJornadaVisible(
              now,
              todaySchedule,
              getNextPunchType("Jornada") === "inicio",
              tolWorkIn,
              tolWorkOut,
              punches,
            )) && (
            <TouchableOpacity
              style={[
                styles.registerBtn,
                !isInicio && styles.registerBtnExit,
                loading && { opacity: 0.7 },
              ]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons
                    name={isInicio ? "log-in-outline" : "log-out-outline"}
                    size={26}
                    color="#fff"
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

        {/* ── Registros del día ── */}
        <View style={styles.floatCard}>
          <View style={styles.floatLabel}>
            <Ionicons name="list-outline" size={14} color="#2563EB" />
            <Text style={styles.floatLabelText}>Historial del Día</Text>
          </View>
          <TouchableOpacity
            onPress={fetchTodayPunches}
            style={[
              styles.refreshBtn,
              { alignSelf: "flex-end", marginBottom: 4 },
            ]}
          >
            <Ionicons name="refresh-outline" size={18} color="#2563EB" />
          </TouchableOpacity>
          {loadingPunches ? (
            <ActivityIndicator color="#2563EB" style={{ marginVertical: 16 }} />
          ) : punches.length === 0 ? (
            <View style={styles.emptyPunches}>
              <Ionicons name="time-outline" size={32} color="#D1D5DB" />
              <Text style={styles.emptyText}>Sin registros hoy</Text>
            </View>
          ) : (
            [...punches].reverse().map((punch) => {
              const hasOvertime = parseFloat(String(punch.overtime ?? 0)) > 0;
              // Solo FinJornada puede generar horas extras
              const isJornadaOvertime =
                punch.type === "FinJornada" && hasOvertime;
              // Puntualidad calculada localmente (corrige estados erróneos del backend)
              const punctuality = getPunctuality(punch, userSchedules, {
                workIn: tolWorkIn,
                workOut: tolWorkOut,
                lunchIn: tolLunchIn,
                lunchOut: tolLunchOut,
              });
              // Prioridad: horas extras > error de imagen > puntualidad local >
              // flags del backend (lateEntry/earlyExit) > status del backend
              const displayStatus = isJornadaOvertime
                ? "Horas extras"
                : punch.status === "Error de Imagen"
                  ? "Error de Imagen"
                  : punctuality !== null
                    ? punctuality
                    : punch.lateEntry
                      ? "Tardanza"
                      : punch.earlyExit
                        ? "Anticipada"
                        : punch.type === "FinBreak"
                          ? "A Tiempo"
                          : punch.status || "A Tiempo";
              const isLateBadge =
                displayStatus === "Tardanza" ||
                displayStatus === "Error de Imagen";
              const isEarlyBadge = displayStatus === "Anticipada";

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
                      name={
                        punch.type.startsWith("Inicio")
                          ? "log-in-outline"
                          : "log-out-outline"
                      }
                      size={16}
                      color={
                        isLateBadge
                          ? "#DC2626"
                          : isEarlyBadge
                            ? "#D97706"
                            : punch.type.startsWith("Inicio")
                              ? "#16A34A"
                              : isJornadaOvertime
                                ? "#2563EB"
                                : "#16A34A"
                      }
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
                    </View>
                  </View>
                  <Text style={styles.punchTime}>
                    {formatRDTimeShort(new Date(punch.createdDate))}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 40 },
  /* ── Clock ── */
  clockCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  clockTextWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  clockTime: {
    color: "#1D4ED8",
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 0.5,
    textAlign: "center",
    marginLeft: 25,
  },
  clockAmPm: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 4,
    color: "#142157",
  },
  clockDate: {
    color: "#3B82F6",
    fontSize: 11,
    marginTop: 1,
    textTransform: "capitalize",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  clockUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  clockUser: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  profileCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  profileCardTitle: { fontSize: 14, fontWeight: "600", color: "#2563EB" },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarWrap: { flexShrink: 0 },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#E5E7EB",
    borderWidth: 2,
    borderColor: "#DBEAFE",
  },
  avatarFallback: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#BFDBFE",
  },
  profileInfo: { flex: 1, gap: 4 },
  profileRoleText: { fontSize: 12, color: "#2563EB", fontWeight: "600" },
  profileName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.1,
  },
  profileScheduleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  profileScheduleText: { fontSize: 12, color: "#6B7280" },
  scheduleCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  noScheduleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  noScheduleText: { fontSize: 13, color: "#92400E" },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  scheduleTitle: { fontSize: 14, fontWeight: "600", color: "#1D4ED8" },
  scheduleItems: { gap: 4 },
  scheduleItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  scheduleText: { fontSize: 13, color: "#374151" },
  scheduleTable: {
    flexDirection: "row",
    gap: 16,
    marginTop: 6,
    alignItems: "center",
  },
  scheduleTableCol: { gap: 3 },
  scheduleTableRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  scheduleTableHeader: { fontSize: 11, fontWeight: "700", color: "#6B7280" },
  scheduleTableValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
    marginLeft: 13,
  },

  /* ── Floating label card ── */
  floatCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 18,
    marginTop: 8,
    elevation: 0,
  },
  floatLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    position: "absolute",
    top: -11,
    left: 14,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 7,
  },
  floatLabelText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2563EB",
    letterSpacing: 0.3,
    textTransform: "none",
  },
  floatLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    position: "relative",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    position: "absolute",
    right: 0,
    top: -6,
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#DC2626",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  categories: { flexDirection: "row", gap: 10 },
  categoryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F8FAFF",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    gap: 5,
    position: "relative",
  },
  categoryBtnActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  categoryText: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  categoryTextActive: { color: "#fff" },
  activeDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  registerBtn: {
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 12,
    backgroundColor: "#16A34A",
  },
  registerBtnExit: { backgroundColor: "#DC2626" },
  registerTextWrap: { alignItems: "center" },
  registerBtnText: {
    color: "#fff",
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
  emptyText: { fontSize: 14, color: "#9CA3AF" },
  punchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  punchIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  punchIconEntry: { backgroundColor: "#DCFCE7" },
  punchIconExit: { backgroundColor: "#DBEAFE" },
  punchIconExitOnTime: { backgroundColor: "#DCFCE7" },
  punchIconOvertime: { backgroundColor: "#DBEAFE" },
  punchIconEarly: { backgroundColor: "#FEF3C7" },
  punchIconError: { backgroundColor: "#FEE2E2" },
  punchInfo: { flex: 1, gap: 4 },
  punchType: { fontSize: 13, fontWeight: "700", color: "#111827" },
  punchBadgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  punchBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeOnTime: { backgroundColor: "#DCFCE7" },
  badgeLate: { backgroundColor: "#FEE2E2" },
  badgeEarly: { backgroundColor: "#FEF3C7" },
  punchBadgeText: { fontSize: 11, fontWeight: "700" },
  badgeLateEntry: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  badgeLateEntryText: { fontSize: 11, fontWeight: "700", color: "#D97706" },
  badgeOvertime: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  badgeOvertimeText: { fontSize: 11, fontWeight: "700", color: "#2563EB" },
  punchTime: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  modalHeaderEntry: { backgroundColor: "#16A34A" },
  modalHeaderExit: { backgroundColor: "#DC2626" },
  modalHeaderText: { fontSize: 18, fontWeight: "700", color: "#fff" },
  modalBody: { padding: 20, gap: 14 },
  modalRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  modalLabel: { fontSize: 14, color: "#6B7280", flex: 1 },
  modalValue: { fontSize: 14, fontWeight: "600", color: "#111827" },
  modalStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  modalStatusOnTime: { backgroundColor: "#DCFCE7" },
  modalStatusLate: { backgroundColor: "#FEE2E2" },
  modalStatusEarly: { backgroundColor: "#FEF3C7" },
  modalStatusText: { fontSize: 13, fontWeight: "700" },
  modalScheduleRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  modalScheduleRefText: { fontSize: 12, color: "#6B7280" },
  modalFooter: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#F3F4F6",
  },
  modalBtnCancelText: { fontSize: 15, color: "#6B7280", fontWeight: "500" },
  modalBtnConfirm: { flex: 1, paddingVertical: 16, alignItems: "center" },
  modalBtnEntry: { backgroundColor: "#F0FDF4" },
  modalBtnExit: { backgroundColor: "#FEF2F2" },
  modalBtnConfirmText: { fontSize: 15, fontWeight: "700" },
  /* NextDayExit Modal */
  ndModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  ndModalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  ndModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  ndModalIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#FFFBEB",
    alignItems: "center",
    justifyContent: "center",
  },
  ndModalTitle: { fontSize: 18, fontWeight: "700", color: "#333" },
  ndModalBody: { gap: 16 },
  ndModalMsg: { fontSize: 14, color: "#666", lineHeight: 22 },
  ndTimeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  ndTimeBtnText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  ndTimeBtnTextValue: { color: "#111827" },
  ndModalBtn: {
    marginTop: 8,
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  ndModalBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  /* Break tag selector */
  breakTagWrap: { marginTop: 12 },
  breakTagLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 6,
  },
  breakTagSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  breakTagSelectorText: { fontSize: 15, fontWeight: "600", color: "#9CA3AF" },
  breakTagSelectorTextValue: { color: "#111827" },
  breakTagOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  breakTagOptionText: { fontSize: 15, fontWeight: "600", color: "#111827" },
});
