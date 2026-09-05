import { APP_BACKGROUND } from "@/constants/colors";
import {
  MAX_CONTENT_WIDTH,
  RADIUS_2XL,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  RADIUS_SM,
  RADIUS_XL,
  useResponsive,
} from "@/constants/responsive";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSchoolStore } from "../../../store/useSchoolStore";
import {
  createAdminPunch,
  daysElapsedRD,
  fetchEmployeePunchPanel,
  fetchOpenWorkdaysAdmin,
  formatEmployeeContact,
  getAdminPunchDay,
  getHistoryEvents,
  getNextAdminAction,
  getOpenWorkdayDate,
  getSuggestedPunchTime,
  identifyEmployeeByPhoto,
  isAdminBreakEnabled,
  searchEmployees,
  buildAdminCreatedDate,
  type AdminCategory,
  type AdminPunchPanel,
  type EmployeeOption,
  type OpenWorkdayRow,
} from "../../utils/adminPunchRules";
import {
  getBreakTagCategoryId,
  getScheduleForDay,
  getStatusColor,
  tagsOfCategory,
  toRD,
  WEEK_DAYS,
  type Tag,
} from "../../utils/punchRules";
import * as Storage from "../../utils/storage";

/**
 * Ponche ADM — un administrador registra la entrada/salida de OTRO empleado.
 * Calcado de /adm/adminpunchinout del webapp, redistribuido en dos estados
 * verticales (buscar empleado → panel del empleado) en vez de las dos columnas
 * de escritorio.
 *
 * Toda la lógica de negocio (payload, guard de hora futura, qué acción toca)
 * vive en src/utils/adminPunchRules.ts, testeada con jest. Acá solo hay estado
 * de UI y render.
 *
 * El acceso a esta pantalla lo controla ÚNICAMENTE el menú dinámico del
 * backend (ítem "Acceso Adm. tc"): ningún endpoint de este flujo valida rol
 * server-side, y no se agregan chequeos de rol hardcodeados.
 */

/** Host de las fotos de perfil — mismo que ya usan punchinout.tsx y DrawerMenu.tsx. */
const PHOTO_HOST = "https://timecontrol.wsmax.net:8600";

/** Debounce del buscador — evita un GET /users por cada tecla. */
const SEARCH_DEBOUNCE_MS = 400;

/** Mínimo de caracteres antes de consultar al backend. */
const SEARCH_MIN_CHARS = 2;

const HISTORY_COLLAPSED_LIMIT = 3;

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

const CATEGORY_ICONS: Record<AdminCategory, keyof typeof Ionicons.glyphMap> = {
  Jornada: "briefcase-outline",
  Break: "cafe-outline",
};

/**
 * Las 3 métricas de cada fila de "No finalizaron Jornada". Se declaran como
 * datos y no como tres bloques de JSX repetidos para que el ícono, el label y
 * el color no puedan quedar desalineados entre columnas.
 *
 * `key` apunta a un campo numérico de OpenWorkdayRow — el tipo obliga a que
 * exista, así que renombrarlo en las rules rompe acá en compilación.
 */
const METRICS: {
  key: "entradas" | "salidas" | "diasTrans";
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  circleStyle: "metricIconEntry" | "metricIconExit" | "metricIconDays";
}[] = [
  {
    key: "entradas",
    label: "Entradas",
    icon: "enter-outline",
    color: "#16A34A",
    circleStyle: "metricIconEntry",
  },
  {
    key: "salidas",
    label: "Salidas",
    icon: "exit-outline",
    color: "#DC2626",
    circleStyle: "metricIconExit",
  },
  {
    key: "diasTrans",
    label: "Días Trans.",
    icon: "calendar-outline",
    color: "#7C3AED",
    circleStyle: "metricIconDays",
  },
];

/**
 * Nombres legibles de cada tipo de ponche. Las variantes Adicional/FH/Extra
 * existen en el backend (UserPunchEvents/handlers.js) y sin entrada acá el
 * fallback mostraría el identificador crudo, p. ej. "FinJornadaAdicional".
 */
const PUNCH_TYPE_LABELS: Record<string, string> = {
  InicioJornada: "Entrada Jornada",
  FinJornada: "Fin Jornada",
  InicioJornadaAdicional: "Inicio Jornada Adicional",
  FinJornadaAdicional: "Fin Jornada Adicional",
  InicioJornadaFH: "Inicio Jornada FH",
  FinJornadaFH: "Fin Jornada FH",
  InicioJornadaExtra: "Inicio Jornada Extra",
  FinJornadaExtra: "Fin Jornada Extra",
  InicioAlmuerzo: "Entrada Almuerzo",
  FinAlmuerzo: "Fin Almuerzo",
  InicioBreak: "Inicio Break",
  FinBreak: "Fin Break",
};

// ─── Formato ──────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** "08:45 a. m." desde una hora "HH:mm:ss" del horario. */
function to12h(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${h < 12 ? "a. m." : "p. m."}`;
}

/** "08:45 a. m." desde un instante, leído en RD. */
function formatRDTimeShort(date: Date): string {
  const { hours, minutes } = toRD(date);
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(h12)}:${pad(minutes)} ${hours < 12 ? "a. m." : "p. m."}`;
}

/** "08/06/2026" — formato del título del historial, calcado del webapp. */
function formatRDDateNumeric(date: Date): string {
  const { year, month, day } = toRD(date);
  return `${pad(day)}/${pad(month + 1)}/${year}`;
}

/** "miércoles, 3 de septiembre" */
function formatRDDateShort(date: Date): string {
  const { weekDay, day, month } = toRD(date);
  return `${WEEK_DAYS[weekDay]}, ${day} de ${MONTH_NAMES[month]}`;
}

function getPunchTypeLabel(type: string): string {
  return PUNCH_TYPE_LABELS[type] ?? type;
}

