import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSchoolStore } from "../../../store/useSchoolStore";
import { MenuTree } from "../../../utils/resolveRoute";

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
  const [expanded, setExpanded] = useState(true);
  const sectionIcon = getIcon(section.parent.icon);
  const hasChildren = section.children.length > 0;

  if (!hasChildren) {
    const isActive = pathname === section.parent.path;
    return (
      <View style={styles.section}>
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
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Ionicons name={sectionIcon} size={20} color="#2563EB" />
        <Text style={styles.sectionTitle}>{section.parent.name}</Text>
        <Ionicons
          name={expanded ? "chevron-down" : "chevron-forward"}
          size={16}
          color="#9CA3AF"
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.submenu}>
          {section.children.map((child) => {
            const isActive = pathname === child.path;
            return (
              <TouchableOpacity
                key={child.id}
                style={[styles.childItem, isActive && styles.activeChildItem]}
                onPress={() => onNavigate(child.path)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.childText, isActive && styles.activeChildText]}
                >
                  {child.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

interface DrawerMenuProps {
  isVisible: boolean;
  onClose: () => void;
}

export default function DrawerMenu({ isVisible, onClose }: DrawerMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, menuTree, app, urlColegio } = useSchoolStore();

  const handleNavigate = useCallback(
    (path: string) => {
      onClose();
      router.push(path as never);
    },
    [onClose, router],
  );

  if (!isVisible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      <SafeAreaView style={styles.drawer}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoContainer}>
              {user?.school?.logo && urlColegio ? (
                <Image
                  source={{ uri: `${urlColegio}/${user.school.logo}` }}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons name="time-outline" size={22} color="#fff" />
              )}
            </View>
            <View>
              <Text style={styles.appName}>Time Flow</Text>
              <Text style={styles.appSubtitle}>Gestión de tiempo</Text>
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
        </ScrollView>

        {/* Footer */}
        {user && (
          <View style={styles.footer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user.user?.fullName?.charAt(0)?.toUpperCase() ?? "U"}
              </Text>
            </View>
            <View style={styles.footerInfo}>
              <Text style={styles.footerName} numberOfLines={1}>
                {user.user?.fullName}
              </Text>
              <Text style={styles.footerRole} numberOfLines={1}>
                {user.role?.name}
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    flexDirection: "row",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  drawer: {
    width: DRAWER_WIDTH,
    backgroundColor: "#FFFFFF",
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
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
  logoContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  appName: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
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
    paddingLeft: 38,
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
});
