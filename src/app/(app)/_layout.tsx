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
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
    APP_BACKGROUND_V2,
    HEADER_BUTTON_BACKGROUND,
    HEADER_NAVY,
    HEADER_TEXT,
} from "@/constants/colors";
import { RADIUS_MD, useResponsive } from "@/constants/responsive";
import { SHADOW_MD } from "@/constants/shadows";
import DrawerMenu from "../../components/drawer/DrawerMenu";

const ROUTE_TITLES: Record<string, string> = {
  "/punchinout": "Registrar Acceso",
  "/attendancetaking": "Asistencia",
  "/adminattendancetaking": "Asistencia Adm.",
  "/tardiness": "Tardanzas",
  "/parentsexcusesscreen": "Excusas",
  "/timeoff": "Permisos",
  "/timeoffscreen": "Solicitar Permiso",
  "/mypermissions": "Mis Permisos",
  "/adminpunchinout": "Registrar Acceso ADM",
  "/permissions": "Consultar Permisos/Ausencias",
  "/excuses": "Excusas",
  "/myexcuses": "Mis Excusas",
  "/holidays": "Días Feriados",
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
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font, insets.top),
    [scale, verticalScale, font, insets.top],
  );

  const [drawerVisible, setDrawerVisible] = useState(false);
  const pathname = usePathname();
  const title = ROUTE_TITLES[pathname] ?? "Time Flow";

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {/*
        Sin backgroundColor: con edge-to-edge (Android) la status bar es
        transparente y lo que se ve detrás es el header navy, que reserva
        insets.top por su cuenta.
      */}
      <StatusBar barStyle="light-content" />

      {/* Header compartido */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          style={styles.menuBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="menu" size={24} color={HEADER_TEXT} />
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
  insetTop: number,
) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: APP_BACKGROUND_V2 },
    /**
     * El SafeAreaView no toma el borde superior: el header se estira detrás
     * de la status bar (insetTop) para que el navy llegue hasta arriba.
     * zIndex para que la sombra caiga sobre el contenido del Slot.
     */
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: HEADER_NAVY,
      paddingHorizontal: scale(16),
      paddingTop: insetTop + verticalScale(14),
      paddingBottom: verticalScale(14),
      ...SHADOW_MD,
      shadowColor: HEADER_NAVY,
      zIndex: 1,
    },
    /** Tamaño fijo: botón de ícono, mismo criterio que avatarContainer en DrawerMenu.tsx. */
    menuBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_MD,
      backgroundColor: HEADER_BUTTON_BACKGROUND,
    },
    /** Spacer simétrico al menuBtn — mantiene el título centrado en el header. */
    headerSpacer: { width: 40 },
    headerTitle: { fontSize: font(18), fontWeight: "700", color: HEADER_TEXT },
  });
}
