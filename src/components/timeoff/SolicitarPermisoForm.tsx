import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import axios from "axios";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystemLegacy from "expo-file-system/legacy";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSchoolStore } from "../../../store/useSchoolStore";
import type {
  SchoolUser,
  UserSchedule,
} from "../../../types/typeStore/SchoolStoreType";
import { normalizePermissionName, toRD, WEEK_DAYS } from "../../utils/punchRules";
import * as Storage from "../../utils/storage";
import { APP_BACKGROUND } from "@/constants/colors";
import { MAX_CONTENT_WIDTH, useResponsive } from "@/constants/responsive";
import RevisionFinalModal, {
  formatDisplayDate,
  formatDisplayTime,
  formatFileSize,
  getFileIcon,
  type PermissionAttachment,
  type PermissionReview,
} from "./RevisionFinalModal";

/**
 * Tag del catálogo de la escuela. `/tags/all` devuelve todos los tags con sus
 * `gotoTags` ya embebidos y ordenados, así que el dropdown dependiente
 * (Acción → Tipo Permiso) se resuelve client-side sin una segunda llamada.
 */
interface PermissionTag {
  id: number;
  name: string;
  categoryId?: number;
  category?: { id?: number; name?: string } | null;
  gotoTags?: PermissionTag[];
  description?: string | null;
}

/**
 * Los 3 IDs de categoría son configurables por escuela — nunca hardcodearlos.
 *
 * Ojo con la forma: el backend los entrega como `{ label, value }` con el id
 * dentro de `value` y en string ("25"), no como número suelto. Se tipan
 * `unknown` a propósito para que el compilador obligue a pasarlos por
 * readCategoryId antes de compararlos contra `tag.categoryId`, que sí es
 * un número plano.
 */
interface CategoryDefaultIds {
  catPermissionActionsId?: unknown;
  catPermTypeId?: unknown;
  catPermStatedId?: unknown;
}

type PickerTarget = "fromDate" | "toDate" | "fromTime" | "toTime" | null;

/** Campos del formulario que pueden mostrar su propio mensaje de error. */
type FieldKey =
  | "action"
  | "type"
  | "subject"
  | "description"
  | "fromDate"
  | "toDate"
  | "fromTime"
  | "toTime"
  | "attachments";

/** Un mensaje por campo — solo están presentes los campos que fallan. */
type FieldErrors = Partial<Record<FieldKey, string>>;

interface SubmitOutcome {
  ok: boolean;
  title: string;
  message: string;
  details: string[];
}

/** Nombre de la acción que el backend trata como día completo (00:00–23:59). */
const AUSENCIA_ACTION_NAME = "ausencia";

/** Alto fijo del textarea de Motivo — debe coincidir con minHeight/maxHeight
 * de `styles.textarea`, es la base del cálculo del scrollbar visual. */
const MOTIVO_TEXTAREA_HEIGHT = 120;

/** Separación del track del scrollbar respecto al borde superior/inferior
 * del textarea — debe coincidir con `styles.motivoScrollTrack` (top/bottom). */
const MOTIVO_TRACK_INSET = 4;

/** Tope por archivo antes de convertirlo a base64 — el data-URI pesa ~1.34x. */
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Tope del cuerpo completo del POST. El límite real del servidor es 20 MB;
 * se corta en 18 MB para dejar colchón a lo que no se puede medir con
 * exactitud desde el cliente (headers, escapes del JSON, transfer-encoding).
 * Este es el chequeo que importa: 4 archivos de 5 MB pasan el tope
 * individual y aun así revientan el request.
 */
const MAX_PAYLOAD_BYTES = 18 * 1024 * 1024;

/** Lo que el usuario ve — el límite publicado, no el margen interno. */
const PAYLOAD_LIMIT_LABEL = "20MB";

const TOTAL_LIMIT_MESSAGE = `El total de adjuntos supera el límite permitido (${PAYLOAD_LIMIT_LABEL}). Quita algún archivo para continuar.`;

/** Peso fijo aproximado del resto del JSON (claves, ids, fechas, horas). */
const BASE_PAYLOAD_OVERHEAD_BYTES = 512;

/** Comillas y coma que el JSON agrega alrededor de cada data-URI. */
const JSON_STRING_OVERHEAD_BYTES = 3;

/** El backend descarta cualquier adjunto de 100 chars o menos. */
const MIN_DATA_URI_LENGTH = 100;

/** Códigos que devuelve el backend en `skipped` traducidos a español simple. */
const SKIP_REASON_LABELS: Record<string, string> = {
  weekday_invalido: "El día no forma parte de tu horario laboral.",
  feriado_no_laborable: "Es un feriado no laborable.",
  sin_horario_usuario: "No tienes horario configurado para ese día.",
  horario_invalido_usuario: "Tu horario de ese día no es válido.",
  fecha_hora_inicio_pasada: "La fecha y hora de inicio ya pasaron.",
  solape_horario: "Se solapa con otro permiso ya registrado.",
  entrada_duplicada_dia: "Ya tienes un permiso de entrada ese día.",
  salida_duplicada_dia: "Ya tienes un permiso de salida ese día.",
  almuerzo_duplicado_dia: "Ya tienes un permiso de almuerzo ese día.",
  fuera_horario_dentro_jornada:
    "El horario solicitado cae dentro de tu jornada laboral.",
  ausencia_duplicada_dia: "Ya tienes una ausencia registrada ese día.",
};

