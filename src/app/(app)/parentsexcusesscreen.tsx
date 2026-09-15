import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystemLegacy from "expo-file-system/legacy";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import axios from "axios";
import {
  Calendar,
  ChevronDown,
  MessageSquare,
  Paperclip,
  User,
} from "lucide-react-native";

import {
  APP_BACKGROUND,
  CARD_BACKGROUND,
  CARD_BORDER,
  ERROR_COLOR,
  FOOTER_BORDER,
  INPUT_BORDER,
  PRIMARY_COLOR,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WARNING_COLOR,
} from "@/constants/colors";
import {
  RADIUS_2XL,
  RADIUS_LG,
  RADIUS_MD,
  useResponsive,
} from "@/constants/responsive";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { getStudents, type Student } from "../../api/getStudents";
import AbsenceCalendar, {
  type AbsenceRange,
} from "../../components/faceclass/AbsenceCalendar";
import TagOptionSheet from "../../components/permissions/TagOptionSheet";
import {
  formatFileSize,
  getFileIcon,
  type PermissionAttachment,
} from "../../components/timeoff/RevisionFinalModal";
import TagMultiSelectSheet from "../../components/users/TagMultiSelectSheet";
import { useTagsByCategory } from "../../hooks/useTagsByCategory";
import {
  isAbsenceRangeOnlyCompanyWorkingDays,
  isCompanyWorkingDate,
  type CompanyScheduleRow,
} from "../../utils/companyWorkingDay";
import { readCategoryDefaultId } from "../../utils/punchRules";
import * as Storage from "../../utils/storage";

/**
 * Copia deliberada de PHOTO_HOST/photoUri() de AdminPermissionCreateModal.tsx
 * (local a ese archivo también) — mismo criterio: no acoplar esta pantalla a
 * otra por 3 líneas. `photourl` es una ruta relativa que el backend sirve
 * por su ruta estática pública; si ya viene absoluta se usa tal cual.
 */
const PHOTO_HOST = "https://timecontrol.wsmax.net:8600";

function photoUri(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.startsWith("http") ? raw : `${PHOTO_HOST}/${raw}`;
}

/** Mismo formato que ClientSelectorModal.jsx del webapp: `curso | code | No. N`. */
function buildStudentSubtitle(student: Student): string | undefined {
  const course = student.course?.[0];
  const subtitle = `${course?.fullName ?? ""}${student.code ? ` | ${student.code}` : ""}${
    course?.listNumber != null ? ` | No. ${course.listNumber}` : ""
  }`;
  return subtitle.trim() ? subtitle : undefined;
}

/** Tope por archivo antes de convertirlo a base64 — mismo criterio que
 * SolicitarPermisoForm.tsx (no hay tope individual real en el backend de
 * excuses tampoco, es la misma cautela de UX). */
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/**
 * Tope del cuerpo completo del POST. El límite real del servidor es 15MB
 * (routes.js de Excuses: `maxBytes: 15 * 1024 * 1024`); se corta en 13MB
 * para dejar colchón a lo que no se puede medir con exactitud desde el
 * cliente (headers, escapes del JSON, el resto de los campos).
 */
const MAX_PAYLOAD_BYTES = 13 * 1024 * 1024;
const PAYLOAD_LIMIT_LABEL = "15MB";
const TOTAL_LIMIT_MESSAGE = `El total de adjuntos supera el límite permitido (${PAYLOAD_LIMIT_LABEL}). Quita algún archivo para continuar.`;
const BASE_PAYLOAD_OVERHEAD_BYTES = 512;
const JSON_STRING_OVERHEAD_BYTES = 3;
const MIN_DATA_URI_LENGTH = 100;

const WORKING_DAYS_ERROR =
  "El rango incluye días en los que la institución no labora. Selecciona solo días hábiles.";

type FieldKey =
  | "students"
  | "tagId"
  | "subject"
  | "description"
  | "absenceRange";