/** Una foto puede venir como ruta relativa del backend o como URL absoluta de S3. */
function photoUri(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${PHOTO_HOST}/${raw}`;
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────

export default function AdminPunchInOutScreen() {
  const { isTablet, scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { urlColegio, user, school } = useSchoolStore();

  const getToken = useCallback(async (): Promise<string | null> => {
    const storeToken = useSchoolStore.getState().token;
    if (storeToken) return storeToken;
    return await Storage.getItemAsync("token");
  }, []);

  // ── Estado "sin empleado seleccionado" ──
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EmployeeOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [openRows, setOpenRows] = useState<OpenWorkdayRow[]>([]);
  const [loadingOpenRows, setLoadingOpenRows] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);

  // ── Estado "empleado seleccionado" ──
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [panel, setPanel] = useState<AdminPunchPanel | null>(null);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [category, setCategory] = useState<AdminCategory>("Jornada");
  const [pickedTime, setPickedTime] = useState<Date>(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [historyShowAll, setHistoryShowAll] = useState(false);

  // El día del ponche es SIEMPRE el de la jornada en curso (hoy). Solo la hora
  // es editable — igual que el webapp.
  const today = useMemo(() => new Date(), []);

  // ── Motivos del break ──
  // La categoría sale de la config de la escuela
  // (settings.categoryDefaultIds.catBreakTypeId), la misma fuente que usa el
  // backend para su propio listado de break tags. Sin fallback: si no está
  // configurada, el picker queda vacío en vez de ofrecer tags de otra
  // categoría.
  const breakTagCategoryId = useMemo(() => {
    const settings =
      (user as any)?.school?.settings ?? school?.settings ?? undefined;
    return getBreakTagCategoryId(settings);
  }, [user, school]);

  const breakTags = useMemo(
    () => tagsOfCategory(allTags, breakTagCategoryId),
    [allTags, breakTagCategoryId],
  );

  // ── Carga de la lista "No finalizaron Jornada" ──
  const loadOpenRows = useCallback(async () => {
    const token = await getToken();
    if (!urlColegio || !token) {
      setLoadingOpenRows(false);
      setRefreshing(false);
      return;
    }
    try {
      setOpenRows(await fetchOpenWorkdaysAdmin({ token, urlColegio }));
    } finally {
      setLoadingOpenRows(false);
      setRefreshing(false);
    }
  }, [urlColegio, getToken]);

  useEffect(() => {
    loadOpenRows();
  }, [loadOpenRows]);

  // ── Catálogo de tags — se trae fresco al entrar, igual que en punchinout ──
  useEffect(() => {
    let cancelled = false;
    const loadTags = async () => {
      const token = await getToken();
      if (!urlColegio || !token) return;
      try {
        const response = await axios.get(`${urlColegio}/tags/all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled || !response.data?.success) return;
        setAllTags((response.data.data as Tag[]) ?? []);
      } catch (error: any) {
        console.error(
          "adminPunch fetchTags:",
          error?.response?.data?.message ?? error?.message,
        );
      }
    };
    loadTags();
    return () => {
      cancelled = true;
    };
  }, [urlColegio, getToken]);

  // ── Buscador ──
  // `searchSeq` descarta las respuestas de una búsqueda ya superada por otra
  // más nueva: con resultados en vivo por cada tecla, dos requests en vuelo
  // pueden volver desordenados y dejar en pantalla los de la consulta vieja.
  const searchSeq = useRef(0);

  const runSearch = useCallback(
    async (term: string) => {
      const trimmed = term.trim();
      const seq = ++searchSeq.current;
      if (trimmed.length < SEARCH_MIN_CHARS) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      const token = await getToken();
      if (!urlColegio || !token) {
        setSearching(false);
        return;
      }
      // Sin filtro de rol: se muestra todo lo que devuelve el backend
      // (empleados y admins por igual) — decisión confirmada.
      const found = await searchEmployees({ token, urlColegio, query: trimmed });
      if (seq !== searchSeq.current) return;
      setResults(found);
      setSearching(false);
    },
    [urlColegio, getToken],
  );

  // Resultados en vivo: cada tecla reprograma el debounce.
  useEffect(() => {
    if (!selectorVisible) return;
    const timer = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, selectorVisible, runSearch]);

  // ── Panel del empleado seleccionado ──
  const loadPanel = useCallback(
    async (schoolUserId: number) => {
      const token = await getToken();
      if (!urlColegio || !token) return;
      setLoadingPanel(true);
      try {
        setPanel(
          await fetchEmployeePunchPanel({ token, urlColegio, schoolUserId }),
        );
      } finally {
        setLoadingPanel(false);
      }
    },
    [urlColegio, getToken],
  );

  /**
   * Pasa el modal al paso "panel". NO cierra el modal: los dos pasos
   * (búsqueda → panel) viven dentro del mismo Modal.
   */
  const selectEmployee = useCallback(
    (option: EmployeeOption) => {
      setEmployee(option);
      setPanel(null);
      setCategory("Jornada");
      setSelectedTagId(null);
      setPickedTime(new Date());
      setHistoryShowAll(false);
      loadPanel(option.schoolUserId);
    },
    [loadPanel],
  );

  /** Deja el paso de búsqueda en blanco — badge en "Cant. 0" y lista vacía. */
  const resetSearch = useCallback(() => {
    // Invalida cualquier respuesta en vuelo: si una búsqueda anterior vuelve
    // después del reset, `searchSeq` la descarta en vez de repoblar la lista.
    searchSeq.current++;
    setQuery("");
    setResults([]);
    setSearching(false);
  }, []);

  /** Botón idle → abre el modal en el paso de búsqueda. */
  const openSelector = useCallback(() => {
    resetSearch();
    setEmployee(null);
    setPanel(null);
    setSelectorVisible(true);
  }, [resetSearch]);

  /**
   * Fila de "No finalizaron Jornada" → abre el MISMO modal, pero directo en el
   * paso "panel", salteando la búsqueda.
   */
  const openPanelFor = useCallback(
    (option: EmployeeOption) => {
      resetSearch();
      setSelectorVisible(true);
      selectEmployee(option);
    },
    [resetSearch, selectEmployee],
  );

  /** Volver a la búsqueda SIN cerrar el modal, para elegir a otra persona. */
  const backToSearch = useCallback(() => {
    setEmployee(null);
    setPanel(null);
    setSelectedTagId(null);
    setConfirmVisible(false);
    resetSearch();
  }, [resetSearch]);

  /**
   * X o back del sistema → siempre vuelve a la pantalla idle, sin importar en
   * qué paso interno estuviera el modal.
   */
  const closeSelector = useCallback(() => {
    setSelectorVisible(false);
    setConfirmVisible(false);
    setTagModalVisible(false);
    setShowTimePicker(false);
    setEmployee(null);
    setPanel(null);
    setSelectedTagId(null);
    resetSearch();
  }, [resetSearch]);

  // El motivo no debe sobrevivir un cambio de pestaña — mismo criterio que
  // punchinout.tsx con selectedBreakTagId.
  useEffect(() => {
    setSelectedTagId(null);
  }, [category]);

  // ── Reconocimiento facial ──
  const handleIdentifyByPhoto = useCallback(async () => {
    const token = await getToken();
    if (!urlColegio || !token) {
      Alert.alert("Error", "No hay conexión activa.");
      return;
    }
    let photo: ImagePicker.ImagePickerAsset | null = null;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permiso requerido",
          "Necesitas permitir el acceso a la galería para identificar al empleado.",
        );
        return;
      }
      // Mismos parámetros de captura que el ponchador normal — el backend
      // espera el mismo base64 en `photourl`.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.4,
        base64: true,
      });
      if (result.canceled) return;
      photo = result.assets[0] ?? null;
    } catch (error) {
      console.error("adminPunch captura imagen:", error);
      Alert.alert("Error de Imagen", "No se pudo capturar la imagen.");
      return;
    }

    if (!photo?.base64) {
      Alert.alert("Foto requerida", "No se pudo leer la imagen seleccionada.");
      return;
    }

    setIdentifying(true);
    try {
      const found = await identifyEmployeeByPhoto({
        token,
        urlColegio,
        photoBase64: photo.base64,
      });
      if (!found) {
        Alert.alert(
          "Sin coincidencia",
          "No se pudo identificar a ningún empleado con esa foto.",
        );
        return;
      }
      selectEmployee(found);
    } finally {
      setIdentifying(false);
    }
  }, [urlColegio, getToken, selectEmployee]);

  // ── Hora editable, con guard de futuro ──
  const handleTimeChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === "android") {
        setShowTimePicker(false);
        if (event.type !== "set" || !date) return;
      }
      if (!date) return;
      // Cualquier hora es válida, incluida una futura: el backend no lo valida
      // y el webapp tampoco lo restringe. Mismo comportamiento que la
      // plataforma de referencia.
      setPickedTime(date);
    },
    [],
  );

  // ── Derivados del panel ──
  const nextAction = useMemo(
    () => getNextAdminAction(panel, category),
    [panel, category],
  );
  const breakEnabled = useMemo(() => isAdminBreakEnabled(panel), [panel]);
  const todaySchedule = useMemo(
    () => getScheduleForDay(panel?.userSchedules ?? [], today),
    [panel, today],
  );
  /**
   * Historial: con una jornada abierta de un día anterior son SUS eventos
   * (openDayEvents), no los de hoy — si no, el historial queda vacío justo
   * cuando hace falta ver qué pasó ese día.
   */
  const historyEvents = useMemo(() => getHistoryEvents(panel), [panel]);
  const openWorkdayDate = useMemo(() => getOpenWorkdayDate(panel), [panel]);

  /** "Historial del día viernes, 4 de septiembre - 2 días" cuando hay jornada abierta. */
  const historyTitle = useMemo(() => {
    if (!openWorkdayDate) return "Historial del Día";
    const days = daysElapsedRD(openWorkdayDate, new Date());
    return `Historial del día ${formatRDDateNumeric(openWorkdayDate)} - ${days} ${
      days === 1 ? "día" : "días"
    }`;
  }, [openWorkdayDate]);

  /**
   * Hora inicial del picker. Va en un efecto y no en selectEmployee porque el
   * horario del empleado llega DESPUÉS: al elegirlo todavía no hay panel, así
   * que la sugerencia solo se puede calcular cuando el fetch responde. Se
   * recalcula también al cambiar de pestaña, que es cuando cambia la acción.
   */
  useEffect(() => {
    setPickedTime(getSuggestedPunchTime(panel, nextAction, new Date()));
  }, [panel, nextAction]);
  /**
   * El día del ponche NO siempre es hoy: cerrar una jornada abierta de un día
   * anterior tiene que llevar la fecha de esa jornada, o el backend lo rechaza
   * por fecha que no coincide.
   */
  const createdDate = useMemo(
    () =>
      buildAdminCreatedDate(
        getAdminPunchDay(panel, nextAction, today),
        pickedTime,
      ),
    [panel, nextAction, today, pickedTime],
  );
  const selectedTagName =
    breakTags.find((t) => t.id === selectedTagId)?.name ?? null;

  // Si el Break deja de estar disponible (jornada cerrada), volver a Jornada.
  useEffect(() => {
    if (category === "Break" && !breakEnabled) setCategory("Jornada");
  }, [category, breakEnabled]);

  // ── Registro del ponche ──
  const handlePressRegister = useCallback(() => {
    if (nextAction.requiresTag && breakTags.length > 0 && !selectedTagId) {
      Alert.alert("Motivo requerido", "Selecciona el motivo del break.");
      return;
    }
    setConfirmVisible(true);
  }, [nextAction, breakTags.length, selectedTagId]);

  const handleConfirmRegister = useCallback(async () => {
    if (!employee) return;
    const token = await getToken();
    if (!urlColegio || !token) {
      Alert.alert("Error", "No hay conexión activa.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createAdminPunch({
        token,
        urlColegio,
        schoolUserId: employee.schoolUserId,
        type: nextAction.type,
        createdDate,
        tagId: nextAction.requiresTag ? selectedTagId : null,
      });

      if (!result.ok) {
        Alert.alert("Error", result.message ?? "Intenta de nuevo.");
        return;
      }

      setConfirmVisible(false);
      setSelectedTagId(null);
      setPickedTime(new Date());
      // Se refresca el MISMO panel — no se navega fuera.
      await loadPanel(employee.schoolUserId);
      loadOpenRows();

      if (result.status === "Fuera de área") {
        Alert.alert(
          "Ponche Registrado",
          "El ponche quedó registrado como 'Fuera de área'.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    employee,
    urlColegio,
    getToken,
    createdDate,
    nextAction,
    selectedTagId,
    loadPanel,
    loadOpenRows,
  ]);

  // ── Render ──
  const visibleHistory = historyShowAll
    ? [...historyEvents].reverse()
    : [...historyEvents].reverse().slice(0, HISTORY_COLLAPSED_LIMIT);

  return (
    <View style={styles.root}>
      {/* ── Modal único: búsqueda → panel del empleado ── */}
      <Modal
        visible={selectorVisible}
        transparent
        animationType="fade"
        onRequestClose={closeSelector}
      >
        <View style={styles.selectorOverlay}>
          <View style={styles.selectorCard}>
            {employee ? (
              <>
                {/* Header del paso "panel" — la vuelta a la búsqueda vive en
                    el botón etiquetado del card, no en una flecha suelta. */}
                <View style={styles.selectorHeader}>
                  <View style={styles.selectorHeaderIcon}>
                    <Ionicons
                      name="person-circle-outline"
                      size={22}
                      color="#2563EB"
                    />
                  </View>
                  <Text style={styles.selectorTitle} numberOfLines={1}>
                    Registrar Acceso
                  </Text>
                  <TouchableOpacity
                    onPress={closeSelector}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={22} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.selectorList}
                  contentContainerStyle={styles.panelScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/* ── Empleado seleccionado ── */}
                  <View style={styles.floatCard}>
                    <TouchableOpacity
                      style={styles.backRow}
                      onPress={backToSearch}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="arrow-back" size={18} color="#2563EB" />
                      <Text style={styles.backText}>Cambiar empleado</Text>
                    </TouchableOpacity>

                    <View style={styles.employeeHeader}>
                      <View style={styles.avatarContainer}>
                        {photoUri(employee.photourl) ? (
                          <Image
                            source={{ uri: photoUri(employee.photourl) as string }}
                            style={styles.avatarImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <Ionicons name="person" size={30} color="#9CA3AF" />
                        )}
                      </View>
                      <View style={styles.employeeInfo}>
                        <Text style={styles.employeeName} numberOfLines={2}>
                          {employee.fullName}
                        </Text>
                        {!!employee.roleName && (
                          <View style={styles.rolePill}>
                            <Text style={styles.rolePillText}>
                              {employee.roleName}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.employeeMeta}>
                          ID {employee.schoolUserId}
                          {employee.code ? ` · ${employee.code}` : ""}
                        </Text>
                      </View>
                    </View>

                    {loadingPanel ? (
                      <ActivityIndicator color="#2563EB" style={styles.inlineLoader} />
                    ) : todaySchedule ? (
                      <View style={styles.scheduleTable}>
                        <View
                          style={[styles.scheduleCol, styles.scheduleColWork]}
                        >
                          <View style={styles.scheduleColHead}>
                            <Ionicons name="time-outline" size={14} color="#2563EB" />
                            <Text style={[styles.scheduleLabel, styles.scheduleLabelWork]}>
                              Horario
                            </Text>
                          </View>
                          <Text style={styles.scheduleValue}>
                            {to12h(todaySchedule.workEntryTime)} –{" "}
                            {to12h(todaySchedule.workExitTime)}
                          </Text>
                        </View>
                        {!!todaySchedule.lunchEntryTime && (
                          <View
                            style={[styles.scheduleCol, styles.scheduleColLunch]}
                          >
                            <View style={styles.scheduleColHead}>
                              <Ionicons
                                name="restaurant-outline"
                                size={14}
                                color="#D97706"
                              />
                              <Text
                                style={[styles.scheduleLabel, styles.scheduleLabelLunch]}
                              >
                                Almuerzo
                              </Text>
                            </View>
                            <Text style={styles.scheduleValue}>
                              {to12h(todaySchedule.lunchEntryTime)} –{" "}
                              {to12h(todaySchedule.lunchExitTime)}
                            </Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <View style={styles.warnRow}>
                        <Ionicons name="warning-outline" size={14} color="#D97706" />
                        <Text style={styles.warnText}>Sin horario configurado</Text>
                      </View>
                    )}
                  </View>

                  {/* ── Reg. Entrada / Salida ── */}
                  <View style={styles.floatCard}>
                    <View style={styles.sectionHeaderRow}>
                      <Ionicons
                        name="swap-horizontal-outline"
                        size={18}
                        color="#2563EB"
                      />
                      <Text style={styles.sectionHeaderText}>
                        Reg. Entrada / Salida
                      </Text>
                    </View>

                    <View style={styles.tabs}>
                      {(["Jornada", "Break"] as AdminCategory[]).map((cat) => {
                        const disabled = cat === "Break" && !breakEnabled;
                        const active = category === cat;
                        return (
                          <TouchableOpacity
                            key={cat}
                            style={[
                              styles.tabBtn,
                              active && styles.tabBtnActive,
                              disabled && styles.tabBtnDisabled,
                            ]}
                            onPress={() => setCategory(cat)}
                            disabled={disabled}
                            activeOpacity={0.75}
                          >
                            <Ionicons
                              name={CATEGORY_ICONS[cat]}
                              size={20}
                              color={active ? "#fff" : disabled ? "#9CA3AF" : "#2563EB"}
                            />
                            <Text
                              style={[
                                styles.tabText,
                                active && styles.tabTextActive,
                                disabled && styles.tabTextDisabled,
                              ]}
                            >
                              {cat}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Hora editable */}
                    <Text style={styles.fieldLabel}>Hora del ponche</Text>
                    <TouchableOpacity
                      style={styles.timeSelector}
                      onPress={() => setShowTimePicker(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="time-outline" size={20} color="#2563EB" />
                      <Text style={styles.timeSelectorText}>
                        {formatRDTimeShort(pickedTime)}
                      </Text>
                      <Text style={styles.timeSelectorDate}>
                        {formatRDDateShort(today)}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                    </TouchableOpacity>

                    {/* Motivo del break */}
                    {nextAction.requiresTag && breakTags.length > 0 && (
                      <>
                        <Text style={styles.fieldLabel}>Motivo del break</Text>
                        <TouchableOpacity
                          style={styles.timeSelector}
                          onPress={() => setTagModalVisible(true)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="cafe-outline" size={20} color="#D97706" />
                          <Text
                            style={[
                              styles.tagSelectorText,
                              selectedTagName != null && styles.tagSelectorTextValue,
                            ]}
                          >
                            {selectedTagName ?? "Selecciona un motivo"}
                          </Text>
                          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                        </TouchableOpacity>
                      </>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.registerBtn,
                        nextAction.kind === "fin" && styles.registerBtnExit,
                        (loadingPanel || submitting) && styles.registerBtnDisabled,
                      ]}
                      onPress={handlePressRegister}
                      disabled={loadingPanel || submitting}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={
                          nextAction.kind === "inicio"
                            ? "log-in-outline"
                            : "log-out-outline"
                        }
                        size={24}
                        color="#fff"
                      />
                      <View style={styles.registerTextWrap}>
                        <Text style={styles.registerBtnText}>{nextAction.label}</Text>
                        <Text style={styles.registerBtnSub}>
                          ({nextAction.category})
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* ── Historial del día ── */}
                  <View style={styles.floatCard}>
                    <TouchableOpacity
                      style={styles.sectionHeaderToggle}
                      onPress={() => setHistoryExpanded((prev) => !prev)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.sectionHeaderRow}>
                        <Ionicons name="list-outline" size={18} color="#2563EB" />
                        <Text
                          style={styles.sectionHeaderText}
                          numberOfLines={2}
                        >
                          {historyTitle}
                        </Text>
                      </View>
                      <Ionicons
                        name={historyExpanded ? "chevron-up" : "chevron-down"}
                        size={16}
                        color="#2563EB"
                      />
                    </TouchableOpacity>

                    {historyExpanded && (
                      <>
                        {loadingPanel ? (
                          <ActivityIndicator
                            color="#2563EB"
                            style={styles.inlineLoader}
                          />
                        ) : historyEvents.length === 0 ? (
                          <View style={styles.emptyBlock}>
                            <Ionicons name="time-outline" size={30} color="#D1D5DB" />
                            <Text style={styles.emptyText}>Sin registros</Text>
                          </View>
                        ) : (
                          visibleHistory.map((punch) => {
                            // El color lo decide el ESTADO del ponche, no si es
                            // entrada o salida: una salida a tiempo y una
                            // tardanza no pueden verse igual. El ícono sigue
                            // saliendo del tipo.
                            const statusColor = getStatusColor(punch.status);
                            return (
                            <View key={punch.id} style={styles.punchRow}>
                              <View
                                style={[
                                  styles.punchIcon,
                                  // Mismo color del ícono al ~13% de opacidad:
                                  // el círculo acompaña al estado sin necesidad
                                  // de un mapa de tintes paralelo que mantener.
                                  { backgroundColor: `${statusColor}22` },
                                ]}
                              >
                                <Ionicons
                                  name={
                                    punch.type.includes("Break")
                                      ? "cafe-outline"
                                      : punch.type.includes("Almuerzo")
                                        ? "restaurant-outline"
                                        : "briefcase-outline"
                                  }
                                  size={16}
                                  color={statusColor}
                                />
                              </View>
                              <View style={styles.punchInfo}>
                                <Text style={styles.punchType}>
                                  {getPunchTypeLabel(punch.type)}
                                </Text>
                                {!!punch.status && (
                                  <Text style={styles.punchStatus}>
                                    {punch.status}
                                  </Text>
                                )}
                              </View>
                              <Text style={styles.punchTime}>
                                {formatRDTimeShort(new Date(punch.createdDate))}
                              </Text>
                            </View>
                            );
                          })
                        )}
                        {historyEvents.length > HISTORY_COLLAPSED_LIMIT && (
                          <TouchableOpacity
                            style={styles.historyToggleBtn}
                            onPress={() => setHistoryShowAll((prev) => !prev)}
                          >
                            <Text style={styles.historyToggleText}>
                              {historyShowAll
                                ? "Ver menos"
                                : `Ver todos (${historyEvents.length})`}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                </ScrollView>
              </>
            ) : (
              <>
              {/* Header: título + cantidad en vivo + cerrar */}
              <View style={styles.selectorHeader}>
                <View style={styles.selectorHeaderIcon}>
                  <Ionicons name="people-outline" size={22} color="#2563EB" />
                </View>
                <Text style={styles.selectorTitle}>Seleccionar Usuario</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    Cant. {results.length}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeSelector}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={22} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              {/* Búsqueda: input + limpiar + lupa + cámara */}
              <View style={styles.selectorSearchRow}>
                <View style={styles.searchInputWrap}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Nombre, cédula, email o código"
                    placeholderTextColor="#9CA3AF"
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                    autoFocus
                    returnKeyType="search"
                    onSubmitEditing={() => runSearch(query)}
                  />
                  {query.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setQuery("")}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </View>
                {/* La lupa dispara la búsqueda YA, sin esperar el debounce. */}
                <TouchableOpacity
                  style={styles.iconBtnPrimary}
                  onPress={() => runSearch(query)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="search" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtnAccent}
                  onPress={handleIdentifyByPhoto}
                  disabled={identifying}
                  activeOpacity={0.8}
                >
                  {identifying ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="camera-outline" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>

              {/* Resultados en vivo */}
              <ScrollView
                style={styles.selectorList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {searching ? (
                  <ActivityIndicator color="#2563EB" style={styles.inlineLoader} />
                ) : query.trim().length < SEARCH_MIN_CHARS ? (
                  <View style={styles.emptyBlock}>
                    <Ionicons name="search-outline" size={28} color="#D1D5DB" />
                    <Text style={styles.emptyText}>
                      Escribe al menos {SEARCH_MIN_CHARS} caracteres
                    </Text>
                  </View>
                ) : results.length === 0 ? (
                  <View style={styles.emptyBlock}>
                    <Ionicons name="person-outline" size={28} color="#D1D5DB" />
                    <Text style={styles.emptyText}>Sin resultados</Text>
                  </View>
                ) : (
                  results.map((option) => (
                    <TouchableOpacity
                      key={option.schoolUserId}
                      style={styles.resultRow}
                      onPress={() => selectEmployee(option)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.avatarSmall}>
                        {photoUri(option.photourl) ? (
                          <Image
                            source={{ uri: photoUri(option.photourl) as string }}
                            style={styles.avatarSmallImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <Ionicons name="person" size={18} color="#9CA3AF" />
                        )}
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultName} numberOfLines={2}>
                          {option.fullName}{" "}
                          <Text style={styles.resultId}>
                            (ID: {option.schoolUserId})
                          </Text>
                        </Text>
                        <Text style={styles.resultMeta} numberOfLines={2}>
                          {formatEmployeeContact(option)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              </>
            )}
          </View>
        </View>

        {/* ── Modal: motivo del break ── */}
        <Modal
          visible={tagModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setTagModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setTagModalVisible(false)}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalIconWrap}>
                  <Ionicons name="cafe-outline" size={22} color="#D97706" />
                </View>
                <Text style={styles.modalTitle}>Motivo del Break</Text>
              </View>
              <ScrollView style={styles.tagList}>
                {breakTags.map((tag) => (
                  <TouchableOpacity
                    key={tag.id}
                    style={styles.tagOption}
                    onPress={() => {
                      setSelectedTagId(tag.id);
                      setTagModalVisible(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.tagOptionText}>{tag.name}</Text>
                    {selectedTagId === tag.id && (
                      <Ionicons name="checkmark" size={18} color="#2563EB" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ── Modal: confirmación (No / Sí) ── */}
        <Modal
          visible={confirmVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalIconWrap}>
                  <Ionicons
                    name={
                      nextAction.kind === "inicio"
                        ? "log-in-outline"
                        : "log-out-outline"
                    }
                    size={22}
                    color="#2563EB"
                  />
                </View>
                <Text style={styles.modalTitle}>¿Está seguro?</Text>
              </View>
              <Text style={styles.modalMessage}>
                ¿Registrar{" "}
                <Text style={styles.modalMessageStrong}>
                  {nextAction.label} {nextAction.category}
                </Text>{" "}
                a{" "}
                <Text style={styles.modalMessageStrong}>
                  {employee?.fullName ?? ""}
                </Text>{" "}
                a las{" "}
                <Text style={styles.modalMessageStrong}>
                  {formatRDTimeShort(pickedTime)}
                </Text>
                ?
              </Text>
              {!!selectedTagName && (
                <Text style={styles.modalMessage}>
                  Motivo:{" "}
                  <Text style={styles.modalMessageStrong}>{selectedTagName}</Text>
                </Text>
              )}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={() => setConfirmVisible(false)}
                  disabled={submitting}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalBtnGhostText}>No</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={handleConfirmRegister}
                  disabled={submitting}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalBtnPrimaryText}>Sí</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {showTimePicker && (
          <DateTimePicker
            value={pickedTime}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={handleTimeChange}
          />
        )}
      </Modal>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isTablet && styles.contentTablet,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadOpenRows();
              if (employee) loadPanel(employee.schoolUserId);
            }}
            colors={["#2563EB"]}
          />
        }
      >
        {/* ── Único punto de entrada: abre el modal ── */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={openSelector}
          activeOpacity={0.85}
        >
          <View style={styles.primaryBtnIcon}>
            <Ionicons name="finger-print" size={20} color="#fff" />
          </View>
          <Text style={styles.primaryBtnText}>Registrar Acceso - ADM TC</Text>
        </TouchableOpacity>

        {/* ── No finalizaron Jornada ── */}
        <View style={styles.openSection}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="alert-circle-outline" size={18} color="#D97706" />
            <Text style={styles.sectionHeaderText}>No finalizaron Jornada</Text>
            {/* Se oculta en 0: el estado vacío ya dice que no queda nadie, y
                un "0" mientras carga sería un dato falso. */}
            {openRows.length > 0 && (
              <View style={styles.pendingPill}>
                <Ionicons name="alert-circle" size={14} color="#D97706" />
                <Text style={styles.pendingPillText}>
                  {openRows.length}{" "}
                  {openRows.length === 1 ? "pendiente" : "pendientes"}
                </Text>
              </View>
            )}
          </View>

          {loadingOpenRows ? (
            <View style={styles.floatCard}>
              <ActivityIndicator color="#2563EB" style={styles.inlineLoader} />
            </View>
          ) : openRows.length === 0 ? (
            <View style={styles.floatCard}>
              <View style={styles.emptyBlock}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={30}
                  color="#D1D5DB"
                />
                <Text style={styles.emptyText}>
                  Todos cerraron su jornada
                </Text>
              </View>
            </View>
          ) : (
            openRows.map((row) => (
              <TouchableOpacity
                key={row.punchId}
                style={styles.openCard}
                onPress={() =>
                  openPanelFor({
                    schoolUserId: row.schoolUserId,
                    fullName: row.fullName,
                    roleName: row.roleName,
                    code: row.code,
                    photourl: row.photourl,
                    email: row.email,
                    phone: row.phone,
                  })
                }
                activeOpacity={0.75}
              >
                {/* Identidad del usuario */}
                <View style={styles.openRowHeader}>
                  <View style={styles.avatarSmall}>
                    {photoUri(row.photourl) ? (
                      <Image
                        source={{ uri: photoUri(row.photourl) as string }}
                        style={styles.avatarSmallImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="person" size={18} color="#9CA3AF" />
                    )}
                  </View>
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {row.fullName}
                    </Text>
                    <Text style={styles.resultMeta} numberOfLines={1}>
                      {row.roleName}
                    </Text>
                    <Text style={styles.openRowDate}>
                      {formatRDDateShort(new Date(row.createdDate))} ·{" "}
                      {formatRDTimeShort(new Date(row.createdDate))}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </View>

                {/* Métricas: 3 columnas a lo ancho de la card */}
                <View style={styles.metricRow}>
                  {METRICS.map((metric) => (
                    <View key={metric.key} style={styles.metricCol}>
                      <View
                        style={[styles.metricIcon, styles[metric.circleStyle]]}
                      >
                        <Ionicons
                          name={metric.icon}
                          size={16}
                          color={metric.color}
                        />
                      </View>
                      <Text style={styles.metricLabel}>{metric.label}</Text>
                      <Text style={styles.metricValue}>{row[metric.key]}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

/** Lado del avatar del empleado seleccionado. Fuente única del View y la Image. */
const AVATAR_SIZE = 64;
/** Lado del avatar de las filas de lista. */
const AVATAR_SM_SIZE = 38;
/** Lado del círculo de ícono de cada métrica de "No finalizaron Jornada". */
const METRIC_ICON_SIZE = 32;
/** Lado del círculo de ícono dentro del botón "Registrar Acceso - ADM TC". */
const PRIMARY_BTN_ICON_SIZE = 34;

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: APP_BACKGROUND },
    content: {
      padding: scale(16),
      gap: verticalScale(16),
      paddingBottom: verticalScale(40),
    },
    /**
     * Centra y limita el contenido en tablet — mismo criterio que
     * contentTablet en punchinout.tsx. `width: "100%"` es necesario porque
     * alignSelf: "center" en un contentContainer colapsaría el ancho.
     */
    contentTablet: {
      maxWidth: MAX_CONTENT_WIDTH,
      alignSelf: "center",
      width: "100%",
    },
    floatCard: {
      backgroundColor: "#fff",
      borderRadius: RADIUS_XL,
      borderWidth: 1.5,
      borderColor: "#E5E7EB",
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(14),
      paddingBottom: verticalScale(14),
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
    },
    sectionHeaderToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionHeaderText: {
      fontSize: font(15),
      fontWeight: "700",
      color: "#142157",
    },
    inlineLoader: { marginVertical: verticalScale(16) },

    /* ── Entrada: botón que abre el modal ── */
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(10),
      backgroundColor: "#2563EB",
      borderRadius: RADIUS_LG,
      paddingVertical: verticalScale(12),
      // Elevación: lo despega del fondo y lo hace leer como control táctil.
      // Misma receta que selectorCard, con la sombra un poco más marcada
      // porque acá el contraste es azul sobre gris, no blanco sobre gris.
      elevation: 4,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
    },
    /**
     * Círculo translúcido detrás del ícono — es lo que le da profundidad al
     * botón: sobre el azul plano se lee como una capa por encima, no como un
     * glifo pegado al fondo. Lado fijo, mismo criterio que los avatares.
     */
    primaryBtnIcon: {
      width: PRIMARY_BTN_ICON_SIZE,
      height: PRIMARY_BTN_ICON_SIZE,
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: PRIMARY_BTN_ICON_SIZE / 2,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
    },
    primaryBtnText: { fontSize: font(16), fontWeight: "700", color: "#fff" },
    /**
     * Pill de pendientes, al final del header de la sección.
     *
     * `marginLeft: "auto"` la empuja contra el borde derecho sin tocar
     * sectionHeaderRow, que es compartido con las otras secciones. `alignSelf`
     * la centra verticalmente respecto al título.
     */
    pendingPill: {
      marginLeft: "auto",
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      backgroundColor: "#FEF3C7",
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(5),
    },
    pendingPillText: {
      fontSize: font(12),
      fontWeight: "700",
      color: "#D97706",
    },

    /* ── Modal selector de usuario ── */
    selectorOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: scale(20),
    },
    selectorCard: {
      width: "100%",
      // Mismo tope/criterio que el card de RevisionFinalModal.tsx.
      maxWidth: 440,
      maxHeight: "88%",
      backgroundColor: "#fff",
      borderRadius: RADIUS_2XL,
      padding: scale(20),
      elevation: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
    },
    selectorHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingBottom: verticalScale(14),
      borderBottomWidth: 1,
      borderBottomColor: "#F3F4F6",
    },
    /** Ícono de cabecera: tamaño fijo, mismo criterio que RevisionFinalModal.tsx. */
    selectorHeaderIcon: {
      width: 42,
      height: 42,
      borderRadius: RADIUS_LG,
      backgroundColor: "#EFF6FF",
      alignItems: "center",
      justifyContent: "center",
    },
    selectorTitle: {
      flex: 1,
      fontSize: font(17),
      fontWeight: "700",
      color: "#111827",
    },
    countBadge: {
      backgroundColor: "#EFF6FF",
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(4),
    },
    countBadgeText: {
      fontSize: font(12),
      fontWeight: "700",
      color: "#1D4ED8",
    },

    selectorSearchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      marginTop: verticalScale(14),
    },
    /** Botones cuadrados de ícono — lado fijo, mismo criterio que los avatares. */
    iconBtnPrimary: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#2563EB",
      borderRadius: RADIUS_MD,
    },
    iconBtnAccent: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#D97706",
      borderRadius: RADIUS_MD,
    },
    selectorList: { marginTop: verticalScale(6) },
    /** El panel dentro del modal no lleva el padding de pantalla, solo el gap
     *  entre sus cards — el card del modal ya aporta su propio padding. */
    panelScrollContent: {
      gap: verticalScale(14),
      paddingTop: verticalScale(8),
      paddingBottom: verticalScale(8),
    },
    searchInputWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      backgroundColor: "#F9FAFB",
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    searchInput: {
      flex: 1,
      fontSize: font(14),
      color: "#111827",
      // eslint-disable-next-line local/no-raw-numbers-in-stylesheet -- 0 resetea el padding por defecto del TextInput en Android, no es un valor de diseño
      padding: 0,
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingVertical: verticalScale(10),
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
    },
    resultInfo: { flex: 1 },
    resultName: {
      fontSize: font(14),
      fontWeight: "700",
      color: "#111827",
    },
    resultId: { fontWeight: "700", color: "#2563EB" },
    resultMeta: {
      fontSize: font(12),
      color: "#6B7280",
      marginTop: verticalScale(1),
    },

    /* ── No finalizaron Jornada ── */
    /** La sección ya no es UNA card con divisores: es un header suelto y una
     *  card independiente por empleado, separadas por este gap. */
    openSection: {
      gap: verticalScale(10),
      // Suma al gap del contentContainer: el botón quedaba muy pegado al
      // header. Va acá y no en el gap general para no separar todo lo demás.
      marginTop: verticalScale(14),
    },
    /**
     * Card por empleado. Mismo lenguaje visual que floatCard (fondo blanco,
     * borde sutil, RADIUS_XL) pero con padding vertical más corto: la fila
     * apila identidad + métricas, y con el aire de floatCard cada tarjeta
     * quedaba innecesariamente alta.
     */
    openCard: {
      backgroundColor: "#fff",
      borderRadius: RADIUS_XL,
      borderWidth: 1.5,
      borderColor: "#E5E7EB",
      paddingHorizontal: scale(14),
      paddingVertical: verticalScale(10),
    },
    openRowHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
    },
    openRowDate: {
      fontSize: font(11),
      color: "#D97706",
      marginTop: verticalScale(2),
      fontWeight: "600",
    },
    metricRow: {
      flexDirection: "row",
      marginTop: verticalScale(8),
      gap: scale(8),
    },
    metricCol: { flex: 1, alignItems: "center" },
    /** Círculo de ícono — lado fijo, mismo criterio que los avatares. */
    metricIcon: {
      width: METRIC_ICON_SIZE,
      height: METRIC_ICON_SIZE,
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: METRIC_ICON_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: verticalScale(2),
    },
    metricIconEntry: { backgroundColor: "#DCFCE7" },
    metricIconExit: { backgroundColor: "#FEE2E2" },
    metricIconDays: { backgroundColor: "#EDE9FE" },
    metricLabel: {
      fontSize: font(11),
      color: "#6B7280",
    },
    metricValue: {
      fontSize: font(16),
      fontWeight: "700",
      color: "#142157",
      marginTop: verticalScale(1),
    },

    /* ── Avatares ── */
    avatarContainer: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: "#F3F4F6",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: AVATAR_SIZE / 2,
    },
    avatarSmall: {
      width: AVATAR_SM_SIZE,
      height: AVATAR_SM_SIZE,
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: AVATAR_SM_SIZE / 2,
      backgroundColor: "#F3F4F6",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarSmallImage: {
      width: AVATAR_SM_SIZE,
      height: AVATAR_SM_SIZE,
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: AVATAR_SM_SIZE / 2,
    },

    /* ── Empleado seleccionado ── */
    backRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      marginBottom: verticalScale(12),
    },
    backText: {
      fontSize: font(13),
      fontWeight: "600",
      color: "#2563EB",
    },
    employeeHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(12),
    },
    employeeInfo: { flex: 1 },
    employeeName: {
      fontSize: font(17),
      fontWeight: "700",
      color: "#111827",
    },
    rolePill: {
      alignSelf: "flex-start",
      backgroundColor: "#EFF6FF",
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(2),
      marginTop: verticalScale(4),
    },
    rolePillText: {
      fontSize: font(11),
      fontWeight: "600",
      color: "#1D4ED8",
    },
    employeeMeta: {
      fontSize: font(12),
      color: "#6B7280",
      marginTop: verticalScale(4),
    },

    /* ── Horario / Almuerzo ── */
    scheduleTable: {
      flexDirection: "row",
      gap: scale(8),
      marginTop: verticalScale(14),
    },
    scheduleCol: {
      flex: 1,
      borderRadius: RADIUS_LG,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(10),
    },
    scheduleColWork: { backgroundColor: "#EFF6FF" },
    scheduleColLunch: { backgroundColor: "#FEF3C7" },
    scheduleColHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
    },
    scheduleLabel: { fontSize: font(12), fontWeight: "700" },
    scheduleLabelWork: { color: "#1D4ED8" },
    scheduleLabelLunch: { color: "#92400E" },
    scheduleValue: {
      fontSize: font(13),
      fontWeight: "600",
      color: "#111827",
      marginTop: verticalScale(4),
    },
    warnRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      marginTop: verticalScale(12),
    },
    warnText: { fontSize: font(12), color: "#D97706" },

    /* ── Tabs + acción ── */
    tabs: {
      flexDirection: "row",
      gap: scale(8),
      marginTop: verticalScale(12),
    },
    tabBtn: {
      flex: 1,
      alignItems: "center",
      gap: scale(4),
      backgroundColor: "#EFF6FF",
      borderRadius: RADIUS_LG,
      paddingVertical: verticalScale(12),
    },
    tabBtnActive: { backgroundColor: "#2563EB" },
    tabBtnDisabled: { backgroundColor: "#F3F4F6" },
    tabText: { fontSize: font(13), fontWeight: "600", color: "#2563EB" },
    tabTextActive: { color: "#fff" },
    tabTextDisabled: { color: "#9CA3AF" },
    fieldLabel: {
      fontSize: font(12),
      fontWeight: "600",
      color: "#6B7280",
      marginTop: verticalScale(14),
      marginBottom: verticalScale(6),
    },
    timeSelector: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      backgroundColor: "#F9FAFB",
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(12),
    },
    timeSelectorText: {
      fontSize: font(15),
      fontWeight: "700",
      color: "#111827",
    },
    timeSelectorDate: {
      flex: 1,
      fontSize: font(11),
      color: "#6B7280",
      textAlign: "right",
      marginRight: scale(6),
    },
    tagSelectorText: { flex: 1, fontSize: font(14), color: "#9CA3AF" },
    tagSelectorTextValue: { color: "#111827", fontWeight: "600" },
    registerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(10),
      backgroundColor: "#16A34A",
      borderRadius: RADIUS_LG,
      paddingVertical: verticalScale(15),
      marginTop: verticalScale(16),
    },
    registerBtnExit: { backgroundColor: "#2563EB" },
    registerBtnDisabled: { opacity: 0.6 },
    registerTextWrap: { flexDirection: "row", alignItems: "baseline", gap: scale(6) },
    registerBtnText: { fontSize: font(16), fontWeight: "700", color: "#fff" },
    registerBtnSub: { fontSize: font(12), color: "rgba(255,255,255,0.85)" },

    /* ── Historial ── */
    punchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingVertical: verticalScale(10),
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
    },
    /** Círculo de ícono — lado fijo, mismo criterio que los avatares. */
    punchIcon: {
      width: 32,
      height: 32,
      // eslint-disable-next-line local/no-raw-numbers-in-stylesheet -- círculo (mitad del lado fijo), no un radio de diseño
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    punchInfo: { flex: 1 },
    punchType: { fontSize: font(13), fontWeight: "600", color: "#111827" },
    punchStatus: {
      fontSize: font(11),
      color: "#6B7280",
      marginTop: verticalScale(1),
    },
    punchTime: { fontSize: font(13), fontWeight: "700", color: "#142157" },
    historyToggleBtn: {
      alignItems: "center",
      paddingVertical: verticalScale(10),
    },
    historyToggleText: {
      fontSize: font(13),
      fontWeight: "600",
      color: "#2563EB",
    },
    emptyBlock: {
      alignItems: "center",
      gap: scale(6),
      paddingVertical: verticalScale(20),
    },
    emptyText: { fontSize: font(13), color: "#9CA3AF" },

    /* ── Modales ── */
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: scale(24),
    },
    modalCard: {
      width: "100%",
      // Tope en tablet — mismo valor/criterio que los modales de
      // punchinout.tsx y DrawerMenu.tsx.
      maxWidth: 400,
      backgroundColor: "#fff",
      borderRadius: RADIUS_XL,
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(20),
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      marginBottom: verticalScale(14),
    },
    /** Círculo de ícono del encabezado — lado fijo. */
    modalIconWrap: {
      width: 40,
      height: 40,
      // eslint-disable-next-line local/no-raw-numbers-in-stylesheet -- círculo (mitad del lado fijo), no un radio de diseño
      borderRadius: 20,
      backgroundColor: "#F3F4F6",
      alignItems: "center",
      justifyContent: "center",
    },
    modalTitle: { fontSize: font(16), fontWeight: "700", color: "#111827" },
    modalMessage: {
      fontSize: font(14),
      color: "#374151",
      lineHeight: font(21),
    },
    modalMessageStrong: { fontWeight: "700", color: "#111827" },
    modalActions: {
      flexDirection: "row",
      gap: scale(10),
      marginTop: verticalScale(20),
    },
    modalBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_MD,
      paddingVertical: verticalScale(12),
    },
    modalBtnGhost: {
      backgroundColor: "#F3F4F6",
    },
    modalBtnGhostText: {
      fontSize: font(15),
      fontWeight: "700",
      color: "#6B7280",
    },
    modalBtnPrimary: { backgroundColor: "#2563EB" },
    modalBtnPrimaryText: {
      fontSize: font(15),
      fontWeight: "700",
      color: "#fff",
    },
    /** Tope de alto del listado de motivos — evita un modal a pantalla completa. */
    tagList: { maxHeight: 280 },
    tagOption: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: verticalScale(12),
      paddingHorizontal: scale(4),
      borderRadius: RADIUS_SM,
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
    },
    tagOptionText: { fontSize: font(14), color: "#111827" },
  });
}
