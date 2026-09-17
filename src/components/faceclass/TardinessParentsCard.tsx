import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CARD_BACKGROUND,
  CARD_BORDER,
  FOOTER_BORDER,
  PRIMARY_COLOR,
  PRIMARY_TINT_BACKGROUND,
  TEXT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/constants/colors";
import { RADIUS_2XL, RADIUS_PILL, useResponsive } from "@/constants/responsive";
import type { StudentParent } from "../../utils/tardinessRules";

/**
 * Tarjeta "Padres / Tutores" del panel de Tardanzas — replica el bloque de
 * representantes del StudentCard del webapp (parentsCount > 0 para el badge).
 *
 * Sin sistema de notificaciones en mobile: el badge de campana del webapp no
 * aplica y se omite. Colapsable con estado local (useState), sin persistencia.
 */
export default function TardinessParentsCard({
  contacts,
}: {
  /** `student.parents` del backend, sin transformar. */
  contacts: StudentParent[];
}) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );
  const [open, setOpen] = useState(true);

  const toggle = useCallback(() => setOpen((value) => !value), []);

  const call = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert(
        "No se pudo llamar",
        "No hay una aplicación de teléfono disponible en este dispositivo.",
      );
    });
  }, []);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <Ionicons name="people-outline" size={18} color={PRIMARY_COLOR} />
        <Text style={styles.title}>Padres / Tutores</Text>
        {contacts.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {contacts.length}{" "}
              {contacts.length === 1 ? "contacto" : "contactos"}
            </Text>
          </View>
        )}
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={TEXT_PLACEHOLDER}
          style={styles.chevron}
        />
      </TouchableOpacity>

      {open &&
        (contacts.length === 0 ? (
          <Text style={styles.emptyHint}>Sin contactos registrados</Text>
        ) : (
          <View style={styles.body}>
            {contacts.map((contact, index) => {
              const name = contact.fullName ?? "Sin nombre";
              const relationship = contact.parentRelationship?.trim();
              const label = relationship ? `${name} - ${relationship}` : name;
              const phone = contact.phone?.trim() ?? "";
              return (
                <View
                  key={typeof contact.id === "number" ? contact.id : index}
                  style={[
                    styles.contactRow,
                    index > 0 && styles.contactRowDivider,
                  ]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText} numberOfLines={1}>
                      {initialsOf(name)}
                    </Text>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName} numberOfLines={2}>
                      {label}
                    </Text>
                    {phone ? (
                      <TouchableOpacity
                        style={styles.phoneRow}
                        onPress={() => call(digitsOnly(phone))}
                        activeOpacity={0.7}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons
                          name="call-outline"
                          size={14}
                          color={PRIMARY_COLOR}
                        />
                        <Text style={styles.phoneText} numberOfLines={1}>
                          {formatPhone(phone)}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.phoneRow}>
                        <Ionicons
                          name="call-outline"
                          size={14}
                          color={TEXT_PLACEHOLDER}
                        />
                        <Text style={styles.noPhoneText}>
                          Sin registros
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
    </View>
  );
}

/**
 * Iniciales del avatar: primera letra de la primera palabra + primera de la
 * última; si el nombre es una sola palabra, sus 2 primeras letras.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0].charAt(0);
  const last = parts[parts.length - 1].charAt(0);
  return `${first}${last}`.toUpperCase();
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Lee el teléfono como viene y lo formatea solo si es un patrón conocido. */
export function formatPhone(phone: string): string {
  const digits = digitsOnly(phone);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    card: {
      backgroundColor: CARD_BACKGROUND,
      borderRadius: RADIUS_2XL,
      borderWidth: 1.5,
      borderColor: CARD_BORDER,
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(14),
      paddingBottom: verticalScale(16),
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      marginBottom: verticalScale(12),
    },
    title: {
      fontSize: font(15),
      fontWeight: "700",
      color: TEXT_PRIMARY,
      flexShrink: 1,
    },
    badge: {
      backgroundColor: PRIMARY_TINT_BACKGROUND,
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(3),
    },
    badgeText: { fontSize: font(11), fontWeight: "700", color: PRIMARY_COLOR },
    chevron: { marginLeft: "auto" },
    emptyHint: {
      fontSize: font(12),
      color: TEXT_SECONDARY,
      fontStyle: "italic",
    },
    body: { gap: verticalScale(4) },
    contactRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
      paddingVertical: verticalScale(8),
    },
    contactRowDivider: {
      borderTopWidth: 1,
      borderTopColor: FOOTER_BORDER,
    },
    avatar: {
      width: scale(40),
      height: scale(40),
      borderRadius: scale(20),
      backgroundColor: PRIMARY_TINT_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      fontSize: font(11),
      fontWeight: "700",
      color: PRIMARY_COLOR,
    },
    contactInfo: { flex: 1, gap: verticalScale(3) },
    contactName: {
      fontSize: font(13),
      fontWeight: "600",
      color: TEXT_PRIMARY,
    },
    phoneRow: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: scale(6),
    },
    phoneText: { fontSize: font(13), color: PRIMARY_COLOR },
    noPhoneText: { fontSize: font(12), color: TEXT_PLACEHOLDER },
  });
}