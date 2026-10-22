import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  type AlertButton,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  APP_BACKGROUND_V2,
  CARD_BACKGROUND,
  DANGER_ICON,
  ERROR_COLOR,
  ICON_EDIT,
  INDIGO_TEXT,
  INDIGO_TINT_BACKGROUND,
  ON_PRIMARY,
  PRIMARY_700,
  PRIMARY_COLOR,
  PRIMARY_TINT_50,
  PRIMARY_TINT_BORDER,
  SECTION_ICON_COLOR,
  SUCCESS_COLOR,
  SUCCESS_TINT_BACKGROUND,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WARNING_TEXT_STRONG,
  WARNING_TINT_BACKGROUND,
} from "@/constants/colors";
import {
  MAX_CONTENT_WIDTH,
  RADIUS_PILL,
  RADIUS_SM,
  useResponsive,
} from "@/constants/responsive";
import SectionIcon from "@/components/ui/SectionIcon";
import TagOptionSheet from "@/components/permissions/TagOptionSheet";
import TagMultiSelectSheet from "@/components/users/TagMultiSelectSheet";
import {
  ADD_FILE_BTN,
  CARD_FORM,
  FIELD_SURFACE,
  FOOTER_BAR,
  FOOTER_BTN_CANCEL,
  FOOTER_BTN_SAVE,
} from "@/styles/surfaces";
import {
  addTaskerAddress,
  addTaskerComment,
  buildReportAddresses,
  collectAddressCandidates,
  filterFaultActionsForClient,
  formatAddressCandidatesTable,
  formatSelectedFaultsSummary,
  getClientAddressHint,
  getRemovedFaultsNotice,
  getSelectedFaultNames,
  getDefaultClientAddressId,
  getNearestElsewhereHint,
  getTaskerAddressDisplay,
  getTaskerClientLabel,
  getFaultSelectPlaceholder,
  getTaskerFaultLabel,
  getTaskerFormRules,
  getSelectedTaskerAddress,
  getUnsavedCommentOnSend,
  hasSharedCoordinatesAcrossClients,
  pickNearestAddressCandidate,
  pickNearestClientAddress,
  pruneSelectedFaults,
  removeTaskerAddress,
  removeTaskerComment,
  saveTaskerCommentDraft,
  selectTaskerAddress,
  sortTaskerAddresses,
  toggleTaskerAddressSelected,
  updateTaskerAddress,
  updateTaskerComment,
  validateReport,
} from "../../utils/taskerRules";
import {
  buildTaskrTaskBody,
  createTaskerTask,
  fetchTaskerFaultActions,
  TASKER_ACTIONS_ERROR,
  TASKER_SEND_ERROR,
} from "../../utils/taskerApi";
import * as Storage from "../../utils/storage";
import { useSchoolStore } from "../../../store/useSchoolStore";
import type {
  TaskerAddress,
  TaskerComment,
  TaskerCommentAuthor,
  TaskerCommentDraft,
  TaskerCompanyConfig,
  TaskerFaultAction,
  TaskerReportAddress,
  TaskerReportErrors,
  TaskerUserClient,
} from "../../../types/typesTasker/TaskerTypes";
import TaskerAddressModal from "./TaskerAddressModal";
import TaskerAddressSummary from "./TaskerAddressSummary";
import TaskerCommentsCard, { type TaskerCommentsCardHandle } from "./TaskerCommentsCard";
import {
  TASKER_LAYOUT as L,
  TASKER_TOUCH_MIN,
  taskerMultilineStyle,
  taskerTitleMetrics,
} from "./taskerCompact";

type Styles = ReturnType<typeof createStyles>;

/** Catálogo de averías (GET /taskr/actions), cargado al abrir. */
type FaultActionsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; actions: TaskerFaultAction[] };

/** Token y servidor de la sesión, como las demás llamadas a FaceClass. Nunca lanza. */
async function sessionCredentials(): Promise<{ token: string; urlColegio: string } | null> {
  try {
    const state = useSchoolStore.getState();
    const token = state.token ?? (await Storage.getItemAsync("token"));
    const urlColegio = state.urlColegio ?? (await Storage.getItemAsync("urlColegio"));
    return token && urlColegio ? { token, urlColegio } : null;
  } catch {
    return null;
  }
}

interface ReportFaultFormProps {
  config: TaskerCompanyConfig;
  /** Nunca vacío: ReportFaultGate no monta el formulario sin clientes. */
  clients: TaskerUserClient[];
  /**
   * Posición NUEVA del teléfono en esta visita (decide la dirección más
   * cercana). null = refrescándose al volver a entrar: sin distancias ni
   * "Más cercana" hasta que llegue.
   */
  coords: { latitude: number; longitude: number } | null;
}

/**
 * Cliente y dirección de arranque (o tras Limpiar): la más cercana entre
 * TODAS las direcciones de TODOS los clientes. Sin ninguna con coordenadas →
 * primer cliente y su predeterminada.
 */
