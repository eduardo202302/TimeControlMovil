import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  APP_BACKGROUND_V2,
  ON_PRIMARY,
  PRIMARY_COLOR,
  SECTION_ICON_COLOR,
  TEXT_BODY,
} from "@/constants/colors";
import { MAX_CONTENT_WIDTH, useResponsive } from "@/constants/responsive";
import SectionIcon from "@/components/ui/SectionIcon";
import { CARD_FORM, FOOTER_BTN_SAVE } from "@/styles/surfaces";

interface TaskerBlockedStateProps {
  /** Ícono y tono del cuadrito; sin ícono (loading) se muestra el spinner. */
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: React.ComponentProps<typeof SectionIcon>["tone"];
  message: string;
  /** Spinner en lugar del ícono (buscando la ubicación). */
  loading?: boolean;
  action?: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void };
}

/**
 * Estado de pantalla completa de Tasker (Reportar y Seguimiento): ocupa el
 * lugar del formulario o la vista cuando no se pueden mostrar.
 */
export default function TaskerBlockedState({
  icon = "alert-circle-outline",
  tone = "amber",
  message,
  loading = false,
  action,
}: TaskerBlockedStateProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.card} accessibilityRole="alert">
        {loading ? (
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        ) : (
          <SectionIcon tone={tone} size={scale(52)}>
            <Ionicons name={icon} size={28} color={SECTION_ICON_COLOR} />
          </SectionIcon>
        )}
        <Text style={styles.message}>{message}</Text>
        {action && (
          <TouchableOpacity style={styles.button} onPress={action.onPress} activeOpacity={0.8}>
            {action.icon && <Ionicons name={action.icon} size={18} color={ON_PRIMARY} />}
            <Text style={styles.buttonText}>{action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: APP_BACKGROUND_V2,
      justifyContent: "center",
      padding: scale(16),
    },
    card: {
      ...CARD_FORM,
      alignItems: "center",
      gap: verticalScale(16),
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(28),
      maxWidth: MAX_CONTENT_WIDTH,
      width: "100%",
      alignSelf: "center",
    },
    message: {
      fontSize: font(15),
      lineHeight: font(22),
      color: TEXT_BODY,
      textAlign: "center",
    },
    button: {
      ...FOOTER_BTN_SAVE,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(8),
      minHeight: verticalScale(48),
      alignSelf: "stretch",
    },
    buttonText: { fontSize: font(15), fontWeight: "700", color: ON_PRIMARY },
  });
}
