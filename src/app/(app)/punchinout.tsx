import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { storageDeleteItem, storageGetItem } from "../../utils/storage";

type Category = "Jornada" | "Almuerzo" | "Break";

const CATEGORY_ICONS: Record<Category, keyof typeof Ionicons.glyphMap> = {
  Jornada: "briefcase-outline",
  Almuerzo: "restaurant-outline",
  Break: "cafe-outline",
};

export default function PunchInOut() {
  const [now, setNow] = useState(new Date());
  const [selectedCategory, setSelectedCategory] = useState<Category>("Jornada");

  const { user, urlColegio, logout } = useSchoolStore();
  const userSchedules: UserSchedule[] = (user as any)?.userSchedules ?? [];
  const todaySchedule = getTodaySchedule(userSchedules, now);
  const jornadaIniciada = isJornadaActiva(punches);

  // Tolerancias: del schedule, luego de school.settings, luego fallback
  const schoolSettings = (user as any)?.school?.settings;
  const isImageRequired: boolean = schoolSettings?.isImageRequired ?? false;
  const tolWorkIn = 1;
  const tolWorkOut = 1;
  const tolLunchIn = 1;
  const tolLunchOut = 1;

  // Datos del usuario autenticado
  const userName: string = (user as any)?.name
    ? `${(user as any).name}${(user as any)?.lastName ? " " + (user as any).lastName : ""}`
    : ((user as any)?.username ?? "Usuario");
  const userCode: string =
    (user as any)?.code ?? (user as any)?.employeeCode ?? "";

  const getToken = useCallback(async (): Promise<string | null> => {
    const storeToken = useSchoolStore.getState().token;
    if (storeToken) return storeToken;
    return await storageGetItem("token");
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert("Cerrar sesión", "¿Estás seguro de que deseas cerrar sesión?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          await Promise.all([
            storageDeleteItem("token"),
            storageDeleteItem("user"),
            storageDeleteItem("menuItems"),
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
      storageDeleteItem("token"),
      storageDeleteItem("user"),
      storageDeleteItem("menuItems"),
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
    const initialSchedulesJson = JSON.stringify(
      (user as any)?.userSchedules ?? [],
    );
    const schoolId = (user as any)?.school?.id;
    const baseUrl = urlColegio;
    let alertShown = false;

    if (!schoolId || !baseUrl) return;

    const checkScheduleChange = async () => {
      if (alertShown) return;
      try {
        // Leer token directo de SecureStore — evita race condition con el store
        const token = await storageGetItem("token");
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

<<<<<<< Updated upstream
  const timeStr = now.toLocaleTimeString("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const dateStr = now.toLocaleDateString("es-DO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
=======
  useEffect(() => {
    const loadData = async () => {
      const foto = await storageGetItem("photourl");
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
    if (selectedCategory === "Almuerzo") return "A Tiempo";

    return "A Tiempo";
  };

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
      const response = await axios.post(
        `${urlColegio}/punches`,
        {
          type: "FinJornada",
          status: "A Tiempo",
          recordedDate: String(nextDayExitTime.trim()),
          nextDayExit: true,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
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

    // ── Foto solo si el perfil la requiere y es entrada ──
    if (isInicio && isImageRequired) {
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
      if (todaySchedule) payload.schedule = todaySchedule;

      const response = await axios.post(`${urlColegio}/punches`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.data.success) {
        await fetchTodayPunches();
      } else {
        const msg: string = response.data.message ?? "Intenta de nuevo.";
        if (msg.includes("InicioJornada activo")) {
          // Jornada del día anterior sin cerrar → mostrar modal
          setNextDayExitModal(true);
        } else if (msg.includes("cambios en el horario")) {
          Alert.alert(
            "Horario modificado",
            msg,
            [{ text: "Aceptar", onPress: forceLogout }],
            { cancelable: false },
          );
        } else {
          Alert.alert("Error", msg);
        }
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
    if (cat === "Jornada") return true;
    return true;
>>>>>>> Stashed changes
  });

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Reloj */}
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

      {/* Categorías */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Seleccionar Categoría</Text>
        <View style={styles.categories}>
          {(["Jornada", "Almuerzo", "Break"] as Category[]).map((cat) => (
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
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Botón registro */}
      <TouchableOpacity style={styles.registerBtn} activeOpacity={0.85}>
        <Ionicons name="log-in-outline" size={26} color="#fff" />
        <View style={styles.registerTextWrap}>
          <Text style={styles.registerBtnText}>Registrar Entrada</Text>
          <Text style={styles.registerBtnSub}>({selectedCategory})</Text>
        </View>
      </TouchableOpacity>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  categories: { flexDirection: "row", gap: 10 },
  categoryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    gap: 6,
  },
  categoryBtnActive: { backgroundColor: "#2563EB" },
  categoryText: { fontSize: 12, fontWeight: "500", color: "#6B7280" },
  categoryTextActive: { color: "#fff" },
  registerBtn: {
    backgroundColor: "#16A34A",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  registerTextWrap: { alignItems: "center" },
  registerBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  registerBtnSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    marginTop: 2,
  },
});
