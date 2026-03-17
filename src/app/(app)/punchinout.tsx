import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Category = "Jornada" | "Almuerzo" | "Break";

const CATEGORY_ICONS: Record<Category, keyof typeof Ionicons.glyphMap> = {
  Jornada: "briefcase-outline",
  Almuerzo: "restaurant-outline",
  Break: "cafe-outline",
};

export default function PunchInOut() {
  const [now, setNow] = useState(new Date());
  const [selectedCategory, setSelectedCategory] = useState<Category>("Jornada");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const dateStr = now.toLocaleDateString("es-DO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Reloj */}
      <View style={styles.clockCard}>
        <View style={styles.clockRow}>
          <Ionicons
            name="time-outline"
            size={20}
            color="rgba(255,255,255,0.85)"
          />
          <Text style={styles.clockLabel}>Hora Actual</Text>
        </View>
        <Text style={styles.clockTime}>{timeStr}</Text>
        <Text style={styles.clockDate}>{dateStr}</Text>
      </View>

      {/* Categorías */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Seleccionar Categoría</Text>
        <View style={styles.categories}>
          {(["Jornada", "Almuerzo", "Break"] as Category[]).map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryBtn,
                selectedCategory === cat && styles.categoryBtnActive,
              ]}
              onPress={() => setSelectedCategory(cat)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={CATEGORY_ICONS[cat]}
                size={22}
                color={selectedCategory === cat ? "#fff" : "#6B7280"}
              />
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === cat && styles.categoryTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Botón registro */}
      <TouchableOpacity style={styles.registerBtn} activeOpacity={0.85}>
        <Ionicons name="log-in-outline" size={26} color="#fff" />
        <View style={styles.registerTextWrap}>
          <Text style={styles.registerBtnText}>Registrar Entrada</Text>
          <Text style={styles.registerBtnSub}>({selectedCategory})</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  clockCard: {
    backgroundColor: "#2563EB",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  clockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  clockLabel: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "500",
  },
  clockTime: {
    color: "#fff",
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 1,
    lineHeight: 48,
  },
  clockDate: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginTop: 4,
    textTransform: "capitalize",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  categories: { flexDirection: "row", gap: 10 },
  categoryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    gap: 6,
  },
  categoryBtnActive: { backgroundColor: "#2563EB" },
  categoryText: { fontSize: 12, fontWeight: "500", color: "#6B7280" },
  categoryTextActive: { color: "#fff" },
  registerBtn: {
    backgroundColor: "#16A34A",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  registerTextWrap: { alignItems: "center" },
  registerBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  registerBtnSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    marginTop: 2,
  },
});
