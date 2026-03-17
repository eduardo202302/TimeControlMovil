<<<<<<< HEAD
import { Stack, router, usePathname } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import { Calendar, Clock, Menu, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSchoolStore } from "../../store/useSchoolStore";

export default function RootLayout() {
  const pathname = usePathname();
  const { setSchool, setUrlColegio, setToken, setUser } = useSchoolStore();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState(["time-control"]);

  const toggleMenu = (menu: string) => {
    setExpandedMenus((prev) =>
      prev.includes(menu) ? prev.filter((m) => m !== menu) : [...prev, menu]
    );
  };

  const menuItems = [
    {
      id: "time-control",
      label: "Time Control",
      icon: Clock,
      submenu: [
        { path: "/home/entrada-salida", label: "Entrada y Salida" },
        { path: "/home/permisos", label: "Permisos" },
      ],
    },
    {
      id: "face-class",
      label: "Face Class",
      icon: Users,
      submenu: [
        { path: "/home/asistencia", label: "Asistencia" },
        { path: "/home/tardanza", label: "Tardanza" },
        { path: "/home/excusas", label: "Excusas" },
      ],
    },
    {
      id: "daykal",
      label: "DayKal",
      icon: Calendar,
      submenu: [{ path: "/home/citas", label: "Citas" }],
    },
  ];

  useEffect(() => {
    const checkAuthorization = async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
          return;
        }
      } catch (error) {
        console.log("Error checking update:", error);
      }

=======
import { Stack, router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { useSchoolStore } from "../../store/useSchoolStore";

export default function RootLayout() {
  const { setSchool, setUrlColegio, setToken, setMenuResolution } =
    useSchoolStore();

  useEffect(() => {
    const checkAuthorization = async () => {
>>>>>>> main
      const isAuthorized = await SecureStore.getItemAsync("isAuthorized");
      const schoolDataRaw = await SecureStore.getItemAsync("dataSchool");
      const urlColegio = await SecureStore.getItemAsync("urlColegio");
      const token = await SecureStore.getItemAsync("token");
      const userRaw = await SecureStore.getItemAsync("user");
<<<<<<< HEAD
=======
      const menuItemsRaw = await SecureStore.getItemAsync("menuItems");
>>>>>>> main

      if (schoolDataRaw) setSchool(JSON.parse(schoolDataRaw));
      if (urlColegio) setUrlColegio(urlColegio);
      if (token) setToken(token);
<<<<<<< HEAD
      if (userRaw) setUser(JSON.parse(userRaw));
=======

      if (isAuthorized === "true" && userRaw && menuItemsRaw) {
        const user = JSON.parse(userRaw);
        const menuItems = JSON.parse(menuItemsRaw);
        setMenuResolution(user, menuItems);
        const { initialPath } = useSchoolStore.getState();
        router.replace((initialPath ?? "/login") as never);
        return;
      }
>>>>>>> main

      if (isAuthorized !== "true") {
        router.replace("/login");
      }
    };

    checkAuthorization();
  }, []);

  return (
<<<<<<< HEAD
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={{ flex: 1, flexDirection: "row" }}>
        
        {/* SIDEBAR */}
        {sidebarOpen && (
          <View style={styles.sidebar}>
            <ScrollView>

              <View style={styles.sidebarHeader}>
                <Text style={styles.logo}>Time Flow</Text>
                <Text style={styles.subtitle}>Gestión de tiempo</Text>
              </View>

              {menuItems.map((item) => {
                const Icon = item.icon;
                const expanded = expandedMenus.includes(item.id);

                return (
                  <View key={item.id}>
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={() => toggleMenu(item.id)}
                    >
                      <Icon size={20} color="#2563eb" />
                      <Text style={styles.menuLabel}>{item.label}</Text>
                    </TouchableOpacity>

                    {expanded &&
                      item.submenu.map((sub) => (
                        <TouchableOpacity
                          key={sub.path}
                          style={[
                            styles.submenu,
                            pathname === sub.path && styles.activeSubmenu,
                          ]}
                          onPress={() => {
                          // router.push(sub.path);
                            setSidebarOpen(false);
                          }}
                        >
                          <Text style={styles.submenuText}>{sub.label}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* MAIN CONTENT */}
        <View style={{ flex: 1 }}>

          {/* HEADER */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => setSidebarOpen((prev) => !prev)}
            >
              <Menu size={26} color="#333" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Time Flow</Text>
          </View>

          {/* STACK NAVIGATION */}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="register" />
            <Stack.Screen name="home" />
          </Stack>

        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#dfe9ff",
  },

  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 240,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderColor: "#e5e7eb",
    zIndex: 1000,
  },

  sidebarHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },

  logo: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2563eb",
  },

  subtitle: {
    fontSize: 12,
    color: "#666",
  },

  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },

  menuLabel: {
    fontSize: 16,
    fontWeight: "500",
  },

  submenu: {
    paddingLeft: 45,
    paddingVertical: 10,
  },

  submenuText: {
    fontSize: 14,
    color: "#444",
  },

  activeSubmenu: {
    backgroundColor: "#eef2ff",
  },

  header: {
    height: 65,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 15,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },

});
=======
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="forgotPassword" options={{ headerShown: false }} />
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
    </Stack>
  );
}
>>>>>>> main
