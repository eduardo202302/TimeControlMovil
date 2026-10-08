import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { RADIUS_LG, RADIUS_PILL, useResponsive } from "@/constants/responsive";
import {
  AUTH_BRAND,
  AUTH_INPUT_BACKGROUND,
  AUTH_INPUT_BORDER,
  AUTH_INPUT_ICON,
  AUTH_LABEL,
} from "@/constants/authColors";
import {
  ERROR_COLOR,
  ERROR_TINT_BACKGROUND,
  OUTCOME_OK_BACKGROUND,
  SUCCESS_ACCENT,
} from "@/constants/colors";
import { DIALOG_OVERLAY, POPUP_CARD } from "@/styles/surfaces";
import { useAuthTheme } from "@/hooks/useAuthTheme";
import type { AuthTheme } from "../../utils/authThemeRules";
import type { CompanyOption } from "../../utils/chooseCompany";
import AuthBrandHeader from "./AuthBrandHeader";

interface CompanySelectorProps<T extends CompanyOption> {
  visible: boolean;
  companies: T[];
  onSelect: (company: T) => void;
  onCancel: () => void;
  /** Por defecto, los textos del login. */
  title?: string;
  subtitle?: string;
  /** Empresa de la sesión actual → pill "Actual" (Cambiar Empresa). */
  currentSchoolId?: number | null;
  /**
   * Deshabilita y marca "Inactiva" las que traen `isActive === false`. Solo
   * Cambiar Empresa: en el login `isActive` es el del schoolUser y nunca
   * deshabilitó nada.
   */
  disableInactive?: boolean;
  /** Spinner en lugar de la lista (mientras llega GET /users/schools). */
  loading?: boolean;
  /** Bloquea los toques mientras se procesa la empresa elegida. */
  busy?: boolean;
}

const DEFAULT_SUBTITLE =
  "Tu usuario pertenece a varias compañías. Selecciona con cuál deseas ingresar.";

export default function CompanySelector<T extends CompanyOption>({
  visible,
  companies,
  onSelect,
  onCancel,
  title = "Elige tu compañía",
  subtitle = DEFAULT_SUBTITLE,
  currentSchoolId = null,
  disableInactive = false,
  loading = false,
  busy = false,
}: CompanySelectorProps<T>) {
  const { scale, verticalScale, font } = useResponsive();
  const theme = useAuthTheme();
  const styles = createStyles(scale, verticalScale, font, theme);

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
            <AuthBrandHeader />
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={AUTH_BRAND} style={styles.loader} />
          ) : (
            <View style={styles.list}>
              {companies.map((company) => {
                // Mismo criterio que CompanyCard del webapp: "Inactiva" gana a
                // "Actual", y una inactiva no se puede elegir.
                const isInactive = disableInactive && company.isActive === false;
                const isCurrent =
                  !isInactive &&
                  currentSchoolId != null &&
                  company.schoolId === currentSchoolId;
                return (
                  <TouchableOpacity
                    key={company.schoolId ?? company.id}
                    style={[
                      styles.companyItem,
                      isInactive && styles.companyItemDisabled,
                    ]}
                    onPress={() => onSelect(company)}
                    disabled={isInactive || busy}
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
                    {isInactive ? (
                      <View style={[styles.pill, styles.pillInactive]}>
                        <Ionicons name="ban-outline" size={12} color={ERROR_COLOR} />
                        <Text style={[styles.pillText, { color: ERROR_COLOR }]}>
                          Inactiva
                        </Text>
                      </View>
                    ) : isCurrent ? (
                      <View style={[styles.pill, styles.pillCurrent]}>
                        <Ionicons name="home-outline" size={12} color={SUCCESS_ACCENT} />
                        <Text style={[styles.pillText, { color: SUCCESS_ACCENT }]}>
                          Actual
                        </Text>
                      </View>
                    ) : null}
                    <Ionicons name="chevron-forward" size={18} color={AUTH_INPUT_ICON} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

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
  theme: AuthTheme,
) {
  return StyleSheet.create({
    backdrop: {
      ...DIALOG_OVERLAY,
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: scale(24),
    },
    card: {
      ...POPUP_CARD,
      width: "100%",
      maxWidth: 400,
      padding: scale(20),
    },
    header: {
      alignItems: "center",
      marginBottom: verticalScale(18),
    },
    title: {
      fontSize: font(18),
      fontWeight: "700",
      color: theme.titleColor,
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
      borderRadius: RADIUS_LG,
      padding: scale(12),
      backgroundColor: AUTH_INPUT_BACKGROUND,
    },
    /** Misma opacidad que .disabledContainer de CompanyCard en el webapp. */
    companyItemDisabled: { opacity: 0.7 },
    loader: { marginVertical: verticalScale(24) },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(4),
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(2),
      marginRight: scale(6),
    },
    pillCurrent: { backgroundColor: OUTCOME_OK_BACKGROUND },
    pillInactive: { backgroundColor: ERROR_TINT_BACKGROUND },
    pillText: { fontSize: font(11), fontWeight: "600" },
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
      backgroundColor: AUTH_BRAND,
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
      borderRadius: RADIUS_LG,
      borderWidth: 1,
      borderColor: AUTH_INPUT_BORDER,
      alignItems: "center",
    },
    cancelText: {
      fontSize: font(15),
      color: AUTH_LABEL,
      fontWeight: "500",
    },
  });
}
