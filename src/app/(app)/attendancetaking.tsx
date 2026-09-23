import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { APP_BACKGROUND, PRIMARY_COLOR, TEXT_SECONDARY } from "@/constants/colors";
import { RADIUS_2XL, useResponsive } from "@/constants/responsive";
import { useSchoolStore } from "../../../store/useSchoolStore";
import AttendanceTabsView, {
  type LoadError,
} from "../../components/faceclass/AttendanceTabsView";
import TeacherAttendanceHeader from "../../components/faceclass/TeacherAttendanceHeader";
import TeacherScheduleCard from "../../components/faceclass/TeacherScheduleCard";
import {
  fetchTeacherAttendance,
  getCurrentSubject,
  hasAvailableClassesToday,
  readUserTeacherTypeList,
  resolveAttendanceGating,
  type AttendanceData,
} from "../../utils/attendanceRules";
import * as Storage from "../../utils/storage";

/**
 * Asistencia (docente) — port de AttendanceTaking + AttendanceForm del webapp,
 * fundidos en una sola pantalla con dos estados:
 *
 *   - Landing: la tabla de clases de hoy (TeacherScheduleCard) y el botón
 *     "Asistencia", que se apaga cuando no hay ninguna clase en curso.
 *   - Formulario: el mismo cuerpo de 6 tabs que Asistencia Adm.
 *     (AttendanceTabsView), sin selector de curso — acá la clase la resuelve el
 *     backend desde el token del docente.
 *
 * Se entra SIEMPRE por el landing, como el webapp: la tabla del día se ve
 * primero y al formulario solo se llega tocando el botón "Asistencia", que
 * está habilitado únicamente mientras hay una clase en curso. "Atrás" devuelve
 * al landing en vez de navegar fuera (en el webapp son dos rutas distintas).
 *
 * De dónde sale la clase: de `attendancesToday` del store, que es la SNAPSHOT
 * que trae chooseschool al iniciar sesión (ver TeacherAttendanceToday). No hay
 * endpoint para recargar esa lista — el único refresco es el poller de
 * punchinout, que vuelve a llamar chooseschool. Lo que sí se recarga acá es la
 * asistencia de la clase en curso, vía GET /attendance/teacher/{subjectId}.
 */

/**
 * Cada cuánto se re-evalúa "¿hay clase en curso?". La lista no se recarga (no
 * hay de dónde); lo que cambia con el tiempo es solo qué fila cae dentro de su
 * ventana horaria. 30s es suficiente para que el cambio de hora de clase se
 * note sin que el usuario tenga que salir y volver.
 */
const TICK_MS = 30_000;

