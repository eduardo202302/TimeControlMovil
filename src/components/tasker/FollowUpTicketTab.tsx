import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, type RefObject } from "react";
import { type ScrollView, Text, View } from "react-native";
import { PRIMARY_700, PRIMARY_COLOR, TEXT_MUTED } from "@/constants/colors";
import {
  buildLocalComment,
  canEditTaskerComment,
  formatElapsed,
  formatPhone,
  formatTaskerDate,
  getTagChipTone,
  type CommentOrder,
} from "../../utils/taskerRules";
import type {
  TaskerComment,
  TaskerCommentAuthor,
  TaskerCommentDraft,
  TaskerTask,
} from "../../../types/typesTasker/TaskerTypes";
import { FollowUpCardHeader, StateChip } from "./FollowUpParts";
import type { FollowUpStyles } from "./followUpStyles";
import TaskerCommentsCard from "./TaskerCommentsCard";

interface FollowUpTicketTabProps {
  task: TaskerTask;
  styles: FollowUpStyles;
  /** "Ahora" fijado al montar la pantalla. */
  nowMs: number;
  /** TaskerCommentsCard los ordena al pintar. */
  comments: TaskerComment[];
  commentOrder: CommentOrder;
  onCommentOrderChange: (order: CommentOrder) => void;
  /** Usuario en sesión: decide qué comentarios se editan (canEditTaskerComment). */
  currentUser: TaskerCommentAuthor | null;
  onAddComment: (comment: TaskerComment) => void;
  onUpdateComment: (id: number, draft: TaskerCommentDraft) => void;
  onRemoveComment: (id: number) => void;
  /** ScrollView de Seguimiento: la tarjeta lleva su formulario a la vista. */
  scrollRef: RefObject<ScrollView | null>;
}

export default function FollowUpTicketTab({
  task,
  styles,
  nowMs,
  comments,
  commentOrder,
  onCommentOrderChange,
  currentUser,
  onAddComment,
  onUpdateComment,
  onRemoveComment,
  scrollRef,
}: FollowUpTicketTabProps) {
  // Como Tasker: se puede comentar en cualquier estado.
  const handleAddComment = (draft: TaskerCommentDraft) => {
    // TODO(puente): enviar buildCommentPayload(text, attachments) al endpoint de
    // comentarios de Tasker y reemplazar el comentario local por el que devuelva.
    onAddComment(
      buildLocalComment({
        text: draft.text,
        attachments: draft.attachments,
        task,
        now: new Date(),
      }),
    );
  };

  const canEdit = useCallback(
    (comment: TaskerComment) => canEditTaskerComment(comment, currentUser),
    [currentUser],
  );

  const createdMs = new Date(task.createdDate).getTime();
  const elapsed = Number.isNaN(createdMs) ? "" : formatElapsed(createdMs, nowMs);

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
          <Text style={styles.clientName}>{task.client.name}</Text>
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
        {!!task.client.phone && (
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
            value={task.addUser.name}
          />
          <InfoRow
            styles={styles}
            icon="construct-outline"
            label="Responsable"
            value={task.assignedUser?.name ?? "Sin asignar"}
          />
          <InfoRow
            styles={styles}
            icon="calendar-outline"
            label="Fecha"
            value={formatTaskerDate(task.createdDate)}
          />
          <InfoRow
            styles={styles}
            icon="stopwatch-outline"
            label="Transcurrido"
            value={elapsed}
            highlight
          />
        </View>
      </View>

      {/* ── Descripción (solo lectura) ── */}
      <View style={styles.card}>
        <FollowUpCardHeader styles={styles} tone="violet" icon="list-outline" title="Descripción" />
        <View style={styles.descriptionBox}>
          <Text style={styles.descriptionText}>{task.action}</Text>
        </View>
      </View>

      {/* ── Comentarios ── */}
      <TaskerCommentsCard
        comments={comments}
        canEdit={canEdit}
        onAdd={handleAddComment}
        onEdit={onUpdateComment}
        onDelete={onRemoveComment}
        order={commentOrder}
        onOrderChange={onCommentOrderChange}
        scrollRef={scrollRef}
      />
    </>
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
