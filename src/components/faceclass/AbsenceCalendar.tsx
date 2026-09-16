import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Calendar,
  LocaleConfig,
  type CalendarProps,
  type DateData,
} from "react-native-calendars";
import {
  CARD_BACKGROUND,
  FOOTER_BORDER,
  INPUT_BORDER,
  PRIMARY_COLOR,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
} from "@/constants/colors";
import { RADIUS_MD, useResponsive } from "@/constants/responsive";

/** Header y días de la semana en español (la librería lee el locale global
 * del módulo — se configura una sola vez, es el reemplazo de los
 * MONTH_NAMES/DAY_NAMES propios del grid custom). */
LocaleConfig.locales["es"] = {
  monthNames: [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ],
  monthNamesShort: [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ],
  dayNames: [
    "Domingo", "Lunes", "Martes", "Miércoles",
    "Jueves", "Viernes", "Sábado",
  ],
  dayNamesShort: ["D", "L", "M", "M", "J", "V", "S"],
  today: "Hoy",
};
LocaleConfig.defaultLocale = "es";

/**
 * Calendario de rango a 2 toques para elegir los días de ausencia — portado
 * de `AbsenceCalendar` del webapp (misma UX: 1er tap fija start=end, 2do tap
 * ajusta el extremo más cercano). Construido sobre `<Calendar>` de
 * react-native-calendars (librería JS pura, sin módulos nativos): selección
 * en modo "period" y días no permitidos como disabled nativo.
 */
export interface AbsenceRange {
  start: Date;
  end: Date;
}

interface AbsenceCalendarProps {
  selectedRange: AbsenceRange | null;
  onChange: (range: AbsenceRange | null) => void;
  /** Si no se pasa, todos los días (salvo pasados) se consideran hábiles. */
  isDateAllowed?: (date: Date) => boolean;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateKey(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function dateFromKey(key: string): Date | null {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
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
  const calendarTheme = useMemo<CalendarProps["theme"]>(
    () => ({
      calendarBackground: CARD_BACKGROUND,
      selectedDayBackgroundColor: PRIMARY_COLOR,
      selectedDayTextColor: CARD_BACKGROUND,
      todayTextColor: PRIMARY_COLOR,
      dayTextColor: TEXT_PRIMARY,
      monthTextColor: TEXT_PRIMARY,
      textDisabledColor: TEXT_PLACEHOLDER,
      arrowColor: PRIMARY_COLOR,
      textDayFontSize: font(14),
      textDayHeaderFontSize: font(11),
      textMonthFontSize: font(14),
      textDayFontWeight: "400",
      textDayHeaderFontWeight: "600",
      textMonthFontWeight: "600",
    }),
    [font],
  );

  // Mes visible: se inicializa en el mes del rango (o el actual) y luego solo
  // lo mueve la navegación del usuario — `current` fija el mes inicial del
  // Calendar y NO debe cambiar después, o la librería saltaría de mes. El
  // `displayMonth` (que sí se actualiza con onMonthChange) se usa para armar
  // las marks del mes visible.
  const [current] = useState(() => {
    const base = selectedRange?.start ?? new Date();
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    return toDateKey(first);
  });
  const [displayMonth, setDisplayMonth] = useState(() => {
    const base = selectedRange?.start ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [startDate, setStartDate] = useState<Date | null>(
    selectedRange?.start ?? null,
  );
  const [endDate, setEndDate] = useState<Date | null>(selectedRange?.end ?? null);

  // Sincroniza con selectedRange (p. ej. al restaurar un borrador de
  // AsyncStorage) — descarta el rango si ya no cumple isDateAllowed.
  /* eslint-disable react-hooks/set-state-in-effect */
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
  // eslint-enable react-hooks/set-state-in-effect

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

  const handleMonthChange = useCallback((date: DateData) => {
    setDisplayMonth(new Date(date.year, date.month - 1, 1));
  }, []);

  const markedDates = useMemo(() => {
    const marks: Record<
      string,
      {
        disabled?: boolean;
        disableTouchEvent?: boolean;
        startingDay?: boolean;
        endingDay?: boolean;
        color?: string;
        textColor?: string;
      }
    > = {};
    const today = startOfDay(new Date());
    const daysInMonth = new Date(
      displayMonth.getFullYear(),
      displayMonth.getMonth() + 1,
      0,
    ).getDate();

    const hasRange = !!startDate && !!endDate;
    const rangeStart =
      hasRange &&
      (startDate!.getTime() <= endDate!.getTime() ? startDate : endDate);
    const rangeEnd =
      hasRange &&
      (startDate!.getTime() <= endDate!.getTime() ? endDate : startDate);
    const rangeStartKey = rangeStart ? toDateKey(rangeStart) : null;
    const rangeEndKey = rangeEnd ? toDateKey(rangeEnd) : null;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = startOfDay(
        new Date(displayMonth.getFullYear(), displayMonth.getMonth(), day),
      );
      const key = toDateKey(date);
      const mark: (typeof marks)[string] = {};

      // Días no permitidos: la librería los deshabilita nativo (sin lógica
      // propia de bloqueo). Pasados también (mismo criterio que el grid previo).
      const isPast = date.getTime() < today.getTime();
      const notAllowed = !!isDateAllowed && !isDateAllowed(date);
      if (isPast || notAllowed) {
        mark.disabled = true;
        mark.disableTouchEvent = true;
      }

      // Rango en modo "period" — mismo patrón de la doc oficial: startingDay
      // en un extremo, endingDay en el otro, color para los días del medio.
      if (hasRange && rangeStartKey && rangeEndKey) {
        if (key >= rangeStartKey && key <= rangeEndKey) {
          mark.startingDay = key === rangeStartKey;
          mark.endingDay = key === rangeEndKey;
          mark.color = PRIMARY_COLOR;
          mark.textColor = CARD_BACKGROUND;
        }
      }

      if (Object.keys(mark).length > 0) marks[key] = mark;
    }
    return marks;
  }, [displayMonth, startDate, endDate, isDateAllowed]);

  const handleDayPress = useCallback(
    (day: DateData) => {
      // Días de otros meses que asoman en la grilla del mes visible: no son
      // seleccionables (el grid previo los pintaba vacíos/deshabilitados).
      if (day.year !== displayMonth.getFullYear() || day.month !== displayMonth.getMonth() + 1) {
        return;
      }
      const clicked = dateFromKey(day.dateString);
      if (!clicked) return;

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
    [startDate, endDate, applyRange, displayMonth],
  );

  const totalDays =
    startDate && endDate
      ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      : startDate
        ? 1
        : 0;

  return (
    <View style={styles.calendar}>
      <Calendar
        current={current}
        onDayPress={handleDayPress}
        onMonthChange={handleMonthChange}
        markingType="period"
        markedDates={markedDates}
        theme={calendarTheme}
        enableSwipeMonths
      />

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