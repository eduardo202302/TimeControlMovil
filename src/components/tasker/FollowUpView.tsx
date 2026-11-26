import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItem,
} from "react-native";
import { HEADER_TEXT, ON_PRIMARY, PRIMARY_COLOR, TEXT_MUTED } from "@/constants/colors";
import { useResponsive } from "@/constants/responsive";
import { useSchoolStore } from "../../../store/useSchoolStore";
import {
  getStateActivities,
  getTaskerClientLabel,
  type CommentOrder,
} from "../../utils/taskerRules";
import {
  addTaskerTaskComment,
  buildEvaluationBody,
  buildStateChangeBody,
  buildTaskrCommentBody,
  fetchTaskerStates,
  fetchTaskerTask,
  fetchTaskerTasks,
  fetchTaskerTaskStates,
  patchTaskerTask,
  TASKER_COMMENT_SEND_ERROR,
  TASKER_EVALUATION_SEND_ERROR,
  TASKER_STATE_CHANGE_ERROR,
  TASKER_TASK_ERROR,
  TASKER_TASK_STATES_ERROR,
  TASKER_TASKS_ERROR,
  type PatchTaskerTaskResult,
  type TaskrFailure,
} from "../../utils/taskerApi";
import {
  canEvaluateTask,
  createExclusiveRunner,
  getCommentDiscardedNotice,
  getTaskerClientName,
  getTicketGoneNotice,
  getTicketsTitle,
  isTaskInList,
  resolveRequestedTicket,
  SEGUIMIENTO_REFRESH_MS,
  shouldDiscardOpenComment,
  TASKER_NO_TICKETS_MESSAGE,
} from "../../utils/taskerFollowUpRules";
import type {
  TaskerCommentDraft,
  TaskerReviewStateId,
  TaskerState,
  TaskerTask,
  TaskerTaskState,
  TaskerTaskSummary,
  TaskrPatchBody,
} from "../../../types/typesTasker/TaskerTypes";
import FollowUpActionsTab from "./FollowUpActionsTab";
import FollowUpAddressTab from "./FollowUpAddressTab";
import { FollowUpNotice, StateChip } from "./FollowUpParts";
import type { TaskStatesCatalog } from "./FollowUpReviewSheets";
import FollowUpTicketCard from "./FollowUpTicketCard";
import FollowUpTicketTab from "./FollowUpTicketTab";
import { createFollowUpStyles, SEGMENT_HIT_SLOP, SEGMENT_ICON_SIZE } from "./followUpStyles";
import { getTaskerCredentials } from "./taskerCredentials";
import type { TaskerCommentsCardHandle } from "./TaskerCommentsCard";
import { useNowMs } from "./useNowMs";

type FollowUpTab = "ticket" | "address" | "actions" | "review";

const TABS: { key: FollowUpTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "ticket", label: "Ticket", icon: "document-text-outline" },
  { key: "address", label: "Dir.", icon: "location-outline" },
  { key: "actions", label: "Acciones", icon: "time-outline" },
  { key: "review", label: "Revisión", icon: "clipboard-outline" },
];

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; tasks: TaskerTaskSummary[] };

type DetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; task: TaskerTask };

/**
 * initial: con indicador y error a pantalla completa ("Reintentar"); pull:
 * deslizar hacia abajo (un error con datos ya cargados solo avisa); silent:
 * la automática (sin indicador; un error deja todo como estaba).
 */
type LoadMode = "initial" | "pull" | "silent";

/** "stale": mientras llegaba se abrió otro ticket (o se cerró el modal). */
type DetailLoad = "ok" | "gone" | "error" | "stale";

const noSession = (message: string): TaskrFailure => ({ ok: false, message, gone: false });

function getInitialTab(list: ListState, id: number): FollowUpTab {
  const summary = list.status === "ready" ? list.tasks.find((t) => t.id === id) : undefined;
  return summary && canEvaluateTask(summary.stateId) ? "review" : "ticket";
}

/** Evaluaciones (GET /taskr/taskStates) como estado de la hoja. Nunca lanza. */
async function requestTaskStates(): Promise<TaskStatesCatalog> {
  const credentials = await getTaskerCredentials();
  const result = credentials
    ? await fetchTaskerTaskStates(credentials)
    : noSession(TASKER_TASK_STATES_ERROR);
  return result.ok
    ? { status: "ready", taskStates: result.taskStates }
    : { status: "error", message: result.message };
}

