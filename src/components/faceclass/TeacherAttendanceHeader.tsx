import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RIBBON_BACKGROUND, RIBBON_TEXT, RIBBON_TEXT_MUTED } from "@/constants/colors";
import { RADIUS_MD, RADIUS_SM, useResponsive } from "@/constants/responsive";
import {
  formatDayMonthYear,
  formatHourLabel,
  type AttendanceData,
} from "../../utils/attendanceRules";

/**
 * Cabecera de Asistencia (docente) — calco de `.header` de
 * AttendanceForm/styles.module.css en el webapp: cinta oscura
 * (`--ribbon` / `--fonstRibbon`) con, en este orden:
 *
 *   fecha ............................... Id: N   ← fila `subHeaderSpaced`
 *   Nombre del usuario logueado                   ← `secondTitleName`, más grande
 *   Curso - Sección                               ← `secondTitle`
 *   Materia                                       ← `secondTitle`
 *   08:00 AM - 09:00 AM .......... Asistencia     ← `secondTitle` con space-between
 *
 * NO es el header de AdminAttendanceForm: ese lleva además el título
 * "Registrar Asistencia - Adm" y una línea con el docente de la clase, y su
 * materia sale de `attendanceData.schedule.subject.name`. Asistencia Adm. en
 * mobile conserva su propio header y no usa este componente.
 */

export interface TeacherAttendanceHeaderProps {
  /** La clase cargada. Null mientras no hay datos: la cinta se pinta igual. */
  attendance: AttendanceData | null;
  /**
   * `user.name` del webapp = `fullName` del usuario LOGUEADO (ver el reducer
   * de user: `name: payload.data.user.fullName`). No es
   * `schedule.teacher.fullName`; coinciden en la práctica porque quien abre
   * esta pantalla es el docente de la clase, pero la fuente es otra.
   */
  userName: string;
  /**
   * Materia según `getCurrentSubject()`, no `attendance.schedule.subject.name`
   * — el webapp las separa a propósito acá.
   */
  subjectName: string;
}

export default function TeacherAttendanceHeader({
  attendance,
  userName,
  subjectName,
}: TeacherAttendanceHeaderProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const course = attendance?.schedule?.course;
  const courseLabel = course?.name
    ? `${course.name}${course.section ? ` - ${course.section}` : ""}`
    : "";
  const hours = [
    formatHourLabel(attendance?.schedule?.startTime),
    formatHourLabel(attendance?.schedule?.endTime),
  ]
    .filter(Boolean)
    .join(" - ");

  return (
    <View style={styles.ribbon}>
      <View style={styles.topRow}>
        <Text style={styles.date} numberOfLines={1}>
          {formatDayMonthYear(attendance?.createdDate)}
        </Text>
        {attendance != null && (
          <Text style={styles.idLabel}>
            Id: <Text style={styles.idValue}>{attendance.id}</Text>
          </Text>
        )}
      </View>

      {!!userName && (
        <Text style={styles.name} numberOfLines={1}>
          {userName}
        </Text>
      )}
      {!!courseLabel && (
        <Text style={styles.line} numberOfLines={1}>
          {courseLabel}
        </Text>
      )}
      {!!subjectName && (
        <Text style={styles.line} numberOfLines={1}>
          {subjectName}
        </Text>
      )}

      {/* Última línea del webapp: horario a la izquierda, "Asistencia" a la
          derecha (el `justify-content: space-between` inline del div). */}
      <View style={styles.hoursRow}>
        <Text style={styles.line} numberOfLines={1}>
          {hours}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Asistencia</Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    // `.header`: columna, padding 0.2rem 1rem, fondo --ribbon, texto
    // --fonstRibbon. El radio inferior es propio de mobile (acá la cinta es
    // una tarjeta dentro de la pantalla, no una banda a ancho completo).
    ribbon: {
      backgroundColor: RIBBON_BACKGROUND,
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(10),
      gap: verticalScale(3),
    },
    // `.subHeaderSpaced`: fila a lo ancho con space-between.
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: scale(8),
    },
    date: { flexShrink: 1, fontSize: font(13), fontWeight: "600", color: RIBBON_TEXT_MUTED },
    idLabel: { fontSize: font(13), fontWeight: "600", color: RIBBON_TEXT_MUTED },
    // `.idValue` es 1.2rem contra el 1rem de la cinta — el número resalta.
    idValue: { fontSize: font(16), fontWeight: "700", color: RIBBON_TEXT },
    // `.secondTitleName`: mismo salto de tamaño que idValue.
    name: { fontSize: font(16), fontWeight: "700", color: RIBBON_TEXT },
    // `.secondTitle`: el tamaño base de la cinta.
    line: { flexShrink: 1, fontSize: font(13), fontWeight: "600", color: RIBBON_TEXT },
    hoursRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: scale(8),
      marginTop: verticalScale(2),
    },
    // En el webapp "Asistencia" es texto suelto; acá va en un recuadro para
    // que se lea como etiqueta y no como parte del horario.
    badge: {
      borderRadius: RADIUS_SM,
      borderWidth: 1,
      borderColor: RIBBON_TEXT_MUTED,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(2),
    },
    badgeText: { fontSize: font(11), fontWeight: "700", color: RIBBON_TEXT },
  });
}
