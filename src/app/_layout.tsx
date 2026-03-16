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
      prev.includes(menu) ? prev.filter((m) => m !== menu) : [...prev, menu],
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

      const isAuthorized = await SecureStore.getItemAsync("isAuthorized");
      const schoolDataRaw = await SecureStore.getItemAsync("dataSchool");
      const urlColegio = await SecureStore.getItemAsync("urlColegio");
      const token = await SecureStore.getItemAsync("token");
      const userRaw = await SecureStore.getItemAsync("user");

      if (schoolDataRaw) setSchool(JSON.parse(schoolDataRaw));
      if (urlColegio) setUrlColegio(urlColegio);
      if (token) setToken(token);
      if (userRaw) setUser(JSON.parse(userRaw));

      if (isAuthorized !== "true") {
        router.replace("/login");
      }
    };

    checkAuthorization();
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#dfe9ff" }}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={{ flex: 1, flexDirection: "row" }}>
          {/* Sidebar */}
          {sidebarOpen && (
            <View style={styles.sidebar}>
              <ScrollView>
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
                            //onPress={() => router.push(sub.path)}
                          >
                            <Text>{sub.label}</Text>
                          </TouchableOpacity>
                        ))}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Main Area */}
          <View style={{ flex: 1 }}>
            {/* Top Bar */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => setSidebarOpen(!sidebarOpen)}>
                <Menu size={24} color="#333" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Time Flow</Text>
            </View>

            {/* Navigation */}
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="register" />
              <Stack.Screen name="home" />
            </Stack>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 220,
    backgroundColor: "white",
    borderRightWidth: 1,
    borderColor: "#eee",
  },
  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  submenu: {
    paddingLeft: 40,
    paddingVertical: 8,
  },
  activeSubmenu: {
    backgroundColor: "#eef2ff",
  },
  header: {
    height: 60,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#dfe9ff",
  },
});
