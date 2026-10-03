import { useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { AUTH_BRAND } from "@/constants/authColors";
import { useResponsive } from "@/constants/responsive";
import { useAuthTheme } from "@/hooks/useAuthTheme";
import { useSchoolStore } from "../../../store/useSchoolStore";

const LOGO_MINI = require("../../../assets/images/logos/logoMini.png");

/**
 * Encabezado de marca de las pantallas de acceso (login, recuperar clave,
 * registro, selector de compañía). Lee SOLO `lastCompany` — la compañía con
 * la que se entró por última vez en este dispositivo:
 *
 *   - con lastCompany y logo que carga → logo de la compañía + nombre
 *   - con lastCompany sin logo (o si falla la carga) → logoMini + nombre
 *   - sin lastCompany → logoMini + "FaceClass" (lo de siempre)
 *
 * El nombre va en el color de título del tema (useAuthTheme).
 */
export default function AuthBrandHeader() {
  const { verticalScale, font } = useResponsive();
  const theme = useAuthTheme();
  const styles = useMemo(
    () => createStyles(verticalScale, font),
    [verticalScale, font],
  );

  const lastCompany = useSchoolStore((state) => state.lastCompany);

  // Se recuerda QUÉ URI falló: si cambia el logo (otra compañía) se reintenta.
  const [failedLogoUri, setFailedLogoUri] = useState<string | null>(null);

  if (!lastCompany) {
    return (
      <View style={[styles.companies, styles.companiesAlone]}>
        <Image source={LOGO_MINI} style={styles.logoImage} />
        <Text style={styles.logoTitle}>FaceClass</Text>
      </View>
    );
  }

  const logoUri = lastCompany.logo
    ? `${lastCompany.urlColegio}/${lastCompany.logo}`
    : null;
  const showCompanyLogo = logoUri !== null && failedLogoUri !== logoUri;

  return (
    <View style={styles.logo}>
      {showCompanyLogo ? (
        <Image
          source={{ uri: logoUri }}
          style={styles.logoImage}
          resizeMode="contain"
          onError={() => setFailedLogoUri(logoUri)}
        />
      ) : (
        <Image source={LOGO_MINI} style={styles.logoImage} />
      )}
      <Text
        style={[styles.logoTitle, styles.companyName, { color: theme.titleColor }]}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {lastCompany.name}
      </Text>
    </View>
  );
}

function createStyles(
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    companies: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: verticalScale(10),
    },
    // Sin lastCompany no hay bloque de nombre debajo: la fila toma su margen
    // para que el contenido arranque a la misma altura.
    companiesAlone: { marginBottom: verticalScale(27) },
    logo: { alignItems: "center", marginBottom: verticalScale(27) },
    logoImage: { width: 100, height: 100 },
    logoTitle: {
      fontSize: font(20),
      fontWeight: "600",
      color: AUTH_BRAND,
      marginTop: verticalScale(6),
    },
    companyName: { textAlign: "center" },
  });
}
