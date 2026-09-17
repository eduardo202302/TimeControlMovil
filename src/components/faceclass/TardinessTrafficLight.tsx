import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CARD_BACKGROUND,
  CARD_BORDER,
  FOOTER_BORDER,
  INPUT_BORDER,
  PRIMARY_COLOR,
  TEXT_PRIMARY,
} from "@/constants/colors";
import {
  RADIUS_2XL,
  RADIUS_MD,
  useResponsive,
} from "@/constants/responsive";
import {
  pad2,
  tardinessColorAt,
  type StudentTardiness,
} from "../../utils/tardinessRules";
import { formatDisplayTime } from "../timeoff/RevisionFinalModal";

/** Lado del círculo de cada luz — círculo real (size/2), no token de radio. */
const LIGHT_SIZE = 22;
/** Ícono de reloj dentro del círculo de luz. */
const LIGHT_ICON_SIZE = 12;

/**
 * "DD/MM/YYYY" desde un registro de tardanza. El `date` del backend llega ya
 * formateado ("YYYY-MM-DD HH:mm:ss"); se acepta ISO con T. Sin date → "".
 */
function recordDateLabel(record: StudentTardiness): string {
  const raw = String(record.date ?? record.createdDate ?? "").trim();
  const [datePart] = raw.split(/[T ]/);
  if (!datePart) return "";
  const parts = datePart.split("-");
  if (
    parts.length === 3 &&
    /^\d{4}$/.test(parts[0]) &&
    /^\d{2}$/.test(parts[1]) &&
    /^\d{2}$/.test(parts[2])
  ) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return datePart;
}

/** "HH:mm" de la hora del registro, o null si no tiene hora. */
function recordTimeLabel(record: StudentTardiness): string | null {
  const raw = String(record.date ?? record.createdDate ?? "").trim();
  const [, timePart] = raw.split(/[T ]/);
  const hhmm = timePart?.slice(0, 5);
  return hhmm && /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : null;
}

