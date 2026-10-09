import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Image, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  DANGER_ICON,
  ON_PRIMARY,
  PRIMARY_700,
  PRIMARY_COLOR,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
} from "@/constants/colors";
import ImageViewerModal from "@/components/ui/ImageViewerModal";
import {
  buildLocalComment,
  canSubmitComment,
  formatElapsed,
  formatPhone,
  formatTaskerDate,
  getCommentAttachmentKind,
  getInitials,
  getTagChipTone,
  type CommentOrder,
} from "../../utils/taskerRules";
import type {
  TaskerAttachment,
  TaskerComment,
  TaskerTask,
} from "../../../types/typesTasker/TaskerTypes";
import { FollowUpCardHeader, StateChip } from "./FollowUpParts";
import type { FollowUpStyles } from "./followUpStyles";
import { showPendingAction } from "./pendingAction";
import { useTaskerAttachmentPicker } from "./useTaskerAttachmentPicker";

interface FollowUpTicketTabProps {
  task: TaskerTask;
  styles: FollowUpStyles;
  /** "Ahora" fijado al montar la pantalla. */
  nowMs: number;
  /** Ya en el orden en que se pintan (ver FollowUpView). */
  comments: TaskerComment[];
  commentOrder: CommentOrder;
  onToggleCommentOrder: () => void;
  onAddComment: (comment: TaskerComment) => void;
}

export default function FollowUpTicketTab({
  task,
  styles,
  nowMs,
  comments,
  commentOrder,
  onToggleCommentOrder,
  onAddComment,
}: FollowUpTicketTabProps) {
  // Formulario "Agregar comentario" (como Tasker: se puede comentar en cualquier estado).
  const [formOpen, setFormOpen] = useState(false);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<TaskerAttachment[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const handleAddAttachments = useCallback((added: TaskerAttachment[]) => {
    setAttachments((prev) => [...prev, ...added]);
  }, []);
  const picker = useTaskerAttachmentPicker(attachments, handleAddAttachments);

  const canSubmit = canSubmitComment(text, attachments);

  const handleSubmit = () => {
    if (!canSubmit) return;
    // TODO(puente): enviar buildCommentPayload(text, attachments) al endpoint de
    // comentarios de Tasker y reemplazar el comentario local por el que devuelva.
    onAddComment(buildLocalComment({ text, attachments, task, now: new Date() }));
    setText("");
    setAttachments([]);
  };

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
            onPress={() => setFormOpen((prev) => !prev)}
            accessibilityState={{ expanded: formOpen }}
            activeOpacity={0.75}
          >
            <Ionicons
              name={formOpen ? "remove-circle-outline" : "add-circle-outline"}
              size={16}
              color={PRIMARY_700}
            />
            <Text style={styles.addCommentText}>{formOpen ? "Ocultar" : "Agregar"}</Text>
          </TouchableOpacity>
        </FollowUpCardHeader>

        {formOpen && (
          <View style={styles.commentForm}>
            <TextInput
              style={styles.commentInput}
              value={text}
              onChangeText={setText}
              placeholder="Escriba un comentario"
              placeholderTextColor={TEXT_PLACEHOLDER}
              multiline
              textAlignVertical="top"
            />
            {attachments.length > 0 && (
              <View style={styles.commentImages}>
                {attachments.map((file) => (
                  <View key={file.id} style={styles.commentFormThumb}>
                    <AttachmentThumb
                      uri={file.dataUri}
                      name={file.name}
                      styles={styles}
                      onOpen={setViewerUri}
                    />
                    <TouchableOpacity
                      style={styles.commentFormRemove}
                      onPress={() =>
                        setAttachments((prev) => prev.filter((a) => a.id !== file.id))
                      }
                      accessibilityLabel={`Quitar ${file.name}`}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="close" size={14} color={DANGER_ICON} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.commentFormActions}>
              <TouchableOpacity
                style={[styles.commentSubmitBtn, !canSubmit && styles.commentSubmitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
                accessibilityState={{ disabled: !canSubmit }}
                activeOpacity={0.8}
              >
                <Ionicons name="send-outline" size={16} color={ON_PRIMARY} />
                <Text style={styles.commentSubmitText}>Agregar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setText("")}
                accessibilityLabel="Limpiar el texto"
                activeOpacity={0.75}
              >
                <Ionicons name="trash-outline" size={18} color={DANGER_ICON} />
              </TouchableOpacity>
              {/* Como Tasker: el clip solo se ve mientras no haya adjuntos. */}
              {attachments.length === 0 && (
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={picker.openPicker}
                  disabled={picker.busy}
                  accessibilityLabel="Adjuntar foto o PDF"
                  activeOpacity={0.75}
                >
                  {picker.busy ? (
                    <ActivityIndicator size="small" color={PRIMARY_700} />
                  ) : (
                    <Ionicons name="attach-outline" size={20} color={PRIMARY_700} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {comments.length === 0 ? (
          <Text style={styles.emptyText}>Sin comentarios</Text>
        ) : (
          <View style={styles.commentList}>
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                styles={styles}
                onOpenImage={setViewerUri}
              />
            ))}
          </View>
        )}
      </View>

      <ImageViewerModal uri={viewerUri} onClose={() => setViewerUri(null)} />
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

interface CommentItemProps {
  comment: TaskerComment;
  styles: FollowUpStyles;
  onOpenImage: (uri: string) => void;
}

function CommentItem({ comment, styles, onOpenImage }: CommentItemProps) {
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
            <AttachmentThumb
              key={`${path}-${index}`}
              uri={path}
              name={`adjunto ${index + 1} del comentario`}
              styles={styles}
              onOpen={onOpenImage}
            />
          ))}
        </View>
      )}
    </View>
  );
}

interface AttachmentThumbProps {
  /** data-URI local o ruta guardada en el servidor. */
  uri: string;
  name: string;
  styles: FollowUpStyles;
  onOpen: (uri: string) => void;
}

/**
 * Miniatura de adjunto: imagen local → la imagen real, abre el visor; PDF
 * local → ícono, no se abre; ruta del servidor → ícono, sigue pendiente.
 */
function AttachmentThumb({ uri, name, styles, onOpen }: AttachmentThumbProps) {
  const kind = getCommentAttachmentKind(uri);
  if (kind === "file") {
    return (
      <View style={styles.commentImage} accessibilityLabel={name}>
        <Ionicons name="document-outline" size={22} color={PRIMARY_700} />
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={styles.commentImage}
      onPress={kind === "image" ? () => onOpen(uri) : showPendingAction}
      accessibilityLabel={`Ver ${name}`}
      activeOpacity={0.8}
    >
      {kind === "image" ? (
        <Image source={{ uri }} style={styles.commentImageFill} resizeMode="cover" />
      ) : (
        <Ionicons name="image-outline" size={22} color={PRIMARY_700} />
      )}
    </TouchableOpacity>
  );
}
