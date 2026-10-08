import React, { useMemo } from "react";
import { Image, Modal, StyleSheet, TouchableOpacity } from "react-native";
import { OVERLAY_VIEWER } from "@/constants/colors";
import { RADIUS_LG, useResponsive } from "@/constants/responsive";

interface ImageViewerModalProps {
  /** Imagen abierta a pantalla completa, o null para cerrarlo. */
  uri: string | null;
  onClose: () => void;
}

/**
 * Visor de imagen a pantalla completa: fondo OVERLAY_VIEWER, la imagen en
 * `contain` y un toque en cualquier parte lo cierra. Extraído tal cual de
 * PermissionDetailView / ExcuseCrudModal para reusarlo en el historial de
 * ponches.
 */
export default function ImageViewerModal({ uri, onClose }: ImageViewerModalProps) {
  const { scale } = useResponsive();
  const styles = useMemo(() => createStyles(scale), [scale]);

  return (
    <Modal
      visible={uri !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.previewOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        {!!uri && (
          <Image
            source={{ uri }}
            style={styles.previewImage}
            resizeMode="contain"
          />
        )}
      </TouchableOpacity>
    </Modal>
  );
}

function createStyles(scale: (size: number) => number) {
  return StyleSheet.create({
    previewOverlay: {
      flex: 1,
      backgroundColor: OVERLAY_VIEWER,
      alignItems: "center",
      justifyContent: "center",
      padding: scale(12),
    },
    previewImage: { width: "100%", height: "100%", borderRadius: RADIUS_LG },
  });
}
