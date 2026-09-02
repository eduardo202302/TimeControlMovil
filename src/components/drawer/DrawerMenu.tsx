import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import * as Storage from "../../utils/storage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  SlideInLeft,
  SlideOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { MenuTree } from "../../../utils/resolveRoute";
import {
  RADIUS_MD,
  RADIUS_SM,
  useResponsive,
} from "@/constants/responsive";

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  dashboard: "grid-outline",
  user: "person-outline",
  users: "people-outline",
  settings: "settings-outline",
  student: "school-outline",
  list: "list-outline",
  key: "key-outline",
  "id card outline": "id-card-outline",
  clock: "time-outline",
  time: "time-outline",
  adn: "time-outline",
  calendar: "calendar-outline",
  "add to calendar": "calendar-outline",
  tasks: "checkmark-circle-outline",
  "warning sign": "warning-outline",
  mail: "mail-outline",
  "envelope square": "mail-outline",
  circle: "ellipse-outline",
  archive: "archive-outline",
  send: "send-outline",
  "bell slash outline": "notifications-off-outline",
  "bell slash": "notifications-off-outline",
  "address book": "book-outline",
  "folder open": "folder-open-outline",
  hashtag: "pricetag-outline",
  "map outline": "map-outline",
  university: "school-outline",
  book: "book-outline",
  tags: "pricetags-outline",
};

function getIcon(iconName: string): keyof typeof Ionicons.glyphMap {
  return ICON_MAP[iconName?.toLowerCase()] ?? "ellipse-outline";
}

/**
 * Estilos tokenizados con scale/verticalScale/font de useResponsive(). Vive
 * fuera del componente (función pura) para que tanto DrawerMenu como
 * MenuSection consuman la misma instancia memoizada — evita recalcular por
 * cada sección del menú.
 */
function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      zIndex: 999,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    drawer: {
      // `width` se aplica inline (ver drawerWidth) — depende de
      // useWindowDimensions() y no puede vivir en un StyleSheet memoizado
      // solo por scale/verticalScale/font.
      position: "absolute",
      top: 0,
      left: 0,
      height: "100%",
      zIndex: 1,
      backgroundColor: "#FFFFFF",
      elevation: 16,
      shadowColor: "#000",
      shadowOffset: { width: -2, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
    },
    header: {
      flexDirection: "column",
      backgroundColor: "#2563EB",
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(14),
      paddingBottom: verticalScale(16),
    },
    companyRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: "#1D4ED8",
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(14),
      paddingBottom: verticalScale(12),
    },
    companyLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      flexShrink: 1,
    },
    companyLogo: {
      width: 32,
      height: 32,
      borderRadius: scale(6),
      backgroundColor: "#FFFFFF",
    },
    companyLogoFallback: {
      width: 32,
      height: 32,
      borderRadius: scale(6),
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    companyName: {
      color: "#FFFFFF",
      fontSize: font(13),
      fontWeight: "700",
    },
    /**
     * Tamaño fijo a propósito: es iconografía (avatar de cabecera), no
     * contenido que necesite más espacio en pantalla grande — mismo
     * criterio que AVATAR_SIZE en punchinout.tsx.
     */
    avatarContainer: {
      width: 40,
      height: 40,
      // eslint-disable-next-line local/no-raw-numbers-in-stylesheet -- círculo (mitad de width/height fijos), no un radio de diseño
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: {
      width: 40,
      height: 40,
      // eslint-disable-next-line local/no-raw-numbers-in-stylesheet -- círculo (mitad de width/height fijos), no un radio de diseño
      borderRadius: 20,
    },
    appName: {
      // `maxWidth` se aplica inline (ver appNameMaxWidth) — depende de
      // drawerWidth.
      color: "#FFFFFF",
      fontSize: font(16),
      fontWeight: "700",
    },
    appSubtitle: {
      color: "rgba(255,255,255,0.8)",
      fontSize: font(12),
      marginTop: verticalScale(1),
    },
    /** Tamaño fijo, mismo criterio que avatarContainer/avatarImage. */
    closeBtn: {
      width: 30,
      height: 30,
      // eslint-disable-next-line local/no-raw-numbers-in-stylesheet -- círculo (mitad de width/height fijos), no un radio de diseño
      borderRadius: 15,
      backgroundColor: "rgba(255,255,255,0.9)",
      alignItems: "center",
      justifyContent: "center",
    },
    scroll: { flex: 1 },
    section: {
      marginBottom: verticalScale(2),
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(12),
      borderRadius: RADIUS_MD,
      gap: scale(10),
      backgroundColor: "#F3F4F6",
    },
    sectionTitle: {
      flex: 1,
      fontSize: font(15),
      fontWeight: "600",
      color: "#374151",
    },
    sectionTitleActive: {
      color: "#2563EB",
    },
    submenu: {
      marginLeft: scale(8),
      marginBottom: verticalScale(4),
    },
    childItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingLeft: scale(28),
      paddingRight: scale(12),
      paddingVertical: verticalScale(11),
      borderRadius: RADIUS_SM,
      marginBottom: verticalScale(2),
      borderLeftWidth: 2,
      borderLeftColor: "transparent",
    },
    activeChildItem: {
      backgroundColor: "#EFF6FF",
      borderLeftColor: "#2563EB",
    },
    childText: {
      fontSize: font(14),
      color: "#6B7280",
    },
    activeChildText: {
      color: "#2563EB",
      fontWeight: "700",
    },
    userSection: {
      marginTop: verticalScale(8),
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
      paddingTop: verticalScale(4),
    },
    logoutItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingLeft: scale(38),
      paddingRight: scale(12),
      paddingVertical: verticalScale(11),
      borderRadius: RADIUS_SM,
      marginBottom: verticalScale(2),
      borderLeftWidth: 2,
      borderLeftColor: "#FECACA",
      backgroundColor: "#FEF2F2",
    },
    logoutBtnText: {
      fontSize: font(12),
      fontWeight: "700",
      color: "#DC2626",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    modalBox: {
      backgroundColor: "#fff",
      borderRadius: RADIUS_SM,
      padding: scale(24),
      width: "80%",
      // Único riesgo estructural real de este archivo (auditoría FASE A):
      // sin tope, en un tablet grande el diálogo de confirmar logout podía
      // llegar a 800-1000dp. Mismo valor/criterio que los modales de
      // SolicitarPermisoForm.tsx y punchinout.tsx.
      maxWidth: 400,
      elevation: 5,
    },
    modalMessage: {
      fontSize: font(14),
      color: "#444",
      marginBottom: verticalScale(24),
    },
    modalButtons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: scale(20),
    },
    modalCancel: {
      color: "#6B7280",
      fontWeight: "600",
      fontSize: font(14),
    },
    modalConfirm: {
      color: "#DC2626",
      fontWeight: "600",
      fontSize: font(14),
    },
  });
}

