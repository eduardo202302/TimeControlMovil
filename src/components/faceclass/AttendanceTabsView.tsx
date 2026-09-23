import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CARD_BACKGROUND,
  CARD_BORDER,
  ERROR_COLOR,
  FOOTER_BORDER,
  PRIMARY_COLOR,
  PRIMARY_TINT_BACKGROUND,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WARNING_COLOR,
} from "@/constants/colors";
import { RADIUS_2XL, RADIUS_LG, RADIUS_MD, RADIUS_PILL, useResponsive } from "@/constants/responsive";
import { pickUserPhoto } from "../users/pickUserPhoto";
import {
  applyListAction,
  displayStatus,
  isRowLocked,
  shouldShowTardinessPicker,
  showEditIcon,
  subtabRowConfig,
  tardinessEntryTimeValue,
  type ListRowAction,
} from "../../utils/attendanceListRules";
import {
  buildManualStudentsPayload,
  countBySubtab,
  filterDetailsBySubtab,
  formatHourLabel,
  formatRecognizedCount,
  splitDetailsByStatus,
  submitAttendanceManual,
  submitAttendancePhotos,
  tabLabel,
  todosSubtabLabel,
  toListRows,
  visibleSubtabs,
  type AttendanceData,
  type AttendanceDetail,
  type AttendanceListRow,
  type AttendanceStatus,
  type ListSubtab,
} from "../../utils/attendanceRules";
import * as Storage from "../../utils/storage";
import { useSchoolStore } from "../../../store/useSchoolStore";

/**
 * Cuerpo compartido de la toma de asistencia: los 6 tabs (Asis./Pre/Aus/Tar/
 * Ex/List), los subtabs de la Lista, la toma de foto, los Resultados y el
 * guardado por diff. Lo usan las DOS pantallas de Face Class:
 *
 *   - Asistencia Adm. (`adminattendancetaking`, menú id:25): elige el curso
 *     con un selector y el backend le devuelve la clase en curso de ese curso.
 *   - Asistencia (docente, `attendancetaking`): no elige nada — la clase sale
 *     de `attendancesToday` del store y el backend resuelve el docente desde
 *     el token.
 *
 * Lo que cambia entre ambas vive en props (cabecera, selector de curso,
 * "Atrás"); lo que NO cambia —que es casi todo— vive aquí una sola vez.
 *
 * El componente NO hace fetch: el caller le pasa `attendance`/`loading`/
 * `loadError` ya resueltos y una forma de recargar (`onReload`), porque cada
 * pantalla pega a un endpoint distinto.
 */

/**
 * Copia deliberada de PHOTO_HOST/photoUri() de adminpunchinout.tsx (mismo
 * criterio que el resto de pantallas: no acoplar por 3 líneas). Las rutas de
 * fotos del backend son relativas; si ya vienen absolutas se usan tal cual.
 */
const PHOTO_HOST = "https://timecontrol.wsmax.net:8600";

