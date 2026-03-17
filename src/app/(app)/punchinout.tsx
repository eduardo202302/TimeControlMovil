import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
}

interface PunchEvent {
  id: number;
  type: string;
  status: string;
  createdDate: string;
  lateEntry?: boolean;
  overtime?: number;
}

const TIMEZONE = "America/Santo_Domingo";

const WEEK_DAYS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
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

function getRDDayIndex(now: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: TIMEZONE,
  });
  const day = formatter.format(now);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[day] ?? now.getDay();
}

function getTodaySchedule(
  schedules: UserSchedule[],
  now: Date,
): UserSchedule | null {
  const todayName = WEEK_DAYS[getRDDayIndex(now)];
  return schedules.find((s) => s.weekDay === todayName) ?? null;
}

function getRDMinutes(now: Date): number {
  const rdTimeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIMEZONE,
  });
  const [h, m] = rdTimeStr.split(":").map(Number);
  return h * 60 + m;
}

function timeStrToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function getStatusForEntry(
  now: Date,
  entryTimeStr: string,
  toleranceMinutes: number = 5,
): "A Tiempo" | "Tardanza" {
  const diff = getRDMinutes(now) - timeStrToMinutes(entryTimeStr);
  return diff > toleranceMinutes ? "Tardanza" : "A Tiempo";
}

function getStatusForExit(
  now: Date,
  exitTimeStr: string,
  toleranceMinutes: number = 5,
): "A Tiempo" | "Anticipada" {
  const diff = timeStrToMinutes(exitTimeStr) - getRDMinutes(now);
  return diff > toleranceMinutes ? "Anticipada" : "A Tiempo";
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: TIMEZONE,
  });
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
  if (status === "A tiempo") return "A tiempo";
  return status;
}

function isJornadaActiva(punches: PunchEvent[]): boolean {
  const lastJornada = [...punches]
    .reverse()
    .find((p) => p.type === "InicioJornada" || p.type === "FinJornada");

  return lastJornada?.type === "InicioJornada";
}

