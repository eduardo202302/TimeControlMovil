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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
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
import { canChangeCompany } from "../../utils/chooseCompany";
import {
  CARD_BACKGROUND,
  ERROR_COLOR,
  ERROR_TINT_BACKGROUND,
  ERROR_TINT_BORDER,
  FIELD_DISABLED_BACKGROUND,
  FOOTER_BORDER,
  HEADER_NAVY,
  HEADER_TEXT,
  ONLINE_DOT,
  OVERLAY_BACKDROP,
  PRIMARY_COLOR,
  PRIMARY_TINT_50,
  TEXT_MUTED,
  TEXT_PLACEHOLDER,
  TEXT_SECONDARY,
} from "@/constants/colors";
import {
  RADIUS_MD,
  RADIUS_SM,
  RADIUS_2XL,
  RADIUS_PILL,
  useResponsive,
} from "@/constants/responsive";
import { SHADOW_LG } from "@/constants/shadows";
import { DIALOG_BOX, DIALOG_OVERLAY } from "@/styles/surfaces";

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
 * Los nombres del menú vienen del backend. Algunos traen el sufijo de la
 * app ("Perfil - Time Control"), que en el móvil sobra.
 */
function getLabel(name: string): string {
  return name?.replace(/\s*-\s*Time\s*Control\s*$/i, "") ?? "";
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
  insetTop: number,
) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      zIndex: 999,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: OVERLAY_BACKDROP,
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
      backgroundColor: CARD_BACKGROUND,
      // Offset positivo: la sombra cae hacia la derecha, sobre el backdrop.
      ...SHADOW_LG,
      shadowOffset: { width: 4, height: 0 },
    },
    /**
     * La SafeAreaView del panel no toma el borde superior: el header reserva
     * insetTop para que el navy llegue hasta arriba, detrás de la status bar.
     */
    header: {
      flexDirection: "column",
      backgroundColor: HEADER_NAVY,
      paddingTop: insetTop,
      borderBottomLeftRadius: RADIUS_2XL,
      borderBottomRightRadius: RADIUS_2XL,
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
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(14),
      paddingBottom: verticalScale(12),
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.18)",
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
      backgroundColor: CARD_BACKGROUND,
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
      color: HEADER_TEXT,
      fontSize: font(13),
      fontWeight: "700",
    },
    /**
     * Tamaño fijo a propósito: es iconografía (avatar de cabecera), no
     * contenido que necesite más espacio en pantalla grande — mismo
     * criterio que AVATAR_SIZE en punchinout.tsx.
     */
    avatarWrapper: { position: "relative" },
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
    /** Tamaño fijo, mismo criterio que avatarContainer/avatarImage. */
    statusDot: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 12,
      height: 12,
      // eslint-disable-next-line local/no-raw-numbers-in-stylesheet -- círculo (mitad de width/height fijos), no un radio de diseño
      borderRadius: 6,
      backgroundColor: ONLINE_DOT,
      borderWidth: 2,
      borderColor: HEADER_NAVY,
    },
    appName: {
      // `maxWidth` se aplica inline (ver appNameMaxWidth) — depende de
      // drawerWidth.
      color: HEADER_TEXT,
      fontSize: font(16),
      fontWeight: "700",
    },
    appSubtitle: {
      color: "rgba(255,255,255,0.8)",
      fontSize: font(12),
      marginTop: verticalScale(1),
    },
    /**
     * Rol + ID del usuario. `maxWidth` se aplica inline (ver
     * appNameMaxWidth): si no cabe, se trunca el rol, nunca el ID.
     */
    roleRow: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: scale(6),
      marginTop: verticalScale(4),
    },
    roleBadge: {
      backgroundColor: "rgba(255,255,255,0.18)",
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(2),
    },
    roleBadgeText: {
      color: HEADER_TEXT,
      fontSize: font(11),
      fontWeight: "600",
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
      backgroundColor: FIELD_DISABLED_BACKGROUND,
    },
    sectionTitle: {
      flex: 1,
      fontSize: font(15),
      fontWeight: "600",
      color: TEXT_SECONDARY,
    },
    sectionTitleActive: {
      color: PRIMARY_COLOR,
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
      backgroundColor: PRIMARY_TINT_50,
      borderLeftColor: PRIMARY_COLOR,
    },
    /**
     * Margen vertical negativo: el ícono (scale(18)) queda siempre más bajo
     * que la línea de texto para el layout, así el alto de la fila lo sigue
     * decidiendo el texto y no crece al agrandar el ícono.
     */
    childIcon: {
      marginVertical: -scale(3),
    },
    childText: {
      fontSize: font(14),
      color: TEXT_MUTED,
    },
    activeChildText: {
      color: PRIMARY_COLOR,
      fontWeight: "700",
    },
    userSection: {
      marginTop: verticalScale(8),
      borderTopWidth: 1,
      borderTopColor: FOOTER_BORDER,
      paddingTop: verticalScale(4),
    },
    /** Misma fila que logoutItem, en el tono de un ítem activo del menú. */
    changeCompanyItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingLeft: scale(38),
      paddingRight: scale(12),
      paddingVertical: verticalScale(11),
      borderRadius: RADIUS_SM,
      marginBottom: verticalScale(2),
      borderLeftWidth: 2,
      borderLeftColor: PRIMARY_COLOR,
      backgroundColor: PRIMARY_TINT_50,
    },
    changeCompanyText: {
      fontSize: font(12),
      fontWeight: "700",
      color: PRIMARY_COLOR,
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
      borderLeftColor: ERROR_TINT_BORDER,
      backgroundColor: ERROR_TINT_BACKGROUND,
    },
    logoutBtnText: {
      fontSize: font(12),
      fontWeight: "700",
      color: ERROR_COLOR,
    },
    modalOverlay: {
      ...DIALOG_OVERLAY,
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    modalBox: {
      ...DIALOG_BOX,
      padding: scale(24),
      width: "80%",
      // Único riesgo estructural real de este archivo (auditoría FASE A):
      // sin tope, en un tablet grande el diálogo de confirmar logout podía
      // llegar a 800-1000dp. Mismo valor/criterio que los modales de
      // SolicitarPermisoForm.tsx y punchinout.tsx.
      maxWidth: 400,
    },
    modalMessage: {
      fontSize: font(14),
      color: TEXT_SECONDARY,
      marginBottom: verticalScale(24),
    },
    modalButtons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: scale(20),
    },
    modalCancel: {
      color: TEXT_MUTED,
      fontWeight: "600",
      fontSize: font(14),
    },
    modalConfirm: {
      color: ERROR_COLOR,
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
  const { scale } = useResponsive();
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
          <Ionicons name={sectionIcon} size={20} color={PRIMARY_COLOR} />
          <Text
            style={[styles.sectionTitle, isActive && styles.sectionTitleActive]}
          >
            {getLabel(section.parent.name)}
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
        <Ionicons name={sectionIcon} size={20} color={PRIMARY_COLOR} />
        <Text style={styles.sectionTitle}>{getLabel(section.parent.name)}</Text>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-forward" size={16} color={TEXT_PLACEHOLDER} />
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
                  size={scale(18)}
                  color={isActive ? PRIMARY_COLOR : TEXT_MUTED}
                  style={styles.childIcon}
                />
                <Text
                  style={[styles.childText, isActive && styles.activeChildText]}
                >
                  {getLabel(child.name)}
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
  /**
   * "Cambiar Empresa". El selector vive en (app)/_layout: el drawer se
   * desmonta al cerrarse, así que no puede ser dueño de ese modal.
   */
  onChangeCompany?: () => void;
}

