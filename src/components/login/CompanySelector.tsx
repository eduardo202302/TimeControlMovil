import { Ionicons } from "@expo/vector-icons";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useResponsive, RADIUS_XL, RADIUS_MD } from "@/constants/responsive";
import { SchoolUser } from "../../../types/typeStore/SchoolStoreType";

interface CompanySelectorProps {
  visible: boolean;
  companies: SchoolUser[];
  onSelect: (company: SchoolUser) => void;
  onCancel: () => void;
}

export default function CompanySelector({
  visible,
  companies,
  onSelect,
  onCancel,
}: CompanySelectorProps) {
  const { scale, verticalScale, font } = useResponsive();
  const styles = createStyles(scale, verticalScale, font);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Ionicons name="business-outline" size={22} color="#3c5fa6" />
            <Text style={styles.title}>Elige tu compañía</Text>
            <Text style={styles.subtitle}>
              Tu usuario pertenece a varias compañías. Selecciona con cuál
              deseas ingresar.
            </Text>
          </View>

          <View style={styles.list}>
            {companies.map((company) => (
              <TouchableOpacity
                key={company.schoolId ?? company.id}
                style={styles.companyItem}
                onPress={() => onSelect(company)}
                activeOpacity={0.7}
              >
                <View style={styles.companyInfo}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(company.school?.name ?? "C").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.companyName}>
                      {company.school?.name ?? "Compañía"}
                    </Text>
                    {company.role?.name ? (
                      <Text style={styles.companyRole}>{company.role.name}</Text>
                    ) : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9aa4b4" />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: scale(24),
    },
    card: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: "white",
      borderRadius: RADIUS_XL,
      padding: scale(20),
    },
    header: {
      alignItems: "center",
      marginBottom: verticalScale(18),
    },
    title: {
      fontSize: font(18),
      fontWeight: "700",
      color: "#333",
      marginTop: verticalScale(8),
    },
    subtitle: {
      fontSize: font(13),
      color: "#667",
      textAlign: "center",
      marginTop: verticalScale(6),
      lineHeight: 18,
    },
    list: {
      gap: scale(10),
    },
    companyItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: "#e0e6ef",
      borderRadius: RADIUS_MD,
      padding: scale(12),
      backgroundColor: "#f9fbff",
    },
    companyInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(12),
      flex: 1,
    },
    avatar: {
      width: 40,
      height: 40,
      // eslint-disable-next-line local/no-raw-numbers-in-stylesheet -- círculo (mitad de width/height fijos), no un radio de diseño
      borderRadius: 20,
      backgroundColor: "#3c5fa6",
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: "white",
      fontSize: font(18),
      fontWeight: "700",
    },
    companyName: {
      fontSize: font(15),
      fontWeight: "600",
      color: "#222",
    },
    companyRole: {
      fontSize: font(12),
      color: "#777",
      marginTop: verticalScale(2),
    },
    cancelBtn: {
      marginTop: verticalScale(16),
      paddingVertical: verticalScale(12),
      borderRadius: RADIUS_MD,
      borderWidth: 1,
      borderColor: "#ddd",
      alignItems: "center",
    },
    cancelText: {
      fontSize: font(15),
      color: "#555",
      fontWeight: "500",
    },
  });
}
