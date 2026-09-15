import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  CARD_BACKGROUND,
  FOOTER_BORDER,
  INPUT_BORDER,
  PRIMARY_COLOR,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
} from "@/constants/colors";
import { RADIUS_MD, RADIUS_SM, useResponsive } from "@/constants/responsive";

/**
 * Grilla de calendario a 2 clics para elegir un rango de ausencia — portado
 * de `AbsenceCalendar` del webapp (misma UX: 1er tap fija start=end, 2do tap
 * ajusta el extremo más cercano). Sin librería externa, igual que el target.
 */
export interface AbsenceRange {
  start: Date;
  end: Date;
}

interface CalendarDay {
  day: number;
  isCurrentMonth: boolean;
  date: Date;
  isToday: boolean;
  isPast: boolean;
}

interface AbsenceCalendarProps {
  selectedRange: AbsenceRange | null;
  onChange: (range: AbsenceRange | null) => void;
  /** Si no se pasa, todos los días (salvo pasados) se consideran hábiles. */
  isDateAllowed?: (date: Date) => boolean;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAY_NAMES = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];

function sameDay(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Mismo criterio que `isAbsenceRangeOnlyCompanyWorkingDays`, pero sin
 * depender de ese módulo — el calendario no conoce `schedulesAdd`, solo un
 * predicado `isDateAllowed` genérico (así se puede testear/reusar suelto). */
function isEveryDayInRangeAllowed(
  start: Date,
  end: Date,
  isDateAllowed?: (date: Date) => boolean,
): boolean {
  if (!isDateAllowed) return true;
  const t0 = Math.min(start.getTime(), end.getTime());
  const t1 = Math.max(start.getTime(), end.getTime());
  const cur = startOfDay(new Date(t0));
  const last = startOfDay(new Date(t1));
  while (cur.getTime() <= last.getTime()) {
    if (!isDateAllowed(new Date(cur))) return false;
    cur.setDate(cur.getDate() + 1);
  }
  return true;
}

function formatShortDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

export default function AbsenceCalendar({
  selectedRange,
  onChange,
  isDateAllowed,
}: AbsenceCalendarProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const [currentMonth, setCurrentMonth] = useState(() => {
    const base = selectedRange?.start ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [startDate, setStartDate] = useState<Date | null>(
    selectedRange?.start ?? null,
  );
  const [endDate, setEndDate] = useState<Date | null>(selectedRange?.end ?? null);

  // Sincroniza con selectedRange (p. ej. al restaurar un borrador de
  // AsyncStorage) — descarta el rango si ya no cumple isDateAllowed.
  useEffect(() => {
    if (!selectedRange) {
      setStartDate(null);
      setEndDate(null);
      return;
    }
    const { start, end } = selectedRange;
    if (!isEveryDayInRangeAllowed(start, end, isDateAllowed)) {
      setStartDate(null);
      setEndDate(null);
      onChange(null);
      return;
    }
    setStartDate((prev) => (prev && sameDay(prev, start) ? prev : start));
    setEndDate((prev) => (prev && sameDay(prev, end) ? prev : end));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange se llama solo para descartar rango inválido, no debe re-disparar el efecto
  }, [selectedRange, isDateAllowed]);

  const applyRange = useCallback(
    (nextStart: Date | null, nextEnd: Date | null) => {
      if (nextStart == null || nextEnd == null) {
        setStartDate(null);
        setEndDate(null);
        onChange(null);
        return;
      }
      if (!isEveryDayInRangeAllowed(nextStart, nextEnd, isDateAllowed)) return;
      setStartDate(nextStart);
      setEndDate(nextEnd);
      onChange({ start: nextStart, end: nextEnd });
    },
    [isDateAllowed, onChange],
  );

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const calendarDays = useMemo<CalendarDay[]>(() => {
    const today = startOfDay(new Date());
    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayWeekday = firstDayOfMonth.getDay();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days: CalendarDay[] = [];
    for (let i = firstDayWeekday - 1; i >= 0; i -= 1) {
      days.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthDays - i),
        isToday: false,
        isPast: false,
      });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = startOfDay(new Date(year, month, day));
      days.push({
        day,
        isCurrentMonth: true,
        date,
        isToday: sameDay(date, today),
        isPast: date.getTime() < today.getTime(),
      });
    }
    const remaining = 42 - days.length;
    for (let day = 1; day <= remaining; day += 1) {
      days.push({
        day,
        isCurrentMonth: false,
        date: new Date(year, month + 1, day),
        isToday: false,
        isPast: false,
      });
    }
    return days;
  }, [year, month]);

  const navigateMonth = useCallback((direction: number) => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
  }, []);

  const isDayAllowed = useCallback(
    (dayData: CalendarDay) => {
      if (!dayData.isCurrentMonth) return false;
      if (!isDateAllowed) return true;
      return isDateAllowed(dayData.date);
    },
    [isDateAllowed],
  );

  const handleDayPress = useCallback(
    (dayData: CalendarDay) => {
      if (!dayData.isCurrentMonth || dayData.isPast) return;
      if (!isDayAllowed(dayData)) return;

      const clicked = dayData.date;

      if (!startDate) {
        applyRange(clicked, clicked);
        return;
      }
      if (startDate && endDate) {
        const isStart = sameDay(clicked, startDate);
        const isEnd = sameDay(clicked, endDate);
        const isSingleDay = sameDay(startDate, endDate);

        if (isStart && isEnd && isSingleDay) {
          applyRange(null, null);
          return;
        }
        if (isStart) {
          applyRange(endDate, endDate);
          return;
        }
        if (isEnd) {
          applyRange(startDate, startDate);
          return;
        }
        if (clicked.getTime() < startDate.getTime()) {
          applyRange(clicked, startDate);
        } else if (clicked.getTime() > endDate.getTime()) {
          applyRange(startDate, clicked);
        } else {
          applyRange(clicked, clicked);
        }
        return;
      }
      if (clicked.getTime() < startDate.getTime()) {
        applyRange(clicked, startDate);
      } else {
        applyRange(startDate, clicked);
      }
    },
    [startDate, endDate, isDayAllowed, applyRange],
  );

  const isInRange = useCallback(
    (dayData: CalendarDay) => {
      if (!startDate || !dayData.isCurrentMonth) return false;
      if (endDate) {
        return dayData.date.getTime() >= startDate.getTime() && dayData.date.getTime() <= endDate.getTime();
      }
      return sameDay(dayData.date, startDate);
    },
    [startDate, endDate],
  );

  const totalDays =
    startDate && endDate
      ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      : startDate
        ? 1
        : 0;

  return (
    <View style={styles.calendar}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigateMonth(-1)}
          style={styles.navButton}
          hitSlop={8}
        >
          <ChevronLeft size={18} color={PRIMARY_COLOR} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>
          {MONTH_NAMES[month]} {year}
        </Text>
        <TouchableOpacity
          onPress={() => navigateMonth(1)}
          style={styles.navButton}
          hitSlop={8}
        >
          <ChevronRight size={18} color={PRIMARY_COLOR} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekDaysRow}>
        {DAY_NAMES.map((d) => (
          <Text key={d} style={styles.weekDayLabel}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.daysGrid}>
        {calendarDays.map((dayData, index) => {
          const allowed = isDayAllowed(dayData);
          const disabled = dayData.isPast || !dayData.isCurrentMonth || !allowed;
          const inRange = isInRange(dayData);
          const isEdge =
            (!!startDate && sameDay(dayData.date, startDate)) ||
            (!!endDate && sameDay(dayData.date, endDate));

          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.dayCell,
                dayData.isCurrentMonth && !dayData.isPast && !allowed && styles.dayCellNonWorking,
                inRange && styles.dayCellInRange,
                isEdge && styles.dayCellEdge,
              ]}
              disabled={disabled}
              onPress={() => handleDayPress(dayData)}
              activeOpacity={0.7}
            >
              {dayData.isCurrentMonth && (
                <Text
                  style={[
                    styles.dayText,
                    dayData.isPast && styles.dayTextMuted,
                    !allowed && !dayData.isPast && styles.dayTextMuted,
                    (inRange || isEdge) && styles.dayTextSelected,
                  ]}
                >
                  {dayData.day}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {startDate && (
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedText}>
            {endDate && !sameDay(startDate, endDate)
              ? `Rango: ${formatShortDate(startDate)} - ${formatShortDate(endDate)}`
              : `Fecha: ${formatShortDate(startDate)}`}
          </Text>
          <Text style={styles.daysCount}>Total: {totalDays} día/s</Text>
        </View>
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
    calendar: {
      backgroundColor: CARD_BACKGROUND,
      borderRadius: RADIUS_MD,
      padding: scale(10),
      borderWidth: 1,
      borderColor: INPUT_BORDER,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: verticalScale(8),
    },
    navButton: {
      padding: scale(6),
    },
    monthTitle: {
      fontWeight: "600",
      fontSize: font(14),
      color: TEXT_PRIMARY,
    },
    weekDaysRow: {
      flexDirection: "row",
    },
    weekDayLabel: {
      width: `${100 / 7}%`,
      textAlign: "center",
      fontSize: font(10),
      fontWeight: "600",
      color: TEXT_PLACEHOLDER,
      marginBottom: verticalScale(4),
    },
    daysGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    dayCell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_SM,
    },
    // Gris propio del calendario, no de colors.ts: coincide en hex con
    // FOOTER_BORDER ("#F3F4F6") por casualidad, pero ese token es para bordes
    // de footer — usarlo acá para "día no laborable" sería un nombre
    // engañoso. Se documenta en vez de forzar un import semánticamente falso.
    dayCellNonWorking: {
      backgroundColor: "#f3f4f6",
    },
    // Tinte de rango (celeste claro) — no tiene equivalente en colors.ts,
    // es un color propio de este calendario (mismo criterio que el gris de
    // arriba: no forzar un token que no significa esto).
    dayCellInRange: {
      backgroundColor: "#dbeafe",
    },
    dayCellEdge: {
      backgroundColor: PRIMARY_COLOR,
    },
    dayText: {
      fontSize: font(13),
      color: TEXT_PRIMARY,
    },
    // Coincide en hex con INPUT_BORDER ("#D1D5DB") — sí se tokeniza porque
    // ahí el nombre calza: es el mismo gris "deshabilitado/neutro" que ya usa
    // el resto del sistema para bordes de input.
    dayTextMuted: {
      color: INPUT_BORDER,
    },
    dayTextSelected: {
      color: CARD_BACKGROUND,
      fontWeight: "700",
    },
    selectedInfo: {
      marginTop: verticalScale(10),
      paddingTop: verticalScale(8),
      borderTopWidth: 1,
      borderTopColor: FOOTER_BORDER,
    },
    selectedText: {
      fontSize: font(13),
      fontWeight: "600",
      color: TEXT_PRIMARY,
    },
    daysCount: {
      fontSize: font(12),
      color: TEXT_PLACEHOLDER,
      marginTop: verticalScale(2),
    },
  });
}
