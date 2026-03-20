import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSchoolStore } from "../../../store/useSchoolStore";

type Category = "Jornada" | "Almuerzo" | "Break";

interface UserSchedule {
  id: number;
  weekDay: string;
  workEntryTime: string;
  workExitTime: string;
  lunchEntryTime: string | null;
  lunchExitTime: string | null;
  toleranceWorkTimeIn?: number;
  toleranceLunchTimeIn?: number;
  toleranceWorkTimeOut?: number;
  toleranceLunchTimeOut?: number;
}

interface PunchEvent {
  id: number;
  type: string;
  status: string;
  createdDate: string;
  lateEntry?: boolean;
  earlyExit?: boolean;
  overtime?: number | string;
  toleranceMinutes?: number | null;
}

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

function getStatusForEntry(
  now: Date,
  entryTimeStr: string,
  toleranceMinutes = 0,
): "A Tiempo" | "Tardanza" | "Anticipada" {
  const diff = getRDMinutes(now) - timeStrToMinutes(entryTimeStr);
  if (diff > toleranceMinutes) return "Tardanza";
  if (diff < -toleranceMinutes) return "Anticipada";
  return "A Tiempo";
}

function getStatusForExit(
  now: Date,
  exitTimeStr: string,
  toleranceMinutes = 0,
): "A Tiempo" | "Anticipada" {
  const diff = timeStrToMinutes(exitTimeStr) - getRDMinutes(now);
  // diff > 0 = salió antes de su hora
  // diff < 0 = salió después de su hora (horas extras) → A Tiempo
  // diff > toleranceMinutes = salió demasiado antes → Anticipada
  if (diff <= 0) return "A Tiempo"; // salió después o exacto → A Tiempo
  return diff > toleranceMinutes ? "Anticipada" : "A Tiempo";
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
        p.status !== "Error de Imagen",
    );
  return last?.type === "InicioJornada";
}

