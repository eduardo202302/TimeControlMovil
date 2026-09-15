import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { RADIUS_2XL, RADIUS_LG, RADIUS_MD, useResponsive } from "@/constants/responsive";

/** Lado del avatar de las filas — mismo AVATAR_SM_SIZE que las filas de
 * resultado de AdminPermissionCreateModal.tsx, un punto más chico porque acá
 * el sheet ya trae buscador + checkbox compitiendo por el mismo ancho. */
const OPTION_AVATAR_SIZE = 32;

export interface MultiSelectOption {
  id: number;
  name: string;
  /** Línea secundaria en gris debajo del nombre (curso, código, etc.). Si no
   * se pasa (ni `avatarUrl`), la fila se ve exactamente igual que antes. */
  subtitle?: string;
  /** Si no hay foto, se muestra un ícono de persona genérico. */
  avatarUrl?: string;
}

interface TagMultiSelectSheetProps {
  visible: boolean;
  title: string;
  options: MultiSelectOption[];
  /** Ids seleccionados, en orden de selección. */
  selectedIds: number[];
  emptyText?: string;
  onChange: (ids: number[]) => void;
  onClose: () => void;
}

/**
 * Versión multi-selección de TagOptionSheet (mismo overlay/sheet) para el
 * `Form.Dropdown multiple search` de UserSettings del webapp. Cada toque
 * aplica al instante y preserva el orden de selección: marcar agrega al
 * final, desmarcar quita.
 */
export default function TagMultiSelectSheet({
  visible,
  title,
  options,
  selectedIds,
  emptyText = "Sin opciones disponibles",
  onChange,
  onClose,
}: TagMultiSelectSheetProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => option.name.toLowerCase().includes(term));
  }, [options, query]);

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar…"
              placeholderTextColor="#9CA3AF"
              autoCorrect={false}
            />
          </View>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? (
              <Text style={styles.empty}>{emptyText}</Text>
            ) : (
              filtered.map((option) => {
                const selected = selectedIds.includes(option.id);
                // Solo se dibuja el avatar si el caller manda subtitle o
                // avatarUrl — así el uso actual (tags simples de Usuarios)
                // no cambia de aspecto.
                const showAvatar =
                  option.subtitle !== undefined || option.avatarUrl !== undefined;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => toggle(option.id)}
                    activeOpacity={0.75}
                  >
                    {showAvatar && (
                      <View style={styles.avatar}>
                        {option.avatarUrl ? (
                          <Image
                            source={{ uri: option.avatarUrl }}
                            style={styles.avatarImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <Ionicons name="person" size={16} color="#9CA3AF" />
                        )}
                      </View>
                    )}
                    <Ionicons
                      name={selected ? "checkbox" : "square-outline"}
                      size={20}
                      color={selected ? "#2563EB" : "#9CA3AF"}
                    />
                    <View style={styles.optionTextGroup}>
                      <Text
                        style={[styles.optionText, selected && styles.optionTextSelected]}
                        numberOfLines={2}
                      >
                        {option.name}
                      </Text>
                      {!!option.subtitle && (
                        <Text style={styles.optionSubtitle} numberOfLines={1}>
                          {option.subtitle}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.doneText}>Listo</Text>
          </TouchableOpacity>
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
      paddingBottom: verticalScale(12),
      maxHeight: "75%",
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
    title: { flex: 1, fontSize: font(16), fontWeight: "700", color: "#111827" },
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
      paddingVertical: verticalScale(11),
      borderRadius: RADIUS_MD,
      marginBottom: verticalScale(4),
    },
    optionSelected: { backgroundColor: "#EFF6FF" },
    optionTextGroup: { flex: 1 },
    optionText: { fontSize: font(14), color: "#374151" },
    optionTextSelected: { color: "#1D4ED8", fontWeight: "700" },
    optionSubtitle: {
      fontSize: font(12),
      color: "#6B7280",
      marginTop: verticalScale(1),
    },
    avatar: {
      width: OPTION_AVATAR_SIZE,
      height: OPTION_AVATAR_SIZE,
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: OPTION_AVATAR_SIZE / 2,
      backgroundColor: "#F3F4F6",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: {
      width: OPTION_AVATAR_SIZE,
      height: OPTION_AVATAR_SIZE,
      // Círculo: mitad del lado fijo, no un radio de diseño.
      borderRadius: OPTION_AVATAR_SIZE / 2,
    },
    doneBtn: {
      marginTop: verticalScale(8),
      alignItems: "center",
      paddingVertical: verticalScale(12),
      borderRadius: RADIUS_LG,
      backgroundColor: "#2563EB",
    },
    doneText: { fontSize: font(14), fontWeight: "700", color: "#fff" },
  });
}