export default function DrawerMenu({
  isVisible,
  onClose,
  onChangeCompany,
}: DrawerMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, menuTree, app, logout, school, urlColegio } = useSchoolStore();
  const schoolUser = user?.user?.schoolUsers?.[0];
  const activeSchool = schoolUser?.school ?? school;
  // Mismo criterio que punchinout.tsx para el id del usuario.
  const userId = schoolUser?.id ?? user?.id;
  const roleName = user?.role?.name?.trim() ?? "";
  const showChangeCompany = !!onChangeCompany && canChangeCompany(user);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const { width, isTablet, scale, verticalScale, font } = useResponsive();
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () => createStyles(scale, verticalScale, font, insets.top),
    [scale, verticalScale, font, insets.top],
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
        <SafeAreaView style={{ flex: 1 }} edges={["left", "bottom"]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.companyRow}>
            <View style={styles.companyLeft}>
              {activeSchool?.logo ? (
                <Image
                  source={{ uri: `${urlColegio}/${activeSchool.logo}` }}
                  style={styles.companyLogo}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.companyLogoFallback}>
                  <Ionicons name="business-outline" size={18} color={HEADER_TEXT} />
                </View>
              )}
              <Text
                style={[styles.companyName, { maxWidth: appNameMaxWidth }]}
                numberOfLines={1}
              >
                {activeSchool?.name ?? ""}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={TEXT_SECONDARY} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerLeft}>
            <View style={styles.avatarWrapper}>
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
                  <Ionicons name="person" size={22} color={HEADER_TEXT} />
                )}
              </View>
              <View style={styles.statusDot} />
            </View>
            <View>
              <Text
                style={[styles.appName, { maxWidth: appNameMaxWidth }]}
                numberOfLines={1}
              >
                {user?.user?.fullName ?? "Usuario"}
              </Text>
              {(roleName || userId != null) && (
                <View style={[styles.roleRow, { maxWidth: appNameMaxWidth }]}>
                  {roleName ? (
                    <View style={[styles.roleBadge, { flexShrink: 1 }]}>
                      <Text style={styles.roleBadgeText} numberOfLines={1}>
                        {roleName}
                      </Text>
                    </View>
                  ) : null}
                  {userId != null && (
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText} numberOfLines={1}>
                        ID: {userId}
                      </Text>
                    </View>
                  )}
                </View>
              )}
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
              {showChangeCompany && (
                <TouchableOpacity
                  style={styles.changeCompanyItem}
                  onPress={onChangeCompany}
                  activeOpacity={0.75}
                >
                  <Ionicons name="sync-outline" size={18} color={PRIMARY_COLOR} />
                  <Text style={styles.changeCompanyText}>Cambiar Empresa</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.logoutItem}
                onPress={handleLogout}
                activeOpacity={0.75}
              >
                <Ionicons name="log-out-outline" size={18} color={ERROR_COLOR} />
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
