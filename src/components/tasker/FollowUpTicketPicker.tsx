import React from "react";
import { ScrollView, Text, TouchableOpacity } from "react-native";
import { getTaskerClientName, getTaskerStateLabel } from "../../utils/taskerFollowUpRules";
import type { TaskerTaskSummary } from "../../../types/typesTasker/TaskerTypes";
import { StateChip } from "./FollowUpParts";
import type { FollowUpStyles } from "./followUpStyles";

interface FollowUpTicketPickerProps {
  tasks: TaskerTaskSummary[];
  /** null = ninguno elegido (así se entra, aunque haya uno solo). */
  selectedId: number | null;
  onSelect: (id: number) => void;
  styles: FollowUpStyles;
}

/** Fila horizontal de tarjetitas, una por ticket: "#id", cliente y estado. */
export default function FollowUpTicketPicker({
  tasks,
  selectedId,
  onSelect,
  styles,
}: FollowUpTicketPickerProps) {
  return (
    <ScrollView
      horizontal
      style={styles.picker}
      contentContainerStyle={styles.pickerContent}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {tasks.map((task) => {
        const selected = task.id === selectedId;
        const client = getTaskerClientName(task.client);
        return (
          <TouchableOpacity
            key={task.id}
            style={[styles.pickerCard, selected && styles.pickerCardSelected]}
            onPress={() => onSelect(task.id)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Ticket ${task.id}, ${client}, ${getTaskerStateLabel(task.state)}`}
          >
            <Text style={[styles.pickerId, selected && styles.pickerIdSelected]}>#{task.id}</Text>
            <Text style={styles.pickerClient} numberOfLines={1}>
              {client}
            </Text>
            <StateChip state={task.state} styles={styles} style={styles.pickerChip} />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
