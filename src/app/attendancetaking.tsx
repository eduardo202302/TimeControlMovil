import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DrawerMenu from "../components/drawer/DrawerMenu";

export default function AttendanceTaking() {
  const [drawerVisible, setDrawerVisible] = useState(false);
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          style={styles.menuBtn}
        >
          <Ionicons name="menu" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Asistencia</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.content}>
        <Ionicons name="checkmark-circle-outline" size={48} color="#93C5FD" />
        <Text style={styles.label}>Asistencia</Text>
        <Text style={styles.sub}>Conecta tu API aquí</Text>
      </View>
      <DrawerMenu
        isVisible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  menuBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  label: { fontSize: 20, fontWeight: "700", color: "#111827" },
  sub: { fontSize: 14, color: "#6B7280" },
});
