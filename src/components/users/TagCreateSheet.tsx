import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { RADIUS_2XL, RADIUS_LG, RADIUS_MD, useResponsive } from "@/constants/responsive";
import type { UserCategory } from "../../utils/usersRules";
import type { CreateTagResult } from "./useUserForm";

interface TagCreateSheetProps {
  /** Categoría fija — la del multi-select donde se tocó el "+". null = cerrado. */
  category: UserCategory | null;
  onCreate: (category: UserCategory, name: string) => Promise<CreateTagResult>;
  onClose: () => void;
}

/**
 * Creación inline de etiqueta desde el "+" de UserSettings — equivalente a
 * abrir TagsCrud en modo Add con `isUserDisabled` (categoría bloqueada). Solo
 * pide el nombre: el resto viaja con los defaults de TagsCrud
 * (buildSimpleTagPayload).
 */
export default function TagCreateSheet({ category, onCreate, onClose }: TagCreateSheetProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (saving) return;
    setName("");
    setError(null);
    onClose();
  };

  const save = async () => {
    if (!category || saving) return;
    setSaving(true);
    setError(null);
    const result = await onCreate(category, name);
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setName("");
    onClose();
  };

  return (
    <Modal visible={category !== null} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Agregar Etiqueta</Text>
            <TouchableOpacity onPress={close} hitSlop={8} disabled={saving}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Categoría</Text>
          <View style={[styles.input, styles.inputDisabled]}>
            <Text style={styles.disabledText}>{category?.name ?? ""}</Text>
          </View>

          <Text style={[styles.label, styles.labelSpaced]}>
            Nombre <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.inputText, !!error && styles.inputInvalid]}
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError(null);
            }}
            placeholder="Ej. Importante"
            placeholderTextColor="#9CA3AF"
            maxLength={100}
            editable={!saving}
            autoFocus
          />
          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={close}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.saveBtn, saving && styles.busy]}
              onPress={save}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveText}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
      paddingBottom: verticalScale(16),
      width: "100%",
      maxWidth: 420,
      alignSelf: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: verticalScale(12),
    },
    title: { fontSize: font(16), fontWeight: "700", color: "#111827" },
    label: { fontSize: font(12), fontWeight: "600", color: "#374151", marginBottom: verticalScale(6) },
    labelSpaced: { marginTop: verticalScale(12) },
    required: { color: "#DC2626", fontWeight: "700" },
    input: {
      borderWidth: 1,
      borderColor: "#D1D5DB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
      backgroundColor: "#fff",
    },
    inputText: { fontSize: font(14), color: "#111827" },
    inputDisabled: { backgroundColor: "#F3F4F6" },
    inputInvalid: { borderColor: "#DC2626" },
    disabledText: { fontSize: font(14), color: "#6B7280" },
    error: { fontSize: font(12), color: "#DC2626", marginTop: verticalScale(4) },
    buttons: { flexDirection: "row", gap: scale(10), marginTop: verticalScale(18) },
    btn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: verticalScale(12),
      borderRadius: RADIUS_LG,
    },
    cancelBtn: { backgroundColor: "#F3F4F6" },
    cancelText: { fontSize: font(14), fontWeight: "700", color: "#374151" },
    saveBtn: { backgroundColor: "#2563EB" },
    saveText: { fontSize: font(14), fontWeight: "700", color: "#fff" },
    busy: { opacity: 0.7 },
  });
}