interface FollowUpViewProps {
  /**
   * Ticket a abrir al cargar la lista (llega de "Ver seguimiento" tras
   * enviar un reporte). Se toma una sola vez: al recibirlo se llama
   * `onRequestConsumed` y las recargas siguientes no lo vuelven a aplicar.
   */
  requestedTicketId?: number | null;
  onRequestConsumed?: () => void;
}

/**
 * Seguimiento de los tickets de Tasker: lista vertical de tarjetas y, al
 * tocar una, su detalle en un modal a pantalla completa (pestañas Ticket /
 * Dir. / Acciones / Revisión). `requestedTicketId`, si está en la lista, abre su
 * modal al cargar. Mientras la pantalla tiene el foco y la app está en primer
 * plano, lista y detalle abierto se recargan solos cada
 * SEGUIMIENTO_REFRESH_MS, sin indicador y sin tocar el formulario de
 * comentario abierto (salvo que el ticket se cierre).
 */
export default function FollowUpView({
  requestedTicketId = null,
  onRequestConsumed,
}: FollowUpViewProps) {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createFollowUpStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const [tab, setTab] = useState<FollowUpTab>("ticket");
  /** El formulario de comentarios se lleva a la vista (y sobre el teclado). */
  const scrollRef = useRef<ScrollView>(null);
  const commentsCardRef = useRef<TaskerCommentsCardHandle>(null);
  // Viven acá y no en la pestaña: el orden se conserva al cambiar de pestaña.
  const [commentOrder, setCommentOrder] = useState<CommentOrder>("desc");
  const [commentsResetKey, setCommentsResetKey] = useState(0);

  const [list, setList] = useState<ListState>({ status: "loading" });
  /** Ticket abierto en el modal; null = modal cerrado. */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Espejos de lo anterior: las cargas leen el valor de cuando terminan, no
  // el del render que las lanzó.
  const listRef = useRef<ListState>(list);
  const selectedIdRef = useRef<number | null>(null);
  const detailRef = useRef<DetailState | null>(null);
  /** Lista + detalle de a una: si una recarga no terminó, no se lanza otra. */
  const [runExclusive] = useState(createExclusiveRunner);
  /** Ticket pedido que espera a la próxima lista cargada con éxito. */
  const pendingTicketRef = useRef<number | null>(null);

  const updateList = useCallback((next: ListState) => {
    listRef.current = next;
    setList(next);
  }, []);

  const updateDetail = useCallback((next: DetailState | null) => {
    detailRef.current = next;
    setDetail(next);
  }, []);

  /** Abre (id) o cierra (null) el modal. */
  const updateSelection = useCallback(
    (id: number | null, nextDetail: DetailState | null) => {
      if (id !== null && id !== selectedIdRef.current) setTab(getInitialTab(listRef.current, id));
      selectedIdRef.current = id;
      setSelectedId(id);
      updateDetail(nextDetail);
    },
    [updateDetail],
  );

  /**
   * Cierra el modal. El detalle se conserva para que la animación de salida
   * no muestre "Cargando…"; el próximo ticket que se abra lo reemplaza.
   */
  const closeDetail = useCallback(() => {
    updateSelection(null, detailRef.current);
  }, [updateSelection]);

  /** Detalle nuevo. Si el ticket acaba de cerrarse con un comentario a medio escribir, lo descarta y avisa. */
  const applyTask = useCallback(
    (task: TaskerTask) => {
      const prev = detailRef.current;
      if (
        prev?.status === "ready" &&
        prev.task.id === task.id &&
        shouldDiscardOpenComment(prev.task.stateId, task.stateId) &&
        commentsCardRef.current?.getOpenDraft()
      ) {
        setCommentsResetKey((key) => key + 1);
        Alert.alert("Comentario no enviado", getCommentDiscardedNotice(task.stateId));
      }
      updateDetail({ status: "ready", task });
    },
    [updateDetail],
  );

  /** Lista. true = el ticket elegido (si hay) sigue en ella. */
  const loadList = useCallback(
    async (mode: LoadMode): Promise<boolean> => {
      if (mode === "initial") updateList({ status: "loading" });
      const credentials = await getTaskerCredentials();
      const result = credentials
        ? await fetchTaskerTasks(credentials)
        : noSession(TASKER_TASKS_ERROR);
      if (!result.ok) {
        if (mode === "silent") return false;
        if (mode === "pull" && listRef.current.status === "ready") {
          Alert.alert("No se pudo actualizar", result.message);
        } else {
          updateList({ status: "error", message: result.message });
        }
        return false;
      }
      updateList({ status: "ready", tasks: result.tasks });
      // Ticket pedido: se aplica una sola vez, en la primera lista que llega.
      // Si no está en ella, todo sigue como siempre.
      const requested = pendingTicketRef.current;
      pendingTicketRef.current = null;
      const target = resolveRequestedTicket(result.tasks, requested);
      if (target !== null) {
        if (target !== selectedIdRef.current) updateSelection(target, { status: "loading" });
        setTab(getInitialTab(listRef.current, target));
        return true;
      }
      const id = selectedIdRef.current;
      if (id !== null && !isTaskInList(result.tasks, id)) {
        closeDetail();
        Alert.alert("Ticket no disponible", getTicketGoneNotice(id));
        return false;
      }
      return true;
    },
    [updateList, updateSelection, closeDetail],
  );

  /**
   * Detalle del ticket `id`. Sin `silent` muestra el indicador y, si falla,
   * el error con "Reintentar". "La tarea ya no está disponible." → avisa y
   * cierra el modal (quien llama recarga la lista).
   */
  const loadDetail = useCallback(
    async (id: number, silent: boolean): Promise<DetailLoad> => {
      if (!silent) updateDetail({ status: "loading" });
      const credentials = await getTaskerCredentials();
      const result = credentials
        ? await fetchTaskerTask({ ...credentials, id })
        : noSession(TASKER_TASK_ERROR);
      if (selectedIdRef.current !== id) return "stale";
      if (result.ok) {
        applyTask(result.task);
        return "ok";
      }
      if (result.gone) {
        closeDetail();
        Alert.alert("Ticket no disponible", result.message);
        return "gone";
      }
      if (!silent) updateDetail({ status: "error", message: result.message });
      return "error";
    },
    [applyTask, updateDetail, closeDetail],
  );

  /** Lista y, si el abierto sigue en ella, su detalle (sin indicador). */
  const reloadAll = useCallback(
    async (mode: LoadMode) => {
      const keepsSelection = await loadList(mode);
      const id = selectedIdRef.current;
      if (!keepsSelection || id === null) return;
      // Recién elegido por la lista (ticket pedido): con indicador y error, como un toque.
      const silent = detailRef.current?.status !== "loading";
      if ((await loadDetail(id, silent)) === "gone") await loadList("silent");
    },
    [loadList, loadDetail],
  );

  /** Fuera de una recarga: el ticket ya no existe → se recarga la lista. */
  const reloadListAfterGone = useCallback(() => {
    void runExclusive(async () => {
      await loadList("silent");
    });
  }, [runExclusive, loadList]);

  /**
   * Tras un cambio propio con éxito (comentario, evaluación, Completada,
   * Incompleta): detalle y lista ya, sin esperar los 30 s y sin indicador.
   * Toma el turno de las recargas: si hay una en curso espera a que termine
   * (pudo pedir datos de antes del cambio) y la de 30 s no se le encima.
   * Resuelve con el detalle al día (quien llama cierra su hoja); la lista
   * llega después, dentro del mismo turno.
   */
  const refreshAfterChange = useCallback(
    (id: number) =>
      new Promise<void>((detailDone) => {
        void runExclusive.queue(async () => {
          try {
            await loadDetail(id, true);
          } finally {
            detailDone();
          }
          // "gone" ya cerró el modal: la lista lo saca de la tarjeta igual.
          await loadList("silent");
        });
      }),
    [runExclusive, loadDetail, loadList],
  );

  const openDetail = useCallback(
    async (id: number) => {
      if ((await loadDetail(id, false)) === "gone") reloadListAfterGone();
    },
    [loadDetail, reloadListAfterGone],
  );

  const handleSelect = useCallback(
    (id: number) => {
      if (id === selectedIdRef.current) return;
      updateSelection(id, { status: "loading" });
      void openDetail(id);
    },
    [updateSelection, openDetail],
  );

  const retryDetail = useCallback(() => {
    const id = selectedIdRef.current;
    if (id !== null) void openDetail(id);
  }, [openDetail]);

  const retryList = useCallback(() => {
    void runExclusive(() => reloadAll("initial"));
  }, [runExclusive, reloadAll]);

  const handlePull = useCallback(async () => {
    setRefreshing(true);
    await runExclusive(() => reloadAll("pull"));
    setRefreshing(false);
  }, [runExclusive, reloadAll]);

  /** Envía el comentario y vuelve a pedir el detalle completo. true = enviado. */
  const handleAddComment = useCallback(
    async (draft: TaskerCommentDraft): Promise<boolean> => {
      const id = selectedIdRef.current;
      if (id === null) return false;
      const credentials = await getTaskerCredentials();
      const result = credentials
        ? await addTaskerTaskComment({ ...credentials, id, body: buildTaskrCommentBody(draft) })
        : noSession(TASKER_COMMENT_SEND_ERROR);
      if (!result.ok) {
        if (result.gone) {
          if (selectedIdRef.current === id) closeDetail();
          Alert.alert("Ticket no disponible", result.message);
          reloadListAfterGone();
        } else {
          // También el rechazo del servidor por ticket cerrado (5/6).
          Alert.alert("Comentario no enviado", result.message);
        }
        return false;
      }
      // La respuesta no trae activities: se pide el detalle completo (y la lista).
      await refreshAfterChange(id);
      return true;
    },
    [refreshAfterChange, closeDetail, reloadListAfterGone],
  );

  // ── Revisión: catálogos (una vez por pantalla), evaluación y cambio de estado ──
  const [taskStates, setTaskStates] = useState<TaskStatesCatalog>({ status: "loading" });
  /** GET /taskr/states: solo nombres de Completada / Incompleta; si falla, los de respaldo. */
  const [states, setStates] = useState<TaskerState[]>([]);

  useEffect(() => {
    void requestTaskStates().then(setTaskStates);
    void (async () => {
      const credentials = await getTaskerCredentials();
      const result = credentials ? await fetchTaskerStates(credentials) : null;
      if (result?.ok) setStates(result.states);
    })();
  }, []);

  const retryTaskStates = useCallback(() => {
    setTaskStates({ status: "loading" });
    void requestTaskStates().then(setTaskStates);
  }, []);

  /**
   * PATCH del ticket abierto y, si sale bien, el detalle completo (la
   * respuesta no trae activities) y la lista. "Ticket no disponible": avisa, cierra el
   * modal y recarga la lista, como los comentarios. El resto lo muestra quien llama.
   */
  const sendReviewPatch = useCallback(
    async (body: TaskrPatchBody, errorMessage: string): Promise<PatchTaskerTaskResult> => {
      const id = selectedIdRef.current;
      if (id === null) return { ok: false, message: errorMessage, gone: false };
      const credentials = await getTaskerCredentials();
      const result = credentials
        ? await patchTaskerTask({ ...credentials, id, body, errorMessage })
        : noSession(errorMessage);
      if (!result.ok) {
        if (result.gone) {
          if (selectedIdRef.current === id) closeDetail();
          Alert.alert("Ticket no disponible", result.message);
          reloadListAfterGone();
        }
        return result;
      }
      // La tarjeta de la lista también muestra el estado nuevo, ya.
      await refreshAfterChange(id);
      return result;
    },
    [refreshAfterChange, closeDetail, reloadListAfterGone],
  );

  const handleEvaluate = useCallback(
    (
      item: { id: number; text: string },
      taskState: TaskerTaskState,
      comment: string,
      images: string[],
    ) =>
      sendReviewPatch(
        buildEvaluationBody(item, taskState, comment, images, new Date()),
        TASKER_EVALUATION_SEND_ERROR,
      ),
    [sendReviewPatch],
  );

  const handleChangeState = useCallback(
    async (stateId: TaskerReviewStateId, comment?: string): Promise<PatchTaskerTaskResult> => {
      const built = buildStateChangeBody(stateId, comment);
      if (!built.ok) return { ok: false, message: built.message, gone: false };
      return sendReviewPatch(built.body, TASKER_STATE_CHANGE_ERROR);
    },
    [sendReviewPatch],
  );

  // ── Actualización automática: solo con foco y en primer plano ──
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(() => AppState.currentState !== "background");

  // Al perder el foco (otra pantalla) se cierra el modal: un Modal nativo
  // abierto quedaría encima de la pantalla nueva.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        closeDetail();
      };
    }, [closeDetail]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      setAppActive(next === "active");
    });
    return () => subscription.remove();
  }, []);

  const live = focused && appActive;

  // Ticket pedido: queda pendiente hasta la próxima lista y el parámetro se
  // consume ya, así ni las recargas ni volver sin parámetro lo reaplican. Con
  // la lista ya cargada (pedido con la pantalla montada) se recarga para
  // aplicarlo; si no, lo aplica la carga del foco.
  useEffect(() => {
    if (requestedTicketId === null) return;
    pendingTicketRef.current = requestedTicketId;
    onRequestConsumed?.();
    if (listRef.current.status !== "loading") {
      void runExclusive(() => reloadAll("silent"));
    }
  }, [requestedTicketId, onRequestConsumed, runExclusive, reloadAll]);

  // Al entrar (o volver a primer plano) se recarga ya, y luego cada 30 s. Al
  // perder el foco o pasar a segundo plano, el intervalo se limpia.
  useEffect(() => {
    if (!live) return;
    const refresh = () =>
      void runExclusive(() =>
        reloadAll(listRef.current.status === "loading" ? "initial" : "silent"),
      );
    refresh();
    const timer = setInterval(refresh, SEGUIMIENTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, runExclusive, reloadAll]);

  /**
   * "Atrás" (flecha o botón de Android): con el formulario de comentario
   * abierto, lo cierra primero; si no, cierra el modal. Las hojas de
   * evaluación e Incompleta son Modals propios: el atrás les llega a ellas.
   */
  const handleBack = useCallback(() => {
    if (commentsCardRef.current?.closeComposer()) return;
    closeDetail();
  }, [closeDetail]);

  const clientLabel = useSchoolStore((state) => getTaskerClientLabel(state.taskerConfig));
  /** Para "Vence:" en rojo: se pone al día cada minuto (como Home.js). */
  const nowMs = useNowMs(live, 60_000);

  // Título del modal: el último ticket abierto, también durante la animación de salida.
  const [shownId, setShownId] = useState<number | null>(null);
  if (selectedId !== null && selectedId !== shownId) setShownId(selectedId);

  const task = detail?.status === "ready" ? detail.task : null;
  const stateActivities = useMemo(() => (task ? getStateActivities(task.activities) : []), [task]);
  const listTasks = list.status === "ready" ? list.tasks : null;

  const renderCard: ListRenderItem<TaskerTaskSummary> = ({ item }) => (
    <FollowUpTicketCard
      task={item}
      clientLabel={clientLabel}
      nowMs={nowMs}
      onPress={handleSelect}
      styles={styles}
    />
  );

  /** Lista sin tarjetas: cargando, error con "Reintentar" o vacía. */
  const renderListEmpty = () => {
    if (list.status === "loading") {
      return <FollowUpNotice styles={styles} loading message="Cargando tickets…" />;
    }
    if (list.status === "error") {
      return (
        <FollowUpNotice
          styles={styles}
          tone="red"
          icon="cloud-offline-outline"
          message={list.message}
          action={{ label: "Reintentar", onPress: retryList }}
        />
      );
    }
    return (
      <FollowUpNotice styles={styles} icon="file-tray-outline" message={TASKER_NO_TICKETS_MESSAGE} />
    );
  };

  /** Detalle sin cargar: indicador o error con "Reintentar". */
  const renderDetailPlaceholder = () => {
    if (detail?.status === "error") {
      return (
        <FollowUpNotice
          styles={styles}
          tone="red"
          icon="alert-circle-outline"
          message={detail.message}
          action={{ label: "Reintentar", onPress: retryDetail }}
        />
      );
    }
    return <FollowUpNotice styles={styles} loading message="Cargando ticket…" />;
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={listTasks ?? []}
        extraData={nowMs}
        renderItem={renderCard}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.listContent, isTablet && styles.contentTablet]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          listTasks && listTasks.length > 0 ? (
            <Text style={styles.listTitle} accessibilityRole="header">
              {getTicketsTitle(listTasks.length)}
            </Text>
          ) : null
        }
        ListEmptyComponent={renderListEmpty()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handlePull}
            colors={[PRIMARY_COLOR]}
            tintColor={PRIMARY_COLOR}
          />
        }
      />

      <Modal visible={selectedId !== null} animationType="slide" onRequestClose={handleBack}>
        {/* TopBar navy: íconos claros mientras está abierto. */}
        <StatusBar barStyle="light-content" />
        <View style={styles.screen}>
          <View style={styles.modalTopBar}>
            <TouchableOpacity
              style={styles.modalBackBtn}
              onPress={handleBack}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Volver a la lista"
            >
              <Ionicons name="arrow-back" size={22} color={HEADER_TEXT} />
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>
              Ticket #{shownId}
            </Text>
          </View>

          {/* ── Pestañas fijas ── */}
          <View style={[styles.tabsWrap, isTablet && styles.contentTablet]}>
            <View style={styles.segmented}>
              {TABS.map(({ key, label, icon }) => {
                const active = tab === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.segment, active && styles.segmentActive]}
                    onPress={() => setTab(key)}
                    hitSlop={SEGMENT_HIT_SLOP}
                    activeOpacity={0.8}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons
                      name={icon}
                      size={SEGMENT_ICON_SIZE}
                      color={active ? ON_PRIMARY : TEXT_MUTED}
                    />
                    {/* Una sola línea: con fuente grande se achica hasta 80 %, nunca salta de fila. */}
                    <Text
                      style={[styles.segmentText, active && styles.segmentTextActive]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {label}
                    </Text>
                    {key === "actions" && task && (
                      <View style={[styles.segmentBadge, active && styles.segmentBadgeActive]}>
                        <Text
                          style={[styles.segmentBadgeText, active && styles.segmentBadgeTextActive]}
                          numberOfLines={1}
                        >
                          {stateActivities.length}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/*
            Patrón de login/registro: "padding" en las dos plataformas. Con
            edge-to-edge (Android) la ventana ya no se achica sola; si alguna
            vez lo hace, el KAV mide 0 de solape y no suma nada.
          */}
          <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
            {/* key = pestaña: cada una arranca desde arriba. Las recargas no la remontan. */}
            <ScrollView
              key={tab}
              ref={scrollRef}
              style={styles.flex}
              contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handlePull}
                  colors={[PRIMARY_COLOR]}
                  tintColor={PRIMARY_COLOR}
                />
              }
            >
              {!task && renderDetailPlaceholder()}

              {tab !== "ticket" && task && (
                <>
                  <View style={styles.strip}>
                    <View style={styles.stripBody}>
                      <Text style={styles.stripTitle}>Ticket #{task.id}</Text>
                      <Text style={styles.stripClient} numberOfLines={1}>
                        {getTaskerClientName(task.client)}
                      </Text>
                    </View>
                    <StateChip state={task.state} styles={styles} />
                  </View>
                  {tab === "address" && <FollowUpAddressTab address={task.address} styles={styles} />}
                  {tab === "actions" && (
                    <FollowUpActionsTab
                      activities={stateActivities}
                      stateId={task.stateId}
                      owner={task}
                      live={live}
                      styles={styles}
                    />
                  )}
                </>
              )}

              {(tab === "ticket" || tab === "review") && task && (
                <FollowUpTicketTab
                  key={task.id}
                  section={tab}
                  task={task}
                  styles={styles}
                  live={live}
                  commentOrder={commentOrder}
                  onCommentOrderChange={setCommentOrder}
                  onAddComment={handleAddComment}
                  commentsCardRef={commentsCardRef}
                  commentsResetKey={commentsResetKey}
                  scrollRef={scrollRef}
                  taskStates={taskStates}
                  states={states}
                  onRetryTaskStates={retryTaskStates}
                  onEvaluate={handleEvaluate}
                  onChangeState={handleChangeState}
                />
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}
