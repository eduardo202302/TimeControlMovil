import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { PRIMARY_COLOR, TEXT_PLACEHOLDER } from "@/constants/colors";
import { useResponsive } from "@/constants/responsive";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { searchCourses } from "../../api/getCourses";
import AttendanceTabsView, {
  createAttendanceStyles,
  type LoadError,
} from "../../components/faceclass/AttendanceTabsView";
import TagOptionSheet, { type TagSheetOption } from "../../components/permissions/TagOptionSheet";
import {
  courseSubtitle,
  fetchAdminAttendance,
  formatHourLabel,
  readUserTeacherTypeList,
  resolveAttendanceGating,
  type AttendanceData,
  type CourseOption,
} from "../../utils/attendanceRules";
import * as Storage from "../../utils/storage";

/**
 * Asistencia Adm. (menú id:25) — port de AdminAttendanceForm del webapp.
 * El admin elige un curso con clase en curso AHORA y toma asistencia por foto
 * grupal (reconocimiento en servidor) o por la lista manual (tab "List",
 * Parte 2/2). Sin gating por horario: el backend solo devuelve la clase
 * vigente.
 *
 * Esta pantalla se queda con lo que es SUYO —el selector de curso, su fetch y
 * la cabecera con los datos de la clase—; los 6 tabs, la toma de foto y el
 * guardado viven en AttendanceTabsView, compartidos con la Asistencia del
 * docente.
 */

/** Debounce del buscador de cursos — mismo valor que el de estudiantes. */
const SEARCH_DEBOUNCE_MS = 400;