export default function AttendanceTaking() {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { urlColegio, companySettings, user, attendancesToday } = useSchoolStore();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  /**
   * false = landing (el estado inicial, siempre). Solo el botón "Asistencia"
   * lo pone en true; "Atrás" lo devuelve a false.
   */
  const [showForm, setShowForm] = useState(false);

  /** Fórmula de handleAttendanceValidations del webapp (ver attendanceRules). */
  const gating = useMemo(
    () =>
      resolveAttendanceGating(
        companySettings?.attendanceMode,
        readUserTeacherTypeList(user),
      ),
    [companySettings?.attendanceMode, user],
  );

  /** La clase de HOY en curso ahora — decide qué estado muestra la pantalla. */
  const currentClass = useMemo(
    () => hasAvailableClassesToday(attendancesToday, now),
    [attendancesToday, now],
  );

  /**
   * La materia que se le pide al backend. Sale de `getCurrentSubject`, NO de
   * `currentClass`: son dos funciones distintas en el webapp y no siempre
   * coinciden (ver el comentario de getCurrentSubject). Se replica ese reparto
   * tal cual para pedirle al backend exactamente lo mismo que el webapp.
   */
  const currentSubject = useMemo(
    () => getCurrentSubject(attendancesToday, now),
    [attendancesToday, now],
  );
  const subjectId = currentSubject?.schedule?.subjectId ?? null;

  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [loading, setLoading] = useState(false);
  const attendanceSeq = useRef(0);

  const getAuth = useCallback(async () => {
    const token =
      useSchoolStore.getState().token ?? (await Storage.getItemAsync("token"));
    const url =
      urlColegio ?? useSchoolStore.getState().urlColegio ?? (await Storage.getItemAsync("urlColegio"));
    return token && url ? { token, urlColegio: url } : null;
  }, [urlColegio]);

  const loadAttendance = useCallback(async () => {
    if (!subjectId) return;
    const auth = await getAuth();
    if (!auth) {
      Alert.alert("Error", "No hay conexión activa.");
      return;
    }
    const seq = ++attendanceSeq.current;
    setLoading(true);
    const result = await fetchTeacherAttendance(subjectId, auth);
    if (seq !== attendanceSeq.current) return;
    setLoading(false);
    if (result.status === "found") {
      setAttendance(result.data);
      setLoadError(null);
    } else {
      setAttendance(null);
      setLoadError({ kind: result.status, message: result.message });
    }
  }, [subjectId, getAuth]);

  /** Mismo disparo que `useFetchAttendance` del webapp: al cambiar la materia. */
  useEffect(() => {
    if (!subjectId) {
      setAttendance(null);
      setLoadError(null);
      return;
    }
    loadAttendance();
  }, [subjectId, loadAttendance]);

  const courseLabel = useMemo(() => {
    const course = attendance?.schedule?.course;
    if (!course?.name) return "";
    return `${course.name}${course.section ? ` - ${course.section}` : ""}`;
  }, [attendance]);

  // ── Landing ──
  const renderLanding = () => (
    <ScrollView
      style={styles.landingBody}
      contentContainerStyle={styles.landingContent}
      showsVerticalScrollIndicator={false}
    >
      {/*
        El botón se pinta siempre —el docente ve que la acción existe— pero
        solo es tocable mientras `hasAvailableClassesToday` devuelva una clase.
        Como `currentClass` se recalcula con el tick, se habilita y se apaga
        solo al entrar y salir de la ventana horaria, sin fetch de por medio.
      */}
      <TouchableOpacity
        style={[styles.cta, !currentClass && styles.ctaDisabled]}
        onPress={() => setShowForm(true)}
        disabled={!currentClass}
        activeOpacity={0.85}
      >
        <Ionicons
          name={currentClass ? "clipboard-outline" : "time-outline"}
          size={22}
          color="#fff"
        />
        <View style={styles.ctaLabels}>
          <Text style={styles.ctaText}>Asistencia</Text>
          <Text style={styles.ctaSub}>
            {currentClass ? "Toca aquí" : "No tienes clases disponibles en este momento"}
          </Text>
        </View>
      </TouchableOpacity>

      <TeacherScheduleCard attendancesToday={attendancesToday} now={now} />
    </ScrollView>
  );

  if (!showForm) {
    return <View style={styles.screen}>{renderLanding()}</View>;
  }

  // ── Cabecera del formulario ──
  // La cinta oscura del webapp (AttendanceForm), NO las icon-rows de
  // Asistencia Adm.: esa pantalla conserva su header y no usa este componente.
  const header = (
    <View style={styles.headerWrap}>
      <TeacherAttendanceHeader
        attendance={attendance}
        userName={user?.user?.fullName ?? ""}
        subjectName={currentSubject?.schedule?.subject?.name ?? ""}
      />
    </View>
  );

  return (
    <AttendanceTabsView
      attendance={attendance}
      loading={loading}
      loadError={loadError}
      gating={gating}
      courseLabel={courseLabel}
      showCourseSelector={false}
      header={header}
      emptyText="No hay una clase en curso para tomar la asistencia."
      refreshEnabled={!!subjectId}
      onReload={loadAttendance}
      onBack={() => setShowForm(false)}
    />
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: APP_BACKGROUND },
    landingBody: { flex: 1 },
    landingContent: {
      padding: scale(16),
      gap: verticalScale(12),
      paddingBottom: verticalScale(24),
    },

    cta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(12),
      backgroundColor: PRIMARY_COLOR,
      borderRadius: RADIUS_2XL,
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(18),
    },
    // Apagado, no oculto: la acción sigue a la vista aunque no se pueda usar.
    ctaDisabled: { backgroundColor: TEXT_SECONDARY, opacity: 0.55 },
    // flexShrink para que el texto largo del estado deshabilitado envuelva en
    // vez de empujar el icono fuera del botón.
    ctaLabels: { flexShrink: 1 },
    ctaText: { fontSize: font(16), fontWeight: "700", color: "#fff" },
    ctaSub: { fontSize: font(12), color: "#E5E7EB" },

    headerWrap: { paddingHorizontal: scale(16), paddingTop: verticalScale(12) },
  });
}
