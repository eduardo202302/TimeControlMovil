import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSchoolStore } from "../../store/useSchoolStore";
import DrawerMenu from "../components/drawer/DrawerMenu";

export default function Dashboard() {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { user } = useSchoolStore();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          style={styles.menuBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="menu" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Contenido */}
      <View style={styles.content}>
        <Text style={styles.welcome}>
          Hola, {user?.user?.fullName ?? "Usuario"} 👋
        </Text>
        <Text style={styles.role}>{user?.role?.name}</Text>
      </View>

      {/* Sidebar */}
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
    borderRadius: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  welcome: { fontSize: 22, fontWeight: "700", color: "#111827" },
  role: { fontSize: 15, color: "#6B7280" },
});
