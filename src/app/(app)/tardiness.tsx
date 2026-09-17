import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { ArrowLeft, Camera, Search, User, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  APP_BACKGROUND,
  CARD_BACKGROUND,
  CARD_BORDER,
  FOOTER_BORDER,
  INPUT_BORDER,
  PRIMARY_COLOR,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";
import {
  RADIUS_2XL,
  RADIUS_LG,
  RADIUS_MD,
  useResponsive,
} from "@/constants/responsive";
import { useSchoolStore } from "../../../store/useSchoolStore";
import TardinessParentsCard from "../../components/faceclass/TardinessParentsCard";
import TardinessTrafficLight from "../../components/faceclass/TardinessTrafficLight";
import * as Storage from "../../utils/storage";
import {
  createTardiness,
  getStudentTardiness,
  identifyStudentByFace,
  pad2,
  searchStudents,
  type StudentDetail,
  type StudentOption,
} from "../../utils/tardinessRules";

/**
 * Tardanzas (Face Class) — registra la entrada tardía de un estudiante.
 * Calcado de /tardiness del webapp (TardinessCrud).
 *
 * Vista única con las 3 cards SIEMPRE visibles (como el webapp): Estudiante
 * (buscador + ficha del seleccionado), Tardanzas (semáforo, vacío hasta
 * elegir estudiante) y Padres / Tutores. Sin estudiante, el footer queda
 * deshabilitado.
 *
 * Toda la lógica de red vive en src/utils/tardinessRules.ts (testeada con
 * jest); acá solo hay estado de UI y render.
 */

/** Host de las fotos de perfil — mismo host que ya usa el resto de la app. */
const PHOTO_HOST = "https://timecontrol.wsmax.net:8600";

/** Debounce del buscador — evita un GET /students por cada tecla. */
const SEARCH_DEBOUNCE_MS = 400;

/** Mínimo de caracteres antes de consultar al backend. */
const SEARCH_MIN_CHARS = 2;

/** Regex de "HH:mm" para el input de hora manual. */
const HH_MM_PATTERN = /^\d{1,2}:\d{2}$/;

export default function Tardanza() {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { urlColegio, companySettings } = useSchoolStore();

  /**
   * Mismo default real que el webapp para leer la config de UI (3). El
   * backend decide su propio default al guardar — no se duplica acá, la
   * pantalla solo manda los valores que ya tiene.
   */
  const daysLateAbsence = companySettings?.daysLateAbsence ?? 3;
  /** "Manual" muestra el input de hora editable; "Automatica" usa la hora actual. */
  const tardinessMode = companySettings?.tardinessMode ?? "Automatica";

  const getToken = useCallback(async (): Promise<string | null> => {
    const storeToken = useSchoolStore.getState().token;
    if (storeToken) return storeToken;
    return await Storage.getItemAsync("token");
  }, []);

  // ── Paso "búsqueda" ──
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [identifying, setIdentifying] = useState(false);

  // ── Paso "panel" ──
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [time, setTime] = useState(() => nowHHMM(new Date()));

  // ── Buscador ──
  // `searchSeq` descarta las respuestas de una búsqueda ya superada por otra
  // más nueva — mismatch de requests en vuelo con resultados en vivo.
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
      const found = await searchStudents(trimmed, { token, urlColegio });
      if (seq !== searchSeq.current) return;
      setResults(found);
      setSearching(false);
    },
    [urlColegio, getToken],
  );

  useEffect(() => {
    if (student) return;
    const timer = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, student, runSearch]);

  /** Acceso rápido dentro de la card Estudiante: limpia la selección y muestra
   * de nuevo los resultados de la última búsqueda (sin resetear el buscador). */
  const clearStudent = useCallback(() => {
    setStudent(null);
    setLoadingPanel(false);
    setSubmitting(false);
  }, []);

  // ── Selección ──
  /** Paso "panel": ajusta la hora pendiente a "ahora" y pinta la ficha. */
  const openPanel = useCallback((detail: StudentDetail) => {
    setStudent(detail);
    setLoadingPanel(false);
    setTime(nowHHMM(new Date()));
  }, []);

  /** Desde un resultado del buscador (texto): el panel necesita el historial. */
  const selectById = useCallback(
    async (option: StudentOption) => {
      const token = await getToken();
      if (!urlColegio || !token) {
        Alert.alert("Error", "No hay conexión activa.");
        return;
      }
      // Ficha inmediata con historial vacío; el fetch completo lo reemplaza.
      setStudent({
        ...option,
        tardiness: [],
        tardinessCount: 0,
      });
      setLoadingPanel(true);
      setTime(nowHHMM(new Date()));
      const detail = await getStudentTardiness(option.id, {
        token,
        urlColegio,
      });
      if (detail) {
        setStudent(detail);
      } else {
        Alert.alert(
          "Sin historial",
          "No se pudo cargar el historial del estudiante. La tardanza se registrará igualmente.",
        );
      }
      setLoadingPanel(false);
    },
    [urlColegio, getToken],
  );

  // ── Reconocimiento facial ──
  const handleIdentifyByPhoto = useCallback(async () => {
    const token = await getToken();
    if (!urlColegio || !token) {
      Alert.alert("Error", "No hay conexión activa.");
      return;
    }
    let photo: ImagePicker.ImagePickerAsset | null = null;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permiso requerido",
          "Necesitas permitir el acceso a la cámara para identificar al estudiante.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.4,
        base64: true,
      });
      if (result.canceled) return;
      photo = result.assets[0] ?? null;
    } catch (error) {
      console.error("tardiness captura imagen:", error);
      Alert.alert("Error de Imagen", "No se pudo capturar la imagen.");
      return;
    }

    if (!photo?.base64) {
      Alert.alert("Foto requerida", "No se pudo leer la imagen seleccionada.");
      return;
    }

    setIdentifying(true);
    try {
      const result = await identifyStudentByFace(photo.base64, {
        token,
        urlColegio,
      });
      if (result.ok) {
        openPanel(result.data.student);
      } else {
        // Mensajes reales del backend: "La imagen es requerida",
        // "No se reconoció ningún estudiante en la imagen",
        // "Estudiante no encontrado", "El estudiante no pertenece a tu escuela".
        Alert.alert("Sin coincidencia", result.message);
      }
    } finally {
      setIdentifying(false);
    }
  }, [urlColegio, getToken, openPanel]);

  // ── Hora manual ──
  const handleTimeChange = useCallback((text: string) => {
    const digits = text.replace(/[^0-9]/g, "").slice(0, 4);
    if (digits.length >= 3) {
      setTime(`${digits.slice(0, 2)}:${digits.slice(2)}`);
    } else {
      setTime(digits);
    }
  }, []);

  // ── Guardar ──
  const handleSave = useCallback(async () => {
    if (!student) return;
    const token = await getToken();
    if (!urlColegio || !token) {
      Alert.alert("Error", "No hay conexión activa.");
      return;
    }
    if (tardinessMode === "Manual" && !HH_MM_PATTERN.test(time)) {
      Alert.alert("Hora inválida", "Ingresa la hora en formato HH:mm.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createTardiness(
        {
          studentId: student.id,
          tardinessMode,
          time,
        },
        { token, urlColegio },
      );
      if (!result.ok) {
        Alert.alert(
          "No se pudo registrar",
          result.message ?? "Intenta de nuevo.",
        );
        return;
      }
      Alert.alert(
        "Tardanza registrada",
        "La tardanza quedó registrada correctamente.",
      );
      clearStudent();
    } finally {
      setSubmitting(false);
    }
  }, [student, urlColegio, getToken, tardinessMode, time, clearStudent]);

  const courseName =
    student?.course?.find((c) => c.fullName)?.fullName ?? null;

  const photo = student ? photoUri(student.photourl) : null;

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Card Estudiante: buscador + ficha del seleccionado ── */}
          <View style={styles.studentCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="person-outline" size={18} color={PRIMARY_COLOR} />
              <Text style={styles.cardTitle}>Estudiante</Text>
            </View>

            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <Search size={18} color={TEXT_PLACEHOLDER} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Nombre, código o curso"
                  placeholderTextColor={TEXT_PLACEHOLDER}
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
                    <X size={18} color={TEXT_PLACEHOLDER} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={[
                  styles.iconBtn,
                  identifying && styles.iconBtnBusy,
                ]}
                onPress={handleIdentifyByPhoto}
                disabled={identifying}
                activeOpacity={0.8}
              >
                {identifying ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Camera size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            {student ? (
              <>
                <TouchableOpacity
                  style={styles.backRow}
                  onPress={clearStudent}
                  activeOpacity={0.7}
                >
                  <ArrowLeft size={18} color={PRIMARY_COLOR} />
                  <Text style={styles.backText}>Cambiar estudiante</Text>
                </TouchableOpacity>

                <View style={styles.employeeHeader}>
                  <View style={styles.avatarContainer}>
                    {photo ? (
                      <Image
                        source={{ uri: photo }}
                        style={styles.avatarImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <User size={30} color="#9CA3AF" />
                    )}
                  </View>
                  <View style={styles.employeeInfo}>
                    <Text style={styles.employeeName} numberOfLines={2}>
                      {student.fullName}
                    </Text>
                  </View>
                </View>

                {/* Detalle tipo StudentCard del webapp: ícono + label + valor */}
                <View style={styles.studentInfoBox}>
                  <View style={styles.infoRow}>
                    <Ionicons name="card-outline" size={16} color={PRIMARY_COLOR} />
                    <Text style={styles.infoLabel}>Matrícula</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>
                      {student.code || "—"}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Ionicons
                      name="school-outline"
                      size={16}
                      color={PRIMARY_COLOR}
                    />
                    <Text style={styles.infoLabel}>Aula - Sección</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>
                      {courseName || "—"}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.results}>
                {searching ? (
                  <View style={styles.emptyBlock}>
                    <ActivityIndicator color={PRIMARY_COLOR} />
                  </View>
                ) : query.trim().length < SEARCH_MIN_CHARS ? (
                  <View style={styles.emptyBlock}>
                    <Search size={26} color="#D1D5DB" />
                    <Text style={styles.emptyText}>
                      Escribe al menos {SEARCH_MIN_CHARS} caracteres
                    </Text>
                  </View>
                ) : results.length === 0 ? (
                  <View style={styles.emptyBlock}>
                    <User size={26} color="#D1D5DB" />
                    <Text style={styles.emptyText}>Sin resultados</Text>
                  </View>
                ) : (
                  results.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={styles.resultRow}
                      onPress={() => selectById(option)}
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
                          <User size={16} color="#9CA3AF" />
                        )}
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultName} numberOfLines={2}>
                          {option.fullName}{" "}
                          <Text style={styles.resultId}>(ID: {option.id})</Text>
                        </Text>
                        <Text style={styles.resultMeta} numberOfLines={2}>
                          {option.course?.[0]?.fullName ??
                            (option.code ? `Código ${option.code}` : "Sin curso")}
                        </Text>
                      </View>
                      <Text style={styles.resultCaret}>›</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </View>

          {/* ── Card Tardanzas (semáforo) ── */}
          {!student ? (
            <View style={styles.emptyCard}>
              <Ionicons name="time-outline" size={26} color="#D1D5DB" />
              <Text style={styles.emptyText}>No hay registro de tardanzas</Text>
            </View>
          ) : loadingPanel ? (
            <View style={styles.panelLoading}>
              <ActivityIndicator color={PRIMARY_COLOR} />
            </View>
          ) : (
            <TardinessTrafficLight
              records={student.tardiness}
              daysLateAbsence={daysLateAbsence}
              manual={tardinessMode === "Manual"}
              time={time}
              onTimeChange={handleTimeChange}
            />
          )}

          {/* ── Card Padres / Tutores ── */}
          <TardinessParentsCard contacts={student?.parents ?? []} />
        </ScrollView>

        {/* ── Acciones — footer fijo, fuera del scroll. Sin estudiante, los
             botones existen pero quedan deshabilitados ── */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.footerBtn,
              styles.cancelBtn,
              (!student || submitting) && styles.footerBtnDisabled,
            ]}
            onPress={clearStudent}
            disabled={!student || submitting}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.footerBtn,
              styles.saveBtn,
              (!student || submitting || loadingPanel) && styles.saveBtnBusy,
            ]}
            onPress={handleSave}
            disabled={!student || submitting || loadingPanel}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveText}>Guardar</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** "HH:mm" desde un instante del dispositivo (zero-padding de pad2). */
