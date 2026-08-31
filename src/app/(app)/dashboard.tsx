import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { APP_BACKGROUND } from "@/constants/colors";
import { useResponsive } from "@/constants/responsive";
import { useSchoolStore } from "../../../store/useSchoolStore";

export default function Dashboard() {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { user } = useSchoolStore();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Contenido */}
      <View style={styles.content}>
        <Text style={styles.welcome}>
          Hola, {user?.user?.fullName ?? "Usuario"} 👋
        </Text>
        <Text style={styles.role}>{user?.role?.name}</Text>
      </View>
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
    content: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: verticalScale(8),
    },
    welcome: { fontSize: font(22), fontWeight: "700", color: "#111827" },
    role: { fontSize: font(15), color: "#6B7280" },
  });
}