/** "DD/MM/YYYY" de la fecha del dispositivo — fecha de la tardanza NUEVA. */
function todayLabel(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** Date con la hora de "HH:mm"; hora actual si el valor no es parseable. */
function timeToDate(hhmm: string): Date {
  const now = new Date();
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return now;
  const date = new Date(now);
  date.setHours(parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
  return date;
}

/** "HH:mm" desde un Date (reverso del picker). */
function toHHMM(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

interface TardinessTrafficLightProps {
  /** Tardanzas ACTIVAS del estudiante (`student.tardiness`). */
  records: StudentTardiness[];
  /** Umbral del semáforo — la luz de cada tardanza sale de
   * `tardinessColorAt(index, daysLateAbsence)` (3 vs 4 colores, `=== 4`). */
  daysLateAbsence: number;
  /** Modo Manual: la fila NUEVA muestra el selector de hora editable a la derecha. */
  manual: boolean;
  /** Hora "HH:mm" precargada con la hora actual del dispositivo. */
  time: string;
  onTimeChange: (value: string) => void;
}

/**
 * Card "Tardanzas" — replica el patrón del TrafficLight de face-class-web: por
 * cada tardanza (activas + la NUEVA) UNA fila con un solo círculo de color
 * (reloj chico adentro), fecha DD/MM/AAAA en negrita y hora en gris. Solo la
 * fila NUEVA, en modo Manual, lleva el selector de hora nativo
 * (@react-native-community/datetimepicker, mismo patrón que
 * SolicitarPermisoForm/HolidaysFormModal: Android inline, iOS modal con
 * Cancelar/Listo).
 */
export default function TardinessTrafficLight({
  records,
  daysLateAbsence,
  manual,
  time,
  onTimeChange,
}: TardinessTrafficLightProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );
  const pendingDate = useMemo(() => todayLabel(new Date()), []);
  const pendingColor = tardinessColorAt(records.length, daysLateAbsence);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerDraft, setPickerDraft] = useState<Date>(() => new Date());

  const openPicker = useCallback(() => {
    setPickerDraft(timeToDate(time));
    setPickerVisible(true);
  }, [time]);

  const handlePickerChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === "android") {
        setPickerVisible(false);
        if (event.type !== "set" || !date) return;
        onTimeChange(toHHMM(date));
        return;
      }
      if (date) setPickerDraft(date);
    },
    [onTimeChange],
  );

  const confirmIosPicker = useCallback(() => {
    onTimeChange(toHHMM(pickerDraft));
    setPickerVisible(false);
  }, [pickerDraft, onTimeChange]);

  return (
    <>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="time-outline" size={18} color={PRIMARY_COLOR} />
          <Text style={styles.title}>Tardanzas</Text>
        </View>

        {/* Filas: una por tardanza activa + la nueva.
            Un SOLO círculo por tardanza, siempre pegado a su fecha/hora. */}
        {records.map((record, index) => {
          const date = recordDateLabel(record);
          const timeOnly = recordTimeLabel(record);
          return (
            <View key={record.id ?? index} style={styles.row}>
              <View
                style={[
                  styles.light,
                  { backgroundColor: tardinessColorAt(index, daysLateAbsence) },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={LIGHT_ICON_SIZE}
                  color="#fff"
                />
              </View>
              <Text style={styles.rowDate} numberOfLines={1}>
                {date || "—"}
              </Text>
              {timeOnly && (
                <Text style={styles.rowTime} numberOfLines={1}>
                  {formatDisplayTime(timeOnly)}
                </Text>
              )}
            </View>
          );
        })}

        {/* Fila NUEVA: la tardanza que se está creando */}
        <View style={styles.row}>
          <View style={[styles.light, { backgroundColor: pendingColor }]}>
            <Ionicons name="time-outline" size={LIGHT_ICON_SIZE} color="#fff" />
          </View>
          <Text style={styles.rowDate} numberOfLines={1}>
            {pendingDate}
          </Text>
          {manual ? (
            <TouchableOpacity
              style={styles.timeSelect}
              onPress={openPicker}
              activeOpacity={0.75}
            >
              <Ionicons name="time-outline" size={16} color={PRIMARY_COLOR} />
              <Text style={styles.timeSelectText}>{formatDisplayTime(time)}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.rowTime} numberOfLines={1}>
              {formatDisplayTime(time)}
            </Text>
          )}
        </View>
      </View>

      {/* ── Picker nativo de hora (mismo patrón que SolicitarPermisoForm) ── */}
      {pickerVisible &&
        (Platform.OS === "ios" ? (
          <Modal visible transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.pickerCard}>
                <View style={styles.pickerBar}>
                  <TouchableOpacity onPress={() => setPickerVisible(false)}>
                    <Text style={styles.pickerCancel}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmIosPicker}>
                    <Text style={styles.pickerDone}>Listo</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={pickerDraft}
                  mode="time"
                  display="spinner"
                  onChange={handlePickerChange}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={pickerDraft}
            mode="time"
            display="default"
            onChange={handlePickerChange}
          />
        ))}
    </>
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
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      marginBottom: verticalScale(12),
    },
    title: {
      fontSize: font(15),
      fontWeight: "700",
      color: TEXT_PRIMARY,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      paddingVertical: verticalScale(6),
    },
    light: {
      width: LIGHT_SIZE,
      height: LIGHT_SIZE,
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: LIGHT_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    rowDate: {
      flexShrink: 1,
      fontSize: font(13),
      fontWeight: "700",
      color: TEXT_PRIMARY,
    },
    rowTime: { fontSize: font(13), color: "#6B7280" },
    timeSelect: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      marginLeft: "auto",
      borderWidth: 1,
      borderColor: INPUT_BORDER,
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(6),
      backgroundColor: CARD_BACKGROUND,
    },
    timeSelectText: {
      fontSize: font(13),
      fontWeight: "600",
      color: TEXT_PRIMARY,
    },

    /* ── Modal del picker en iOS ── */
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: scale(24),
    },
    pickerCard: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: CARD_BACKGROUND,
      borderRadius: RADIUS_2XL,
      overflow: "hidden",
      elevation: 10,
    },
    pickerBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: scale(18),
      paddingVertical: verticalScale(14),
      borderBottomWidth: 1,
      borderBottomColor: FOOTER_BORDER,
    },
    pickerCancel: { fontSize: font(14), fontWeight: "600", color: "#6B7280" },
    pickerDone: { fontSize: font(14), fontWeight: "700", color: PRIMARY_COLOR },
  });
}