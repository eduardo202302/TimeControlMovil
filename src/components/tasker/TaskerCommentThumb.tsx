import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CARD_BORDER, PRIMARY_700, PRIMARY_TINT_BACKGROUND } from "@/constants/colors";
import { RADIUS_MD } from "@/constants/responsive";
import { getAttachmentTypeLabel, getCommentAttachmentKind } from "../../utils/taskerRules";

interface TaskerCommentThumbProps {
  /** data-URI local o URL del servidor (buildTaskrFileUrl). */
  uri: string;
  name: string;
  onOpen: (uri: string) => void;
}

/**
 * Miniatura de adjunto de un comentario (lista y formulario):
 * - imagen (local o del servidor) → la imagen real, abre el visor;
 * - video → ícono "play"; del servidor se abre fuera de la app;
 * - cualquier otro archivo → ícono de documento + extensión (PDF, DOCX…);
 *   del servidor se abre fuera de la app.
 * Lo local que no es imagen no se abre. Nada que no sea imagen va al visor.
 */
export default function TaskerCommentThumb({ uri, name, onOpen }: TaskerCommentThumbProps) {
  const kind = getCommentAttachmentKind(uri);
  if (kind === "image" || kind === "remoteImage") {
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

  const isVideo = kind === "video" || kind === "remoteVideo";
  const label = isVideo ? "" : getAttachmentTypeLabel(uri, name);
  const content = isVideo ? (
    <Ionicons name="play" size={22} color={PRIMARY_700} />
  ) : (
    <>
      <Ionicons name="document-outline" size={label ? 18 : 22} color={PRIMARY_700} />
      {!!label && (
        <Text style={styles.ext} numberOfLines={1}>
          {label}
        </Text>
      )}
    </>
  );
  const description = isVideo ? `Video ${name}` : `${label ? `${label} ` : ""}${name}`;

  if (kind === "remoteVideo" || kind === "remoteFile") {
    return (
      <TouchableOpacity
        style={styles.thumb}
        onPress={() => Linking.openURL(uri).catch(() => undefined)}
        accessibilityLabel={`Abrir ${description}`}
        activeOpacity={0.8}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.thumb} accessibilityLabel={description}>
      {content}
    </View>
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
  // Extensión bajo el ícono de documento ("PDF", "DOCX").
  // eslint-disable-next-line local/no-raw-numbers-in-stylesheet -- dentro de la miniatura de 56×56 fija (no escala), igual que su ícono
  ext: { marginTop: 2, fontSize: 10, fontWeight: "700", color: PRIMARY_700 },
});
