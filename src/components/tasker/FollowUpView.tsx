import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ON_PRIMARY, TEXT_MUTED } from "@/constants/colors";
import { useResponsive } from "@/constants/responsive";
import { getTaskerOpenTask } from "@/constants/taskerMock";
import {
  getStateActivities,
  sortComments,
  type CommentOrder,
} from "../../utils/taskerRules";
import type { TaskerComment } from "../../../types/typesTasker/TaskerTypes";
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
 * comentarios se agregan en local (todavía no se envían).
 */
export default function FollowUpView() {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createFollowUpStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  // "Ahora" se toma UNA vez al montar: Transcurrido y los tiempos abiertos no corren en vivo.
  // El ejemplo se arma con ese mismo instante, así sus tiempos salen siempre iguales.
  const [nowMs] = useState(() => Date.now());
  const { task } = useMemo(() => getTaskerOpenTask(nowMs), [nowMs]);
  const stateActivities = useMemo(() => getStateActivities(task.activities), [task]);

  const [tab, setTab] = useState<FollowUpTab>("ticket");
  // Viven acá y no en la pestaña: orden y comentarios agregados se conservan
  // al cambiar de pestaña.
  const [commentOrder, setCommentOrder] = useState<CommentOrder>("desc");
  /**
   * Lista tal como se pinta (como Tasker): ordenar reordena TODA la lista por
   * createdDate; un comentario nuevo entra SIEMPRE arriba, sea cual sea el orden.
   */
  const [comments, setComments] = useState<TaskerComment[]>(() =>
    sortComments(task.comments, "desc"),
  );

  const handleToggleCommentOrder = useCallback(() => {
    const next: CommentOrder = commentOrder === "desc" ? "asc" : "desc";
    setCommentOrder(next);
    setComments((prev) => sortComments(prev, next));
  }, [commentOrder]);

  const handleAddComment = useCallback((comment: TaskerComment) => {
    setComments((prev) => [comment, ...prev]);
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

      {/* key = pestaña: cada una arranca desde arriba. */}
      <ScrollView
        key={tab}
        style={styles.flex}
        contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
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
            onToggleCommentOrder={handleToggleCommentOrder}
            onAddComment={handleAddComment}
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
    </View>
  );
}
