import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ON_PRIMARY, TEXT_MUTED } from "@/constants/colors";
import { useResponsive } from "@/constants/responsive";
import { getTaskerOpenTask } from "@/constants/taskerMock";
import {
  getStateActivities,
  removeTaskerComment,
  updateTaskerComment,
  type CommentOrder,
} from "../../utils/taskerRules";
import { useSchoolStore } from "../../../store/useSchoolStore";
import type {
  TaskerComment,
  TaskerCommentAuthor,
  TaskerCommentDraft,
} from "../../../types/typesTasker/TaskerTypes";
import FollowUpActionsTab from "./FollowUpActionsTab";
import FollowUpAddressTab from "./FollowUpAddressTab";
import { StateChip } from "./FollowUpParts";
import FollowUpTicketTab from "./FollowUpTicketTab";
import { createFollowUpStyles } from "./followUpStyles";

type FollowUpTab = "ticket" | "address" | "actions";

const TABS: { key: FollowUpTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "ticket", label: "Ticket", icon: "document-text-outline" },
  { key: "address", label: "Dirección", icon: "location-outline" },
  { key: "actions", label: "Acciones", icon: "time-outline" },
];

/**
 * Seguimiento de un ticket de Tasker — FASE B: con los datos fijos de
 * taskerMock.ts. Las tres pestañas son estado local de esta pantalla; los
 * comentarios se agregan, editan y borran en local (todavía no se envían).
 */
export default function FollowUpView() {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createFollowUpStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  // "Ahora" se toma UNA vez al montar: Transcurrido y los tiempos abiertos no corren en vivo.
  // El ejemplo se arma con ese mismo instante: sus fechas caen en el día de "ahora".
  const [nowMs] = useState(() => Date.now());
  const { task } = useMemo(() => getTaskerOpenTask(nowMs), [nowMs]);
  const stateActivities = useMemo(() => getStateActivities(task.activities), [task]);

  const [tab, setTab] = useState<FollowUpTab>("ticket");
  /** El formulario de comentarios se lleva a la vista (y sobre el teclado). */
  const scrollRef = useRef<ScrollView>(null);
  // Viven acá y no en la pestaña: orden y cambios a los comentarios se
  // conservan al cambiar de pestaña. TaskerCommentsCard ordena al pintar.
  const [commentOrder, setCommentOrder] = useState<CommentOrder>("desc");
  const [comments, setComments] = useState<TaskerComment[]>(() => task.comments);

  // Quién puede editar y borrar: ver canEditTaskerComment.
  const sessionUser = useSchoolStore((state) => state.user);
  const currentUser = useMemo<TaskerCommentAuthor | null>(
    () =>
      sessionUser?.user
        ? { id: sessionUser.user.id, name: sessionUser.user.fullName }
        : null,
    [sessionUser],
  );

  const handleAddComment = useCallback((comment: TaskerComment) => {
    setComments((prev) => [comment, ...prev]);
  }, []);

  // TODO(puente): Tasker no tiene ruta para editar ni borrar comentarios; por
  // ahora estos dos cambios solo viven en esta pantalla.
  const handleUpdateComment = useCallback((id: number, draft: TaskerCommentDraft) => {
    setComments((prev) => updateTaskerComment(prev, id, draft));
  }, []);

  const handleRemoveComment = useCallback((id: number) => {
    setComments((prev) => removeTaskerComment(prev, id));
  }, []);

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
                {key === "actions" && (
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
        {/* key = pestaña: cada una arranca desde arriba. */}
        <ScrollView
          key={tab}
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {tab !== "ticket" && (
            <View style={styles.strip}>
              <View style={styles.stripBody}>
                <Text style={styles.stripTitle}>Ticket #{task.id}</Text>
                <Text style={styles.stripClient} numberOfLines={1}>
                  {task.client.name}
                </Text>
              </View>
              <StateChip state={task.state} styles={styles} />
            </View>
          )}

          {tab === "ticket" && (
            <FollowUpTicketTab
              task={task}
              styles={styles}
              nowMs={nowMs}
              comments={comments}
              commentOrder={commentOrder}
              onCommentOrderChange={setCommentOrder}
              currentUser={currentUser}
              onAddComment={handleAddComment}
              onUpdateComment={handleUpdateComment}
              onRemoveComment={handleRemoveComment}
              scrollRef={scrollRef}
            />
          )}
          {tab === "address" && <FollowUpAddressTab address={task.address} styles={styles} />}
          {tab === "actions" && (
            <FollowUpActionsTab
              activities={stateActivities}
              stateId={task.stateId}
              nowMs={nowMs}
              styles={styles}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
