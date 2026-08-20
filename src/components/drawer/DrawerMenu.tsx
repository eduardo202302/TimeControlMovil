import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import * as Storage from "../../utils/storage";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
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

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const { width } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(width * 0.78, 320);

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

interface SectionProps {
  section: MenuTree;
  onNavigate: (path: string) => void;
  pathname: string;
}

function MenuSection({ section, onNavigate, pathname }: SectionProps) {
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
  const { user, menuTree, app, logout } = useSchoolStore();
  const [userExpanded, setUserExpanded] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const userChevronRotation = useSharedValue(0);

  useEffect(() => {
    if (!isVisible) return;
    Storage.getItemAsync("photourl").then(setUserPhoto);
  }, [isVisible]);

  useEffect(() => {
    userChevronRotation.value = withTiming(userExpanded ? 90 : 0, {
      duration: 200,
    });
  }, [userExpanded, userChevronRotation]);

  const userChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${userChevronRotation.value}deg` }],
  }));

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
        style={styles.drawer}
      >
        <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
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
              <Text style={styles.appName} numberOfLines={1}>
                {user?.user?.fullName ?? "Usuario"}
              </Text>
              <Text style={styles.appSubtitle} numberOfLines={1}>
                {user?.role?.name ?? ""}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="#374151" />
          </TouchableOpacity>
        </View>

        {/* Menu */}
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 8 }}
        >
          {(menuTree as MenuTree[]).map((section) => (
            <MenuSection
              key={section.parent.id}
              section={section}
              onNavigate={handleNavigate}
              pathname={pathname}
            />
          ))}

          {/* ── Usuario colapsable ── */}
          {user && (
            <Animated.View
              style={styles.userSection}
              layout={LinearTransition.duration(200)}
            >
              <TouchableOpacity
                style={styles.userHeader}
                onPress={() => setUserExpanded(!userExpanded)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="person-circle-outline"
                  size={20}
                  color="#2563EB"
                />
                <Text style={styles.sectionTitle}>Sesión</Text>
                <Animated.View style={userChevronStyle}>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </Animated.View>
              </TouchableOpacity>

              {userExpanded && (
                <Animated.View
                  style={styles.userSubmenu}
                  entering={FadeInDown.duration(220).easing(Easing.out(Easing.quad))}
                  exiting={FadeOutUp.duration(180).easing(Easing.in(Easing.quad))}
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
                    <Ionicons
                      name="log-out-outline"
                      size={18}
                      color="#DC2626"
                    />
                    <Text>Cerrar Sesión</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}
            </Animated.View>
          )}
        </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 999,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    width: DRAWER_WIDTH,
    zIndex: 1,
    backgroundColor: "#FFFFFF",
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: "#2563EB",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  appName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    maxWidth: DRAWER_WIDTH - 110,
  },
  appSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  section: {
    marginBottom: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 10,
    backgroundColor: "#F3F4F6",
  },
  sectionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  sectionTitleActive: {
    color: "#2563EB",
  },
  submenu: {
    marginLeft: 8,
    marginBottom: 4,
  },
  childItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 28,
    paddingRight: 12,
    paddingVertical: 11,
    borderRadius: 8,
    marginBottom: 2,
    borderLeftWidth: 2,
    borderLeftColor: "transparent",
  },
  activeChildItem: {
    backgroundColor: "#EFF6FF",
    borderLeftColor: "#2563EB",
  },
  childText: {
    fontSize: 14,
    color: "#6B7280",
  },
  activeChildText: {
    color: "#2563EB",
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FAFAFA",
  },
  userSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 4,
  },
  userHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 10,
  },
  userSubmenu: {
    marginLeft: 8,
    marginBottom: 4,
  },
  logoutItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 38,
    paddingRight: 12,
    paddingVertical: 11,
    borderRadius: 8,
    marginBottom: 2,
    borderLeftWidth: 2,
    borderLeftColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2563EB",
  },
  footerInfo: { flex: 1 },
  footerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  footerRole: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 1,
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#DC2626",
  },

  modalOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.5)',
  justifyContent: 'center',
  alignItems: 'center',
},
modalBox: {
  backgroundColor: '#fff',
  borderRadius: 8,
  padding: 24,
  width: '80%',
  elevation: 5,
},
modalTitle: {
  fontSize: 18,
  fontWeight: '600',
  marginBottom: 12,
  color: '#111',
},
modalMessage: {
  fontSize: 14,
  color: '#444',
  marginBottom: 24,
},
modalButtons: {
  flexDirection: 'row',
  justifyContent: 'flex-end',
  gap: 20,
},
modalCancel: {
  color: '#6B7280',
  fontWeight: '600',
  fontSize: 14,
},
modalConfirm: {
  color: '#DC2626',
  fontWeight: '600',
  fontSize: 14,
},
});