type DrawerStyles = ReturnType<typeof createStyles>;

interface SectionProps {
  section: MenuTree;
  onNavigate: (path: string) => void;
  pathname: string;
  styles: DrawerStyles;
}

function MenuSection({ section, onNavigate, pathname, styles }: SectionProps) {
  const [expanded, setExpanded] = useState(false);
  const sectionIcon = getIcon(section.parent.icon);
  const hasChildren = section.children.length > 0;
  const chevronRotation = useSharedValue(0);

  useEffect(() => {
    chevronRotation.value = withTiming(expanded ? 90 : 0, { duration: 200 });
  }, [expanded, chevronRotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  if (!hasChildren) {
    const isActive = pathname === section.parent.path;
    return (
      <Animated.View style={styles.section} layout={LinearTransition.duration(200)}>
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => onNavigate(section.parent.path)}
          activeOpacity={0.7}
        >
          <Ionicons name={sectionIcon} size={20} color="#2563EB" />
          <Text
            style={[styles.sectionTitle, isActive && styles.sectionTitleActive]}
          >
            {section.parent.name}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={styles.section} layout={LinearTransition.duration(200)}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Ionicons name={sectionIcon} size={20} color="#2563EB" />
        <Text style={styles.sectionTitle}>{section.parent.name}</Text>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </Animated.View>
      </TouchableOpacity>

      {expanded && (
        <Animated.View
          style={styles.submenu}
          entering={FadeInDown.duration(220).easing(Easing.out(Easing.quad))}
          exiting={FadeOutUp.duration(180).easing(Easing.in(Easing.quad))}
          layout={LinearTransition.duration(200)}
        >
          {section.children.map((child) => {
            const isActive = pathname === child.path;
            const childIcon = getIcon(child.icon);
            return (
              <TouchableOpacity
                key={child.id}
                style={[styles.childItem, isActive && styles.activeChildItem]}
                onPress={() => onNavigate(child.path)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={childIcon}
                  size={16}
                  color={isActive ? "#2563EB" : "#9CA3AF"}
                />
                <Text
                  style={[styles.childText, isActive && styles.activeChildText]}
                >
                  {child.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      )}
    </Animated.View>
  );
}

interface DrawerMenuProps {
  isVisible: boolean;
  onClose: () => void;
}

export default function DrawerMenu({ isVisible, onClose }: DrawerMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, menuTree, app, logout, school, urlColegio } = useSchoolStore();
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const { width, isTablet, scale, verticalScale, font } = useResponsive();

  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  /**
   * En teléfono, 78% del ancho tapa a 320dp igual que antes. En tablet el
   * tope sube a 380dp: con 320 fijo, un tablet de 1280dp landscape dejaba el
   * drawer en solo 25% del ancho, angosto para el criterio de Material
   * Design (256-320dp fue pensado para teléfono). No depende de
   * SlideInLeft/SlideOutLeft: Reanimated mide el View real al animar, no usa
   * este valor como parámetro.
   */
  const drawerWidth = useMemo(() => {
    const cap = isTablet ? 380 : 320;
    return Math.min(width * 0.78, cap);
  }, [width, isTablet]);
  const appNameMaxWidth = useMemo(() => drawerWidth - 110, [drawerWidth]);

  useEffect(() => {
    if (!isVisible) return;
    Storage.getItemAsync("photourl").then(setUserPhoto);
  }, [isVisible]);

  const handleNavigate = useCallback(
    (path: string) => {
      onClose();
      router.push(path as never);
    },
    [onClose, router],
  );

  const handleLogout = useCallback(() => {
  setLogoutModalVisible(true);
}, []);

const confirmLogout = useCallback(async () => {
  setLogoutModalVisible(false);
  onClose();
  await Storage.deleteItemAsync("token");
  await Storage.deleteItemAsync("user");
  await Storage.deleteItemAsync("menuItems");
  logout();
  router.replace("/login");
}, [logout, onClose, router]);
  if (!isVisible) return null;

  return (
    <View style={styles.overlay}>
      <AnimatedTouchable
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
        entering={FadeIn.duration(280).easing(Easing.out(Easing.cubic))}
        exiting={FadeOut.duration(220).easing(Easing.in(Easing.cubic))}
      />

      <Animated.View
        entering={SlideInLeft.duration(280).easing(Easing.out(Easing.cubic))}
        exiting={SlideOutLeft.duration(220).easing(Easing.in(Easing.cubic))}
        style={[styles.drawer, { width: drawerWidth }]}
      >
        <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.companyRow}>
            <View style={styles.companyLeft}>
              {school?.logo ? (
                <Image
                  source={{ uri: `${urlColegio}/${school.logo}` }}
                  style={styles.companyLogo}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.companyLogoFallback}>
                  <Ionicons name="business-outline" size={18} color="#fff" />
                </View>
              )}
              <Text
                style={[styles.companyName, { maxWidth: appNameMaxWidth }]}
                numberOfLines={1}
              >
                {school?.name ?? ""}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#374151" />
            </TouchableOpacity>
          </View>
          <View style={styles.headerLeft}>
            <View style={styles.avatarContainer}>
              {userPhoto ? (
                <Image
                  source={{
                    uri: `https://timecontrol.wsmax.net:8600/${userPhoto}`,
                  }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="person" size={22} color="#fff" />
              )}
            </View>
            <View>
              <Text
                style={[styles.appName, { maxWidth: appNameMaxWidth }]}
                numberOfLines={1}
              >
                {user?.user?.fullName ?? "Usuario"}
              </Text>
              <Text style={styles.appSubtitle} numberOfLines={1}>
                {user?.role?.name ?? ""}
              </Text>
            </View>
          </View>
        </View>

        {/* Menu */}
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingVertical: verticalScale(8),
            paddingHorizontal: scale(8),
          }}
        >
          {(menuTree as MenuTree[]).map((section) => (
            <MenuSection
              key={section.parent.id}
              section={section}
              onNavigate={handleNavigate}
              pathname={pathname}
              styles={styles}
            />
          ))}

          {/* ── Sesión ── */}
          {user && (
            <Animated.View
              style={styles.userSection}
              layout={LinearTransition.duration(200)}
            >
              <Modal
                transparent
                visible={logoutModalVisible}
                animationType="fade"
                onRequestClose={() => setLogoutModalVisible(false)}
              >
                <View style={styles.modalOverlay}>
                  <View style={styles.modalBox}>
                    <Text style={styles.logoutBtnText}>Cerrar Sesión</Text>
                    <Text style={styles.modalMessage}>
                      ¿Estás seguro de que deseas salir de la App?
                    </Text>
                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        onPress={() => setLogoutModalVisible(false)}
                      >
                        <Text style={styles.modalCancel}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={confirmLogout}>
                        <Text style={styles.modalConfirm}>Salir</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
              <TouchableOpacity
                style={styles.logoutItem}
                onPress={handleLogout}
                activeOpacity={0.75}
              >
                <Ionicons name="log-out-outline" size={18} color="#DC2626" />
                <Text style={styles.logoutBtnText}>Cerrar Sesión</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}