export default function AdminAttendanceTaking() {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createAttendanceStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { urlColegio, companySettings, user } = useSchoolStore();
  const router = useRouter();

  /** Fórmula de handleAttendanceValidations del webapp (ver attendanceRules). */
  const gating = useMemo(
    () =>
      resolveAttendanceGating(
        companySettings?.attendanceMode,
        readUserTeacherTypeList(user),
      ),
    [companySettings?.attendanceMode, user],
  );

  const getAuth = useCallback(async () => {
    const token =
      useSchoolStore.getState().token ?? (await Storage.getItemAsync("token"));
    const url =
      urlColegio ?? useSchoolStore.getState().urlColegio ?? (await Storage.getItemAsync("urlColegio"));
    return token && url ? { token, urlColegio: url } : null;
  }, [urlColegio]);

  // ── Selector de curso ──
  const [course, setCourse] = useState<CourseOption | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [courseQuery, setCourseQuery] = useState("");
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseCount, setCourseCount] = useState(0);
  const [coursePage, setCoursePage] = useState(1);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingMoreCourses, setLoadingMoreCourses] = useState(false);
  // Descarta respuestas de una búsqueda ya superada por otra más nueva.
  const courseSeq = useRef(0);

  // ── Asistencia ──
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const attendanceSeq = useRef(0);
  /** Sube en cada selección de curso — devuelve los tabs a "Asis.". */
  const [selectionSeq, setSelectionSeq] = useState(0);

  // ── Cursos ──
  const loadCourses = useCallback(
    async (query: string, page: number) => {
      const seq = ++courseSeq.current;
      const auth = await getAuth();
      if (!auth) {
        setLoadingCourses(false);
        return;
      }
      if (page === 1) setLoadingCourses(true);
      else setLoadingMoreCourses(true);
      const result = await searchCourses(query, auth, page);
      if (seq !== courseSeq.current) return;
      setCourses((prev) => (page === 1 ? result.items : [...prev, ...result.items]));
      setCourseCount(result.count);
      setCoursePage(page);
      setLoadingCourses(false);
      setLoadingMoreCourses(false);
    },
    [getAuth],
  );

  useEffect(() => {
    if (!sheetVisible) return;
    const timer = setTimeout(() => loadCourses(courseQuery, 1), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [sheetVisible, courseQuery, loadCourses]);

  const openCourseSheet = useCallback(() => {
    setCourseQuery("");
    setCourses([]);
    setCourseCount(0);
    setLoadingCourses(true);
    setSheetVisible(true);
  }, []);

  // ── Asistencia ──
  const loadAttendance = useCallback(
    async (courseId: number) => {
      const auth = await getAuth();
      if (!auth) {
        Alert.alert("Error", "No hay conexión activa.");
        return;
      }
      const seq = ++attendanceSeq.current;
      setLoadingAttendance(true);
      const result = await fetchAdminAttendance(courseId, auth);
      if (seq !== attendanceSeq.current) return;
      setLoadingAttendance(false);
      // Igual que setUpFetchData del webapp: cada fetch descarta las fotos
      // nuevas sin guardar y los cambios de la Lista, y re-habilita ambos
      // modos (lo hace AttendanceTabsView al cambiar `attendance`).
      if (result.status === "found") {
        setAttendance(result.data);
        setLoadError(null);
      } else {
        setAttendance(null);
        setLoadError({ kind: result.status, message: result.message });
      }
    },
    [getAuth],
  );

  const handleSelectCourse = useCallback(
    (option: TagSheetOption) => {
      const selected = courses.find((c) => c.id === option.id);
      if (!selected) return;
      setSheetVisible(false);
      setCourse(selected);
      setSelectionSeq((prev) => prev + 1);
      loadAttendance(selected.id);
    },
    [courses, loadAttendance],
  );

  const handleRefresh = useCallback(() => {
    if (course) return loadAttendance(course.id);
  }, [course, loadAttendance]);

  const courseLabel = course
    ? `${course.name}${course.section ? ` - ${course.section}` : ""}`
    : "";

  const sheetOptions: TagSheetOption[] = useMemo(
    () => courses.map((c) => ({ id: c.id, name: c.name, subtitle: courseSubtitle(c) })),
    [courses],
  );

  // ── Render ──
  const renderClassInfo = (data: AttendanceData) => {
    const schedule = data.schedule;
    const hours = [formatHourLabel(schedule?.startTime), formatHourLabel(schedule?.endTime)]
      .filter(Boolean)
      .join(" - ");
    return (
      <View style={styles.classInfo}>
        {!!schedule?.subject?.name && (
          <View style={styles.infoRow}>
            <Ionicons name="book-outline" size={16} color={PRIMARY_COLOR} />
            <Text style={styles.infoLabel}>Materia</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{schedule.subject.name}</Text>
          </View>
        )}
        {!!schedule?.teacher?.fullName && (
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={16} color={PRIMARY_COLOR} />
            <Text style={styles.infoLabel}>Docente</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{schedule.teacher.fullName}</Text>
          </View>
        )}
        {!!hours && (
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={PRIMARY_COLOR} />
            <Text style={styles.infoLabel}>Horario</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{hours}</Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Ionicons name="pricetag-outline" size={16} color={PRIMARY_COLOR} />
          <Text style={styles.infoLabel}>Id</Text>
          <Text style={styles.infoValue}>{data.id}</Text>
        </View>
      </View>
    );
  };

  const courseSelector = (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="business-outline" size={18} color={PRIMARY_COLOR} />
        <Text style={styles.cardTitle}>Seleccionar Curso/Sección</Text>
      </View>
      <TouchableOpacity style={styles.selector} onPress={openCourseSheet} activeOpacity={0.8}>
        <Text
          style={[styles.selectorText, !course && styles.selectorPlaceholder]}
          numberOfLines={1}
        >
          {course ? courseLabel : "Buscar por nombre, sección..."}
        </Text>
        <Ionicons name="chevron-down" size={18} color={TEXT_PLACEHOLDER} />
      </TouchableOpacity>
      {attendance && renderClassInfo(attendance)}
    </View>
  );

  return (
    <View style={styles.screen}>
      <AttendanceTabsView
        attendance={attendance}
        loading={loadingAttendance}
        loadError={loadError}
        gating={gating}
        courseLabel={courseLabel}
        showCourseSelector
        courseSelector={courseSelector}
        refreshEnabled={!!course}
        resetKey={selectionSeq}
        onReload={handleRefresh}
        onBack={() => router.back()}
      />

      <TagOptionSheet
        visible={sheetVisible}
        title="Seleccionar Curso"
        options={sheetOptions}
        selectedId={course?.id ?? null}
        emptyText="No hay cursos con clase en curso"
        onSelect={handleSelectCourse}
        onClose={() => setSheetVisible(false)}
        search={{
          value: courseQuery,
          onChangeText: setCourseQuery,
          placeholder: "Buscar por nombre, sección...",
        }}
        loading={loadingCourses}
        hideColorDot
        footer={
          courses.length < courseCount ? (
            <TouchableOpacity
              style={styles.loadMore}
              onPress={() => loadCourses(courseQuery, coursePage + 1)}
              disabled={loadingMoreCourses}
            >
              {loadingMoreCourses ? (
                <ActivityIndicator color={PRIMARY_COLOR} size="small" />
              ) : (
                <Text style={styles.loadMoreText}>Cargar más</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );
}