function initialSelection(
  clients: TaskerUserClient[],
  coords: ReportFaultFormProps["coords"],
) {
  const nearest = pickNearestAddressCandidate(collectAddressCandidates(clients, coords), null);
  const client = clients.find((c) => c.id === nearest?.clientId) ?? clients[0];
  const addressId = nearest ? nearest.addressId : getDefaultClientAddressId(client.addresses);
  return { client, addresses: buildReportAddresses(client, [], addressId) };
}

/**
 * Reportar (Tasker) — FASE B: config y clientes de chooseschool, averías de
 * GET /taskr/actions y envío a POST /taskr/tasks. Solo se monta con la
 * compañía conectada, clientes y la posición del teléfono (ver
 * ReportFaultGate); al volver a entrar sigue montado y recibe la nueva. Comentarios (con sus imágenes y PDF) y direcciones se
 * agregan, editan, borran y marcan en local; todo viaja junto en el envío.
 */
export default function ReportFaultForm({ config, clients, coords }: ReportFaultFormProps) {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const rules = useMemo(() => getTaskerFormRules(config), [config]);
  const faultLabel = getTaskerFaultLabel(config);
  const [faultActionsState, setFaultActionsState] = useState<FaultActionsState>({
    status: "loading",
  });
  const faultActions = useMemo(
    () => (faultActionsState.status === "ready" ? faultActionsState.actions : []),
    [faultActionsState],
  );
  // "Reporta:" y autor de los comentarios: el usuario en sesión.
  const sessionUser = useSchoolStore((state) => state.user);
  const commentAuthor = useMemo<TaskerCommentAuthor>(
    () => ({ id: sessionUser?.user?.id ?? null, name: sessionUser?.user?.fullName ?? "Usuario" }),
    [sessionUser],
  );

  const [initial] = useState(() => initialSelection(clients, coords));
  const [clientId, setClientId] = useState<number>(initial.client.id);
  const client = clients.find((c) => c.id === clientId) ?? initial.client;

  // Subtítulo del header (ver (app)/_layout.tsx): el cliente elegido, mientras
  // el formulario está montado. Sin nombre o al desmontar → sin subtítulo.
  const setHeaderClientName = useSchoolStore((state) => state.setTaskerReportClientName);
  useEffect(() => {
    setHeaderClientName(client.name.trim() || null);
  }, [client.name, setHeaderClientName]);
  useEffect(() => () => setHeaderClientName(null), [setHeaderClientName]);
  const [faultIds, setFaultIds] = useState<number[]>([]);
  /** Averías que se quitaron en el último cambio de cliente (0 = sin aviso). */
  const [removedFaults, setRemovedFaults] = useState(0);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<TaskerReportErrors>({});
  const [clientSheetVisible, setClientSheetVisible] = useState(false);
  const [faultSheetVisible, setFaultSheetVisible] = useState(false);
  const [addresses, setAddresses] = useState<TaskerReportAddress[]>(initial.addresses);
  /** null = ventana cerrada; target null = dirección nueva. */
  const [addressEditor, setAddressEditor] = useState<{
    target: TaskerReportAddress | null;
  } | null>(null);
  const [comments, setComments] = useState<TaskerComment[]>([]);
  /**
   * Sube en cada reinicio (Limpiar o envío exitoso) y en "Enviar sin él" /
   * "Guardar y enviar": la tarjeta cierra el comentario a medias.
   */
  const [commentsResetKey, setCommentsResetKey] = useState(0);
  /** Envío en curso: el ref bloquea un segundo toque antes del re-render. */
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  /** Las respuestas que llegan tras desmontar no tocan el estado. */
  const mountedRef = useRef(true);
  const faultsRequestRef = useRef(0);
  /** La tarjeta de comentarios lleva su formulario a la vista (y sobre el teclado). */
  const scrollRef = useRef<ScrollView>(null);
  /** Borrador del comentario abierto, que se revisa al enviar. */
  const commentsCardRef = useRef<TaskerCommentsCardHandle>(null);

  /** Tras Limpiar o un envío exitoso: a la vista el primer bloque del formulario. */
  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Carga el catálogo; el estado solo cambia cuando llega la respuesta (una
   * vieja no pisa la actual).
   */
  const loadFaultActions = useCallback(async () => {
    const id = ++faultsRequestRef.current;
    const credentials = await sessionCredentials();
    const result = credentials
      ? await fetchTaskerFaultActions(credentials)
      : { ok: false as const, actions: [], message: TASKER_ACTIONS_ERROR };
    if (!mountedRef.current || id !== faultsRequestRef.current) return;
    setFaultActionsState(
      result.ok ? { status: "ready", actions: result.actions } : { status: "error" },
    );
  }, []);

  /** "Reintentar": vuelve al indicador de carga y pide de nuevo. */
  const retryFaultActions = useCallback(() => {
    setFaultActionsState({ status: "loading" });
    void loadFaultActions();
  }, [loadFaultActions]);

  // Solo si la compañía usa averías. Arranca en "loading": no hace falta marcarlo.
  useEffect(() => {
    if (rules.showFaults) void loadFaultActions();
  }, [rules.showFaults, loadFaultActions]);

  const availableFaults = useMemo(
    () => filterFaultActionsForClient(faultActions, client.id),
    [faultActions, client.id],
  );
  const faultOptions = useMemo(
    () => availableFaults.map((a) => ({ id: a.id, name: a.name })),
    [availableFaults],
  );
  const faultsSummary = formatSelectedFaultsSummary(getSelectedFaultNames(faultIds, faultActions));
  /** Lista a mostrar: la predeterminada siempre primero. */
  const sortedAddresses = useMemo(() => sortTaskerAddresses(addresses), [addresses]);
  /**
   * Candidatas a "Más cercana": las de todos los clientes; las del cliente
   * elegido, tal como están en la lista (con las agregadas, editadas y sin las
   * borradas). Se recalcula al agregar, editar, borrar o cambiar de cliente.
   */
  const addressCandidates = useMemo(
    () => collectAddressCandidates(clients, coords, { clientId: client.id, addresses }),
    [clients, coords, client.id, addresses],
  );
  const nearest = useMemo(
    () => pickNearestAddressCandidate(addressCandidates, client.id),
    [addressCandidates, client.id],
  );
  /** "Más cercana" en Direcciones: solo si la más cercana de TODAS es de este cliente. */
  const nearestAddressId = nearest?.clientId === client.id ? nearest.addressId : null;
  /** Línea bajo el cliente: "Más cercana" / "Seleccionada" con la distancia de la marcada. */
  const addressHint = getClientAddressHint(addresses, client.id, nearest, coords);
  const hintIsNearest = addressHint?.caption === "Más cercana";
  /** La más cercana de todas, si es de otro cliente (con "Usar"). */
  const nearestElsewhere = getNearestElsewhereHint(nearest, client.id);

  // Diagnóstico: coordenadas de cada candidata (para ver repetidas en Tasker).
  useEffect(() => {
    if (!__DEV__) return;
    console.log(`[Reportar] Direcciones candidatas\n${formatAddressCandidatesTable(addressCandidates)}`);
    if (hasSharedCoordinatesAcrossClients(addressCandidates)) {
      console.warn("Direcciones con coordenadas idénticas: revisar datos en Tasker");
    }
  }, [addressCandidates]);
  const clientLabel = getTaskerClientLabel(config);
  const removedFaultsNotice = getRemovedFaultsNotice(removedFaults);
  const clientOptions = useMemo(() => clients.map((c) => ({ id: c.id, name: c.name })), [clients]);

  const clearError = useCallback((key: keyof TaskerReportErrors) => {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const handleDescriptionChange = useCallback(
    (text: string) => {
      setDescription(text);
      clearError("description");
    },
    [clearError],
  );

  /** Cada toque en la hoja se aplica al momento: cerrarla (Listo o fuera) conserva lo marcado. */
  const handleFaultsChange = useCallback(
    (ids: number[]) => {
      setFaultIds(ids);
      setRemovedFaults(0);
      clearError("faults");
    },
    [clearError],
  );

  /**
   * El usuario cambió cliente o dirección en esta visita: una posición nueva ya
   * no mueve la selección, solo etiquetas y distancias. Se limpia al entrar.
   */
  const touchedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      touchedRef.current = false;
    }, []),
  );

  /**
   * Mismo cliente → solo marca `addressId`. Otro cliente: sus direcciones con
   * `addressId` marcada o, sin ella, la más cercana de ese cliente (o la
   * primera); las agregadas por el usuario se conservan y se quitan las
   * averías que ya no le aplican (con aviso de cuántas).
   */
  const applySelection = useCallback(
    (nextId: number, addressId?: number) => {
      if (nextId === clientId) {
        if (addressId === undefined) return;
        setAddresses((prev) => selectTaskerAddress(prev, addressId));
        clearError("address");
        return;
      }
      const next = clients.find((c) => c.id === nextId);
      if (!next) return;
      const selectedId = addressId ?? pickNearestClientAddress([next], coords)?.addressId ?? null;
      setClientId(next.id);
      setAddresses((prev) => buildReportAddresses(next, prev, selectedId));
      const kept = pruneSelectedFaults(faultIds, filterFaultActionsForClient(faultActions, next.id));
      setFaultIds(kept);
      setRemovedFaults(faultIds.length - kept.length);
      clearError("address");
    },
    [clientId, clients, coords, faultActions, faultIds, clearError],
  );

  /** Otro cliente desde la hoja o con "Usar" (con su dirección). */
  const handleSelectClient = useCallback(
    (nextId: number, addressId?: number) => {
      setClientSheetVisible(false);
      if (nextId === clientId) return;
      touchedRef.current = true;
      applySelection(nextId, addressId);
    },
    [clientId, applySelection],
  );

  /**
   * Posición nueva (al volver a entrar): sin cambios del usuario en esta
   * visita, se vuelve a sugerir la más cercana de todas (cliente + dirección);
   * con cambios, solo se recalculan etiquetas y distancias.
   */
  const suggestedCoordsRef = useRef(coords);
  useEffect(() => {
    if (!coords || coords === suggestedCoordsRef.current) return;
    suggestedCoordsRef.current = coords;
    if (touchedRef.current) return;
    const nearest = pickNearestAddressCandidate(
      collectAddressCandidates(clients, coords, { clientId, addresses }),
      clientId,
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la posición nueva llega de fuera (GPS) y se aplica una sola vez por lectura
    if (nearest) applySelection(nearest.clientId, nearest.addressId);
  }, [coords, clients, clientId, addresses, applySelection]);

  const handleAddressSelected = useCallback(
    (built: TaskerAddress) => {
      const target = addressEditor?.target ?? null;
      setAddresses((prev) =>
        target
          ? updateTaskerAddress(prev, {
              ...built,
              id: target.id,
              order: target.order,
              selected: target.selected,
              locked: false,
              fromClient: target.fromClient,
            })
          : addTaskerAddress(prev, built),
      );
      touchedRef.current = true;
      // La nueva queda seleccionada: ya hay dirección.
      if (!target) clearError("address");
      setAddressEditor(null);
    },
    [addressEditor, clearError],
  );

  const handleRemoveAddress = useCallback((address: TaskerReportAddress) => {
    Alert.alert("Confirmar Eliminar", `Está seguro que desea eliminar la Dirección ${address.order}`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => {
          touchedRef.current = true;
          setAddresses((prev) => removeTaskerAddress(prev, address.id));
        },
      },
    ]);
  }, []);

  const handleToggleAddress = useCallback(
    (id: number) => {
      touchedRef.current = true;
      setAddresses((prev) => toggleTaskerAddressSelected(prev, id));
      clearError("address");
    },
    [clearError],
  );

  const handleAddComment = useCallback(
    (draft: TaskerCommentDraft) => {
      setComments((prev) => addTaskerComment(prev, draft, commentAuthor, new Date()));
    },
    [commentAuthor],
  );

  const handleEditComment = useCallback((id: number, draft: TaskerCommentDraft) => {
    setComments((prev) => updateTaskerComment(prev, id, draft));
  }, []);

  const handleRemoveComment = useCallback((id: number) => {
    setComments((prev) => removeTaskerComment(prev, id));
  }, []);

  /**
   * Limpiar y envío exitoso: todo vacío, cliente y dirección a la recomendada
   * con la posición actual, y el comentario a medias (agregar o editar) cerrado
   * y descartado sin preguntar. Ese borrador nunca viaja: solo cuenta lo
   * guardado en `comments`.
   */
  const resetForm = useCallback(() => {
    const fresh = initialSelection(clients, coords);
    touchedRef.current = false;
    setClientId(fresh.client.id);
    setFaultIds([]);
    setRemovedFaults(0);
    setDescription("");
    setComments([]);
    setAddresses(fresh.addresses);
    setErrors({});
    setCommentsResetKey((key) => key + 1);
  }, [clients, coords]);

  const handleClear = useCallback(() => {
    resetForm();
    scrollToTop();
  }, [resetForm, scrollToTop]);

  /** Envío ya validado, con `toSend` como comentarios (los guardados, o con el borrador recién guardado). */
  const sendReport = useCallback(
    async (toSend: TaskerComment[]) => {
      if (sendingRef.current) return;
      const body = buildTaskrTaskBody({
        appliesFault: config.appliesFault === true,
        clientId: client.id,
        faultIds,
        description,
        address: getSelectedTaskerAddress(addresses),
        comments: toSend,
      });
      sendingRef.current = true;
      setSending(true);
      try {
        const credentials = await sessionCredentials();
        const response = credentials
          ? await createTaskerTask({ ...credentials, body })
          : { ok: false as const, message: TASKER_SEND_ERROR };
        if (!mountedRef.current) return;
        if (response.ok) {
          Alert.alert(
            "Reporte enviado",
            response.id != null ? `Ticket #${response.id}` : undefined,
            [{ text: "OK", onPress: scrollToTop }],
          );
          resetForm();
        } else {
          // Nada se limpia ni se mueve: el usuario puede corregir y reintentar.
          Alert.alert("Reporte no enviado", response.message);
        }
      } finally {
        sendingRef.current = false;
        if (mountedRef.current) setSending(false);
      }
    },
    [config.appliesFault, client.id, faultIds, description, addresses, resetForm, scrollToTop],
  );

  /**
   * Valida y, si hay un comentario abierto con cambios, pregunta antes de
   * enviar ("Volver", "Enviar sin él" y, si se puede guardar, "Guardar y enviar").
   */
  const handleSubmit = useCallback(() => {
    if (sendingRef.current) return;
    const result = validateReport({ faultIds, description, addresses }, rules);
    setErrors(result);
    if (Object.values(result).some(Boolean)) return;

    const open = commentsCardRef.current?.getOpenDraft() ?? null;
    const unsaved = getUnsavedCommentOnSend(open, comments);
    if (!open || unsaved.kind === "send") {
      void sendReport(comments);
      return;
    }
    const buttons: AlertButton[] = [
      {
        text: "Volver",
        style: "cancel",
        onPress: () => commentsCardRef.current?.revealComposer(),
      },
      {
        text: "Enviar sin él",
        style: "destructive",
        onPress: () => {
          setCommentsResetKey((key) => key + 1);
          void sendReport(comments);
        },
      },
    ];
    if (unsaved.canSave) {
      buttons.push({
        text: "Guardar y enviar",
        onPress: () => {
          const saved = saveTaskerCommentDraft(
            comments,
            open.target,
            open.current,
            commentAuthor,
            new Date(),
          );
          setComments(saved);
          setCommentsResetKey((key) => key + 1);
          void sendReport(saved);
        },
      });
    }
    Alert.alert("Comentario sin guardar", "Tienes un comentario que no has guardado.", buttons);
  }, [faultIds, description, addresses, rules, comments, commentAuthor, sendReport]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Averías (selección múltiple, filtradas por el cliente) ── */}
        {rules.showFaults && (
          <View style={styles.card}>
            <CardHeader
              styles={styles}
              tone="violet"
              icon="construct-outline"
              title={faultLabel}
              required={rules.faultsRequired}
            />
            {faultActionsState.status === "loading" ? (
              <View style={[styles.select, styles.selectDisabled]} accessibilityLabel="Cargando averías">
                <ActivityIndicator size="small" color={PRIMARY_700} />
                <Text style={styles.selectPlaceholder}>Cargando averías…</Text>
              </View>
            ) : faultActionsState.status === "error" ? (
              <View style={[styles.select, !!errors.faults && styles.fieldInvalid]}>
                <Ionicons name="alert-circle-outline" size={18} color={ERROR_COLOR} />
                <Text style={styles.selectPlaceholder} numberOfLines={2}>
                  {TASKER_ACTIONS_ERROR}
                </Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={retryFaultActions}
                  accessibilityRole="button"
                  activeOpacity={0.75}
                >
                  <Ionicons name="refresh-outline" size={16} color={PRIMARY_700} />
                  <Text style={styles.retryText}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : availableFaults.length === 0 ? (
              <View style={[styles.select, styles.selectDisabled, !!errors.faults && styles.fieldInvalid]}>
                <Text style={styles.selectPlaceholder}>No hay averías configuradas</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.select, !!errors.faults && styles.fieldInvalid]}
                onPress={() => setFaultSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={`${faultLabel}: ${faultsSummary ?? "ninguna elegida"}`}
                activeOpacity={0.75}
              >
                <Text
                  style={faultsSummary ? styles.selectValue : styles.selectPlaceholder}
                  numberOfLines={2}
                >
                  {faultsSummary ?? getFaultSelectPlaceholder(faultLabel)}
                </Text>
                <Ionicons name="chevron-down" size={16} color={TEXT_PLACEHOLDER} />
              </TouchableOpacity>
            )}
            {!!errors.faults && <Text style={styles.fieldError}>{errors.faults}</Text>}
            {removedFaultsNotice && (
              <View style={styles.noticeRow} accessibilityLiveRegion="polite">
                <Ionicons name="information-circle-outline" size={16} color={WARNING_TEXT_STRONG} />
                <Text style={styles.noticeText}>{removedFaultsNotice}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Descripción ── */}
        <View style={styles.card}>
          <CardHeader
            styles={styles}
            tone="blue"
            icon="document-text-outline"
            title="Descripción"
            required={rules.descriptionRequired}
          />
          <TextInput
            style={[styles.textarea, !!errors.description && styles.fieldInvalid]}
            value={description}
            onChangeText={handleDescriptionChange}
            placeholder="Describa los detalles aquí…"
            placeholderTextColor={TEXT_PLACEHOLDER}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Descripción"
          />
          {!!errors.description && (
            <Text style={styles.fieldError}>{errors.description}</Text>
          )}
        </View>

        {/* ── Comentarios: texto, imágenes/PDF o ambos (todos del usuario en sesión: editables) ── */}
        <TaskerCommentsCard
          ref={commentsCardRef}
          comments={comments}
          canEdit={() => true}
          onAdd={handleAddComment}
          onEdit={handleEditComment}
          onDelete={handleRemoveComment}
          sharedAttachmentLimit
          scrollRef={scrollRef}
          resetKey={commentsResetKey}
          compact
        />

        {/* ── Cliente: fijo con uno solo; con 2 o más, selector ── */}
        <View style={styles.card}>
          <CardHeader styles={styles} tone="blue" icon="business-outline" title={clientLabel} />
          {clients.length > 1 ? (
            <TouchableOpacity
              style={styles.select}
              onPress={() => setClientSheetVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`${clientLabel}: ${client.name}. Cambiar`}
              activeOpacity={0.75}
            >
              <Text style={styles.selectValue} numberOfLines={1}>
                {client.name}
              </Text>
              <Ionicons name="chevron-down" size={16} color={TEXT_PLACEHOLDER} />
            </TouchableOpacity>
          ) : (
            <Text style={styles.clientName}>{client.name}</Text>
          )}
          {/* Recuadro simple: etiqueta y distancia (el detalle va en la tarjeta Direcciones). */}
          {(addressHint || nearestElsewhere) && (
            <View style={styles.hintBox}>
              {addressHint && (
                <View style={styles.hintRow}>
                  <Ionicons
                    name="location-outline"
                    size={16}
                    color={hintIsNearest ? SUCCESS_COLOR : PRIMARY_700}
                  />
                  <Text style={styles.hintLine} numberOfLines={1}>
                    <Text style={[styles.hintCaption, hintIsNearest && styles.hintCaptionNearest]}>
                      {addressHint.caption}
                    </Text>
                    {!!addressHint.distanceLabel && (
                      <Text style={styles.hintDistance}> · {addressHint.distanceLabel}</Text>
                    )}
                  </Text>
                </View>
              )}
              {nearestElsewhere && (
                <View style={[styles.hintRow, !!addressHint && styles.elsewhereRowDivided]}>
                  <Ionicons name="navigate-outline" size={16} color={SUCCESS_COLOR} />
                  <Text style={styles.elsewhereText} numberOfLines={1}>
                    {nearestElsewhere.label}
                  </Text>
                  <TouchableOpacity
                    style={styles.useBtn}
                    onPress={() =>
                      handleSelectClient(nearestElsewhere.clientId, nearestElsewhere.addressId)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Usar ${nearestElsewhere.label}`}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.useBtnText}>Usar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          <View style={styles.reporterRow}>
            <Ionicons name="person-outline" size={14} color={TEXT_MUTED} />
            <Text style={styles.reporterText}>
              Reporta: <Text style={styles.reporterName}>{commentAuthor.name}</Text>
            </Text>
          </View>
        </View>

        {/* ── Direcciones: las del cliente (la predeterminada solo se elige) + las agregadas ── */}
        <View style={styles.card}>
          <CardHeader
            styles={styles}
            tone="teal"
            icon="location-outline"
            title={`Direcciones (${sortedAddresses.length})`}
          />
          {/* EXCEPCIÓN E3: Tasker reordena arrastrando las filas; aquí no (falta la librería). */}
          {sortedAddresses.map((address) => (
            <AddressRow
              key={address.id}
              address={address}
              nearest={address.id === nearestAddressId}
              styles={styles}
              onEdit={() => setAddressEditor({ target: address })}
              onRemove={() => handleRemoveAddress(address)}
              onToggleSelected={() => handleToggleAddress(address.id)}
            />
          ))}
          {!!errors.address && <Text style={styles.fieldError}>{errors.address}</Text>}
          <TouchableOpacity
            style={[styles.addBtn, addresses.length > 0 && styles.addBtnSpaced]}
            onPress={() => setAddressEditor({ target: null })}
            activeOpacity={0.75}
          >
            <Ionicons name="add-circle-outline" size={18} color={PRIMARY_700} />
            <Text style={styles.addBtnText}>Agregar dirección</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Barra inferior fija ── */}
      <View style={styles.footer}>
        <View style={[styles.footerRow, isTablet && styles.contentTablet]}>
          <TouchableOpacity
            style={[styles.footerBtn, styles.cancelBtn, sending && styles.footerBtnDisabled]}
            onPress={handleClear}
            disabled={sending}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>Limpiar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.footerBtn, styles.saveBtn, sending && styles.footerBtnDisabled]}
            onPress={handleSubmit}
            disabled={sending}
            accessibilityState={{ disabled: sending, busy: sending }}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color={ON_PRIMARY} />
            ) : (
              <Ionicons name="send-outline" size={18} color={ON_PRIMARY} />
            )}
            <Text style={styles.saveText}>{sending ? "Enviando…" : "Guardar y enviar"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TagMultiSelectSheet
        visible={faultSheetVisible}
        title={faultLabel}
        options={faultOptions}
        selectedIds={faultIds}
        emptyText="Sin opciones para este cliente"
        onChange={handleFaultsChange}
        onClose={() => setFaultSheetVisible(false)}
      />

      <TagOptionSheet
        visible={clientSheetVisible}
        title={clientLabel}
        options={clientOptions}
        selectedId={clientId}
        hideColorDot
        onSelect={(option) => option.id != null && handleSelectClient(option.id)}
        onClose={() => setClientSheetVisible(false)}
      />

      <TaskerAddressModal
        visible={addressEditor !== null}
        address={addressEditor?.target ?? null}
        onClose={() => setAddressEditor(null)}
        onSelect={handleAddressSelected}
      />
    </KeyboardAvoidingView>
  );
}

interface CardHeaderProps {
  styles: Styles;
  tone: React.ComponentProps<typeof SectionIcon>["tone"];
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Asterisco rojo después del título. */
  required?: boolean;
  /** Contenido a la derecha del título (chip, botones). */
  children?: React.ReactNode;
}

function CardHeader({ styles, tone, icon, title, required, children }: CardHeaderProps) {
  const { font } = useResponsive();
  const titleIcon = taskerTitleMetrics(font);
  return (
    <View style={styles.cardHeader}>
      <SectionIcon tone={tone} size={titleIcon.side} radius={titleIcon.radius}>
        <Ionicons name={icon} size={titleIcon.glyph} color={SECTION_ICON_COLOR} />
      </SectionIcon>
      <Text style={styles.cardTitle}>
        {title}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

interface AddressRowProps {
  address: TaskerReportAddress;
  /** Etiqueta "Más cercana" (la más cercana de toda la lista con coordenadas). */
  nearest: boolean;
  styles: Styles;
  onEdit: () => void;
  onRemove: () => void;
  onToggleSelected: () => void;
}

/**
 * La predeterminada del cliente (locked) solo se elige: sin lápiz ni papelera
 * y con la etiqueta "Predeterminada". Las demás del cliente y las agregadas se
 * editan y borran (solo en este reporte).
 */
function AddressRow({
  address,
  nearest,
  styles,
  onEdit,
  onRemove,
  onToggleSelected,
}: AddressRowProps) {
  return (
    <TaskerAddressSummary
      address={address}
      lines={getTaskerAddressDisplay(address)}
      style={styles.addressRow}
      actions={
        address.locked ? undefined : (
          <>
            <TouchableOpacity
              style={styles.addressBtn}
              onPress={onEdit}
              accessibilityLabel="Editar dirección"
              activeOpacity={0.75}
            >
              <Ionicons name="create-outline" size={18} color={ICON_EDIT} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addressBtn}
              onPress={onRemove}
              accessibilityLabel="Eliminar dirección"
              activeOpacity={0.75}
            >
              <Ionicons name="trash-outline" size={18} color={DANGER_ICON} />
            </TouchableOpacity>
          </>
        )
      }
    >
      <View style={styles.addressChips}>
        <TouchableOpacity
          style={[styles.selectAddressBtn, address.selected && styles.selectAddressBtnActive]}
          onPress={onToggleSelected}
          accessibilityState={{ selected: address.selected }}
          activeOpacity={0.75}
        >
          <Ionicons
            name={address.selected ? "checkmark-circle" : "ellipse-outline"}
            size={16}
            color={address.selected ? ON_PRIMARY : PRIMARY_700}
          />
          <Text
            style={[
              styles.selectAddressText,
              address.selected && styles.selectAddressTextActive,
            ]}
          >
            {address.selected ? "Seleccionada" : "Seleccionar"}
          </Text>
        </TouchableOpacity>
        {address.locked && (
          <View style={styles.defaultChip}>
            <Ionicons name="lock-closed-outline" size={12} color={INDIGO_TEXT} />
            <Text style={styles.defaultChipText}>Predeterminada</Text>
          </View>
        )}
        {nearest && (
          <View style={styles.nearestChip}>
            <Ionicons name="navigate-outline" size={12} color={SUCCESS_COLOR} />
            <Text style={styles.nearestChipText}>Más cercana</Text>
          </View>
        )}
      </View>
    </TaskerAddressSummary>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: APP_BACKGROUND_V2 },
    flex: { flex: 1 },
    // Medidas del diseño compacto: taskerCompact.ts (áreas táctiles ≥ 44).
    content: {
      padding: scale(L.screenPadding),
      gap: verticalScale(L.cardGap),
      paddingBottom: verticalScale(L.screenPaddingBottom),
    },
    contentTablet: {
      maxWidth: MAX_CONTENT_WIDTH,
      alignSelf: "center",
      width: "100%",
    },
    card: {
      ...CARD_FORM,
      paddingHorizontal: scale(L.cardPaddingH),
      paddingTop: verticalScale(L.cardPaddingTop),
      paddingBottom: verticalScale(L.cardPaddingBottom),
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(L.headerGap),
      marginBottom: verticalScale(L.headerMarginBottom),
    },
    // lineHeight = lado del ícono (taskerTitleMetrics): quedan a la misma altura.
    cardTitle: {
      flex: 1,
      fontSize: taskerTitleMetrics(font).fontSize,
      lineHeight: taskerTitleMetrics(font).lineHeight,
      fontWeight: "700",
      color: TEXT_PRIMARY,
    },
    required: { color: ERROR_COLOR },
    select: {
      ...FIELD_SURFACE,
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      minHeight: Math.max(TASKER_TOUCH_MIN, verticalScale(44)),
      paddingHorizontal: scale(12),
    },
    selectValue: { flex: 1, fontSize: font(14), color: TEXT_PRIMARY },
    selectPlaceholder: { flex: 1, fontSize: font(14), color: TEXT_PLACEHOLDER },
    selectDisabled: { opacity: 0.7 },
    retryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(4),
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(6),
      borderRadius: RADIUS_PILL,
      backgroundColor: PRIMARY_TINT_50,
    },
    retryText: { fontSize: font(12), fontWeight: "700", color: PRIMARY_700 },
    noticeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: scale(6),
      marginTop: verticalScale(L.noticeMarginTop),
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(L.noticePaddingV),
      borderRadius: RADIUS_SM,
      backgroundColor: WARNING_TINT_BACKGROUND,
    },
    noticeText: { flex: 1, fontSize: font(12), lineHeight: font(17), color: WARNING_TEXT_STRONG },
    // 2 líneas al arrancar; crece hasta 5 y luego scroll interno.
    textarea: {
      ...FIELD_SURFACE,
      ...taskerMultilineStyle(scale, font),
      paddingHorizontal: scale(12),
      fontSize: font(14),
      color: TEXT_PRIMARY,
    },
    fieldInvalid: { borderColor: ERROR_COLOR },
    fieldError: { fontSize: font(12), color: ERROR_COLOR, marginTop: verticalScale(4) },
    addBtn: {
      ...ADD_FILE_BTN,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      minHeight: Math.max(TASKER_TOUCH_MIN, verticalScale(44)),
    },
    addBtnSpaced: { marginTop: verticalScale(L.addBtnMarginTop) },
    addBtnText: { fontSize: font(14), fontWeight: "600", color: PRIMARY_700 },
    clientName: { fontSize: font(16), fontWeight: "700", color: TEXT_PRIMARY },
    hintBox: {
      marginTop: verticalScale(L.hintMarginTop),
      paddingHorizontal: scale(L.hintPaddingH),
      paddingVertical: verticalScale(L.hintPaddingV),
      borderRadius: RADIUS_SM,
      backgroundColor: PRIMARY_TINT_50,
    },
    hintRow: { flexDirection: "row", alignItems: "center", gap: scale(6) },
    hintLine: { flex: 1, fontSize: font(13) },
    hintCaption: { fontWeight: "700", color: PRIMARY_700 },
    hintCaptionNearest: { color: SUCCESS_COLOR },
    hintDistance: { fontWeight: "400", color: TEXT_MUTED },
    // "Más cercana" de otro cliente, separada de la seleccionada por una línea.
    elsewhereRowDivided: {
      marginTop: verticalScale(L.hintDividerSpace),
      paddingTop: verticalScale(L.hintDividerSpace),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: PRIMARY_TINT_BORDER,
    },
    elsewhereText: { flex: 1, fontSize: font(12), color: TEXT_SECONDARY },
    useBtn: {
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(3),
      borderRadius: RADIUS_PILL,
      backgroundColor: SUCCESS_COLOR,
    },
    useBtnText: { fontSize: font(12), fontWeight: "700", color: ON_PRIMARY },
    reporterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      marginTop: verticalScale(L.reporterMarginTop),
    },
    reporterText: { fontSize: font(13), color: TEXT_MUTED },
    reporterName: { fontWeight: "600", color: TEXT_SECONDARY },
    // El resto de la fila vive en TaskerAddressSummary.
    addressRow: { marginBottom: verticalScale(L.addressRowMarginBottom) },
    addressChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: scale(8),
      marginTop: verticalScale(L.addressChipsMarginTop),
    },
    selectAddressBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(6),
      borderRadius: RADIUS_PILL,
      borderWidth: 1,
      borderColor: PRIMARY_TINT_BORDER,
      backgroundColor: PRIMARY_TINT_50,
    },
    selectAddressBtnActive: { borderColor: PRIMARY_COLOR, backgroundColor: PRIMARY_COLOR },
    selectAddressText: { fontSize: font(12), fontWeight: "700", color: PRIMARY_700 },
    selectAddressTextActive: { color: ON_PRIMARY },
    nearestChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(4),
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(4),
      borderRadius: RADIUS_PILL,
      backgroundColor: SUCCESS_TINT_BACKGROUND,
    },
    defaultChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(4),
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(4),
      borderRadius: RADIUS_PILL,
      backgroundColor: INDIGO_TINT_BACKGROUND,
    },
    defaultChipText: { fontSize: font(11), fontWeight: "700", color: INDIGO_TEXT },
    nearestChipText: { fontSize: font(11), fontWeight: "700", color: SUCCESS_COLOR },
    // Botón de ícono cuadrado: 36×36 fijo (área táctil del ícono).
    addressBtn: {
      width: 36,
      height: 36,
      borderRadius: RADIUS_SM,
      backgroundColor: CARD_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
    },
    footer: {
      ...FOOTER_BAR,
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(12),
    },
    footerRow: { flexDirection: "row", gap: scale(10) },
    footerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      minHeight: verticalScale(48),
    },
    cancelBtn: { ...FOOTER_BTN_CANCEL, flex: 1 },
    cancelText: { fontSize: font(15), fontWeight: "600", color: TEXT_SECONDARY },
    saveBtn: { ...FOOTER_BTN_SAVE, flex: 2 },
    saveText: { fontSize: font(15), fontWeight: "700", color: ON_PRIMARY },
    footerBtnDisabled: { opacity: 0.6 },
  });
}