function photoUri(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${PHOTO_HOST}/${raw}`;
}

type TabId = "Asistencia" | "Presente" | "Ausencia" | "Tardanza" | "Excusa" | "Lista";
type StatusVariant = "presente" | "ausente" | "tardanza" | "excusa";

/** Colores de título de AttendanceList.module.css del webapp. */
const VARIANT_COLORS: Record<StatusVariant, { bg: string; fg: string }> = {
  presente: { bg: "#A6D7B0", fg: "#1F4D2B" },
  ausente: { bg: "#FECACA", fg: "#7F1D1D" },
  tardanza: { bg: "#F4B988", fg: "#7C3A12" },
  excusa: { bg: "#FFEF95", fg: "#713F12" },
};

const RECORDED_LABEL: Record<string, string> = {
  auto: "Foto",
  manual: "Manual",
};

/**
 * `notFound` es un estado explícito (no hay clase en curso), no un error: se
 * pinta como estado vacío con el mensaje real del backend.
 */
export type LoadError = { kind: "notFound" | "error"; message: string };

/** Letra de la insignia de estado (stateTitle de StudentAttendanceCard). */
const STATUS_LETTER: Record<StatusVariant, string> = {
  presente: "P",
  ausente: "A",
  tardanza: "T",
  excusa: "E",
};

/** Labels de los botones de estado del webapp. */
const ACTION_LABEL: Record<AttendanceStatus, string> = {
  tardanza: "Tard.",
  ausente: "Ause.",
  presente: "Pres.",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date de hoy con la hora "HH:mm" (hora actual si no parsea) — para el picker. */
function timeToDate(hhmm: string): Date {
  const date = new Date();
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (match) date.setHours(parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
  return date;
}

/** "HH:mm" desde un Date (reverso del picker). */
function toHHMM(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export interface AttendanceTabsViewProps {
  /** Clase cargada por el caller. `null` = nada que mostrar todavía. */
  attendance: AttendanceData | null;
  /** Hay un fetch en vuelo — el cuerpo muestra el spinner. */
  loading: boolean;
  /** Resultado no-exitoso del último fetch, ya con el mensaje del backend. */
  loadError: LoadError | null;
  /** `resolveAttendanceGating` ya resuelto por el caller (depende del store). */
  gating: { cantAuto: boolean; cantManual: boolean };
  /** "Curso - Sección" para el meta de cada estudiante. */
  courseLabel: string;
  /**
   * Adm. sí, docente no. Cuando es true se pinta `courseSelector` arriba del
   * tab "Asis." (el docente no elige curso: el backend ya sabe cuál es).
   */
  showCourseSelector: boolean;
  /** El card del selector — solo se usa con `showCourseSelector`. */
  courseSelector?: React.ReactNode;
  /** Cabecera fija ENCIMA de la fila de tabs (la usa el docente). */
  header?: React.ReactNode;
  /** Texto del estado vacío inicial (sin datos y sin error). */
  emptyText?: string;
  /** Habilita el pull-to-refresh (Adm.: solo con curso elegido). */
  refreshEnabled?: boolean;
  /** Pull-to-refresh y refetch tras guardar. */
  onReload: () => void | Promise<void>;
  /** Botón "Atrás" del footer. */
  onBack: () => void;
  /**
   * Cambiarlo devuelve la vista al tab "Asis.". Adm. lo mueve en cada
   * selección de curso (el `setActiveTab("Asistencia")` que tenía la pantalla
   * antes de la extracción); recargar la MISMA clase no lo toca, para no
   * sacar al usuario del tab en que estaba al guardar o al refrescar.
   */
  resetKey?: number | string | null;
}

export default function AttendanceTabsView({
  attendance,
  loading,
  loadError,
  gating,
  courseLabel,
  showCourseSelector,
  courseSelector,
  header,
  emptyText = "Selecciona un curso con clase en curso para tomar la asistencia.",
  refreshEnabled = true,
  onReload,
  onBack,
  resetKey,
}: AttendanceTabsViewProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createAttendanceStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { urlColegio } = useSchoolStore();
  const { cantAuto, cantManual } = gating;

  const getAuth = useCallback(async () => {
    const token =
      useSchoolStore.getState().token ?? (await Storage.getItemAsync("token"));
    const url =
      urlColegio ?? useSchoolStore.getState().urlColegio ?? (await Storage.getItemAsync("urlColegio"));
    return token && url ? { token, urlColegio: url } : null;
  }, [urlColegio]);

  /** Estado de la Lista manual. */
  const [rows, setRows] = useState<AttendanceListRow[]>([]);
  /** true tras cualquier cambio en la Lista — oculta la cámara hasta guardar. */
  const [disabledAuto, setDisabledAuto] = useState(false);

  // ── Toma de foto ──
  /** Solo fotos NUEVAS (data URI). Las guardadas viven en `attendance.photos`. */
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [late, setLate] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>("Asistencia");
  const [listSubtab, setListSubtab] = useState<ListSubtab>("Todos");

  // ── Selector de hora de entrada (una sola instancia para toda la Lista) ──
  const [picker, setPicker] = useState<{ rowId: number; draft: Date } | null>(null);

  /**
   * Igual que `setUpFetchData` del webapp: cada carga nueva descarta las fotos
   * sin guardar y los cambios de la Lista, y re-habilita ambos modos. Se
   * dispara por identidad de `attendance` porque el caller construye un objeto
   * nuevo en cada fetch (y lo pone en null cuando falla).
   */
  useEffect(() => {
    setRows(attendance ? toListRows(attendance.attendanceDetails) : []);
    setNewPhotos([]);
    setDisabledAuto(false);
  }, [attendance]);

  useEffect(() => {
    setActiveTab("Asistencia");
  }, [resetKey]);

  // ── Cámara ──
  const handleCapture = useCallback(async () => {
    setCapturing(true);
    const result = await pickUserPhoto("camera");
    setCapturing(false);
    switch (result.status) {
      case "ok":
        setNewPhotos((prev) => [...prev, result.dataUrl]);
        break;
      case "denied":
        Alert.alert("Permiso requerido", "Debes permitir el acceso a la cámara para tomar la foto.");
        break;
      case "error":
        Alert.alert("Error de Imagen", "No se pudo capturar la imagen.");
        break;
      default:
        break;
    }
  }, []);

  const removeNewPhoto = useCallback((index: number) => {
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Lista manual ──
  /**
   * Port de `handlerAttendance`: aplica la acción a esa fila y, como en el
   * webapp, cualquier acción (estado, lápiz u hora) bloquea la toma de foto
   * hasta guardar.
   */
  const handleListAction = useCallback(
    (rowId: number, action: ListRowAction, value?: string) => {
      setRows((prev) => applyListAction(prev, rowId, action, value));
      setDisabledAuto(true);
    },
    [],
  );

  const openEntryTimePicker = useCallback((row: AttendanceListRow, listDisabled: boolean) => {
    setPicker({ rowId: row.id, draft: timeToDate(tardinessEntryTimeValue(row, listDisabled)) });
  }, []);

  const handlePickerChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === "android") {
        const target = picker;
        setPicker(null);
        if (!target || event.type !== "set" || !date) return;
        handleListAction(target.rowId, "tardinessEntryTime", toHHMM(date));
        return;
      }
      if (date) setPicker((prev) => (prev ? { ...prev, draft: date } : prev));
    },
    [picker, handleListAction],
  );

  const confirmIosPicker = useCallback(() => {
    if (picker) handleListAction(picker.rowId, "tardinessEntryTime", toHHMM(picker.draft));
    setPicker(null);
  }, [picker, handleListAction]);

  // ── Guardar ──
  const handleSave = useCallback(async () => {
    if (!attendance || saving) return;
    const auth = await getAuth();
    if (!auth) {
      Alert.alert("Error", "No hay conexión activa.");
      return;
    }
    setSaving(true);
    const result =
      newPhotos.length > 0
        ? await submitAttendancePhotos(
            { attendanceId: attendance.id, photos: newPhotos, late },
            auth,
          )
        : await submitAttendanceManual(
            { attendanceId: attendance.id, students: buildManualStudentsPayload(rows) },
            auth,
          );
    setSaving(false);
    if (!result.ok) {
      Alert.alert("No se guardó", result.message);
      return;
    }
    const detail = [result.message, ...result.failedPhotos].join("\n");
    Alert.alert("Asistencia guardada", detail);
    // El cliente no lee el POST para actualizar estado: refresca con un GET.
    await onReload();
  }, [attendance, saving, getAuth, newPhotos, late, rows, onReload]);

  // ── Derivados ──
  const statistics = attendance?.statistics;
  const byStatus = useMemo(
    () => splitDetailsByStatus(attendance?.attendanceDetails ?? []),
    [attendance],
  );

  /** Fotos nuevas sin guardar → Verif./Manual pasan a solo lectura. */
  const cantUpdateManual = newPhotos.length > 0;
  const subtabs = visibleSubtabs({ cantAuto, cantManual });
  const currentSubtab: ListSubtab = subtabs.includes(listSubtab) ? listSubtab : "Todos";
  const subtabCounts = countBySubtab(rows);
  const subtabLabels: Record<ListSubtab, string> = {
    Todos: todosSubtabLabel(subtabCounts),
    Foto: tabLabel("Foto", subtabCounts.foto),
    Verificados: tabLabel("Verif.", subtabCounts.verificados),
    Manual: tabLabel("Manual", subtabCounts.manual),
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "Asistencia", label: "Asis." },
    { id: "Presente", label: tabLabel("Pre", statistics?.presente) },
    { id: "Ausencia", label: tabLabel("Aus", statistics?.ausente) },
    { id: "Tardanza", label: tabLabel("Tar", statistics?.tardanza) },
    { id: "Excusa", label: tabLabel("Ex", statistics?.excusa) },
    { id: "Lista", label: tabLabel("List", rows.length) },
  ];

  // ── Render ──
  const renderPhotoCard = (data: AttendanceData) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="image-outline" size={18} color={PRIMARY_COLOR} />
        <Text style={styles.cardTitle}>Toma de foto</Text>
      </View>

      {(data.photos.length > 0 || newPhotos.length > 0) && (
        <View style={styles.thumbGrid}>
          {/* Guardadas: solo lectura — el backend no permite borrarlas. */}
          {data.photos.map((photo, index) => {
            const uri = photoUri(photo.path);
            return (
              <View key={`saved-${index}`} style={styles.thumb}>
                {uri ? (
                  <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
                ) : (
                  <Ionicons name="person" size={28} color={TEXT_PLACEHOLDER} />
                )}
                <View
                  style={[
                    styles.thumbBadge,
                    {
                      backgroundColor:
                        photo.markedAs === "tardanza"
                          ? VARIANT_COLORS.tardanza.bg
                          : VARIANT_COLORS.presente.bg,
                    },
                  ]}
                >
                  <Text style={styles.thumbBadgeText}>{photo.studentsMarked}</Text>
                </View>
              </View>
            );
          })}
          {newPhotos.map((dataUrl, index) => (
            <View key={`new-${index}`} style={[styles.thumb, styles.thumbNew]}>
              <Image source={{ uri: dataUrl }} style={styles.thumbImage} resizeMode="cover" />
              <TouchableOpacity
                style={styles.thumbRemove}
                onPress={() => removeNewPhoto(index)}
                hitSlop={8}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {disabledAuto ? (
        <Text style={styles.disabledText}>
          La toma de asistencia está deshabilitada hasta guardar los cambios hechos en la lista
          manual
        </Text>
      ) : (
        <View style={styles.captureRow}>
          <View style={styles.radios}>
            {[
              { value: false, label: "Asistencia", color: VARIANT_COLORS.presente },
              { value: true, label: "Tardanza", color: VARIANT_COLORS.tardanza },
            ].map((opt) => {
              const checked = late === opt.value;
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[styles.radio, { backgroundColor: opt.color.bg }]}
                  onPress={() => setLate(opt.value)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={checked ? "radio-button-on" : "radio-button-off"}
                    size={18}
                    color={opt.color.fg}
                  />
                  <Text style={[styles.radioText, { color: opt.color.fg }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={[styles.cameraBtn, capturing && styles.cameraBtnBusy]}
            onPress={handleCapture}
            disabled={capturing}
            activeOpacity={0.8}
          >
            {capturing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="camera" size={22} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderResultRow = (label: string, value: string | number | null) => (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={styles.resultValue}>{value ?? ""}</Text>
    </View>
  );

  /** El webapp deja el valor en blanco cuando es 0. */
  const positive = (n: number | undefined) => (n && n > 0 ? n : null);

  const renderResultsCard = (data: AttendanceData) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="bar-chart-outline" size={18} color={PRIMARY_COLOR} />
        <Text style={styles.cardTitle}>Resultados</Text>
      </View>
      {!cantAuto && renderResultRow("Reconocidos:", formatRecognizedCount(data.photos))}
      {renderResultRow("Registrados:", positive(rows.length))}
      <View style={styles.divider} />
      {renderResultRow("Ausente:", positive(data.statistics.ausente))}
      {renderResultRow("Tardanza Entrada:", positive(data.statistics.TardanzaEntrada))}
      {renderResultRow("Tardanza:", positive(data.statistics.tardanza))}
      {renderResultRow("Excusa:", positive(data.statistics.excusa))}
      <View style={styles.divider} />
      {renderResultRow("Presente:", positive(data.statistics.presente))}
    </View>
  );

  const renderEmptyState = () => {
    if (loading) {
      return (
        <View style={styles.emptyCard}>
          <ActivityIndicator color={PRIMARY_COLOR} />
        </View>
      );
    }
    if (loadError) {
      return (
        <View style={styles.emptyCard}>
          <Ionicons
            name={loadError.kind === "notFound" ? "calendar-outline" : "alert-circle-outline"}
            size={32}
            color={loadError.kind === "notFound" ? TEXT_PLACEHOLDER : ERROR_COLOR}
          />
          <Text style={styles.emptyTitle}>
            {loadError.kind === "notFound" ? "Sin clase en curso" : "No se pudo cargar"}
          </Text>
          <Text style={styles.emptyText}>{loadError.message}</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="school-outline" size={32} color={TEXT_PLACEHOLDER} />
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  };

  const renderStudentRow = (detail: AttendanceDetail) => {
    const uri = photoUri(detail.student?.photourl);
    const meta = [
      courseLabel,
      detail.student?.code,
      RECORDED_LABEL[detail.recorded],
      detail.status === "tardanza" ? detail.tardinessTime : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <View key={detail.id} style={styles.studentRow}>
        <View style={styles.avatar}>
          {uri ? (
            <Image source={{ uri }} style={styles.avatarImage} resizeMode="cover" />
          ) : (
            <Ionicons name="person" size={18} color={TEXT_PLACEHOLDER} />
          )}
        </View>
        <View style={styles.studentInfo}>
          <Text style={styles.studentName} numberOfLines={2}>
            {detail.student?.fullName ?? ""}
          </Text>
          {!!meta && (
            <Text style={styles.studentMeta} numberOfLines={1}>
              {meta}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderStatusList = (title: string, variant: StatusVariant, details: AttendanceDetail[]) => {
    const sorted = [...details].sort((a, b) =>
      (a.student?.fullName ?? "").localeCompare(b.student?.fullName ?? ""),
    );
    return (
      <View style={styles.card}>
        {sorted.length === 0 ? (
          <Text style={styles.emptyText}>Sin estudiantes</Text>
        ) : (
          <>
            <View style={[styles.listTitle, { backgroundColor: VARIANT_COLORS[variant].bg }]}>
              <Text style={[styles.listTitleText, { color: VARIANT_COLORS[variant].fg }]}>
                {title}
              </Text>
            </View>
            {sorted.map(renderStudentRow)}
          </>
        )}
      </View>
    );
  };

  const renderListRow = (
    row: AttendanceListRow,
    listDisabled: boolean,
    buttons: AttendanceStatus[],
  ) => {
    const uri = photoUri(row.student?.photourl);
    const locked = isRowLocked(row, listDisabled);
    const shown = displayStatus(row);
    const meta = [
      courseLabel,
      row.student?.code,
      RECORDED_LABEL[row.recorded],
      row.status === "tardanza" && row.recorded !== "unrecorded" ? row.tardinessTime : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <View key={row.id} style={styles.listRow}>
        <View style={styles.listRowMain}>
          <View style={styles.avatar}>
            {uri ? (
              <Image source={{ uri }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Ionicons name="person" size={18} color={TEXT_PLACEHOLDER} />
            )}
          </View>
          <View style={styles.studentInfo}>
            <Text style={styles.studentName} numberOfLines={2}>
              {row.student?.fullName ?? ""}
            </Text>
            {!!meta && (
              <Text style={styles.studentMeta} numberOfLines={1}>
                {meta}
              </Text>
            )}
          </View>
          {showEditIcon(row, listDisabled) && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => handleListAction(row.id, "edit")}
              hitSlop={8}
            >
              <Ionicons name="create-outline" size={20} color={PRIMARY_COLOR} />
            </TouchableOpacity>
          )}
          <View style={[styles.statusBadge, { backgroundColor: VARIANT_COLORS[shown].bg }]}>
            <Text style={[styles.statusBadgeText, { color: VARIANT_COLORS[shown].fg }]}>
              {STATUS_LETTER[shown]}
            </Text>
          </View>
        </View>

        {buttons.length > 0 && (
          <View style={styles.actionRow}>
            {buttons.map((status) => {
              const active = row.status === status;
              return (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.actionBtn,
                    active && {
                      backgroundColor: VARIANT_COLORS[status].bg,
                      borderColor: VARIANT_COLORS[status].fg,
                    },
                    locked && styles.actionBtnLocked,
                  ]}
                  onPress={() => handleListAction(row.id, status)}
                  disabled={locked}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.actionBtnText,
                      active && { color: VARIANT_COLORS[status].fg },
                    ]}
                  >
                    {ACTION_LABEL[status]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {shouldShowTardinessPicker(row, listDisabled) && (
          <View style={styles.entryTimeRow}>
            <Text style={styles.entryTimeLabel}>Hora de entrada:</Text>
            <TouchableOpacity
              style={styles.timeSelect}
              onPress={() => openEntryTimePicker(row, listDisabled)}
              activeOpacity={0.75}
            >
              <Ionicons name="time-outline" size={16} color={PRIMARY_COLOR} />
              <Text style={styles.timeSelectText}>
                {formatHourLabel(tardinessEntryTimeValue(row, listDisabled))}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderList = () => {
    const { listDisabled, buttons } = subtabRowConfig(currentSubtab, cantUpdateManual);
    const visible = filterDetailsBySubtab(rows, currentSubtab).sort((a, b) =>
      (a.student?.fullName ?? "").localeCompare(b.student?.fullName ?? ""),
    );
    return (
      <View style={styles.card}>
        {visible.length === 0 ? (
          <Text style={styles.emptyText}>Sin coincidencias</Text>
        ) : (
          visible.map((row) => renderListRow(row, listDisabled, buttons))
        )}
      </View>
    );
  };

  const renderTabContent = () => {
    if (activeTab === "Asistencia") {
      return (
        <>
          {showCourseSelector && courseSelector}
          {attendance && !loading ? (
            <>
              {!cantAuto && renderPhotoCard(attendance)}
              {renderResultsCard(attendance)}
            </>
          ) : (
            renderEmptyState()
          )}
        </>
      );
    }
    if (!attendance) return renderEmptyState();
    switch (activeTab) {
      case "Presente":
        return renderStatusList("Presentes", "presente", byStatus.presente);
      case "Ausencia":
        return renderStatusList("Ausentes", "ausente", byStatus.ausente);
      case "Tardanza":
        return renderStatusList("Tardanzas", "tardanza", byStatus.tardanza);
      case "Excusa":
        return renderStatusList("Excusas", "excusa", byStatus.excusa);
      default:
        return renderList();
    }
  };

  const saveDisabled = !attendance || saving || loading;

  return (
    <View style={styles.screen}>
      {header}

      {/* ── Tabs — fila de botones tipo ITabs del webapp ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsBar}
        contentContainerStyle={styles.tabs}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {activeTab === "Lista" && attendance && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsBar}
          contentContainerStyle={styles.tabs}
        >
          {subtabs.map((subtab) => {
            const active = subtab === currentSubtab;
            return (
              <TouchableOpacity
                key={subtab}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setListSubtab(subtab)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {subtabLabels[subtab]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={onReload}
            enabled={refreshEnabled}
            tintColor={PRIMARY_COLOR}
            colors={[PRIMARY_COLOR]}
          />
        }
      >
        {renderTabContent()}
      </ScrollView>

      <View style={styles.footer}>
        {/* "Atrás" del webapp: navega directo, sin advertir cambios sin guardar. */}
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <Text style={styles.backText}>Atrás</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saveDisabled}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveText}>Guardar</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Picker nativo de hora (mismo patrón que TardinessTrafficLight) ── */}
      {picker &&
        (Platform.OS === "ios" ? (
          <Modal visible transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.pickerCard}>
                <View style={styles.pickerBar}>
                  <TouchableOpacity onPress={() => setPicker(null)}>
                    <Text style={styles.pickerCancel}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmIosPicker}>
                    <Text style={styles.pickerDone}>Listo</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={picker.draft}
                  mode="time"
                  display="spinner"
                  onChange={handlePickerChange}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={picker.draft}
            mode="time"
            display="default"
            onChange={handlePickerChange}
          />
        ))}
    </View>
  );
}

/** Lado de las miniaturas de fotos — tamaño fijo, como los avatares. */
const THUMB_SIZE = 72;

/**
 * Hoja de estilos completa de la toma de asistencia. Se exporta porque las dos
 * pantallas arman su propia cabecera (selector de curso / datos de la clase) y
 * deben pintarla con los mismos cards, filas y tipografías que el cuerpo.
 */
export function createAttendanceStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    screen: { flex: 1 },

    /* ── Tabs ── */
    // El estilo base de ScrollView es flexGrow:1 + flexShrink:1. Sin
    // flexShrink:0, cuando el contenido de abajo es alto Yoga encoge también
    // esta fila por debajo del alto de sus tabs y el ScrollView (que siempre
    // recorta) corta el texto.
    tabsBar: {
      flexGrow: 0,
      flexShrink: 0,
      backgroundColor: CARD_BACKGROUND,
      borderBottomWidth: 1,
      borderBottomColor: FOOTER_BORDER,
    },
    tabs: {
      alignItems: "center",
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(8),
      gap: scale(6),
    },
    tab: {
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(8),
      borderRadius: RADIUS_MD,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabActive: {
      backgroundColor: PRIMARY_TINT_BACKGROUND,
      borderBottomColor: PRIMARY_COLOR,
    },
    // lineHeight explícito: en Android el texto sin lineHeight puede quedar
    // más alto que su caja y cortarse arriba.
    tabText: {
      fontSize: font(13),
      lineHeight: font(18),
      fontWeight: "600",
      color: TEXT_SECONDARY,
    },
    tabTextActive: { color: PRIMARY_COLOR, fontWeight: "700" },

    /** Ocupa el resto del alto — no compite con la fila de tabs. */
    body: { flex: 1 },
    content: {
      padding: scale(16),
      gap: verticalScale(12),
      paddingBottom: verticalScale(24),
    },

    /* ── Cards ── */
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
    emptyTitle: { fontSize: font(15), fontWeight: "700", color: TEXT_PRIMARY },
    emptyText: {
      fontSize: font(13),
      color: "#6B7280",
      textAlign: "center",
    },

    /* ── Selector de curso ── */
    selector: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      borderWidth: 1,
      borderColor: CARD_BORDER,
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(11),
    },
    selectorText: { flex: 1, fontSize: font(14), fontWeight: "600", color: TEXT_PRIMARY },
    selectorPlaceholder: { fontWeight: "400", color: TEXT_PLACEHOLDER },
    classInfo: {
      marginTop: verticalScale(12),
      borderTopWidth: 1,
      borderTopColor: FOOTER_BORDER,
      paddingTop: verticalScale(10),
      gap: verticalScale(8),
    },
    infoRow: { flexDirection: "row", alignItems: "center", gap: scale(8) },
    infoLabel: {
      width: scale(80),
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

    /* ── Toma de foto ── */
    thumbGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: scale(8),
      marginBottom: verticalScale(12),
    },
    thumb: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: RADIUS_MD,
      backgroundColor: "#F3F4F6",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    thumbNew: { borderWidth: 2, borderColor: PRIMARY_COLOR },
    thumbImage: { width: THUMB_SIZE, height: THUMB_SIZE },
    thumbBadge: {
      position: "absolute",
      bottom: 4,
      right: 4,
      minWidth: 22,
      paddingHorizontal: scale(5),
      paddingVertical: verticalScale(1),
      borderRadius: RADIUS_PILL,
      alignItems: "center",
    },
    thumbBadgeText: { fontSize: font(11), fontWeight: "700", color: TEXT_PRIMARY },
    thumbRemove: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: RADIUS_PILL,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
    captureRow: { flexDirection: "row", alignItems: "center", gap: scale(12) },
    radios: { flex: 1, gap: verticalScale(8) },
    radio: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(8),
      borderRadius: RADIUS_MD,
    },
    radioText: { fontSize: font(14), fontWeight: "700" },
    cameraBtn: {
      width: 56,
      height: 56,
      borderRadius: RADIUS_PILL,
      backgroundColor: PRIMARY_COLOR,
      alignItems: "center",
      justifyContent: "center",
    },
    cameraBtnBusy: { opacity: 0.7 },
    disabledText: {
      fontSize: font(13),
      fontWeight: "600",
      color: WARNING_COLOR,
    },

    /* ── Resultados ── */
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: verticalScale(5),
    },
    resultLabel: { flex: 6, fontSize: font(13), fontWeight: "600", color: TEXT_SECONDARY },
    resultValue: { flex: 10, fontSize: font(14), fontWeight: "700", color: TEXT_PRIMARY },
    divider: {
      height: 1,
      backgroundColor: FOOTER_BORDER,
      marginVertical: verticalScale(6),
    },

    /* ── Listas de solo lectura ── */
    listTitle: {
      borderRadius: RADIUS_MD,
      paddingVertical: verticalScale(8),
      alignItems: "center",
      marginBottom: verticalScale(8),
    },
    listTitleText: { fontSize: font(14), fontWeight: "700" },
    studentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingVertical: verticalScale(8),
      borderBottomWidth: 1,
      borderBottomColor: FOOTER_BORDER,
    },
    avatar: {
      width: scale(38),
      height: scale(38),
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: scale(19),
      backgroundColor: "#F3F4F6",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: { width: scale(38), height: scale(38) },
    studentInfo: { flex: 1 },
    studentName: { fontSize: font(14), fontWeight: "700", color: TEXT_PRIMARY },
    studentMeta: { fontSize: font(12), color: "#6B7280", marginTop: verticalScale(1) },

    /* ── Lista manual ── */
    listRow: {
      paddingVertical: verticalScale(10),
      borderBottomWidth: 1,
      borderBottomColor: FOOTER_BORDER,
      gap: verticalScale(8),
    },
    listRowMain: { flexDirection: "row", alignItems: "center", gap: scale(10) },
    editBtn: { padding: scale(4) },
    statusBadge: {
      width: scale(26),
      height: scale(26),
      borderRadius: RADIUS_PILL,
      alignItems: "center",
      justifyContent: "center",
    },
    statusBadgeText: { fontSize: font(12), fontWeight: "800" },
    actionRow: { flexDirection: "row", gap: scale(8) },
    actionBtn: {
      flex: 1,
      alignItems: "center",
      paddingVertical: verticalScale(8),
      borderRadius: RADIUS_MD,
      borderWidth: 1.5,
      borderColor: CARD_BORDER,
      backgroundColor: CARD_BACKGROUND,
    },
    actionBtnLocked: { opacity: 0.45 },
    actionBtnText: { fontSize: font(13), fontWeight: "700", color: TEXT_SECONDARY },
    entryTimeRow: { flexDirection: "row", alignItems: "center", gap: scale(10) },
    entryTimeLabel: { fontSize: font(13), fontWeight: "600", color: TEXT_SECONDARY },
    timeSelect: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      borderWidth: 1,
      borderColor: CARD_BORDER,
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(6),
    },
    timeSelectText: { fontSize: font(14), fontWeight: "600", color: TEXT_PRIMARY },

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

    /* ── Sheet de cursos ── */
    loadMore: { alignItems: "center", paddingVertical: verticalScale(12) },
    loadMoreText: { fontSize: font(13), fontWeight: "700", color: PRIMARY_COLOR },

    /* ── Footer ── */
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
    // Mismo botón secundario que el "Cancelar" del footer de Tardanzas.
    backBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: verticalScale(13),
      borderRadius: RADIUS_LG,
      backgroundColor: FOOTER_BORDER,
    },
    backText: { fontSize: font(14), fontWeight: "700", color: TEXT_SECONDARY },
    saveBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: verticalScale(13),
      borderRadius: RADIUS_LG,
      backgroundColor: PRIMARY_COLOR,
    },
    saveBtnDisabled: { opacity: 0.55 },
    saveText: { fontSize: font(14), fontWeight: "700", color: CARD_BACKGROUND },
  });
}
