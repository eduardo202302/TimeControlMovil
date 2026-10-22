import { Ionicons } from "@expo/vector-icons";
import React, { type RefObject } from "react";
import { type ScrollView, Text, View } from "react-native";
import { PRIMARY_700, PRIMARY_COLOR, TEXT_MUTED } from "@/constants/colors";
import {
  formatElapsed,
  formatPhone,
  formatTaskerDate,
  getTagChipTone,
  getTaskerFaultLabel,
  type CommentOrder,
} from "../../utils/taskerRules";
import {
  canCommentOnTask,
  getClosedTaskNotice,
  getTaskerClientName,
  TASKER_UNASSIGNED_LABEL,
} from "../../utils/taskerFollowUpRules";
import { useSchoolStore } from "../../../store/useSchoolStore";
import type {
  TaskerCommentDraft,
  TaskerTask,
} from "../../../types/typesTasker/TaskerTypes";
import { FollowUpCardHeader, StateChip } from "./FollowUpParts";
import type { FollowUpStyles } from "./followUpStyles";
import TaskerCommentsCard, { type TaskerCommentsCardHandle } from "./TaskerCommentsCard";
import { useNowMs } from "./useNowMs";

interface FollowUpTicketTabProps {
  task: TaskerTask;
  styles: FollowUpStyles;
  /** Seguimiento a la vista y app en primer plano: "Transcurrido" corre. */
  live: boolean;
  commentOrder: CommentOrder;
  onCommentOrderChange: (order: CommentOrder) => void;
  /** Envía el comentario; true = enviado (el formulario se cierra). */
  onAddComment: (draft: TaskerCommentDraft) => Promise<boolean>;
  /** Seguimiento consulta si hay un formulario abierto cuando el ticket se cierra. */
  commentsCardRef: RefObject<TaskerCommentsCardHandle | null>;
  /** Al cambiar, cierra el formulario de comentario sin preguntar. */
  commentsResetKey: number;
  /** ScrollView de Seguimiento: la tarjeta lleva su formulario a la vista. */
  scrollRef: RefObject<ScrollView | null>;
}

export default function FollowUpTicketTab({
  task,
  styles,
  live,
  commentOrder,
  onCommentOrderChange,
  onAddComment,
  commentsCardRef,
  commentsResetKey,
  scrollRef,
}: FollowUpTicketTabProps) {
  const faultLabel = useSchoolStore((state) => getTaskerFaultLabel(state.taskerConfig));
  const canComment = canCommentOnTask(task.stateId);

  return (
    <>
      {/* ── Ticket ── */}
      <View style={styles.card}>
        <FollowUpCardHeader
          styles={styles}
          tone="blue"
          icon="document-text-outline"
          title={`Ticket #${task.id}`}
        >
          <StateChip state={task.state} styles={styles} />
        </FollowUpCardHeader>

        <View style={styles.clientRow}>
          <Text style={styles.clientName}>{getTaskerClientName(task.client)}</Text>
          {task.tags.length > 0 && (
            <View style={styles.tagChips}>
              {task.tags.map((tag, index) => {
                const tone = getTagChipTone(index);
                return (
                  <View key={tag.id} style={[styles.tagChip, { backgroundColor: tone.background }]}>
                    <Text style={[styles.tagChipText, { color: tone.text }]}>{tag.name}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
        {!!task.client?.phone && (
          <View style={styles.phoneRow}>
            <Ionicons name="call-outline" size={14} color={TEXT_MUTED} />
            <Text style={styles.phoneText}>{formatPhone(task.client.phone)}</Text>
          </View>
        )}

        <View style={styles.infoList}>
          <InfoRow
            styles={styles}
            icon="person-outline"
            label="Solicitado por"
            value={task.externalUserName.trim() || "—"}
          />
          <InfoRow
            styles={styles}
            icon="construct-outline"
            label="Responsable"
            value={task.assignedUser?.name.trim() || TASKER_UNASSIGNED_LABEL}
          />
          <InfoRow
            styles={styles}
            icon="calendar-outline"
            label="Fecha"
            value={formatTaskerDate(task.createdDate)}
          />
          <ElapsedRow styles={styles} createdDate={task.createdDate} live={live} />
        </View>
      </View>

      {/* ── Descripción (solo lectura) ── */}
      <View style={styles.card}>
        <FollowUpCardHeader styles={styles} tone="violet" icon="list-outline" title="Descripción" />
        <View style={styles.descriptionBox}>
          <Text style={styles.descriptionText}>{task.action.trim() || "Sin descripción."}</Text>
        </View>
      </View>

      {/* ── Averías (taskList, ya en orden) ── */}
      {task.faults.length > 0 && (
        <View style={styles.card}>
          <FollowUpCardHeader
            styles={styles}
            tone="amber"
            icon="build-outline"
            title={`${faultLabel} (${task.faults.length})`}
          />
          <View style={styles.faultList}>
            {task.faults.map((fault, index) => (
              <View key={`${index}-${fault}`} style={styles.faultRow}>
                <View style={styles.faultDot} />
                <Text style={styles.faultText}>{fault}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Comentarios: solo agregar; cerrado (5/6) → solo lectura ── */}
      <TaskerCommentsCard
        ref={commentsCardRef}
        comments={task.comments}
        onAdd={onAddComment}
        canAdd={canComment}
        closedNotice={canComment ? undefined : getClosedTaskNotice(task.stateId)}
        order={commentOrder}
        onOrderChange={onCommentOrderChange}
        resetKey={commentsResetKey}
        scrollRef={scrollRef}
        compact
      />
    </>
  );
}

/** "Transcurrido" desde createdDate, en vivo: solo esta fila se repinta cada segundo. */
function ElapsedRow({
  styles,
  createdDate,
  live,
}: {
  styles: FollowUpStyles;
  createdDate: string;
  live: boolean;
}) {
  const nowMs = useNowMs(live);
  const createdMs = new Date(createdDate).getTime();
  const elapsed = Number.isNaN(createdMs) ? "" : formatElapsed(createdMs, nowMs);
  return (
    <InfoRow styles={styles} icon="stopwatch-outline" label="Transcurrido" value={elapsed} highlight />
  );
}

interface InfoRowProps {
  styles: FollowUpStyles;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  /** Fila destacada (Transcurrido). */
  highlight?: boolean;
}

function InfoRow({ styles, icon, label, value, highlight = false }: InfoRowProps) {
  return (
    <View style={[styles.infoRow, highlight && styles.infoRowHighlight]}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={highlight ? PRIMARY_700 : PRIMARY_COLOR} />
      </View>
      <View style={styles.infoBody}>
        <Text style={[styles.infoLabel, highlight && styles.infoLabelHighlight]}>{label}</Text>
        <Text style={[styles.infoValue, highlight && styles.infoValueStrong]}>{value}</Text>
      </View>
    </View>
  );
}
