import { Ionicons } from "@expo/vector-icons";
import { Slot, usePathname } from "expo-router";
import React, { useState } from "react";
import {
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DrawerMenu from "../../components/drawer/DrawerMenu";

const ROUTE_TITLES: Record<string, string> = {
  "/punchinout": "Entrada y Salida",
  "/attendancetaking": "Asistencia",
  "/tardiness": "Tardanzas",
  "/parentsexcusesscreen": "Excusas",
  "/timeoff": "Permisos",
  "/dashboard": "Dashboard",
  "/users": "Usuarios",
  "/students": "Estudiantes",
  "/teachers": "Docentes",
  "/parents": "Padres / Tutores",
  "/roles": "Roles",
  "/entities": "Empresa",
  "/unauthorized": "Sin acceso",
};

export default function AppLayout() {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const pathname = usePathname();
  const title = ROUTE_TITLES[pathname] ?? "Time Flow";

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header compartido */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          style={styles.menuBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="menu" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Contenido de cada pantalla */}
      <Slot />

      {/* Drawer compartido */}
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
});