function isAlmuerzoVisible(
  now: Date,
  schedule: UserSchedule | null,
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
  const windowStart = timeStrToMinutes(schedule.lunchEntryTime) - 5;
  const windowEnd = timeStrToMinutes(schedule.lunchExitTime) + 5;

  return current >= windowStart && current <= windowEnd;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PunchInOut() {
  const [now, setNow] = useState(new Date());
  const [selectedCategory, setSelectedCategory] = useState<Category>("Jornada");
  const [punches, setPunches] = useState<PunchEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPunches, setLoadingPunches] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [phoneImagen, setPhoneImagen] = useState<string | null>(null);

  const { user, urlColegio, logout } = useSchoolStore();
  const userSchedules: UserSchedule[] = (user as any)?.userSchedules ?? [];
  const todaySchedule = getTodaySchedule(userSchedules, now);
  const jornadaIniciada = isJornadaActiva(punches);

  // Tolerancias: primero del schedule, luego del user, luego default 15
  const tolWorkIn =
    todaySchedule?.toleranceWorkTimeIn ??
    (user as any)?.toleranceWorkTimeIn ??
    0;
  const tolWorkOut =
    todaySchedule?.toleranceWorkTimeOut ??
    (user as any)?.toleranceWorkTimeOut ??
    0;
  const tolLunchIn =
    todaySchedule?.toleranceLunchTimeIn ??
    (user as any)?.toleranceLunchTimeIn ??
    0;
  const tolLunchOut =
    todaySchedule?.toleranceLunchTimeOut ??
    (user as any)?.toleranceLunchTimeOut ??
    0;
  console.log("[Tolerancias]", {
    tolWorkIn,
    tolWorkOut,
    tolLunchIn,
    tolLunchOut,
    todaySchedule,
  });

  // Datos del usuario autenticado
  const userName: string = (user as any)?.name
    ? `${(user as any).name}${(user as any)?.lastName ? " " + (user as any).lastName : ""}`
    : ((user as any)?.username ?? "Usuario");
  const userCode: string =
    (user as any)?.code ?? (user as any)?.employeeCode ?? "";

  const getToken = useCallback(async (): Promise<string | null> => {
    const storeToken = useSchoolStore.getState().token;
    if (storeToken) return storeToken;
    return await SecureStore.getItemAsync("token");
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert("Cerrar sesión", "¿Estás seguro de que deseas cerrar sesión?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          await SecureStore.deleteItemAsync("token");
          logout();
        },
      },
    ]);
  }, [logout]);

  // Reloj en tiempo real — tick cada segundo
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      const foto = await SecureStore.getItemAsync("photourl");
      console.log("photourl:", foto);
      setPhoneImagen(foto);
    };
    loadData();
  }, []);

  // Si la categoría seleccionada deja de ser visible → volver a Jornada
  useEffect(() => {
    if (
      selectedCategory === "Almuerzo" &&
      !isAlmuerzoVisible(now, todaySchedule, punches)
    ) {
      setSelectedCategory("Jornada");
    }
  }, [now, punches, todaySchedule, selectedCategory]);

  const fetchTodayPunches = useCallback(async () => {
    try {
      setLoadingPunches(true);
      const token = await getToken();
      if (!urlColegio || !token) return;
      const response = await axios.get(`${urlColegio}/punches/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) {
        setPunches(response.data.data ?? []);
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

  const getEntryStatus = (): string => {
    if (selectedCategory === "Break") return "A Tiempo";

    if (!isInicio) {
      if (selectedCategory === "Jornada" && todaySchedule?.workExitTime)
        return getStatusForExit(now, todaySchedule.workExitTime, tolWorkOut);
      if (selectedCategory === "Almuerzo" && todaySchedule?.lunchExitTime)
        return getStatusForExit(now, todaySchedule.lunchExitTime, tolLunchOut);
      return "A Tiempo";
    }

    if (selectedCategory === "Jornada" && todaySchedule?.workEntryTime)
      return getStatusForEntry(now, todaySchedule.workEntryTime, tolWorkIn);
    if (selectedCategory === "Almuerzo" && todaySchedule?.lunchEntryTime)
      return getStatusForEntry(now, todaySchedule.lunchEntryTime, tolLunchIn);

    return "A Tiempo";
  };

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
    const status2 = selectedCategory === "Break" ? undefined : getEntryStatus();

    let photo = null;

    // ── Solo pedir foto en entradas ──
    if (isInicio) {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permiso requerido",
          "Necesitas permitir el acceso a la galería para registrar tu asistencia.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.4,
        base64: true,
      });

      if (result.canceled) return;
      photo = result.assets[0];
    }

    setLoading(true);
    try {
      const payload: Record<string, any> = { type };
      if (status2 !== undefined) payload.status = status2;
      if (photo?.base64) payload.photourl = [photo.base64];

      const response = await axios.post(`${urlColegio}/punches`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.data.success) {
        await fetchTodayPunches();
        // ── Si el punch fue creado pero con Error de Imagen ──
        if (response.data.data?.status === "Error de Imagen") {
          Alert.alert(
            "Verificación fallida",
            "Tu rostro no coincide con el registrado. No se pudo iniciar la jornada. Intenta de nuevo o contacta al administrador.",
          );
          return;
        }
        Alert.alert(
          "Registrado",
          `${getPunchTypeLabel(type)} registrado correctamente.`,
        );
      } else {
        Alert.alert("Error", response.data.message ?? "Intenta de nuevo.");
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message ?? "Error de conexión.";
      Alert.alert("Error", typeof msg === "string" ? msg : JSON.stringify(msg));
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
      return isAlmuerzoVisible(now, todaySchedule, punches);
    return true;
  });

  return (
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
          <Ionicons name="swap-horizontal-outline" size={14} color="#2563EB" />
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
                <Text style={styles.registerBtnSub}>({selectedCategory})</Text>
              </View>
            </>
          )}
        </TouchableOpacity>
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
          [...punches].reverse().map((punch) => (
            <View key={punch.id} style={styles.punchRow}>
              <View
                style={[
                  styles.punchIcon,
                  punch.status === "Error de Imagen" ||
                  punch.status === "Tardanza"
                    ? styles.punchIconError
                    : punch.status === "Anticipada"
                      ? styles.punchIconEarly
                      : punch.type.startsWith("Inicio")
                        ? styles.punchIconEntry
                        : parseFloat(String(punch.overtime ?? 0)) > 0
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
                    punch.status === "Error de Imagen" ||
                    punch.status === "Tardanza"
                      ? "#DC2626"
                      : punch.status === "Anticipada"
                        ? "#D97706"
                        : punch.type.startsWith("Inicio")
                          ? "#16A34A"
                          : parseFloat(String(punch.overtime ?? 0)) > 0
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
                  {punch.type.startsWith("Fin") &&
                  parseFloat(String(punch.overtime ?? 0)) > 0 ? (
                    /* Salida con overtime → solo "Horas extras", el status es irrelevante */
                    <View style={styles.badgeOvertime}>
                      <Text style={styles.badgeOvertimeText}>Horas extras</Text>
                    </View>
                  ) : (
                    /* Sin overtime → mostrar status normal */
                    punch.status && (
                      <View
                        style={[
                          styles.punchBadge,
                          punch.status === "Tardanza"
                            ? styles.badgeLate
                            : punch.status === "Anticipada"
                              ? styles.badgeEarly
                              : punch.status === "Error de Imagen"
                                ? styles.badgeLate
                                : styles.badgeOnTime,
                        ]}
                      >
                        <Text
                          style={[
                            styles.punchBadgeText,
                            { color: getStatusColor(punch.status) },
                          ]}
                        >
                          {punch.status}
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
          ))
        )}
      </View>
    </ScrollView>
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
});
