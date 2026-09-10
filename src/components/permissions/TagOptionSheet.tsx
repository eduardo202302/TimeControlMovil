import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { RADIUS_2XL, RADIUS_MD, RADIUS_PILL, useResponsive } from "@/constants/responsive";
import type { PermissionCatalogTag } from "../../utils/adminPermissionRules";

interface TagOptionSheetProps {
  visible: boolean;
  title: string;
  options: PermissionCatalogTag[];
  selectedId?: number | null;
  emptyText?: string;
  onSelect: (tag: PermissionCatalogTag) => void;
  onClose: () => void;
}

/** Selector de un tag del catálogo (estado, acción o tipo) con su color. */
export default function TagOptionSheet({
  visible,
  title,
  options,
  selectedId,
  emptyText = "Sin opciones disponibles",
  onSelect,
  onClose,
}: TagOptionSheetProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        {/* Captura los toques del sheet para que no lleguen al overlay y lo cierren. */}
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {options.length === 0 ? (
              <Text style={styles.empty}>{emptyText}</Text>
            ) : (
              options.map((tag) => {
                const selected = selectedId != null && Number(tag.id) === Number(selectedId);
                return (
                  <TouchableOpacity
                    key={String(tag.id)}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => onSelect(tag)}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[styles.dot, { backgroundColor: tag.color || "#CBD5E1" }]}
                    />
                    <Text
                      style={[styles.optionText, selected && styles.optionTextSelected]}
                      numberOfLines={2}
                    >
                      {tag.name}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={18} color="#2563EB" />}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      paddingHorizontal: scale(24),
    },
    sheet: {
      backgroundColor: "#fff",
      borderRadius: RADIUS_2XL,
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(16),
      paddingBottom: verticalScale(10),
      maxHeight: "70%",
      width: "100%",
      maxWidth: 420,
      alignSelf: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: verticalScale(10),
    },
    title: { fontSize: font(16), fontWeight: "700", color: "#111827" },
    list: { flexGrow: 0 },
    empty: {
      fontSize: font(13),
      color: "#6B7280",
      textAlign: "center",
      paddingVertical: verticalScale(20),
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(12),
      borderRadius: RADIUS_MD,
      marginBottom: verticalScale(4),
    },
    optionSelected: { backgroundColor: "#EFF6FF" },
    dot: {
      width: scale(12),
      height: scale(12),
      borderRadius: RADIUS_PILL,
    },
    optionText: { flex: 1, fontSize: font(14), color: "#374151" },
    optionTextSelected: { color: "#1D4ED8", fontWeight: "700" },
  });
}
