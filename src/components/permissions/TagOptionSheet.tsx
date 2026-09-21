import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { RADIUS_2XL, RADIUS_MD, RADIUS_PILL, useResponsive } from "@/constants/responsive";
import type { PermissionCatalogTag } from "../../utils/adminPermissionRules";

/**
 * Opción del sheet: un tag del catálogo, con `subtitle` opcional en gris
 * debajo del nombre — mismo criterio que `MultiSelectOption.subtitle` de
 * TagMultiSelectSheet. Sin `subtitle`, la fila se ve igual que antes.
 */
export type TagSheetOption = PermissionCatalogTag & { subtitle?: string | null };

interface TagOptionSheetProps {
  visible: boolean;
  title: string;
  options: TagSheetOption[];
  selectedId?: number | null;
  emptyText?: string;
  onSelect: (tag: TagSheetOption) => void;
  onClose: () => void;
  /**
   * Buscador controlado por el caller (búsqueda contra el backend, p. ej.
   * GET /courses con `all`). Sin esta prop no se dibuja — los usos
   * existentes (catálogos cortos en memoria) no cambian.
   */
  search?: { value: string; onChangeText: (text: string) => void; placeholder?: string };
  /** Spinner en lugar de la lista (búsqueda en vuelo). */
  loading?: boolean;
  /** Contenido al final de la lista (p. ej. "Cargar más"). */
  footer?: ReactNode;
  /** Oculta el punto de color — para opciones que no son tags (cursos). */
  hideColorDot?: boolean;
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
  search,
  loading = false,
  footer,
  hideColorDot = false,
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
          {search && (
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                value={search.value}
                onChangeText={search.onChangeText}
                placeholder={search.placeholder ?? "Buscar…"}
                placeholderTextColor="#9CA3AF"
                autoCorrect={false}
              />
            </View>
          )}
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {loading ? (
              <ActivityIndicator color="#2563EB" style={styles.loading} />
            ) : options.length === 0 ? (
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
                    {!hideColorDot && (
                      <View
                        style={[styles.dot, { backgroundColor: tag.color || "#CBD5E1" }]}
                      />
                    )}
                    <View style={styles.optionBody}>
                      <Text
                        style={[styles.optionText, selected && styles.optionTextSelected]}
                        numberOfLines={2}
                      >
                        {tag.name}
                      </Text>
                      {!!tag.subtitle && (
                        <Text style={styles.optionSubtitle} numberOfLines={1}>
                          {tag.subtitle}
                        </Text>
                      )}
                    </View>
                    {selected && <Ionicons name="checkmark" size={18} color="#2563EB" />}
                  </TouchableOpacity>
                );
              })
            )}
            {!loading && footer}
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
    optionBody: { flex: 1 },
    optionText: { fontSize: font(14), color: "#374151" },
    optionSubtitle: { fontSize: font(12), color: "#6B7280", marginTop: verticalScale(2) },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(10),
      marginBottom: verticalScale(8),
    },
    searchInput: {
      flex: 1,
      fontSize: font(14),
      color: "#111827",
      paddingVertical: verticalScale(8),
    },
    loading: { paddingVertical: verticalScale(20) },
    optionTextSelected: { color: "#1D4ED8", fontWeight: "700" },
  });
}
