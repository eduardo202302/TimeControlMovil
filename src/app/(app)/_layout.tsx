import { Ionicons } from "@expo/vector-icons";
import { Slot, usePathname } from "expo-router";
import React, { useMemo, useState } from "react";
import {
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { APP_BACKGROUND } from "@/constants/colors";
import { RADIUS_MD, useResponsive } from "@/constants/responsive";
import DrawerMenu from "../../components/drawer/DrawerMenu";

const ROUTE_TITLES: Record<string, string> = {
  "/punchinout": "Registrar Acceso",
  "/attendancetaking": "Asistencia",
  "/tardiness": "Tardanzas",
  "/parentsexcusesscreen": "Excusas",
  "/timeoff": "Permisos",
  "/timeoffscreen": "Solicitar Permiso",
  "/mypermissions": "Mis Permisos",
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
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

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
        <View style={styles.headerSpacer} />
      </View>

      {/* Contenido de cada pantalla */}
      <Slot />

      {/* Drawer compartido */}
      {drawerVisible && (
        <DrawerMenu
          isVisible={drawerVisible}
          onClose={() => setDrawerVisible(false)}
        />
      )}
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
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: "#fff",
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(14),
      borderBottomWidth: 1,
      borderBottomColor: "#F3F4F6",
    },
    /** Tamaño fijo: botón de ícono, mismo criterio que avatarContainer en DrawerMenu.tsx. */
    menuBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_MD,
    },
    /** Spacer simétrico al menuBtn — mantiene el título centrado en el header. */
    headerSpacer: { width: 40 },
    headerTitle: { fontSize: font(18), fontWeight: "700", color: "#142157" },
  });
}
