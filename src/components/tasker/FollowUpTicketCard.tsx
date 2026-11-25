import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ERROR_TEXT, TEXT_SECONDARY } from "@/constants/colors";
import { useResponsive } from "@/constants/responsive";
import {
  getTaskerClientName,
  getTaskerStateLabel,
  getTicketDue,
  TASKER_UNASSIGNED_LABEL,
} from "../../utils/taskerFollowUpRules";
import { formatReportSentAt } from "../../utils/taskerRules";
import type { TaskerTaskSummary } from "../../../types/typesTasker/TaskerTypes";
import { SolidLabel } from "./FollowUpParts";
import type { FollowUpStyles } from "./followUpStyles";

interface FollowUpTicketCardProps {
  task: TaskerTaskSummary;
  /** Etiqueta del cliente de la compañía (getTaskerClientLabel). */
  clientLabel: string;
  /** "Ahora" para saber si ya venció (useNowMs). */
  nowMs: number;
  onPress: (id: number) => void;
  styles: FollowUpStyles;
}

function Field({ label, value, styles }: { label: string; value: string; styles: FollowUpStyles }) {
  return (
    <View style={styles.ticketField}>
      <Text style={styles.ticketFieldLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.ticketFieldValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Tarjeta de la lista de Seguimiento, calcada de TaskCard.js de etaskr-mobile
 * (21-140): cabecera "#id" + estado, campos, divisor, descripción y pie con
 * el vencimiento (o la creación) y la prioridad. La lista de Taskr no trae
 * etiquetas ni el historial de estados: sin "Etiquetas" ni tiempo en el estado.
 */
function FollowUpTicketCard({ task, clientLabel, nowMs, onPress, styles }: FollowUpTicketCardProps) {
  const { font } = useResponsive();
  const client = getTaskerClientName(task.client);
  const responsible = task.assignedUser?.name.trim() || TASKER_UNASSIGNED_LABEL;
  const stateLabel = getTaskerStateLabel(task.state);
  const action = task.action.trim();
  const due = getTicketDue(task.dueDate, nowMs);
  const createdAt = due ? "" : formatReportSentAt(task.createdDate);
  const dateColor = due?.expired ? ERROR_TEXT : TEXT_SECONDARY;

  return (
    <TouchableOpacity
      style={styles.ticketCard}
      onPress={() => onPress(task.id)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Ticket ${task.id}, ${client}, ${stateLabel}`}
    >
      <View style={styles.ticketHeader}>
        <Text style={styles.ticketId} numberOfLines={1}>
          #{task.id}
        </Text>
        <SolidLabel color={task.state.color} label={stateLabel} styles={styles} />
      </View>

      <Field label={clientLabel} value={client} styles={styles} />
      <Field label="Responsable" value={responsible} styles={styles} />
      {task.province !== "" && <Field label="Provincia" value={task.province} styles={styles} />}

      <View style={styles.ticketDivider} />

      <Text style={[styles.ticketAction, !action && styles.ticketActionEmpty]} numberOfLines={3}>
        {action || "Sin descripción."}
      </Text>

      <View style={styles.ticketFooter}>
        <View style={styles.ticketDate}>
          {(due || createdAt !== "") && (
            <>
              <MaterialCommunityIcons
                name="calendar-month-outline"
                size={font(15)}
                color={dateColor}
              />
              <Text style={[styles.ticketDateText, { color: dateColor }]} numberOfLines={1}>
                {due ? (
                  <>
                    {"Vence: "}
                    <Text style={due.expired && styles.ticketDateExpired}>{due.text}</Text>
                  </>
                ) : (
                  createdAt
                )}
              </Text>
            </>
          )}
        </View>
        {task.priority && task.priority.name.trim() !== "" && (
          <SolidLabel color={task.priority.color} label={task.priority.name} styles={styles} />
        )}
      </View>
    </TouchableOpacity>
  );
}

export default memo(FollowUpTicketCard);
