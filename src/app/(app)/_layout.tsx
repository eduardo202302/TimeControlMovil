import { Ionicons } from "@expo/vector-icons";
import { Slot, router, usePathname } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
    Alert,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
    APP_BACKGROUND_V2,
    HEADER_BUTTON_BACKGROUND,
    HEADER_NAVY,
    HEADER_TEXT,
} from "@/constants/colors";
import { RADIUS_MD, useResponsive } from "@/constants/responsive";
import { SHADOW_MD } from "@/constants/shadows";
import DrawerMenu from "../../components/drawer/DrawerMenu";
import CompanySelector from "../../components/login/CompanySelector";
import { useSchoolStore } from "../../../store/useSchoolStore";
import {
    fetchUserCompanies,
    getActiveSchoolId,
    switchCompany,
    type CompanyOption,
} from "../../utils/chooseCompany";

const ROUTE_TITLES: Record<string, string> = {
  "/punchinout": "Registrar Acceso",
  "/attendancetaking": "Asistencia",
  "/adminattendancetaking": "Asistencia Adm.",
  "/tardiness": "Tardanzas",
  "/parentsexcusesscreen": "Excusas",
  "/timeoff": "Permisos",
  "/timeoffscreen": "Solicitar Permiso",
  "/mypermissions": "Mis Permisos",
  "/adminpunchinout": "Registrar Acceso ADM",
  "/permissions": "Consultar Permisos/Ausencias",
  "/excuses": "Excusas",
  "/myexcuses": "Mis Excusas",
  "/holidays": "Días Feriados",
  "/dashboard": "Dashboard",
  "/users": "Usuarios",
  "/students": "Estudiantes",
  "/teachers": "Docentes",
  "/parents": "Padres / Tutores",
  "/roles": "Roles",
  "/entities": "Empresa",
  "/unauthorized": "Sin acceso",
  "/reportfault": "Reportar Avería",
  "/followup": "Seguimiento",
};

export default function AppLayout() {
  const { scale, verticalScale, font } = useResponsive();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font, insets.top),
    [scale, verticalScale, font, insets.top],
  );

  const [drawerVisible, setDrawerVisible] = useState(false);
  const pathname = usePathname();
  const title = ROUTE_TITLES[pathname] ?? "Time Flow";

  // Empresa activa. Es el `key` del Slot: al cambiar de empresa TODAS las
  // pantallas se remontan y vuelven a cargar con el token nuevo (varias leen
  // su configuración una sola vez al montar — p. ej. punchinout —, así que
  // navegar no alcanza si la ruta de inicio es la misma).
  const activeSchoolId = useSchoolStore((state) =>
    getActiveSchoolId(state.user),
  );

  // ── Cambiar Empresa ── null = selector cerrado.
  const [companyPicker, setCompanyPicker] = useState<{
    loading: boolean;
    busy: boolean;
    companies: CompanyOption[];
  } | null>(null);

  // Cada apertura tiene su id: si el usuario cancela mientras carga la
  // lista, la respuesta tardía no reabre el selector.
  const pickerRequestRef = useRef(0);

  const openCompanyPicker = useCallback(async () => {
    const requestId = ++pickerRequestRef.current;
    setDrawerVisible(false);
    setCompanyPicker({ loading: true, busy: false, companies: [] });
    const result = await fetchUserCompanies();
    if (requestId !== pickerRequestRef.current) return;
    if (!result.ok) {
      setCompanyPicker(null);
      Alert.alert("Cambiar Empresa", result.message);
      return;
    }
    setCompanyPicker({ loading: false, busy: false, companies: result.companies });
  }, []);

  const closeCompanyPicker = useCallback(() => {
    // Con el cambio en curso no se cierra: ya no se puede deshacer a medias.
    setCompanyPicker((prev) => {
      if (prev?.busy) return prev;
      pickerRequestRef.current += 1;
      return null;
    });
  }, []);

  const handleSelectCompany = useCallback(
    async (company: CompanyOption) => {
      // La actual no se re-elige: cerrar es lo mismo y no remonta nada.
      if (company.schoolId === activeSchoolId) {
        setCompanyPicker(null);
        return;
      }
      setCompanyPicker((prev) => prev && { ...prev, busy: true });
      const result = await switchCompany(company.schoolId);
      if (!result.ok) {
        // Nada se persistió: la sesión sigue en la empresa actual.
        setCompanyPicker((prev) => prev && { ...prev, busy: false });
        Alert.alert("Cambiar Empresa", result.message);
        return;
      }
      setCompanyPicker(null);
      router.replace(result.path as never);
    },
    [activeSchoolId],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {/*
        Sin backgroundColor: con edge-to-edge (Android) la status bar es
        transparente y lo que se ve detrás es el header navy, que reserva
        insets.top por su cuenta.
      */}
      <StatusBar barStyle="light-content" />

      {/* Header compartido */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          style={styles.menuBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="menu" size={24} color={HEADER_TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Contenido de cada pantalla — se remonta al cambiar de empresa */}
      <Slot key={activeSchoolId ?? "none"} />

      {/* Drawer compartido */}
      {drawerVisible && (
        <DrawerMenu
          isVisible={drawerVisible}
          onClose={() => setDrawerVisible(false)}
          onChangeCompany={openCompanyPicker}
        />
      )}

      <CompanySelector
        visible={companyPicker !== null}
        companies={companyPicker?.companies ?? []}
        title="Seleccione una Empresa"
        subtitle="Selecciona la empresa con la que deseas continuar."
        currentSchoolId={activeSchoolId}
        disableInactive
        loading={companyPicker?.loading ?? false}
        busy={companyPicker?.busy ?? false}
        onSelect={handleSelectCompany}
        onCancel={closeCompanyPicker}
      />
    </SafeAreaView>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
  insetTop: number,
) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: APP_BACKGROUND_V2 },
    /**
     * El SafeAreaView no toma el borde superior: el header se estira detrás
     * de la status bar (insetTop) para que el navy llegue hasta arriba.
     * zIndex para que la sombra caiga sobre el contenido del Slot.
     */
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: HEADER_NAVY,
      paddingHorizontal: scale(16),
      paddingTop: insetTop + verticalScale(14),
      paddingBottom: verticalScale(14),
      ...SHADOW_MD,
      shadowColor: HEADER_NAVY,
      zIndex: 1,
    },
    /** Tamaño fijo: botón de ícono, mismo criterio que avatarContainer en DrawerMenu.tsx. */
    menuBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_MD,
      backgroundColor: HEADER_BUTTON_BACKGROUND,
    },
    /** Spacer simétrico al menuBtn — mantiene el título centrado en el header. */
    headerSpacer: { width: 40 },
    headerTitle: { fontSize: font(18), fontWeight: "700", color: HEADER_TEXT },
  });
}
