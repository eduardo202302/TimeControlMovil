import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function Tardiness() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.empty}>
        <Ionicons name="warning-outline" size={48} color="#FCA5A5" />
        <Text style={styles.title}>Tardanzas</Text>
        <Text style={styles.sub}>Conecta tu API aquí</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 16 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 100,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" },
  sub: { fontSize: 14, color: "#6B7280" },
});
