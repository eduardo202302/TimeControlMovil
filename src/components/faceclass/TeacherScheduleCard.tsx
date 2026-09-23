import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  CARD_BACKGROUND,
  CARD_BORDER,
  FOOTER_BORDER,
  PRIMARY_COLOR,
  PRIMARY_TINT_BACKGROUND,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";
import { RADIUS_2XL, RADIUS_MD, RADIUS_PILL, useResponsive } from "@/constants/responsive";
import type { TeacherAttendanceToday } from "../../../types/typeStore/SchoolStoreType";
import { formatDisplayTime } from "../timeoff/RevisionFinalModal";
import {
  currentWeekdayName,
  formatDayMonthYear,
  hasAvailableClassesToday,
} from "../../utils/attendanceRules";

/**
 * Port de `TeacherSchedule` (face-class-web, SubComponents de
 * AttendanceTaking): las clases de HOY del docente, con la de ahora resaltada.
 * Es solo informativa — el webapp tampoco pone botones acá; la acción vive en
 * la pantalla que lo contiene.
 *
 * El webapp usa una tabla de 4 columnas (Materia|Curso|Inicio|Fin). Acá no:
 * en ancho de teléfono esas columnas no caben y los nombres largos ("Tercero
 * de Secundaria - C") se cortan contra el borde. En su lugar, cada clase es
 * una fila apilada —materia, curso, horario— con el mismo patrón visual que
 * ExcuseCard.
 *
 * Las horas que se MUESTRAN son las del horario recurrente
 * (`schedule.startTime`/`endTime`), no las de la ventana real de hoy. Es lo
 * único en que se separa del webapp, que muestra las del nivel superior: en
 * una tabla de horario lo que el docente espera ver es su horario semanal. La
 * decisión de "¿cuál está en curso?" sí usa la ventana real, vía
 * `hasAvailableClassesToday`.
 */

/** Mismo par de la variante "tardanza" de AttendanceTabsView/AttendanceList. */
const TARDINESS_CHIP_BACKGROUND = "#F4B988";
const TARDINESS_CHIP_TEXT = "#7C3A12";

/** `getFormattedDate` del webapp: "Lunes 22 de septiembre del 2026". */
export function formatLongDate(now: Date): string {
  return `${currentWeekdayName(now)} ${formatDayMonthYear(now)}`;
}

export interface TeacherScheduleCardProps {
  /** La snapshot del store, sin filtrar. */
  attendancesToday: TeacherAttendanceToday[];
  /**
   * Instante con el que se calcula "hoy" y "en curso". El caller lo pasa desde
   * su propio tick para que la fila resaltada se mueva sin remontar nada.
   */
  now: Date;
}

export default function TeacherScheduleCard({
  attendancesToday,
  now,
}: TeacherScheduleCardProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const weekday = currentWeekdayName(now);

  /** Mismo filtro que el webapp: por nombre de día, no por `date`. */
  const todaySchedule = useMemo(
    () =>
      Array.isArray(attendancesToday)
        ? attendancesToday.filter((item) => item?.schedule?.weekday === weekday)
        : [],
    [attendancesToday, weekday],
  );

  const currentId = hasAvailableClassesToday(attendancesToday, now)?.id ?? null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{formatLongDate(now)}</Text>

      {todaySchedule.length === 0 ? (
        <Text style={styles.empty}>No tiene clases programadas para hoy.</Text>
      ) : (
        todaySchedule.map((item) => {
          const isCurrent = item.id === currentId;
          const schedule = item.schedule;
          const course = schedule?.course;
          const tardiness = item.statistics?.TardanzaEntrada ?? 0;
          const courseLabel = `${course?.name ?? ""}${course?.section ? ` - ${course.section}` : ""}`;
          const hours = [
            formatDisplayTime(schedule?.startTime ?? ""),
            formatDisplayTime(schedule?.endTime ?? ""),
          ]
            .filter(Boolean)
            .join(" - ");
          return (
            <View key={item.id} style={[styles.row, isCurrent && styles.currentRow]}>
              <View style={styles.rowTop}>
                {/* flex:1 + numberOfLines: los nombres largos envuelven o
                    cortan con puntos suspensivos, nunca contra el borde. */}
                <Text style={styles.subject} numberOfLines={2}>
                  {schedule?.subject?.name || "Sin materia"}
                </Text>
                {tardiness > 0 && (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{`Tard. ${tardiness}`}</Text>
                  </View>
                )}
              </View>

              {!!courseLabel.trim() && (
                <Text style={styles.course} numberOfLines={1}>
                  {courseLabel}
                </Text>
              )}

              {!!hours && (
                <View style={styles.hoursLine}>
                  <Ionicons
                    name="time-outline"
                    size={13}
                    color={isCurrent ? PRIMARY_COLOR : TEXT_SECONDARY}
                  />
                  <Text style={[styles.hours, isCurrent && styles.currentHours]}>
                    {hours}
                  </Text>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    card: {
      backgroundColor: CARD_BACKGROUND,
      borderRadius: RADIUS_2XL,
      borderWidth: 1.5,
      borderColor: CARD_BORDER,
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(14),
      paddingBottom: verticalScale(16),
    },
    title: {
      fontSize: font(15),
      fontWeight: "700",
      color: TEXT_PRIMARY,
      marginBottom: verticalScale(12),
      textTransform: "capitalize",
    },
    empty: { fontSize: font(13), color: "#6B7280" },

    // El padding horizontal lo llevan TODAS las filas, no solo la resaltada:
    // así el fondo de la clase en curso no desplaza su texto respecto al resto.
    row: {
      gap: verticalScale(3),
      paddingVertical: verticalScale(10),
      paddingHorizontal: scale(8),
      borderRadius: RADIUS_MD,
      borderBottomWidth: 1,
      borderBottomColor: FOOTER_BORDER,
    },
    currentRow: { backgroundColor: PRIMARY_TINT_BACKGROUND },

    rowTop: { flexDirection: "row", alignItems: "center", gap: scale(8) },
    subject: { flex: 1, fontSize: font(15), fontWeight: "700", color: TEXT_PRIMARY },
    course: { fontSize: font(12), color: TEXT_SECONDARY },

    hoursLine: { flexDirection: "row", alignItems: "center", gap: scale(5) },
    hours: { flexShrink: 1, fontSize: font(13), color: TEXT_SECONDARY },
    currentHours: { fontWeight: "700", color: PRIMARY_COLOR },

    // Mismo chip pequeño de ExcuseCard; flexShrink:0 para que no lo aplaste
    // un nombre de materia largo.
    chip: {
      flexShrink: 0,
      borderRadius: RADIUS_PILL,
      backgroundColor: TARDINESS_CHIP_BACKGROUND,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(3),
    },
    chipText: { fontSize: font(10), fontWeight: "700", color: TARDINESS_CHIP_TEXT },
  });
}