export default function PunchInOut() {
  const [now, setNow] = useState(new Date());
  const [selectedCategory, setSelectedCategory] = useState<Category>("Jornada");
  const [punches, setPunches] = useState<PunchEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPunches, setLoadingPunches] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    type: string;
    status: string | undefined;
    isInicio: boolean;
    category: Category;
  } | null>(null);

  const { user, urlColegio } = useSchoolStore();
  const userSchedules: UserSchedule[] = (user as any)?.userSchedules ?? [];
  const todaySchedule = getTodaySchedule(userSchedules, now);
  const jornadaActiva = isJornadaActiva(punches);
  const getToken = useCallback(async (): Promise<string | null> => {
    const storeToken = useSchoolStore.getState().token;
    if (storeToken) return storeToken;
    return await SecureStore.getItemAsync("token");
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: TIMEZONE,
  });

  const dateStr = now.toLocaleDateString("es-DO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIMEZONE,
  });

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
      .find((p) => p.type === types.inicio || p.type === types.fin);
    if (!last) return "inicio";
    return last.type === types.inicio ? "fin" : "inicio";
  };

  const isInicio = getNextPunchType(selectedCategory) === "inicio";
  const jornadaIniciada = isJornadaActiva(punches);

  const getEntryStatus = (): string => {
    // Break nunca manda status
    if (selectedCategory === "Break") return "A Tiempo";

    if (!isInicio) {
      // Salidas
      if (selectedCategory === "Jornada" && todaySchedule?.workExitTime)
        return getStatusForExit(now, todaySchedule.workExitTime);
      if (selectedCategory === "Almuerzo" && todaySchedule?.lunchExitTime)
        return getStatusForExit(now, todaySchedule.lunchExitTime);
      return "A Tiempo";
    }

    // Entradas
    if (selectedCategory === "Jornada" && todaySchedule?.workEntryTime)
      return getStatusForEntry(now, todaySchedule.workEntryTime);

    // InicioAlmuerzo → "A tiempo" o "Tardanza"
    if (selectedCategory === "Almuerzo" && todaySchedule?.lunchEntryTime)
      return getStatusForEntry(now, todaySchedule.lunchEntryTime);

    return "A Tiempo";
  };

  const handleRegister = async () => {
    const token = await getToken();
    if (!urlColegio || !token) {
      Alert.alert("Error", "No hay conexión activa.");
      return;
    }

    // Validar que haya jornada activa para Almuerzo y Break
    if (
      !jornadaIniciada &&
      (selectedCategory === "Almuerzo" || selectedCategory === "Break")
    ) {
      Alert.alert("Acción no permitida", "Debes iniciar la jornada primero.");
      return;
    }

    const types = PUNCH_TYPE_MAP[selectedCategory];
    const type = isInicio ? types.inicio : types.fin;
    const isBreak = selectedCategory === "Break";
    const status = isBreak ? undefined : getEntryStatus();

    setConfirmModal({
      visible: true,
      type,
      status,
      isInicio,
      category: selectedCategory,
    });
  };

  const handleConfirm = async () => {
    if (!confirmModal) return;
    const token = await getToken();
    if (!urlColegio || !token) return;
    setConfirmModal((prev) => (prev ? { ...prev, visible: false } : null));
    setLoading(true);
    try {
      const payload: Record<string, any> = { type: confirmModal.type };
      if (confirmModal.status !== undefined)
        payload.status = confirmModal.status;

      console.log("PAYLOAD:", JSON.stringify(payload));

      const response = await axios.post(`${urlColegio}/punches`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log("RESPONSE:", JSON.stringify(response.data));

      if (response.data.success) {
        await fetchTodayPunches();
        Alert.alert(
          "Registrado",
          `${getPunchTypeLabel(confirmModal.type)} registrado correctamente.`,
        );
      } else {
        Alert.alert("Error", response.data.message ?? "Intenta de nuevo.");
      }
    } catch (error: any) {
      console.log("ERROR COMPLETO:", JSON.stringify(error?.response?.data));
      const msg = error?.response?.data?.message ?? "Error de conexión.";
      Alert.alert("Error", typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

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
      <View style={styles.clockCard}>
        <View style={styles.clockRow}>
          <Ionicons
            name="time-outline"
            size={20}
            color="rgba(255,255,255,0.85)"
          />
          <Text style={styles.clockLabel}>Hora Actual</Text>
        </View>
        <Text style={styles.clockTime}>{timeStr}</Text>
        <Text style={styles.clockDate}>{dateStr}</Text>
      </View>

      {todaySchedule ? (
        <View style={styles.scheduleCard}>
          <View style={styles.scheduleRow}>
            <Ionicons name="calendar-outline" size={16} color="#2563EB" />
            <Text style={styles.scheduleTitle}>Horario de hoy</Text>
          </View>
          <View style={styles.scheduleItems}>
            <View style={styles.scheduleItem}>
              <Ionicons name="log-in-outline" size={14} color="#16A34A" />
              <Text style={styles.scheduleText}>
                Entrada: {todaySchedule.workEntryTime?.slice(0, 5)}
              </Text>
            </View>
            <View style={styles.scheduleItem}>
              <Ionicons name="log-out-outline" size={14} color="#DC2626" />
              <Text style={styles.scheduleText}>
                Salida: {todaySchedule.workExitTime?.slice(0, 5)}
              </Text>
            </View>
            {todaySchedule.lunchEntryTime && (
              <View style={styles.scheduleItem}>
                <Ionicons name="restaurant-outline" size={14} color="#D97706" />
                <Text style={styles.scheduleText}>
                  Almuerzo: {todaySchedule.lunchEntryTime.slice(0, 5)} -{" "}
                  {todaySchedule.lunchExitTime?.slice(0, 5)}
                </Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.noScheduleCard}>
          <Ionicons name="warning-outline" size={16} color="#D97706" />
          <Text style={styles.noScheduleText}>
            Sin horario configurado para hoy
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Seleccionar Categoría</Text>
        <View style={styles.categories}>
          {(["Jornada", "Almuerzo", "Break"] as Category[])
            .filter((cat) => {
              if (!jornadaIniciada && (cat === "Almuerzo" || cat === "Break")) {
                return false;
              }
              return true;
            })
            .map((cat) => {
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
                    color={selectedCategory === cat ? "#fff" : "#6B7280"}
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
                {isInicio ? "Registrar Entrada" : "Registrar Salida"}
              </Text>
              <Text style={styles.registerBtnSub}>({selectedCategory})</Text>
            </View>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>Registros de Hoy</Text>
          <TouchableOpacity
            onPress={fetchTodayPunches}
            style={styles.refreshBtn}
          >
            <Ionicons name="refresh-outline" size={18} color="#2563EB" />
          </TouchableOpacity>
        </View>
        {loadingPunches ? (
          <ActivityIndicator color="#2563EB" style={{ marginVertical: 16 }} />
        ) : punches.length === 0 ? (
          <View style={styles.emptyPunches}>
            <Ionicons name="time-outline" size={32} color="#D1D5DB" />
            <Text style={styles.emptyText}>Sin registros hoy</Text>
          </View>
        ) : (
          punches.map((punch) => (
            <View key={punch.id} style={styles.punchRow}>
              <View
                style={[
                  styles.punchIcon,
                  punch.type.startsWith("Inicio")
                    ? styles.punchIconEntry
                    : styles.punchIconExit,
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
                    punch.type.startsWith("Inicio") ? "#16A34A" : "#DC2626"
                  }
                />
              </View>
              <View style={styles.punchInfo}>
                <Text style={styles.punchType}>
                  {getPunchTypeLabel(punch.type)}
                </Text>
                <View style={styles.punchBadgeRow}>
                  {punch.status && (
                    <View
                      style={[
                        styles.punchBadge,
                        punch.status === "Tardanza"
                          ? styles.badgeLate
                          : punch.status === "Anticipada"
                            ? styles.badgeEarly
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
                  )}
                  {punch.lateEntry && (
                    <View style={styles.badgeLateEntry}>
                      <Text style={styles.badgeLateEntryText}>Tardanza</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={styles.punchTime}>
                {formatTime(punch.createdDate)}
              </Text>
            </View>
          ))
        )}
      </View>

      {confirmModal && (
        <Modal
          visible={confirmModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmModal(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View
                style={[
                  styles.modalHeader,
                  confirmModal.isInicio
                    ? styles.modalHeaderEntry
                    : styles.modalHeaderExit,
                ]}
              >
                <Ionicons
                  name={
                    confirmModal.isInicio ? "log-in-outline" : "log-out-outline"
                  }
                  size={28}
                  color="#fff"
                />
                <Text style={styles.modalHeaderText}>
                  {confirmModal.isInicio
                    ? "Registrar Entrada"
                    : "Registrar Salida"}
                </Text>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.modalRow}>
                  <Ionicons
                    name={CATEGORY_ICONS[confirmModal.category]}
                    size={18}
                    color="#6B7280"
                  />
                  <Text style={styles.modalLabel}>Categoría</Text>
                  <Text style={styles.modalValue}>{confirmModal.category}</Text>
                </View>

                <View style={styles.modalRow}>
                  <Ionicons name="time-outline" size={18} color="#6B7280" />
                  <Text style={styles.modalLabel}>Hora</Text>
                  <Text style={styles.modalValue}>
                    {now.toLocaleTimeString("es-DO", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                      timeZone: TIMEZONE,
                    })}
                  </Text>
                </View>

                {/* Estado */}
                {confirmModal.status && (
                  <View style={styles.modalRow}>
                    <Ionicons
                      name={getStatusIcon(confirmModal.status)}
                      size={18}
                      color={getStatusColor(confirmModal.status)}
                    />
                    <Text style={styles.modalLabel}>Estado</Text>
                    <View
                      style={[
                        styles.modalStatusBadge,
                        confirmModal.status === "Tardanza"
                          ? styles.modalStatusLate
                          : confirmModal.status === "Anticipada"
                            ? styles.modalStatusEarly
                            : styles.modalStatusOnTime,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalStatusText,
                          { color: getStatusColor(confirmModal.status) },
                        ]}
                      >
                        {getStatusLabel(confirmModal.status)}
                      </Text>
                    </View>
                  </View>
                )}

                {todaySchedule &&
                  confirmModal.isInicio &&
                  confirmModal.category === "Jornada" &&
                  todaySchedule.workEntryTime && (
                    <View style={styles.modalScheduleRef}>
                      <Ionicons
                        name="information-circle-outline"
                        size={14}
                        color="#6B7280"
                      />
                      <Text style={styles.modalScheduleRefText}>
                        Hora de entrada:{" "}
                        {todaySchedule.workEntryTime.slice(0, 5)}
                      </Text>
                    </View>
                  )}

                {todaySchedule &&
                  !confirmModal.isInicio &&
                  confirmModal.category === "Jornada" &&
                  todaySchedule.workExitTime && (
                    <View style={styles.modalScheduleRef}>
                      <Ionicons
                        name="information-circle-outline"
                        size={14}
                        color="#6B7280"
                      />
                      <Text style={styles.modalScheduleRefText}>
                        Hora de salida: {todaySchedule.workExitTime.slice(0, 5)}
                      </Text>
                    </View>
                  )}

                {todaySchedule &&
                  confirmModal.isInicio &&
                  confirmModal.category === "Almuerzo" &&
                  todaySchedule.lunchEntryTime && (
                    <View style={styles.modalScheduleRef}>
                      <Ionicons
                        name="information-circle-outline"
                        size={14}
                        color="#6B7280"
                      />
                      <Text style={styles.modalScheduleRefText}>
                        Hora de almuerzo:{" "}
                        {todaySchedule.lunchEntryTime.slice(0, 5)}
                      </Text>
                    </View>
                  )}

                {todaySchedule &&
                  !confirmModal.isInicio &&
                  confirmModal.category === "Almuerzo" &&
                  todaySchedule.lunchExitTime && (
                    <View style={styles.modalScheduleRef}>
                      <Ionicons
                        name="information-circle-outline"
                        size={14}
                        color="#6B7280"
                      />
                      <Text style={styles.modalScheduleRefText}>
                        Fin de almuerzo:{" "}
                        {todaySchedule.lunchExitTime.slice(0, 5)}
                      </Text>
                    </View>
                  )}
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setConfirmModal(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalBtnConfirm,
                    confirmModal.isInicio
                      ? styles.modalBtnEntry
                      : styles.modalBtnExit,
                  ]}
                  onPress={handleConfirm}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.modalBtnConfirmText,
                      { color: confirmModal.isInicio ? "#16A34A" : "#DC2626" },
                    ]}
                  >
                    Confirmar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  clockCard: {
    backgroundColor: "#2563EB",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  clockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  clockLabel: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "500",
  },
  clockTime: {
    color: "#fff",
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 1,
    lineHeight: 48,
  },
  clockDate: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginTop: 4,
    textTransform: "capitalize",
  },
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
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    gap: 4,
    position: "relative",
  },
  categoryBtnActive: { backgroundColor: "#2563EB" },
  categoryText: { fontSize: 12, fontWeight: "500", color: "#6B7280" },
  categoryTextActive: { color: "#fff" },
  activeDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16A34A",
  },
  registerBtn: {
    backgroundColor: "#16A34A",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    elevation: 4,
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  registerBtnExit: { backgroundColor: "#DC2626", shadowColor: "#DC2626" },
  registerTextWrap: { alignItems: "center" },
  registerBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  registerBtnSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    marginTop: 2,
  },
  emptyPunches: { alignItems: "center", paddingVertical: 20, gap: 8 },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
  punchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
  },
  punchIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  punchIconEntry: { backgroundColor: "#DCFCE7" },
  punchIconExit: { backgroundColor: "#FEE2E2" },
  punchInfo: { flex: 1, gap: 4 },
  punchType: { fontSize: 13, fontWeight: "600", color: "#111827" },
  punchBadgeRow: { flexDirection: "row", gap: 6 },
  punchBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeOnTime: { backgroundColor: "#DCFCE7" },
  badgeLate: { backgroundColor: "#FEE2E2" },
  badgeEarly: { backgroundColor: "#FEF3C7" },
  punchBadgeText: { fontSize: 11, fontWeight: "600" },
  badgeLateEntry: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  badgeLateEntryText: { fontSize: 11, fontWeight: "600", color: "#D97706" },
  punchTime: { fontSize: 13, fontWeight: "600", color: "#374151" },
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
