import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { PRIMARY_700, PRIMARY_COLOR, TEXT_MUTED } from "@/constants/colors";
import {
  formatElapsed,
  formatPhone,
  formatTaskerDate,
  getInitials,
  getTagChipTone,
  sortComments,
  type CommentOrder,
} from "../../utils/taskerRules";
import type { TaskerComment, TaskerTask } from "../../../types/typesTasker/TaskerTypes";
import { FollowUpCardHeader, StateChip } from "./FollowUpParts";
import type { FollowUpStyles } from "./followUpStyles";
import { showPendingAction } from "./pendingAction";

interface FollowUpTicketTabProps {
  task: TaskerTask;
  styles: FollowUpStyles;
  /** "Ahora" fijado al montar la pantalla. */
  nowMs: number;
  commentOrder: CommentOrder;
  onToggleCommentOrder: () => void;
}

export default function FollowUpTicketTab({
  task,
  styles,
  nowMs,
  commentOrder,
  onToggleCommentOrder,
}: FollowUpTicketTabProps) {
  const comments = useMemo(
    () => sortComments(task.comments, commentOrder),
    [task.comments, commentOrder],
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
      <View style={styles.card}>
        <FollowUpCardHeader
          styles={styles}
          tone="blue"
          icon="chatbubble-ellipses-outline"
          title={`Comentarios (${comments.length})`}
        >
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={onToggleCommentOrder}
            accessibilityLabel={
              commentOrder === "desc"
                ? "Ordenar comentarios del más antiguo al más reciente"
                : "Ordenar comentarios del más reciente al más antiguo"
            }
            activeOpacity={0.75}
          >
            <Ionicons name="swap-vertical-outline" size={18} color={TEXT_MUTED} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addCommentBtn}
            onPress={showPendingAction}
            activeOpacity={0.75}
          >
            <Ionicons name="add-circle-outline" size={16} color={PRIMARY_700} />
            <Text style={styles.addCommentText}>Agregar</Text>
          </TouchableOpacity>
        </FollowUpCardHeader>
        {comments.length === 0 ? (
          <Text style={styles.emptyText}>Sin comentarios</Text>
        ) : (
          <View style={styles.commentList}>
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} styles={styles} />
            ))}
          </View>
        )}
      </View>
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

function CommentItem({ comment, styles }: { comment: TaskerComment; styles: FollowUpStyles }) {
  return (
    <View style={styles.comment}>
      <View style={styles.commentHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(comment.addUser.name)}</Text>
        </View>
        <View style={styles.commentMeta}>
          <Text style={styles.commentAuthor}>{comment.addUser.name}</Text>
          <Text style={styles.commentDate}>{formatTaskerDate(comment.createdDate)}</Text>
        </View>
      </View>
      <Text style={styles.commentText}>{comment.comment}</Text>
      {comment.images.length > 0 && (
        <View style={styles.commentImages}>
          {comment.images.map((path, index) => (
            <TouchableOpacity
              key={`${path}-${index}`}
              style={styles.commentImage}
              onPress={showPendingAction}
              accessibilityLabel={`Ver adjunto ${index + 1} del comentario`}
              activeOpacity={0.8}
            >
              <Ionicons name="image-outline" size={22} color={PRIMARY_700} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