/** Nombres de los 7 días tal cual los espera el backend (`weekDays`). */
const WEEK_DAY_NAMES = Object.values(WEEK_DAYS);

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Bytes reales de un string al serializarlo en UTF-8. `String.length` cuenta
 * unidades UTF-16, así que las tildes y la ñ del motivo pesan más de lo que
 * aparentan y el presupuesto se quedaría corto.
 */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // Par suplente: 4 bytes en UTF-8 y consume dos unidades UTF-16.
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** Un data-URI base64 es ASCII puro, así que `length` ya son bytes. */
function attachmentPayloadBytes(dataUri: string): number {
  return dataUri.length + JSON_STRING_OVERHEAD_BYTES;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Date → "YYYY-MM-DD" usando los campos locales (lo que el picker mostró). */
function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Date → "HH:mm" */
function toTimeKey(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Sello comparable a partir de campos de calendario sueltos. Se usa para
 * contrastar la fecha/hora elegida contra "ahora" en hora RD sin que el
 * offset del dispositivo desplace el día.
 */
function calendarStamp(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
): number {
  return Date.UTC(year, month, day, hours, minutes);
}

function tagCategoryId(tag: PermissionTag): number | undefined {
  return tag.categoryId ?? tag.category?.id ?? undefined;
}

/**
 * Normaliza un id de `categoryDefaultIds` a número. Acepta las tres formas
 * vistas en el campo — número suelto, string ("25") y el objeto
 * `{ label, value }` que devuelve hoy el backend — para que la comparación
 * contra `tag.categoryId` no dependa de cuál esté configurada la escuela.
 * Devuelve undefined si no hay id utilizable (incluido el 0, que no es un
 * categoryId válido).
 */
function readCategoryId(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return raw || undefined;
  if (typeof raw === "string") return Number(raw) || undefined;
  const value = (raw as { value?: unknown }).value;
  return value == null ? undefined : Number(value) || undefined;
}

/**
 * Normaliza `settings.maxDaysPermissions` — el tope de días por solicitud,
 * configurado solo a nivel escuela. Mismo problema de forma que
 * `categoryDefaultIds`: llega como número suelto o envuelto en `{ value: N }`.
 * Ausente, vacío o no numérico significa SIN LÍMITE, y eso se representa con
 * null para que el llamador no aplique ningún tope.
 */
function readMaxDays(raw: unknown): number | null {
  if (raw == null) return null;
  const source =
    typeof raw === "object" ? (raw as { value?: unknown }).value : raw;
  if (source == null || source === "") return null;
  const parsed = Number(source);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Copia desplazada N días — `setDate` ya resuelve fin de mes y año. */
function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/** Días de diferencia entre dos fechas, ignorando la hora. */
function daysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

/** "Ahora" en hora RD como sello comparable. */
function nowStampRD(): number {
  const nowRD = toRD(new Date());
  return calendarStamp(
    nowRD.year,
    nowRD.month,
    nowRD.day,
    nowRD.hours,
    nowRD.minutes,
  );
}

/** Sello de un día del picker a la hora indicada. */
function dayStamp(day: Date, hours: number, minutes: number): number {
  return calendarStamp(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hours,
    minutes,
  );
}

/** true si el día ya terminó por completo respecto a la hora RD actual. */
function hasDayPassed(day: Date): boolean {
  return dayStamp(day, 23, 59) < nowStampRD();
}

/** true si esa hora, puesta en ese día, ya pasó. */
function isPastTimeOnDay(day: Date, time: Date): boolean {
  return dayStamp(day, time.getHours(), time.getMinutes()) < nowStampRD();
}

/** true si la fecha elegida es el día de hoy en hora RD. */
function isTodayRD(day: Date): boolean {
  const nowRD = toRD(new Date());
  return (
    day.getFullYear() === nowRD.year &&
    day.getMonth() === nowRD.month &&
    day.getDate() === nowRD.day
  );
}

/**
 * Orden alfabético para los dropdowns. `localeCompare` con "es" coloca
 * acentos y ñ donde corresponde, en vez del orden por code point que daría
 * una comparación cruda.
 */
function byNameEs(a: PermissionTag, b: PermissionTag): number {
  return a.name.localeCompare(b.name, "es");
}

function isAusenciaTag(tag: PermissionTag | null): boolean {
  return !!tag && normalizePermissionName(tag.name) === AUSENCIA_ACTION_NAME;
}

/** Traduce el bloque `skipped` de la respuesta a líneas legibles. */
function describeSkipped(skipped: any): string[] {
  if (!skipped) return [];
  const lines: string[] = [];

  const byReason = Array.isArray(skipped.byReason) ? skipped.byReason : [];
  for (const entry of byReason) {
    const code = String(entry?.reason ?? entry?.code ?? "");
    const count = Number(entry?.count ?? entry?.total ?? 0);
    const label = SKIP_REASON_LABELS[code] ?? code.replace(/_/g, " ");
    lines.push(count > 0 ? `${count} día(s) — ${label}` : label);
  }

  // Algunas respuestas traen solo `items`; se agrupa por fecha en ese caso.
  if (lines.length === 0 && Array.isArray(skipped.items)) {
    for (const item of skipped.items) {
      const code = String(item?.reason ?? item?.code ?? "");
      const rawDate = String(item?.date ?? item?.permissionDate ?? "").split(
        "T",
      )[0];
      const label = SKIP_REASON_LABELS[code] ?? code.replace(/_/g, " ");
      lines.push(rawDate ? `${formatDisplayDate(rawDate)} — ${label}` : label);
    }
  }

  return lines;
}

export default function SolicitarPermisoForm() {
  const { isTablet } = useResponsive();
  const { user, urlColegio, school } = useSchoolStore();
  const schoolUser: SchoolUser | undefined = user?.user?.schoolUsers?.[0];
  const schoolId =
    schoolUser?.schoolId ?? (user as any)?.school?.id ?? school?.id;
  const userSchedules: UserSchedule[] =
    schoolUser?.userSchedules ?? user?.userSchedules ?? [];
  // Días sin horario configurado: elegirlos siempre terminaría descartado
  // por el backend, así que se muestran deshabilitados en el selector.
  const enabledWeekDaysSet = useMemo(
    () => new Set(userSchedules.map((s) => s.weekDay)),
    [userSchedules],
  );

  // ── Catálogo (Acción → Tipo Permiso) ──────────────────────────────────────
  const [actionTags, setActionTags] = useState<PermissionTag[]>([]);
  const [typeCategoryId, setTypeCategoryId] = useState<number | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  // Tope de días por solicitud de la escuela. null = sin límite configurado.
  const [maxDays, setMaxDays] = useState<number | null>(null);

  // ── Formulario ────────────────────────────────────────────────────────────
  const [selectedAction, setSelectedAction] = useState<PermissionTag | null>(
    null,
  );
  const [selectedType, setSelectedType] = useState<PermissionTag | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [motivoContentHeight, setMotivoContentHeight] = useState(0);
  const [motivoScrollY, setMotivoScrollY] = useState(0);
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [fromTime, setFromTime] = useState<Date | null>(null);
  const [toTime, setToTime] = useState<Date | null>(null);
  const [attachments, setAttachments] = useState<PermissionAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedWeekDays, setSelectedWeekDays] = useState<string[]>([]);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [selectorOpen, setSelectorOpen] = useState<"action" | "type" | null>(
    null,
  );
  const [expandedTagId, setExpandedTagId] = useState<number | null>(null);
  const [weekDaysModalVisible, setWeekDaysModalVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [pickerDraft, setPickerDraft] = useState<Date>(new Date());
  const [reviewVisible, setReviewVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  // Qué campos ya tienen permiso de mostrar su error. Se llena al intentar
  // guardar (o al elegir una hora pasada); el mensaje en sí sale de
  // `fieldErrors`, así que corregir el campo lo apaga sin tocar esto.
  const [revealedFields, setRevealedFields] = useState<
    Partial<Record<FieldKey, boolean>>
  >({});

  const isFullDay = isAusenciaTag(selectedAction);

  const getToken = useCallback(async (): Promise<string | null> => {
    const storeToken = useSchoolStore.getState().token;
    if (storeToken) return storeToken;
    return await Storage.getItemAsync("token");
  }, []);

  // ── Carga del catálogo ────────────────────────────────────────────────────
  // Los IDs de categoría vienen de school.settings.categoryDefaultIds. Se
  // siembra con lo que ya trajo el login y se refresca contra /schools/{id}
  // para que un cambio de configuración se refleje sin re-login.
  const seedCategoryIds = useMemo<CategoryDefaultIds | undefined>(() => {
    const fromSchoolUser = schoolUser?.school?.settings?.categoryDefaultIds;
    const fromUser = (user as any)?.school?.settings?.categoryDefaultIds;
    const fromStore = school?.settings?.categoryDefaultIds;
    return (fromSchoolUser ?? fromUser ?? fromStore) as
      | CategoryDefaultIds
      | undefined;
  }, [schoolUser, user, school]);

  // Misma cadena de fallback que categoryDefaultIds, pero normalizando ANTES
  // del ?? por la misma razón: un `{ value: N }` (o un string vacío) nunca es
  // nullish y taparía la fuente siguiente aunque no sirva.
  const seedMaxDays = useMemo<number | null>(() => {
    return (
      readMaxDays(schoolUser?.school?.settings?.maxDaysPermissions) ??
      readMaxDays((user as any)?.school?.settings?.maxDaysPermissions) ??
      readMaxDays(school?.settings?.maxDaysPermissions)
    );
  }, [schoolUser, user, school]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const token = await getToken();
      if (!urlColegio || !token) {
        setCatalogError("No hay conexión activa.");
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };

      let categoryIds: CategoryDefaultIds | undefined = seedCategoryIds;
      let resolvedMaxDays: number | null = seedMaxDays;
      if (schoolId) {
        try {
          const schoolRes = await axios.get(`${urlColegio}/schools/${schoolId}`, {
            headers,
          });
          if (schoolRes.data.success) {
            const settings = schoolRes.data.data?.settings;
            const fresh = settings?.categoryDefaultIds;
            if (fresh) categoryIds = fresh as CategoryDefaultIds;
            // El tope sí se pisa con lo que venga: que desaparezca de la
            // configuración significa "sin límite", no "deja el anterior".
            if (settings) {
              resolvedMaxDays = readMaxDays(settings.maxDaysPermissions);
            }
          }
        } catch (error: any) {
          // Si ya hay IDs sembrados del login, un fallo aquí no bloquea el form.
          console.error(
            "loadCatalog/schools:",
            error?.response?.data?.message ?? error?.message,
          );
        }
      }
      setMaxDays(resolvedMaxDays);

      // Normalizar ANTES del ?? es lo que hace funcionar el fallback: el objeto
      // crudo `{ label, value }` nunca es nullish, así que un
      // catPermissionActionsId inservible jamás cedería el paso a catPermTypeId.
      const permTypeCategoryId = readCategoryId(categoryIds?.catPermTypeId);
      // Fallback documentado: algunas escuelas no tienen catPermissionActionsId
      // configurado y las acciones viven bajo la misma categoría que los tipos.
      const actionCategoryId =
        readCategoryId(categoryIds?.catPermissionActionsId) ??
        permTypeCategoryId;

      if (permTypeCategoryId == null) {
        setCatalogError(
          "La escuela no tiene configurado el catálogo de permisos.",
        );
        return;
      }

      const tagsRes = await axios.get(`${urlColegio}/tags/all`, { headers });
      if (!tagsRes.data.success) {
        setCatalogError(
          tagsRes.data.message ?? "No se pudo cargar el catálogo de permisos.",
        );
        return;
      }

      const allTags: PermissionTag[] = tagsRes.data.data ?? [];

      // Alimenta el filtro de Tipo (typeOptions), que compara contra
      // tag.categoryId: tiene que entrar ya normalizado a número.
      setTypeCategoryId(permTypeCategoryId);
      // .filter() ya devuelve un arreglo nuevo, así que ordenarlo in situ no
      // toca la respuesta original del backend.
      setActionTags(
        allTags
          .filter((tag) => tagCategoryId(tag) === actionCategoryId)
          .sort(byNameEs),
      );
    } catch (error: any) {
      console.error(
        "loadCatalog:",
        error?.response?.data?.message ?? error?.message,
      );
      setCatalogError("No se pudo cargar el catálogo de permisos.");
    } finally {
      setCatalogLoading(false);
    }
  }, [urlColegio, getToken, schoolId, seedCategoryIds, seedMaxDays]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Tipos disponibles para la acción elegida — dependiente, se recalcula solo.
  const typeOptions = useMemo<PermissionTag[]>(() => {
    if (!selectedAction || typeCategoryId == null) return [];
    // Mismo criterio que en las Acciones: el .filter() aísla el arreglo antes
    // de ordenarlo, así que los gotoTags del tag original quedan intactos.
    return (selectedAction.gotoTags ?? [])
      .filter((tag) => tagCategoryId(tag) === typeCategoryId)
      .sort(byNameEs);
  }, [selectedAction, typeCategoryId]);

  // ── Pickers de fecha/hora ─────────────────────────────────────────────────
  const currentValueFor = useCallback(
    (target: Exclude<PickerTarget, null>): Date => {
      const now = new Date();
      switch (target) {
        case "fromDate":
          return fromDate ?? now;
        case "toDate":
          return toDate ?? fromDate ?? now;
        case "fromTime":
          return fromTime ?? now;
        case "toTime": {
          if (toTime) return toTime;
          if (fromTime) return new Date(fromTime.getTime() + 60 * 60 * 1000);
          return now;
        }
      }
    },
    [fromDate, toDate, fromTime, toTime],
  );

  const openPicker = useCallback(
    (target: Exclude<PickerTarget, null>) => {
      setPickerDraft(currentValueFor(target));
      setPickerTarget(target);
    },
    [currentValueFor],
  );

  const revealFields = useCallback((fields: FieldKey[]) => {
    setRevealedFields((prev) => {
      const next = { ...prev };
      for (const field of fields) next[field] = true;
      return next;
    });
  }, []);

  const commitPicked = useCallback(
    (target: Exclude<PickerTarget, null>, date: Date) => {
      switch (target) {
        case "fromDate":
          setFromDate(date);
          // Mantener el rango coherente: "Hasta" nunca queda antes de "Desde".
          setToDate((prev) => (prev && prev < date ? date : prev));
          break;
        case "toDate":
          setToDate(date);
          break;
        case "fromTime":
          setFromTime(date);
          // Android ignora `minimumDate` en modo hora, así que la hora pasada
          // hay que atajarla aquí: se acepta el valor elegido pero el campo
          // queda marcado en rojo en vez de pasar en silencio.
          if (fromDate && isPastTimeOnDay(fromDate, date)) {
            revealFields(["fromTime"]);
          }
          break;
        case "toTime":
          setToTime(date);
          break;
      }
    },
    [fromDate, revealFields],
  );

  const handlePickerChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === "android") {
        const target = pickerTarget;
        setPickerTarget(null);
        if (event.type !== "set" || !date || !target) return;
        commitPicked(target, date);
        return;
      }
      if (date) setPickerDraft(date);
    },
    [pickerTarget, commitPicked],
  );

  const confirmIosPicker = useCallback(() => {
    if (pickerTarget) commitPicked(pickerTarget, pickerDraft);
    setPickerTarget(null);
  }, [pickerTarget, pickerDraft, commitPicked]);

  // Piso del picker: ninguna fecha del pasado y, si "Desde" es hoy, ninguna
  // hora de inicio anterior a la actual (iOS lo respeta; Android no, ver
  // commitPicked).
  const pickerMinimumDate = useMemo<Date | undefined>(() => {
    if (pickerTarget === "fromDate" || pickerTarget === "toDate") {
      return new Date();
    }
    if (pickerTarget === "fromTime" && fromDate && isTodayRD(fromDate)) {
      return new Date();
    }
    return undefined;
  }, [pickerTarget, fromDate]);

  // Techo del picker: "Hasta" no puede pasarse del tope de días de la escuela.
  const pickerMaximumDate = useMemo<Date | undefined>(() => {
    if (pickerTarget !== "toDate" || !fromDate || maxDays == null) {
      return undefined;
    }
    return addDays(fromDate, maxDays);
  }, [pickerTarget, fromDate, maxDays]);

  // ── Adjuntos ──────────────────────────────────────────────────────────────
  // Presupuesto del request completo: lo que ya pesan los adjuntos codificados
  // más el texto del formulario. Es lo que decide si cabe un archivo más.
  const attachmentsBytes = useMemo(
    () =>
      attachments.reduce(
        (total, file) => total + attachmentPayloadBytes(file.dataUri),
        0,
      ),
    [attachments],
  );

  const payloadBytes = useMemo(
    () =>
      BASE_PAYLOAD_OVERHEAD_BYTES +
      utf8ByteLength(subject) +
      utf8ByteLength(description) +
      attachmentsBytes,
    [subject, description, attachmentsBytes],
  );

  const payloadOverLimit = payloadBytes > MAX_PAYLOAD_BYTES;

  const handlePickFiles = useCallback(async () => {
    if (payloadOverLimit) {
      setAttachmentError(TOTAL_LIMIT_MESSAGE);
      return;
    }
    setAttachmentError(null);
    setLoadingFiles(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: "*/*",
      });
      if (result.canceled) return;

      const accepted: PermissionAttachment[] = [];
      const rejected: string[] = [];
      // Se descuenta archivo por archivo dentro de la misma tanda: aceptar los
      // que caben y rechazar solo los que desbordan.
      let usedBytes = payloadBytes;
      let overflowed = false;

      for (const asset of result.assets ?? []) {
        try {
          if (asset.size && asset.size > MAX_ATTACHMENT_BYTES) {
            rejected.push(`${asset.name} (supera 5 MB)`);
            continue;
          }
          // En web el picker ya devuelve el base64; en nativo se lee del cache.
          const base64 =
            asset.base64 ??
            (await FileSystemLegacy.readAsStringAsync(asset.uri, {
              encoding: FileSystemLegacy.EncodingType.Base64,
            }));
          const mimeType =
            asset.mimeType || "application/octet-stream";
          const dataUri = `data:${mimeType};base64,${base64}`;
          if (dataUri.length <= MIN_DATA_URI_LENGTH) {
            rejected.push(`${asset.name} (archivo vacío o ilegible)`);
            continue;
          }
          const fileBytes = attachmentPayloadBytes(dataUri);
          if (usedBytes + fileBytes > MAX_PAYLOAD_BYTES) {
            rejected.push(asset.name);
            overflowed = true;
            continue;
          }
          usedBytes += fileBytes;
          accepted.push({
            id: `${asset.name}-${asset.lastModified ?? Date.now()}-${accepted.length}`,
            name: asset.name,
            size: asset.size,
            mimeType,
            dataUri,
          });
        } catch (error: any) {
          console.error("handlePickFiles/read:", error?.message);
          rejected.push(`${asset.name} (no se pudo leer)`);
        }
      }

      if (accepted.length > 0) {
        setAttachments((prev) => [...prev, ...accepted]);
      }
      if (overflowed) {
        setAttachmentError(
          `${TOTAL_LIMIT_MESSAGE} No se adjuntaron: ${rejected.join(", ")}.`,
        );
      } else if (rejected.length > 0) {
        setAttachmentError(`No se adjuntaron: ${rejected.join(", ")}`);
      }
    } catch (error: any) {
      console.error("handlePickFiles:", error?.message);
      setAttachmentError("No se pudo abrir el selector de archivos.");
    } finally {
      setLoadingFiles(false);
    }
  }, [payloadBytes, payloadOverLimit]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((file) => file.id !== id));
    // Quitar un archivo es justo la acción que resuelve el aviso de tamaño.
    setAttachmentError(null);
  }, []);

  // ── Validación (espeja las reglas del backend) ────────────────────────────
  // Cada regla se evalúa por su cuenta y deja el mensaje en su propio campo:
  // el usuario ve de una vez todo lo que falta, no solo la primera falla.
  const fieldErrors = useMemo<FieldErrors>(() => {
    const errors: FieldErrors = {};

    // Bloqueo duro: se resuelve quitando archivos, no llenando campos.
    if (payloadOverLimit) errors.attachments = TOTAL_LIMIT_MESSAGE;

    if (!selectedAction) errors.action = "Selecciona la acción del permiso.";
    if (!selectedType) errors.type = "Selecciona el tipo de permiso.";

    const trimmedSubject = subject.trim();
    if (!trimmedSubject) errors.subject = "El asunto es requerido.";
    else if (trimmedSubject.length > 255)
      errors.subject = "El asunto no puede superar los 255 caracteres.";

    if (!description.trim()) errors.description = "El motivo es requerido.";

    if (!fromDate) errors.fromDate = "Selecciona la fecha Desde.";
    // Ausencia cubre el día completo, así que el corte de "pasado" para la
    // fecha es siempre el fin del día; la hora se revisa aparte.
    else if (hasDayPassed(fromDate))
      errors.fromDate = "La fecha de inicio no puede estar en el pasado.";

    if (toDate) {
      if (fromDate && toDateKey(toDate) < toDateKey(fromDate))
        errors.toDate = "La fecha Hasta no puede ser anterior a la fecha Desde.";
      else if (
        fromDate &&
        maxDays != null &&
        daysBetween(fromDate, toDate) > maxDays
      )
        // Respaldo del `maximumDate` del picker, por si el rango llega de otro
        // lado. Texto idéntico al del backend para no dar dos versiones.
        errors.toDate = `El rango excede el máximo permitido de días (${maxDays}).`;
    }

    if (!isFullDay) {
      if (!fromTime) errors.fromTime = "Selecciona la hora de Inicio.";
      else if (
        fromDate &&
        !errors.fromDate &&
        isPastTimeOnDay(fromDate, fromTime)
      )
        errors.fromTime = "La hora de inicio no puede estar en el pasado.";

      if (!toTime) errors.toTime = "Selecciona la hora de Fin.";
      else if (fromTime && toTimeKey(toTime) <= toTimeKey(fromTime))
        errors.toTime = "La hora de Fin debe ser posterior a la de Inicio.";
    }

    return errors;
  }, [
    payloadOverLimit,
    selectedAction,
    selectedType,
    subject,
    description,
    fromDate,
    toDate,
    fromTime,
    toTime,
    isFullDay,
    maxDays,
  ]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  /** Mensaje visible de un campo: existe el error Y ya se reveló. */
  const errorFor = useCallback(
    (field: FieldKey): string | undefined =>
      revealedFields[field] ? fieldErrors[field] : undefined,
    [revealedFields, fieldErrors],
  );

  const toggleWeekDay = useCallback((day: string) => {
    setSelectedWeekDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }, []);

  const handleWeekDaysInfo = useCallback(() => {
    Alert.alert(
      "Días de la semana",
      "Opcional. Si no seleccionas ningún día, el permiso aplicará a todos los días dentro del rango Desde–Hasta. Solo se muestran habilitados los días que tienes en tu horario.",
    );
  }, []);

  // "Guardar Solicitud" nunca está deshabilitado: si algo falta, en vez de
  // abrir la revisión se pintan los campos que fallan.
  const handleSaveRequest = useCallback(() => {
    const failing = Object.keys(fieldErrors) as FieldKey[];
    if (failing.length > 0) {
      revealFields(failing);
      return;
    }
    setReviewVisible(true);
  }, [fieldErrors, revealFields]);

  const review = useMemo<PermissionReview | null>(() => {
    if (!isFormValid || !selectedAction || !selectedType) return null;
    if (!fromDate) return null;
    const effectiveToDate = toDate ?? fromDate;
    return {
      actionName: selectedAction.name,
      typeName: selectedType.name,
      fromDate: toDateKey(fromDate),
      toDate: toDateKey(effectiveToDate),
      fromTime: isFullDay || !fromTime ? "" : toTimeKey(fromTime),
      toTime: isFullDay || !toTime ? "" : toTimeKey(toTime),
      isFullDay,
      subject: subject.trim(),
      description: description.trim(),
      attachments,
    };
  }, [
    isFormValid,
    selectedAction,
    selectedType,
    fromDate,
    toDate,
    fromTime,
    toTime,
    isFullDay,
    subject,
    description,
    attachments,
  ]);

  const resetForm = useCallback(() => {
    setSelectedAction(null);
    setSelectedType(null);
    setSubject("");
    setDescription("");
    setFromDate(null);
    setToDate(null);
    setFromTime(null);
    setToTime(null);
    setAttachments([]);
    setAttachmentError(null);
    setRevealedFields({});
    setSelectedWeekDays([]);
  }, []);

  // ── Envío ─────────────────────────────────────────────────────────────────
  const buildOutcome = useCallback((payload: any): SubmitOutcome => {
    const data = payload?.data;
    // Respuesta de rango: trae el resumen del grupo. El caso "0 creados" llega
    // con success:false y solo `skipped`, por eso también cuenta como rango.
    const isRange =
      data &&
      typeof data === "object" &&
      ("createdCount" in data || "permissionGroupId" in data || "skipped" in data);
    const details = isRange ? describeSkipped(data.skipped) : [];

    if (!payload?.success) {
      return {
        ok: false,
        title: "No se pudo enviar",
        message:
          payload?.message ??
          data?.message ??
          "No se creó ningún permiso. Revisa el detalle.",
        details,
      };
    }

    if (isRange) {
      const created = Number(data.createdCount ?? data.created?.length ?? 0);
      const skippedTotal = Number(
        data.skippedCount ?? data.skipped?.total ?? 0,
      );
      return {
        ok: created > 0,
        title: created > 0 ? "Solicitud enviada" : "No se creó ningún permiso",
        message:
          skippedTotal > 0
            ? `Se crearon ${created} día(s) y se omitieron ${skippedTotal}.`
            : `Se crearon ${created} día(s). Estado: Solicitado.`,
        details,
      };
    }

    return {
      ok: true,
      title: "Solicitud enviada",
      message: "Tu permiso quedó registrado con estado: Solicitado.",
      details: [],
    };
  }, []);

  const handleConfirmSubmit = useCallback(async () => {
    if (!review) return;
    const token = await getToken();
    if (!urlColegio || !token) {
      setReviewVisible(false);
      setOutcome({
        ok: false,
        title: "Sin conexión",
        message: "No hay conexión activa. Intenta de nuevo.",
        details: [],
      });
      return;
    }

    setSubmitting(true);
    try {
      // Siempre fromDate/toDate — nunca permissionDate, aunque sea un solo día.
      const payload: Record<string, unknown> = {
        subject: review.subject.slice(0, 255),
        description: review.description,
        typeTagId: selectedType!.id,
        actionTagId: selectedAction!.id,
        fromDate: review.fromDate,
        toDate: review.toDate,
      };
      // Ausencia: el backend fuerza 00:00–23:59, mandar horas lo rompería.
      if (!review.isFullDay) {
        payload.fromTime = review.fromTime;
        payload.toTime = review.toTime;
      }
      if (review.attachments.length > 0) {
        payload.attachments = review.attachments.map((file) => file.dataUri);
      }
      if (selectedWeekDays.length > 0) {
        payload.weekDays = selectedWeekDays;
      }

      const response = await axios.post(
        `${urlColegio}/userdaypermissions`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      // `success` puede venir en false con HTTP 200 — el status no basta.
      const result = buildOutcome(response.data);
      setReviewVisible(false);
      setOutcome(result);
      if (result.ok) resetForm();
    } catch (error: any) {
      const msg = error?.response?.data?.message ?? "Error de conexión.";
      setReviewVisible(false);
      setOutcome({
        ok: false,
        title: "No se pudo enviar",
        message: typeof msg === "string" ? msg : JSON.stringify(msg),
        details: describeSkipped(error?.response?.data?.data?.skipped),
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    review,
    getToken,
    urlColegio,
    selectedType,
    selectedAction,
    selectedWeekDays,
    buildOutcome,
    resetForm,
  ]);

  const actionError = errorFor("action");
  const typeError = errorFor("type");
  const subjectError = errorFor("subject");
  const descriptionError = errorFor("description");
  const fromDateError = errorFor("fromDate");
  const toDateError = errorFor("toDate");
  const fromTimeError = errorFor("fromTime");
  const toTimeError = errorFor("toTime");
  const attachmentsFieldError = errorFor("attachments");

  const selectorOptions = selectorOpen === "action" ? actionTags : typeOptions;
  const selectorTitle =
    selectorOpen === "action" ? "Acción" : "Tipo de Permiso";
  const selectorSelectedId =
    selectorOpen === "action" ? selectedAction?.id : selectedType?.id;

  // Scrollbar visual del textarea de Motivo — proporcional al contenido real,
  // solo se calcula cuando hay overflow (ver condición de render más abajo).
  // El thumb vive DENTRO del track (inset 4 arriba/abajo), así que la escala
  // y el clamp usan el alto efectivo del track, no el del textarea completo.
  const motivoTrackHeight = MOTIVO_TEXTAREA_HEIGHT - MOTIVO_TRACK_INSET * 2;
  const motivoThumbHeight = Math.max(
    (motivoTrackHeight * motivoTrackHeight) / Math.max(motivoContentHeight, 1),
    16,
  );
  const motivoThumbTop = Math.min(
    Math.max(
      motivoScrollY * (motivoTrackHeight / Math.max(motivoContentHeight, 1)),
      0,
    ),
    motivoTrackHeight - motivoThumbHeight,
  );

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          isTablet && styles.contentTablet,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 1. Información ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="people-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Información</Text>
          </View>

          {catalogLoading ? (
            <View style={styles.catalogState}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.catalogStateText}>Cargando catálogo…</Text>
            </View>
          ) : catalogError ? (
            <View style={styles.catalogState}>
              <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
              <Text style={styles.catalogErrorText}>{catalogError}</Text>
              <TouchableOpacity onPress={loadCatalog} activeOpacity={0.75}>
                <Text style={styles.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.label}>
                Acción <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.select, !!actionError && styles.fieldInvalid]}
                onPress={() => setSelectorOpen("action")}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.selectText,
                    selectedAction && styles.selectTextFilled,
                  ]}
                  numberOfLines={1}
                >
                  {selectedAction?.name ?? "Selecciona una acción"}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
              {!!actionError && (
                <Text style={styles.fieldError}>{actionError}</Text>
              )}

              <Text style={[styles.label, styles.labelSpaced]}>
                Tipo Permiso <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.select,
                  !selectedAction && styles.selectDisabled,
                  !!typeError && styles.fieldInvalid,
                ]}
                onPress={() => selectedAction && setSelectorOpen("type")}
                disabled={!selectedAction}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.selectText,
                    selectedType && styles.selectTextFilled,
                  ]}
                  numberOfLines={1}
                >
                  {selectedType?.name ??
                    (selectedAction
                      ? "Selecciona un tipo"
                      : "Elige primero una acción")}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
              </TouchableOpacity>
              {!!typeError && <Text style={styles.fieldError}>{typeError}</Text>}
              {selectedAction && typeOptions.length === 0 && (
                <Text style={styles.helperWarning}>
                  Esta acción no tiene tipos de permiso configurados.
                </Text>
              )}
            </>
          )}
        </View>

        {/* ── 2. Detalles ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Detalles</Text>
          </View>

          <Text style={styles.label}>
            Asunto <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, !!subjectError && styles.fieldInvalid]}
            value={subject}
            onChangeText={setSubject}
            placeholder="Ej. Cita médica"
            placeholderTextColor="#9CA3AF"
            maxLength={255}
          />
          {!!subjectError && (
            <Text style={styles.fieldError}>{subjectError}</Text>
          )}

          <Text style={[styles.label, styles.labelSpaced]}>
            Motivo <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.motivoWrap}>
            <TextInput
              style={[
                styles.input,
                styles.textarea,
                !!descriptionError && styles.fieldInvalid,
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe el motivo de tu solicitud"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              onContentSizeChange={(e) =>
                setMotivoContentHeight(e.nativeEvent.contentSize.height)
              }
              onScroll={(e) => setMotivoScrollY(e.nativeEvent.contentOffset.y)}
            />
            {motivoContentHeight > MOTIVO_TEXTAREA_HEIGHT && (
              <View style={styles.motivoScrollTrack}>
                <View
                  style={[
                    styles.motivoScrollThumb,
                    { height: motivoThumbHeight, top: motivoThumbTop },
                  ]}
                />
              </View>
            )}
          </View>
          {!!descriptionError && (
            <Text style={styles.fieldError}>{descriptionError}</Text>
          )}
        </View>

        {/* ── 3. Fecha y Hora ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Fecha y Hora</Text>
          </View>

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>
                Desde <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.select, !!fromDateError && styles.fieldInvalid]}
                onPress={() => openPicker("fromDate")}
                activeOpacity={0.75}
              >
                <Ionicons name="calendar-outline" size={16} color="#2563EB" />
                <Text
                  style={[
                    styles.selectText,
                    fromDate && styles.selectTextFilled,
                  ]}
                >
                  {fromDate ? formatDisplayDate(toDateKey(fromDate)) : "DD/MM/AAAA"}
                </Text>
              </TouchableOpacity>
              {!!fromDateError && (
                <Text style={styles.fieldError}>{fromDateError}</Text>
              )}
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.label}>
                Hasta
              </Text>
              <TouchableOpacity
                style={[styles.select, !!toDateError && styles.fieldInvalid]}
                onPress={() => openPicker("toDate")}
                activeOpacity={0.75}
              >
                <Ionicons name="calendar-outline" size={16} color="#2563EB" />
                <Text
                  style={[styles.selectText, toDate && styles.selectTextFilled]}
                >
                  {toDate ? formatDisplayDate(toDateKey(toDate)) : "DD/MM/AAAA"}
                </Text>
              </TouchableOpacity>
              {!!toDateError && (
                <Text style={styles.fieldError}>{toDateError}</Text>
              )}
            </View>
          </View>

          {isFullDay ? (
            <View style={styles.fullDayNote}>
              <Ionicons name="information-circle-outline" size={16} color="#1D4ED8" />
              <Text style={styles.fullDayNoteText}>
                Se registrará todo el día — no hace falta indicar horas.
              </Text>
            </View>
          ) : (
            <View style={[styles.row, styles.rowSpaced]}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>
                  Inicio <Text style={styles.required}>*</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.select, !!fromTimeError && styles.fieldInvalid]}
                  onPress={() => openPicker("fromTime")}
                  activeOpacity={0.75}
                >
                  <Ionicons name="time-outline" size={16} color="#2563EB" />
                  <Text
                    style={[
                      styles.selectText,
                      fromTime && styles.selectTextFilled,
                    ]}
                  >
                    {fromTime ? formatDisplayTime(toTimeKey(fromTime)) : "--:--"}
                  </Text>
                </TouchableOpacity>
                {!!fromTimeError && (
                  <Text style={styles.fieldError}>{fromTimeError}</Text>
                )}
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>
                  Fin <Text style={styles.required}>*</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.select, !!toTimeError && styles.fieldInvalid]}
                  onPress={() => openPicker("toTime")}
                  activeOpacity={0.75}
                >
                  <Ionicons name="time-outline" size={16} color="#2563EB" />
                  <Text
                    style={[
                      styles.selectText,
                      toTime && styles.selectTextFilled,
                    ]}
                  >
                    {toTime ? formatDisplayTime(toTimeKey(toTime)) : "--:--"}
                  </Text>
                </TouchableOpacity>
                {!!toTimeError && (
                  <Text style={styles.fieldError}>{toTimeError}</Text>
                )}
              </View>
            </View>
          )}

          <View style={[styles.labelRow, styles.rowSpaced]}>
            <Text style={styles.label}>Días de la semana</Text>
            <TouchableOpacity
              onPress={handleWeekDaysInfo}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name="information-circle-outline"
                size={16}
                color="#1D4ED8"
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.select}
            onPress={() => setWeekDaysModalVisible(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="calendar-outline" size={16} color="#2563EB" />
            <Text
              style={[
                styles.selectText,
                selectedWeekDays.length > 0 && styles.selectTextFilled,
              ]}
              numberOfLines={1}
            >
              {selectedWeekDays.length > 0
                ? selectedWeekDays.join(", ")
                : "Seleccione días (opcional)"}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* ── 4. Adjuntar Archivos ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="attach-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>Adjuntar Archivos</Text>
          </View>

          <TouchableOpacity
            style={[styles.dropzone, payloadOverLimit && styles.dropzoneBlocked]}
            onPress={handlePickFiles}
            disabled={loadingFiles || payloadOverLimit}
            activeOpacity={0.75}
          >
            {loadingFiles ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Ionicons
                name={
                  payloadOverLimit ? "alert-circle-outline" : "cloud-upload-outline"
                }
                size={24}
                color={payloadOverLimit ? "#DC2626" : "#2563EB"}
              />
            )}
            <Text
              style={[
                styles.dropzoneText,
                payloadOverLimit && styles.dropzoneTextBlocked,
              ]}
            >
              {loadingFiles
                ? "Procesando archivos…"
                : payloadOverLimit
                  ? "Límite alcanzado"
                  : "Seleccionar archivos"}
            </Text>
            <Text style={styles.dropzoneHint}>
              Opcional · máx. 5 MB c/u · {PAYLOAD_LIMIT_LABEL} en total
            </Text>
          </TouchableOpacity>

          {attachments.length > 0 && (
            <View style={styles.usageRow}>
              <View style={styles.usageTrack}>
                <View
                  style={[
                    styles.usageFill,
                    {
                      width: `${Math.min(100, (payloadBytes / MAX_PAYLOAD_BYTES) * 100)}%`,
                    },
                    payloadOverLimit && styles.usageFillOver,
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.usageText,
                  payloadOverLimit && styles.usageTextOver,
                ]}
              >
                {formatMegabytes(payloadBytes)} / {PAYLOAD_LIMIT_LABEL}
              </Text>
            </View>
          )}

          {!!attachmentError && (
            <Text
              style={[
                styles.helperWarning,
                payloadOverLimit && styles.helperError,
              ]}
            >
              {attachmentError}
            </Text>
          )}

          {/* El aviso de la tanda ya dice lo mismo cuando existe — no se
              repite el mensaje del tope debajo. La zona de carga en sí queda
              sombreada por `dropzoneBlocked`. */}
          {!attachmentError && !!attachmentsFieldError && (
            <Text style={styles.fieldError}>{attachmentsFieldError}</Text>
          )}

          {attachments.length > 0 && (
            <View style={styles.chipList}>
              {attachments.map((file) => (
                <View key={file.id} style={styles.chip}>
                  <Ionicons
                    name={getFileIcon(file.mimeType)}
                    size={16}
                    color="#2563EB"
                  />
                  <Text style={styles.chipName} numberOfLines={1}>
                    {file.name}
                  </Text>
                  {!!formatFileSize(file.size) && (
                    <Text style={styles.chipSize}>
                      {formatFileSize(file.size)}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => removeAttachment(file.id)}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Acciones ── */}
        <View style={styles.footerActions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnGhost]}
            onPress={() => router.back()}
            activeOpacity={0.75}
          >
            <Text style={styles.btnGhostText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={handleSaveRequest}
            activeOpacity={0.85}
          >
            <Ionicons name="save-outline" size={17} color="#fff" />
            <Text style={styles.btnPrimaryText}>Guardar Solicitud</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Selector de tags (Acción / Tipo) ── */}
      <Modal
        visible={selectorOpen !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectorOpen(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setSelectorOpen(null);
            setExpandedTagId(null);
          }}
        >
          <View style={styles.selectorCard}>
            <Text style={styles.selectorTitle}>{selectorTitle}</Text>
            <ScrollView style={styles.selectorList}>
              {selectorOptions.map((tag) => {
                const hasDescription = !!tag.description;
                const isExpanded = expandedTagId === tag.id;
                return (
                  <TouchableOpacity
                    key={tag.id}
                    style={styles.selectorOption}
                    onPress={() => {
                      if (selectorOpen === "action") {
                        setSelectedAction(tag);
                        // El tipo depende de la acción: se reinicia al cambiarla.
                        setSelectedType(null);
                      } else {
                        setSelectedType(tag);
                      }
                      setSelectorOpen(null);
                      setExpandedTagId(null);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={styles.selectorOptionMain}>
                      <Text style={styles.selectorOptionText}>{tag.name}</Text>
                      {hasDescription && !isExpanded && (
                        <Text
                          style={styles.selectorOptionDescription}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {tag.description}
                        </Text>
                      )}
                      {hasDescription && isExpanded && (
                        <Text style={styles.selectorOptionDescription}>
                          {tag.description}
                        </Text>
                      )}
                    </View>
                    {hasDescription && (
                      <TouchableOpacity
                        style={styles.selectorOptionChevron}
                        onPress={() =>
                          setExpandedTagId(isExpanded ? null : tag.id)
                        }
                        activeOpacity={0.6}
                      >
                        <Ionicons
                          name={
                            isExpanded ? "chevron-up-outline" : "chevron-down-outline"
                          }
                          size={18}
                          color="#6B7280"
                        />
                      </TouchableOpacity>
                    )}
                    {selectorSelectedId === tag.id && (
                      <Ionicons name="checkmark" size={18} color="#2563EB" />
                    )}
                  </TouchableOpacity>
                );
              })}
              {selectorOptions.length === 0 && (
                <Text style={styles.selectorEmpty}>
                  No hay opciones disponibles.
                </Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Selector de Días de la semana (multi-selección) ── */}
      <Modal
        visible={weekDaysModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setWeekDaysModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setWeekDaysModalVisible(false)}
        >
          <View style={styles.selectorCard}>
            <Text style={styles.selectorTitle}>Días de la semana</Text>
            <ScrollView style={styles.selectorList}>
              {WEEK_DAY_NAMES.map((day) => {
                const enabled = enabledWeekDaysSet.has(day);
                const checked = selectedWeekDays.includes(day);
                return (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.selectorOption,
                      !enabled && styles.selectDisabled,
                    ]}
                    onPress={() => toggleWeekDay(day)}
                    disabled={!enabled}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.selectorOptionText}>{day}</Text>
                    <Ionicons
                      name={checked ? "checkbox" : "square-outline"}
                      size={20}
                      color={checked ? "#2563EB" : "#9CA3AF"}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, styles.selectorDoneButton]}
              onPress={() => setWeekDaysModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnPrimaryText}>Listo</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Picker nativo de fecha/hora ── */}
      {pickerTarget !== null &&
        (Platform.OS === "ios" ? (
          <Modal visible transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.pickerCard}>
                <View style={styles.pickerBar}>
                  <TouchableOpacity onPress={() => setPickerTarget(null)}>
                    <Text style={styles.pickerCancel}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmIosPicker}>
                    <Text style={styles.pickerDone}>Listo</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={pickerDraft}
                  mode={pickerTarget.endsWith("Date") ? "date" : "time"}
                  display="spinner"
                  minimumDate={pickerMinimumDate}
                  maximumDate={pickerMaximumDate}
                  onChange={handlePickerChange}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={pickerDraft}
            mode={pickerTarget.endsWith("Date") ? "date" : "time"}
            display="default"
            minimumDate={pickerMinimumDate}
            maximumDate={pickerMaximumDate}
            onChange={handlePickerChange}
          />
        ))}

      {/* ── Revisión Final ── */}
      <RevisionFinalModal
        visible={reviewVisible}
        review={review}
        submitting={submitting}
        onEdit={() => setReviewVisible(false)}
        onConfirm={handleConfirmSubmit}
      />

      {/* ── Resultado del envío ── */}
      <Modal
        visible={outcome !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOutcome(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.outcomeCard}>
            <View
              style={[
                styles.outcomeIconWrap,
                outcome?.ok ? styles.outcomeIconOk : styles.outcomeIconError,
              ]}
            >
              <Ionicons
                name={outcome?.ok ? "checkmark-circle" : "alert-circle"}
                size={26}
                color={outcome?.ok ? "#059669" : "#DC2626"}
              />
            </View>
            <Text style={styles.outcomeTitle}>{outcome?.title}</Text>
            <Text style={styles.outcomeMessage}>{outcome?.message}</Text>

            {!!outcome?.details.length && (
              <ScrollView style={styles.outcomeDetails}>
                {outcome.details.map((line, index) => (
                  <View key={`${line}-${index}`} style={styles.outcomeDetailRow}>
                    <Ionicons
                      name="remove-circle-outline"
                      size={14}
                      color="#B45309"
                    />
                    <Text style={styles.outcomeDetailText}>{line}</Text>
                  </View>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, styles.outcomeBtn]}
              onPress={() => setOutcome(null)}
              activeOpacity={0.85}
            >
              <Text style={styles.btnPrimaryText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: APP_BACKGROUND },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  /**
   * Centra y limita el contenido en tablet, igual que punchinout.tsx. Sin esto
   * las cards heredan el ancho completo del device y la fila Desde/Hasta
   * (row + rowItem flex:1) estira cada campo a ~500dp para mostrar una fecha.
   *
   * `width: "100%"` es necesario porque `alignSelf: "center"` en un
   * contentContainer haría que el contenido colapse a su ancho intrínseco.
   *
   * Los modales quedan fuera de este cap a propósito: `Modal` renderiza en su
   * propio árbol y ya trae su tope explícito (maxWidth: 400).
   */
  contentTablet: {
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    width: "100%",
  },

  /* ── Cards ── */
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },

  /* ── Campos ── */
  label: { fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 6 },
  labelSpaced: { marginTop: 14 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  required: { color: "#DC2626" },
  input: {
    backgroundColor: APP_BACKGROUND,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#111827",
  },
  textarea: {
    minHeight: MOTIVO_TEXTAREA_HEIGHT,
    maxHeight: MOTIVO_TEXTAREA_HEIGHT,
    paddingTop: 12,
    paddingRight: 18,
  },
  motivoWrap: { position: "relative" },
  motivoScrollTrack: {
    position: "absolute",
    top: 4,
    bottom: 4,
    right: 3,
    width: 3,
    borderRadius: 2,
    backgroundColor: "#00000014",
  },
  motivoScrollThumb: {
    position: "absolute",
    right: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: "#00000040",
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: APP_BACKGROUND,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  selectDisabled: { opacity: 0.55 },
  selectText: { flex: 1, fontSize: 14, color: "#9CA3AF" },
  selectTextFilled: { color: "#111827", fontWeight: "600" },
  row: { flexDirection: "row", gap: 12 },
  rowSpaced: { marginTop: 14 },
  rowItem: { flex: 1 },
  helperWarning: { fontSize: 11, color: "#B45309", marginTop: 8 },
  helperError: { color: "#DC2626" },
  /* Recuadro con error: mismo borde rojo para select, input y textarea. */
  fieldInvalid: { borderColor: "#DC2626" },
  fieldError: { fontSize: 12, color: "#DC2626", marginTop: 6 },
  fullDayNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },
  fullDayNoteText: { flex: 1, fontSize: 12, color: "#1D4ED8" },

  /* ── Catálogo ── */
  catalogState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  catalogStateText: { fontSize: 13, color: "#6B7280" },
  catalogErrorText: { flex: 1, fontSize: 12, color: "#DC2626" },
  retryText: { fontSize: 12, fontWeight: "700", color: "#2563EB" },

  /* ── Adjuntos ── */
  dropzone: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FAFF",
    borderRadius: 12,
    paddingVertical: 22,
  },
  dropzoneBlocked: { borderColor: "#FECACA", backgroundColor: "#FEF2F2" },
  dropzoneText: { fontSize: 13, fontWeight: "700", color: "#2563EB" },
  dropzoneTextBlocked: { color: "#DC2626" },
  dropzoneHint: { fontSize: 11, color: "#9CA3AF" },
  usageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  usageTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#F3F4F6",
    overflow: "hidden",
  },
  usageFill: { height: "100%", borderRadius: 3, backgroundColor: "#2563EB" },
  usageFillOver: { backgroundColor: "#DC2626" },
  usageText: { fontSize: 11, fontWeight: "600", color: "#6B7280" },
  usageTextOver: { color: "#DC2626" },
  chipList: { gap: 8, marginTop: 12 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: APP_BACKGROUND,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipName: { flex: 1, fontSize: 13, color: "#374151", fontWeight: "500" },
  chipSize: { fontSize: 11, color: "#9CA3AF" },

  /* ── Acciones ── */
  footerActions: { flexDirection: "row", gap: 10 },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    paddingVertical: 15,
  },
  btnGhost: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  btnGhostText: { fontSize: 14, fontWeight: "700", color: "#374151" },
  btnPrimary: { backgroundColor: "#2563EB", flex: 1.5 },
  btnPrimaryText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  /* ── Modales ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  selectorCard: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "70%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    elevation: 10,
  },
  selectorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  selectorList: { flexGrow: 0 },
  selectorOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  selectorOptionMain: {
    flex: 1,
  },
  selectorOptionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  selectorOptionDescription: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  selectorOptionChevron: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectorEmpty: {
    fontSize: 13,
    color: "#9CA3AF",
    paddingVertical: 16,
    textAlign: "center",
  },
  selectorDoneButton: { flex: 0, marginTop: 14 },
  pickerCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    elevation: 10,
  },
  pickerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  pickerCancel: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  pickerDone: { fontSize: 14, fontWeight: "700", color: "#2563EB" },

  /* ── Resultado ── */
  outcomeCard: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    elevation: 10,
  },
  outcomeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  outcomeIconOk: { backgroundColor: "#ECFDF5" },
  outcomeIconError: { backgroundColor: "#FEF2F2" },
  outcomeTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  outcomeMessage: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 6,
  },
  outcomeDetails: {
    alignSelf: "stretch",
    marginTop: 14,
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  outcomeDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    paddingVertical: 4,
  },
  outcomeDetailText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 18 },
  outcomeBtn: { flex: 0, alignSelf: "stretch", marginTop: 18 },
});