function nowHHMM(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Una foto puede venir como ruta relativa del backend o como URL absoluta. */
function photoUri(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${PHOTO_HOST}/${raw}`;
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    /* Pantalla directa (sin Modal ni landing) — mismo patrón que
     * parentsexcusesscreen.tsx: hereda el header compartido de (app)/_layout.tsx. */
    screen: { flex: 1, backgroundColor: APP_BACKGROUND },
    flex: { flex: 1 },
    content: {
      padding: scale(16),
      gap: verticalScale(14),
    },

    /* ── Búsqueda ── */
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
    },
    searchInputWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      backgroundColor: CARD_BACKGROUND,
      borderWidth: 1,
      borderColor: INPUT_BORDER,
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
    },
    searchInput: {
      flex: 1,
      fontSize: font(14),
      color: TEXT_PRIMARY,
      paddingVertical: verticalScale(10),
    },
    iconBtn: {
      width: scale(44),
      height: verticalScale(44),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_LG,
      backgroundColor: PRIMARY_COLOR,
    },
    iconBtnBusy: { opacity: 0.7 },

    /* ── Resultados ── */
    results: { gap: verticalScale(2) },
    emptyBlock: {
      alignItems: "center",
      gap: verticalScale(8),
      paddingVertical: verticalScale(40),
    },
    emptyText: {
      fontSize: font(13),
      color: TEXT_SECONDARY,
      textAlign: "center",
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      backgroundColor: CARD_BACKGROUND,
      borderRadius: RADIUS_2XL,
      borderWidth: 1.5,
      borderColor: CARD_BORDER,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      marginBottom: verticalScale(6),
    },
    avatarSmall: {
      width: scale(32),
      height: scale(32),
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: scale(16),
      backgroundColor: "#F3F4F6",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarSmallImage: {
      width: scale(32),
      height: scale(32),
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: scale(16),
    },
    resultInfo: { flex: 1 },
    resultName: {
      fontSize: font(14),
      fontWeight: "700",
      color: TEXT_PRIMARY,
    },
    resultId: { fontSize: font(12), fontWeight: "400", color: "#6B7280" },
    resultMeta: {
      fontSize: font(12),
      color: "#6B7280",
      marginTop: verticalScale(1),
    },
    resultCaret: { fontSize: font(18), color: TEXT_PLACEHOLDER },

    /* ── Ficha del estudiante ── */
    studentCard: {
      backgroundColor: CARD_BACKGROUND,
      borderRadius: RADIUS_2XL,
      borderWidth: 1.5,
      borderColor: CARD_BORDER,
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(14),
      paddingBottom: verticalScale(16),
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      marginBottom: verticalScale(12),
    },
    cardTitle: { fontSize: font(15), fontWeight: "700", color: TEXT_PRIMARY },
    emptyCard: {
      backgroundColor: CARD_BACKGROUND,
      borderRadius: RADIUS_2XL,
      borderWidth: 1.5,
      borderColor: CARD_BORDER,
      alignItems: "center",
      gap: verticalScale(8),
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(28),
    },
    backRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      paddingVertical: verticalScale(6),
      marginBottom: verticalScale(6),
    },
    backText: { fontSize: font(13), fontWeight: "700", color: PRIMARY_COLOR },
    employeeHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(12),
    },
    avatarContainer: {
      width: scale(56),
      height: scale(56),
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: scale(28),
      backgroundColor: "#F3F4F6",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: {
      width: scale(56),
      height: scale(56),
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: scale(28),
    },
    employeeInfo: { flex: 1 },
    employeeName: {
      fontSize: font(16),
      fontWeight: "700",
      color: TEXT_PRIMARY,
    },
    studentInfoBox: {
      marginTop: verticalScale(12),
      borderTopWidth: 1,
      borderTopColor: FOOTER_BORDER,
      paddingTop: verticalScale(10),
      gap: verticalScale(8),
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
    },
    infoLabel: {
      width: scale(108),
      fontSize: font(12),
      fontWeight: "600",
      color: TEXT_SECONDARY,
    },
    infoValue: {
      flex: 1,
      fontSize: font(13),
      fontWeight: "600",
      color: TEXT_PRIMARY,
      textAlign: "right",
    },

    panelLoading: {
      alignItems: "center",
      paddingVertical: verticalScale(40),
    },

    /* ── Acciones (footer fijo) ── */
    footer: {
      flexDirection: "row",
      gap: scale(10),
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(12),
      paddingBottom: verticalScale(28),
      backgroundColor: CARD_BACKGROUND,
      borderTopWidth: 1,
      borderTopColor: FOOTER_BORDER,
    },
    footerBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: verticalScale(13),
      borderRadius: RADIUS_LG,
    },
    cancelBtn: { backgroundColor: FOOTER_BORDER },
    footerBtnDisabled: { opacity: 0.55 },
    cancelText: {
      fontSize: font(14),
      fontWeight: "700",
      color: TEXT_SECONDARY,
    },
    saveBtn: { backgroundColor: PRIMARY_COLOR },
    saveBtnBusy: { opacity: 0.7 },
    saveText: { fontSize: font(14), fontWeight: "700", color: CARD_BACKGROUND },
  });
}