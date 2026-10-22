import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React from "react";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";
import { CARD_BORDER, PRIMARY_700, PRIMARY_TINT_BACKGROUND } from "@/constants/colors";
import { RADIUS_MD } from "@/constants/responsive";
import { getCommentAttachmentKind } from "../../utils/taskerRules";

interface TaskerCommentThumbProps {
  /** data-URI local o URL del servidor (buildTaskrFileUrl). */
  uri: string;
  name: string;
  onOpen: (uri: string) => void;
}

/**
 * Miniatura de adjunto de un comentario (lista y formulario): imagen (local o
 * del servidor) → la imagen real, abre el visor; PDF local → ícono, no se
 * abre; PDF del servidor → ícono, se abre fuera de la app.
 */
export default function TaskerCommentThumb({ uri, name, onOpen }: TaskerCommentThumbProps) {
  const kind = getCommentAttachmentKind(uri);
  if (kind === "file") {
    return (
      <View style={styles.thumb} accessibilityLabel={name}>
        <Ionicons name="document-outline" size={22} color={PRIMARY_700} />
      </View>
    );
  }
  if (kind === "remoteFile") {
    return (
      <TouchableOpacity
        style={styles.thumb}
        onPress={() => Linking.openURL(uri).catch(() => undefined)}
        accessibilityLabel={`Abrir ${name}`}
        activeOpacity={0.8}
      >
        <Ionicons name="document-outline" size={22} color={PRIMARY_700} />
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      style={styles.thumb}
      onPress={() => onOpen(uri)}
      accessibilityLabel={`Ver ${name}`}
      activeOpacity={0.8}
    >
      <Image source={{ uri }} style={styles.fill} resizeMode="cover" />
    </TouchableOpacity>
  );
}

// Tamaño fijo (no escala): la comparten la tarjeta y el formulario.
const styles = StyleSheet.create({
  // Miniatura de adjunto: 56×56 fijo, igual que el mockup.
  thumb: {
    width: 56,
    height: 56,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: RADIUS_MD,
    backgroundColor: PRIMARY_TINT_BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
  },
  // Adjunto de imagen (data-URI o URL): la imagen real llena la miniatura.
  fill: { width: "100%", height: "100%", borderRadius: RADIUS_MD },
});
