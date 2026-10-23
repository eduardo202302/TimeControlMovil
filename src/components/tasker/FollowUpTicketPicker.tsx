import React, { useCallback, useEffect, useRef } from "react";
import { ScrollView, Text, TouchableOpacity } from "react-native";
import { getTaskerClientName, getTaskerStateLabel } from "../../utils/taskerFollowUpRules";
import { getCenteredScrollOffset } from "../../utils/scrollIntoViewRules";
import type { TaskerTaskSummary } from "../../../types/typesTasker/TaskerTypes";
import { StateChip } from "./FollowUpParts";
import type { FollowUpStyles } from "./followUpStyles";

interface FollowUpTicketPickerProps {
  tasks: TaskerTaskSummary[];
  /** null = ninguno elegido (así se entra, aunque haya uno solo). */
  selectedId: number | null;
  onSelect: (id: number) => void;
  styles: FollowUpStyles;
  /**
   * Tarjeta a llevar a la vista (centrada) apenas se mida; luego se avisa con
   * `onRevealed`. null = no desplazar (los toques del usuario no lo usan).
   */
  revealId?: number | null;
  onRevealed?: () => void;
}

/** Fila horizontal de tarjetitas, una por ticket: "#id", cliente y estado. */
export default function FollowUpTicketPicker({
  tasks,
  selectedId,
  onSelect,
  styles,
  revealId = null,
  onRevealed,
}: FollowUpTicketPickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const cardsRef = useRef(new Map<number, { x: number; width: number }>());
  const viewportWidthRef = useRef(0);
  const contentWidthRef = useRef(0);

  /** Centra `revealId` si ya están medidos la tarjeta y el ScrollView. */
  const tryReveal = useCallback(() => {
    if (revealId === null) return;
    const card = cardsRef.current.get(revealId);
    if (!card || viewportWidthRef.current === 0 || contentWidthRef.current === 0) return;
    scrollRef.current?.scrollTo({
      x: getCenteredScrollOffset(
        card.x,
        card.width,
        viewportWidthRef.current,
        contentWidthRef.current,
      ),
      animated: true,
    });
    onRevealed?.();
  }, [revealId, onRevealed]);

  // Ya montada y medida: se desplaza al llegar el pedido. Si no, lo hace el onLayout.
  useEffect(() => {
    tryReveal();
  }, [tryReveal]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      style={styles.picker}
      contentContainerStyle={styles.pickerContent}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onLayout={(event) => {
        viewportWidthRef.current = event.nativeEvent.layout.width;
        tryReveal();
      }}
      onContentSizeChange={(width) => {
        contentWidthRef.current = width;
        tryReveal();
      }}
    >
      {tasks.map((task) => {
        const selected = task.id === selectedId;
        const client = getTaskerClientName(task.client);
        return (
          <TouchableOpacity
            key={task.id}
            style={[styles.pickerCard, selected && styles.pickerCardSelected]}
            onPress={() => onSelect(task.id)}
            onLayout={(event) => {
              const { x, width } = event.nativeEvent.layout;
              cardsRef.current.set(task.id, { x, width });
              if (task.id === revealId) tryReveal();
            }}
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