type FieldErrors = Partial<Record<FieldKey, string>>;

interface DraftData {
  selectedStudentIds: string[];
  subject: string;
  description: string;
  selectedTagId: number | null;
  absenceRange: { start: string; end: string } | null;
}

function toDateKey(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Bytes reales de un string en UTF-8 — mismo criterio que
 * SolicitarPermisoForm.tsx (String.length cuenta unidades UTF-16). */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
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

export default function ParentsExcusesScreen() {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { user, urlColegio, companySettings, school } = useSchoolStore();
  const userId = user?.user?.id ?? "default";
  const draftKey = `parentsExcuseForm_${userId}`;

  // schoolId para refrescar la configuración de la sede — mismo patrón que
  // SolicitarPermisoForm (GET /schools/{id}).
  const schoolId = user?.schoolId ?? user?.school?.id ?? school?.id ?? null;

  /**
   * `companySettings` solo lo llena el flujo de chooseschool (multi-compañía)
   * y el polling de punchinout: un padre/tutor de una sola compañía, o un
   * arranque en frío con sesión persistida, lo tienen en null. Para que el
   * tipo de excusa (y el horario de la sede) siempre se resuelvan, se cae,
   * en orden, al settings refrescado por `/schools/{id}`, al del schoolUser
   * logueado y al del `school` del store (la app lo refresca en cada arranque).
   */
  const [refreshedSchoolSettings, setRefreshedSchoolSettings] = useState<
    Record<string, unknown> | null
  >(null);

  useEffect(() => {
    if (!schoolId || !urlColegio) return;
    const token = useSchoolStore.getState().token;
    if (!token) return;
    let cancelled = false;
    axios
      .get<{ success: boolean; data?: { settings?: unknown } }>(
        `${urlColegio}/schools/${schoolId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      .then((res) => {
        if (cancelled || !res.data?.success) return;
        const settings = res.data.data?.settings;
        if (settings && typeof settings === "object") {
          setRefreshedSchoolSettings(settings as Record<string, unknown>);
        }
      })
      .catch(() => {
        // Silencioso: las fuentes locales bastan; un fallo de red no bloquea
        // la pantalla.
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, urlColegio]);

  const userSchoolSettings = user?.school?.settings as
    | Record<string, unknown>
    | undefined;
  const storeSchoolSettings = school?.settings as
    | Record<string, unknown>
    | undefined;

  const categoryDefaultIds = (refreshedSchoolSettings?.categoryDefaultIds ??
    companySettings?.categoryDefaultIds ??
    userSchoolSettings?.categoryDefaultIds ??
    storeSchoolSettings?.categoryDefaultIds ??
    {}) as Record<string, unknown>;
  const schedulesAdd = (refreshedSchoolSettings?.schedulesAdd ??
    companySettings?.schedulesAdd ??
    userSchoolSettings?.schedulesAdd ??
    storeSchoolSettings?.schedulesAdd ??
    []) as CompanyScheduleRow[];
  const entryTimeRaw = refreshedSchoolSettings?.entryTime ??
    companySettings?.entryTime ??
    userSchoolSettings?.entryTime ??
    storeSchoolSettings?.entryTime;
  const entryTime = typeof entryTimeRaw === "string" ? entryTimeRaw : "";
  const exitTimeRaw = refreshedSchoolSettings?.exitTime ??
    companySettings?.exitTime ??
    userSchoolSettings?.exitTime ??
    storeSchoolSettings?.exitTime;
  const exitTime = typeof exitTimeRaw === "string" ? exitTimeRaw : "";

  const typeCategoryId =
    readCategoryDefaultId(categoryDefaultIds?.catExcusesId) ?? null;
  const stateCategoryId =
    readCategoryDefaultId(categoryDefaultIds?.catExcuseStatedId) ?? null;

  const { tags: typeTags, loading: typeTagsLoading } =
    useTagsByCategory(typeCategoryId);
  const { tags: stateTags } = useTagsByCategory(stateCategoryId);

  const [studentSheetVisible, setStudentSheetVisible] = useState(false);
  const [typeSheetVisible, setTypeSheetVisible] = useState(false);
  const [estudiantes, setEstudiantes] = useState<Student[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [absenceRange, setAbsenceRange] = useState<AbsenceRange | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<
    PermissionAttachment[]
  >([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);

  // buildPayload no se toca: sigue leyendo `attachments` como antes (un
  // array de data-URIs). Solo cambió de dónde sale — ahora se deriva de los
  // objetos ricos (nombre/tamaño/mimetype) que necesita la UI tipo
  // SolicitarPermisoForm.
  const attachments = useMemo(
    () => attachmentFiles.map((file) => file.dataUri),
    [attachmentFiles],
  );

  // Cargar estudiantes del padre/tutor logueado (getStudents ya filtra por parentId)
  useEffect(() => {
    const cargarEstudiantes = async () => {
      const data = await getStudents();
      setEstudiantes(data);
    };
    cargarEstudiantes();
  }, []);

  // Auto-seleccionar el tipo de excusa marcado isUnique, si el usuario no eligió otro
  useEffect(() => {
    if (typeTagsLoading || typeTags.length === 0) return;
    const uniqueTag = typeTags.find((t) => t.isUnique);
    if (!uniqueTag) return;
    setSelectedTagId((prev) => (prev != null ? prev : uniqueTag.id));
  }, [typeTagsLoading, typeTags]);

  // stateTagId de una excusa nueva: primero un tag marcado add, si no hay,
  // el que se llame "Pendiente" — mismo criterio que ParentsExcusesScreen del webapp.
  const resolvedStateTag = useMemo(() => {
    return (
      stateTags.find((t) => t.add === true || (t as any).defaultTag === true) ??
      stateTags.find((t) => t.name?.trim().toLowerCase() === "pendiente")
    );
  }, [stateTags]);

  // ── Borrador (AsyncStorage) ─────────────────────────────────────────────────
  // Los adjuntos NO se persisten a propósito: son base64 (pueden pesar varios
  // MB) y AsyncStorage en Android por defecto tiene un tope de almacenamiento
  // total mucho más chico que el límite de 15MB del backend — persistirlos
  // arriesga romper el guardado de TODA la app, no solo este borrador.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(draftKey)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed: DraftData = JSON.parse(raw);
          if (Array.isArray(parsed.selectedStudentIds)) {
            setSelectedStudentIds(parsed.selectedStudentIds);
          }
          if (typeof parsed.subject === "string") setSubject(parsed.subject);
          if (typeof parsed.description === "string")
            setDescription(parsed.description);
          if (typeof parsed.selectedTagId === "number")
            setSelectedTagId(parsed.selectedTagId);
          if (parsed.absenceRange) {
            const start = new Date(parsed.absenceRange.start);
            const end = new Date(parsed.absenceRange.end);
            if (
              !Number.isNaN(start.getTime()) &&
              !Number.isNaN(end.getTime())
            ) {
              setAbsenceRange({ start, end });
            }
          }
        } catch {
          // borrador corrupto — se ignora, no bloquea la pantalla
        }
      })
      .finally(() => {
        if (!cancelled) setDraftLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr una vez al montar, con el draftKey inicial
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    const data: DraftData = {
      selectedStudentIds,
      subject,
      description,
      selectedTagId,
      absenceRange: absenceRange
        ? {
            start: absenceRange.start.toISOString(),
            end: absenceRange.end.toISOString(),
          }
        : null,
    };
    AsyncStorage.setItem(draftKey, JSON.stringify(data)).catch(() => {});
  }, [
    draftLoaded,
    draftKey,
    selectedStudentIds,
    subject,
    description,
    selectedTagId,
    absenceRange,
  ]);

  const clearDraft = useCallback(() => {
    AsyncStorage.removeItem(draftKey).catch(() => {});
  }, [draftKey]);

  // ── Estudiantes ──────────────────────────────────────────────────────────
  // TagMultiSelectSheet trabaja con ids numéricos — selectedStudentIds sigue
  // siendo string[] internamente (buildPayload sigue siendo el único lugar
  // que lo pasa a number[] para el payload); esta conversión es solo para
  // calzar con las props del componente reusado.
  const studentOptions = useMemo(
    () =>
      estudiantes.map((e) => ({
        id: e.id,
        name: e.fullName,
        subtitle: buildStudentSubtitle(e),
        avatarUrl: photoUri(e.photourl),
      })),
    [estudiantes],
  );
  const selectedStudentIdsNumeric = useMemo(
    () => selectedStudentIds.map(Number),
    [selectedStudentIds],
  );
  const handleStudentSelectionChange = useCallback((ids: number[]) => {
    setSelectedStudentIds(ids.map(String));
  }, []);

  // ── Tipo de excusa ───────────────────────────────────────────────────────
  const selectedTypeTag = typeTags.find((t) => t.id === selectedTagId);
  const typeSheetOptions = useMemo(
    () =>
      typeTags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
    [typeTags],
  );

  const isDateAllowed = useCallback(
    (date: Date) =>
      isCompanyWorkingDate(date, schedulesAdd, entryTime, exitTime),
    [schedulesAdd, entryTime, exitTime],
  );

  // ── Adjuntos — expo-document-picker, mismo patrón que SolicitarPermisoForm ──
  const attachmentsBytes = useMemo(
    () =>
      attachmentFiles.reduce(
        (total, file) => total + attachmentPayloadBytes(file.dataUri),
        0,
      ),
    [attachmentFiles],
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
      // Se descuenta archivo por archivo dentro de la misma tanda: aceptar
      // los que caben y rechazar solo los que desbordan.
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
          const mimeType = asset.mimeType || "application/octet-stream";
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
        setAttachmentFiles((prev) => [...prev, ...accepted]);
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
    setAttachmentFiles((prev) => prev.filter((file) => file.id !== id));
    setAttachmentError(null);
  }, []);

  // ── Validación ───────────────────────────────────────────────────────────
  const validateForm = useCallback((): boolean => {
    const nextErrors: FieldErrors = {};

    if (selectedStudentIds.length === 0) {
      nextErrors.students = "Selecciona al menos un estudiante";
    }
    if (selectedTagId == null) {
      nextErrors.tagId = "Debe seleccionar un tipo de excusa";
    }
    if (subject.trim().length < 3) {
      nextErrors.subject = "El asunto debe tener al menos 3 caracteres";
    }
    if (description.trim().length < 10) {
      nextErrors.description = "El motivo debe tener al menos 10 caracteres";
    }
    if (!absenceRange) {
      nextErrors.absenceRange = "Debe seleccionar los días de ausencia";
    } else if (
      !isAbsenceRangeOnlyCompanyWorkingDays(
        absenceRange.start,
        absenceRange.end,
        schedulesAdd,
        entryTime,
        exitTime,
      )
    ) {
      nextErrors.absenceRange = WORKING_DAYS_ERROR;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [
    selectedStudentIds,
    selectedTagId,
    subject,
    description,
    absenceRange,
    schedulesAdd,
    entryTime,
    exitTime,
  ]);

  const resetForm = useCallback(() => {
    setSelectedStudentIds([]);
    setSubject("");
    setDescription("");
    setSelectedTagId(null);
    setAbsenceRange(null);
    setAttachmentFiles([]);
    setAttachmentError(null);
    setErrors({});
  }, []);

  const buildPayload = useCallback(() => {
    const [start, end] = [
      toDateKey(absenceRange!.start),
      toDateKey(absenceRange!.end),
    ];
    return {
      studentIds: selectedStudentIds.map(Number),
      description: description.trim(),
      subject: subject.trim(),
      absentDays: [start, end],
      attachments,
      typeTagId: selectedTagId,
      ...(resolvedStateTag ? { stateTagId: resolvedStateTag.id } : {}),
    };
  }, [
    selectedStudentIds,
    description,
    subject,
    absenceRange,
    attachments,
    selectedTagId,
    resolvedStateTag,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    const url = urlColegio ?? useSchoolStore.getState().urlColegio;
    const token = await Storage.getItemAsync("token");
    if (!url || !token) {
      Alert.alert("Sin conexión", "No hay conexión activa. Intenta de nuevo.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildPayload();
      const response = await axios.post(`${url}/excuses`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      // `success` puede venir en false con HTTP 200 — el status no basta.
      if (!response.data?.success) {
        throw new Error(
          response.data?.message ?? "No se pudo enviar la excusa.",
        );
      }

      resetForm();
      clearDraft();
      Alert.alert(
        "Excusa enviada",
        "Tu excusa quedó registrada correctamente.",
      );
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ??
        error?.message ??
        "Error de conexión.";
      Alert.alert(
        "No se pudo enviar",
        typeof msg === "string" ? msg : "Ocurrió un error.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [validateForm, urlColegio, buildPayload, resetForm, clearDraft]);

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ESTUDIANTE / TIPO */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <User size={18} color={PRIMARY_COLOR} />
              <Text style={styles.cardTitle}>Estudiante / Tipo</Text>
            </View>

            <Text style={styles.label}>
              Estudiante(s) <Text style={styles.required}>*</Text>
            </Text>
            <TouchableOpacity
              style={[styles.select, !!errors.students && styles.inputInvalid]}
              onPress={() => setStudentSheetVisible(true)}
              activeOpacity={0.75}
            >
              <Text
                style={
                  selectedStudentIds.length > 0
                    ? styles.selectValue
                    : styles.selectPlaceholder
                }
                numberOfLines={1}
              >
                {selectedStudentIds.length > 0
                  ? `${selectedStudentIds.length} estudiante(s) seleccionado(s)`
                  : "Seleccionar estudiante(s)"}
              </Text>
              <ChevronDown size={16} color={TEXT_PLACEHOLDER} />
            </TouchableOpacity>
            {errors.students && (
              <Text style={styles.fieldError}>{errors.students}</Text>
            )}

            <Text style={[styles.label, styles.labelSpaced]}>
              Tipo de excusa <Text style={styles.required}>*</Text>
            </Text>
            <TouchableOpacity
              style={[styles.select, !!errors.tagId && styles.inputInvalid]}
              onPress={() => setTypeSheetVisible(true)}
              disabled={typeTagsLoading}
              activeOpacity={0.75}
            >
              <Text
                style={
                  selectedTypeTag
                    ? styles.selectValue
                    : styles.selectPlaceholder
                }
                numberOfLines={1}
              >
                {selectedTypeTag?.name ?? "Selecciona un tipo de excusa"}
              </Text>
              {typeTagsLoading ? (
                <ActivityIndicator size="small" color={PRIMARY_COLOR} />
              ) : (
                <ChevronDown size={16} color={TEXT_PLACEHOLDER} />
              )}
            </TouchableOpacity>
            {errors.tagId && (
              <Text style={styles.fieldError}>{errors.tagId}</Text>
            )}
          </View>

          {/* DETALLES (ASUNTO + MOTIVO) */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MessageSquare size={18} color={PRIMARY_COLOR} />
              <Text style={styles.cardTitle}>Detalles</Text>
            </View>

            <Text style={styles.label}>
              Asunto <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              placeholder="Escriba aquí..."
              placeholderTextColor={TEXT_PLACEHOLDER}
              style={[styles.input, !!errors.subject && styles.inputInvalid]}
              value={subject}
              onChangeText={setSubject}
            />
            {errors.subject && (
              <Text style={styles.fieldError}>{errors.subject}</Text>
            )}

            <Text style={[styles.label, styles.labelSpaced]}>
              Motivo <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              placeholder="Describe el motivo de la ausencia o tardanza"
              placeholderTextColor={TEXT_PLACEHOLDER}
              style={[
                styles.input,
                styles.textarea,
                !!errors.description && styles.inputInvalid,
              ]}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            {errors.description && (
              <Text style={styles.fieldError}>{errors.description}</Text>
            )}
          </View>

          {/* DÍA/S AUSENCIA */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Calendar size={18} color={PRIMARY_COLOR} />
              <Text style={styles.cardTitle}>Día/s Ausencia</Text>
            </View>
            <AbsenceCalendar
              selectedRange={absenceRange}
              onChange={setAbsenceRange}
              isDateAllowed={isDateAllowed}
            />
            {errors.absenceRange && (
              <Text style={styles.fieldError}>{errors.absenceRange}</Text>
            )}
          </View>

          {/* ADJUNTOS */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Paperclip size={18} color={PRIMARY_COLOR} />
              <Text style={styles.cardTitle}>Adjuntos</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.dropzone,
                payloadOverLimit && styles.dropzoneBlocked,
              ]}
              onPress={handlePickFiles}
              disabled={loadingFiles || payloadOverLimit}
              activeOpacity={0.75}
            >
              {loadingFiles ? (
                <ActivityIndicator size="small" color={PRIMARY_COLOR} />
              ) : (
                <Ionicons
                  name={
                    payloadOverLimit
                      ? "alert-circle-outline"
                      : "cloud-upload-outline"
                  }
                  size={24}
                  color={payloadOverLimit ? ERROR_COLOR : PRIMARY_COLOR}
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

            {attachmentFiles.length > 0 && (
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

            {attachmentFiles.length > 0 && (
              <View style={styles.chipList}>
                {attachmentFiles.map((file) => (
                  <View key={file.id} style={styles.chip}>
                    <Ionicons
                      name={getFileIcon(file.mimeType)}
                      size={16}
                      color={PRIMARY_COLOR}
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
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color={TEXT_PLACEHOLDER}
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        {/* ACCIONES — footer fijo, fuera del scroll */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerBtn, styles.cancelBtn]}
            onPress={() => router.back()}
            disabled={submitting}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.footerBtn,
              styles.saveBtn,
              submitting && styles.saveBtnBusy,
            ]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveText}>Enviar</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <TagMultiSelectSheet
        visible={studentSheetVisible}
        title="Seleccionar Estudiantes"
        showCount
        options={studentOptions}
        selectedIds={selectedStudentIdsNumeric}
        emptyText="No hay estudiantes disponibles"
        onChange={handleStudentSelectionChange}
        onClose={() => setStudentSheetVisible(false)}
      />

      <TagOptionSheet
        visible={typeSheetVisible}
        title="Tipo de excusa"
        options={typeSheetOptions}
        selectedId={selectedTagId}
        emptyText="No hay tipos de excusa configurados"
        onSelect={(tag) => {
          setSelectedTagId(Number(tag.id));
          setTypeSheetVisible(false);
        }}
        onClose={() => setTypeSheetVisible(false)}
      />
    </View>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    // Pantalla directa (sin Modal ni landing) — mismo patrón que
    // timeoffscreen.tsx/SolicitarPermisoForm.tsx: hereda el header
    // compartido de (app)/_layout.tsx, esta pantalla solo pone el fondo.
    screen: { flex: 1, backgroundColor: APP_BACKGROUND },

    // Para el KeyboardAvoidingView.
    flex: { flex: 1 },

    content: {
      padding: scale(16),
      gap: verticalScale(14),
    },

    // Header de sección — mismo texto/lugar que "Reportar Excusa" en
    // ParentsExcusesScreen/index.jsx del webapp (ahí vive en un <Header>
    // aparte; acá alcanza con un texto simple, ya que el header nativo de
    // la app ya muestra "Excusas" como título de la ruta).
    pageTitle: { fontSize: font(18), fontWeight: "700", color: TEXT_PRIMARY },

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
      marginBottom: verticalScale(14),
    },
    cardTitle: { fontSize: font(15), fontWeight: "700", color: TEXT_PRIMARY },

    /* ── Campos ── */
    label: {
      fontSize: font(12),
      fontWeight: "600",
      color: TEXT_SECONDARY,
      marginBottom: verticalScale(6),
    },
    labelSpaced: { marginTop: verticalScale(14) },
    required: { color: ERROR_COLOR, fontWeight: "700" },

    input: {
      borderWidth: 1,
      borderColor: INPUT_BORDER,
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      fontSize: font(14),
      color: TEXT_PRIMARY,
      backgroundColor: CARD_BACKGROUND,
    },
    inputInvalid: { borderColor: ERROR_COLOR },
    fieldError: {
      fontSize: font(12),
      color: ERROR_COLOR,
      marginTop: verticalScale(4),
    },

    textarea: { minHeight: verticalScale(80) },

    select: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      borderWidth: 1,
      borderColor: INPUT_BORDER,
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      backgroundColor: CARD_BACKGROUND,
    },
    selectValue: { flex: 1, fontSize: font(14), color: TEXT_PRIMARY },
    selectPlaceholder: { flex: 1, fontSize: font(14), color: TEXT_PLACEHOLDER },

    /* ── Adjuntos (dropzone + chips, igual que SolicitarPermisoForm) ── */
    dropzone: {
      alignItems: "center",
      justifyContent: "center",
      gap: scale(4),
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: INPUT_BORDER,
      backgroundColor: APP_BACKGROUND,
      borderRadius: RADIUS_MD,
      paddingVertical: verticalScale(22),
    },
    dropzoneBlocked: { borderColor: ERROR_COLOR, backgroundColor: CARD_BORDER },
    dropzoneText: {
      fontSize: font(13),
      fontWeight: "700",
      color: PRIMARY_COLOR,
    },
    dropzoneTextBlocked: { color: ERROR_COLOR },
    dropzoneHint: { fontSize: font(11), color: TEXT_PLACEHOLDER },

    usageRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      marginTop: verticalScale(12),
    },
    usageTrack: {
      flex: 1,
      height: 5,
      borderRadius: RADIUS_MD,
      backgroundColor: FOOTER_BORDER,
      overflow: "hidden",
    },
    usageFill: {
      height: "100%",
      borderRadius: RADIUS_MD,
      backgroundColor: PRIMARY_COLOR,
    },
    usageFillOver: { backgroundColor: ERROR_COLOR },
    usageText: {
      fontSize: font(11),
      fontWeight: "600",
      color: TEXT_PLACEHOLDER,
    },
    usageTextOver: { color: ERROR_COLOR },

    helperWarning: {
      fontSize: font(11),
      color: WARNING_COLOR,
      marginTop: verticalScale(8),
    },
    helperError: { color: ERROR_COLOR },

    chipList: { gap: scale(8), marginTop: verticalScale(12) },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      backgroundColor: APP_BACKGROUND,
      borderWidth: 1,
      borderColor: CARD_BORDER,
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    chipName: {
      flex: 1,
      fontSize: font(13),
      color: TEXT_SECONDARY,
      fontWeight: "500",
    },
    chipSize: { fontSize: font(11), color: TEXT_PLACEHOLDER },

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
    cancelText: {
      fontSize: font(14),
      fontWeight: "700",
      color: TEXT_SECONDARY,
    },
    saveBtn: { backgroundColor: PRIMARY_COLOR },
    saveBtnBusy: { opacity: 0.7 },
    // CARD_BACKGROUND ("#fff") reusado como color de texto: no hay un token
    // de "texto blanco" separado en colors.ts, y este botón es sólido
    // PRIMARY_COLOR de fondo.
    saveText: { fontSize: font(14), fontWeight: "700", color: CARD_BACKGROUND },
  });
}
