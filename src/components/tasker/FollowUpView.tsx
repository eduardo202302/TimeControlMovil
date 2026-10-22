import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ON_PRIMARY, PRIMARY_COLOR, TEXT_MUTED } from "@/constants/colors";
import { useResponsive } from "@/constants/responsive";
import { getStateActivities, type CommentOrder } from "../../utils/taskerRules";
import {
  addTaskerTaskComment,
  buildTaskrCommentBody,
  fetchTaskerTask,
  fetchTaskerTasks,
  TASKER_COMMENT_SEND_ERROR,
  TASKER_TASK_ERROR,
  TASKER_TASKS_ERROR,
  type TaskrFailure,
} from "../../utils/taskerApi";
import {
  createExclusiveRunner,
  getCommentDiscardedNotice,
  getTaskerClientName,
  getTicketGoneNotice,
  isTaskInList,
  SEGUIMIENTO_REFRESH_MS,
  shouldDiscardOpenComment,
  TASKER_NO_TICKETS_MESSAGE,
  TASKER_SELECT_TICKET_MESSAGE,
  TASKER_SELECT_TICKET_TAB_MESSAGE,
} from "../../utils/taskerFollowUpRules";
import type {
  TaskerCommentDraft,
  TaskerTask,
  TaskerTaskSummary,
} from "../../../types/typesTasker/TaskerTypes";
import FollowUpActionsTab from "./FollowUpActionsTab";
import FollowUpAddressTab from "./FollowUpAddressTab";
import { FollowUpNotice, StateChip } from "./FollowUpParts";
import FollowUpTicketPicker from "./FollowUpTicketPicker";
import FollowUpTicketTab from "./FollowUpTicketTab";
import { createFollowUpStyles } from "./followUpStyles";
import { getTaskerCredentials } from "./taskerCredentials";
import type { TaskerCommentsCardHandle } from "./TaskerCommentsCard";

type FollowUpTab = "ticket" | "address" | "actions";

const TABS: { key: FollowUpTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "ticket", label: "Ticket", icon: "document-text-outline" },
  { key: "address", label: "Dirección", icon: "location-outline" },
  { key: "actions", label: "Acciones", icon: "time-outline" },
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

/** "stale": mientras llegaba se eligió otro ticket (o ninguno). */
type DetailLoad = "ok" | "gone" | "error" | "stale";

const noSession = (message: string): TaskrFailure => ({ ok: false, message, gone: false });

/**
 * Seguimiento de los tickets de Tasker. La lista se carga al entrar y no se
 * elige ninguno; al tocar una tarjeta se pide su detalle. Mientras la
 * pantalla tiene el foco y la app está en primer plano, lista y detalle se
 * recargan solos cada SEGUIMIENTO_REFRESH_MS, sin indicador y sin tocar el
 * formulario de comentario abierto (salvo que el ticket se cierre).
 */
export default function FollowUpView() {
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

  const updateList = useCallback((next: ListState) => {
    listRef.current = next;
    setList(next);
  }, []);

  const updateDetail = useCallback((next: DetailState | null) => {
    detailRef.current = next;
    setDetail(next);
  }, []);

  const updateSelection = useCallback(
    (id: number | null, nextDetail: DetailState | null) => {
      selectedIdRef.current = id;
      setSelectedId(id);
      updateDetail(nextDetail);
    },
    [updateDetail],
  );

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
      const id = selectedIdRef.current;
      if (id !== null && !isTaskInList(result.tasks, id)) {
        updateSelection(null, null);
        Alert.alert("Ticket no disponible", getTicketGoneNotice(id));
        return false;
      }
      return true;
    },
    [updateList, updateSelection],
  );

  /**
   * Detalle del ticket `id`. Sin `silent` muestra el indicador y, si falla,
   * el error con "Reintentar". "La tarea ya no está disponible." → avisa y
   * deselecciona (quien llama recarga la lista).
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
        updateSelection(null, null);
        Alert.alert("Ticket no disponible", result.message);
        return "gone";
      }
      if (!silent) updateDetail({ status: "error", message: result.message });
      return "error";
    },
    [applyTask, updateDetail, updateSelection],
  );

  /** Lista y, si el elegido sigue en ella, su detalle (sin indicador). */
  const reloadAll = useCallback(
    async (mode: LoadMode) => {
      const keepsSelection = await loadList(mode);
      const id = selectedIdRef.current;
      if (!keepsSelection || id === null) return;
      if ((await loadDetail(id, true)) === "gone") await loadList("silent");
    },
    [loadList, loadDetail],
  );

  /** Fuera de una recarga: el ticket ya no existe → se recarga la lista. */
  const reloadListAfterGone = useCallback(() => {
    void runExclusive(async () => {
      await loadList("silent");
    });
  }, [runExclusive, loadList]);

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
          if (selectedIdRef.current === id) updateSelection(null, null);
          Alert.alert("Ticket no disponible", result.message);
          reloadListAfterGone();
        } else {
          // También el rechazo del servidor por ticket cerrado (5/6).
          Alert.alert("Comentario no enviado", result.message);
        }
        return false;
      }
      // La respuesta no trae activities: se pide el detalle completo.
      if ((await loadDetail(id, true)) === "gone") reloadListAfterGone();
      return true;
    },
    [loadDetail, updateSelection, reloadListAfterGone],
  );

  // ── Actualización automática: solo con foco y en primer plano ──
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(() => AppState.currentState !== "background");

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      setAppActive(next === "active");
    });
    return () => subscription.remove();
  }, []);

  const live = focused && appActive;

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

  const task = detail?.status === "ready" ? detail.task : null;
  const stateActivities = useMemo(() => (task ? getStateActivities(task.activities) : []), [task]);

  /** Sin detalle a la vista: elegir, cargando o error con "Reintentar". */
  const renderDetailPlaceholder = (message: string) => {
    if (selectedId === null) {
      return <FollowUpNotice styles={styles} icon="hand-left-outline" message={message} />;
    }
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

  const renderTicketTab = () => {
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
    if (list.tasks.length === 0) {
      return (
        <FollowUpNotice styles={styles} icon="file-tray-outline" message={TASKER_NO_TICKETS_MESSAGE} />
      );
    }
    return (
      <>
        <FollowUpTicketPicker
          tasks={list.tasks}
          selectedId={selectedId}
          onSelect={handleSelect}
          styles={styles}
        />
        {task ? (
          <FollowUpTicketTab
            key={task.id}
            task={task}
            styles={styles}
            live={live}
            commentOrder={commentOrder}
            onCommentOrderChange={setCommentOrder}
            onAddComment={handleAddComment}
            commentsCardRef={commentsCardRef}
            commentsResetKey={commentsResetKey}
            scrollRef={scrollRef}
          />
        ) : (
          renderDetailPlaceholder(TASKER_SELECT_TICKET_MESSAGE)
        )}
      </>
    );
  };

  return (
    <View style={styles.screen}>
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
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={icon} size={16} color={active ? ON_PRIMARY : TEXT_MUTED} />
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {label}
                </Text>
                {key === "actions" && task && (
                  <View style={[styles.segmentBadge, active && styles.segmentBadgeActive]}>
                    <Text
                      style={[styles.segmentBadgeText, active && styles.segmentBadgeTextActive]}
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

      {/* Mismo criterio que ReportFaultForm: en iOS el teclado achica el área de scroll. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
          {tab === "ticket" && renderTicketTab()}

          {tab !== "ticket" && !task && renderDetailPlaceholder(TASKER_SELECT_TICKET_TAB_MESSAGE)}

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
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
