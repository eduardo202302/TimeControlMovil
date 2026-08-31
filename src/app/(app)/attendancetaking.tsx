import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { APP_BACKGROUND } from "@/constants/colors";
import { useResponsive } from "@/constants/responsive";

export default function AttendanceTaking() {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Ionicons name="checkmark-circle-outline" size={48} color="#93C5FD" />
        <Text style={styles.label}>Asistencia</Text>
        <Text style={styles.sub}>Conecta tu API aquí</Text>
      </View>
    </SafeAreaView>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: APP_BACKGROUND },
    content: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: verticalScale(12),
    },
    // 20 no coincide con ningún token — huérfano, font() directo.
    label: { fontSize: font(20), fontWeight: "700", color: "#111827" },
    // 14 no coincide con ningún token — huérfano, font() directo.
    sub: { fontSize: font(14), color: "#6B7280" },
  });
}
