import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Clock, AlertTriangle, Lightbulb } from "lucide-react-native";
import { RADIUS_LG, RADIUS_MD, RADIUS_SM, useResponsive } from "@/constants/responsive";

export default function Tardanza() {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const [tardanzas, setTardanzas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // AQUÍ LUEGO CONECTAS TU API
  const fetchTardanzas = async () => {
    try {
      setLoading(true);

      // const res = await fetch("https://tu-api.com/tardanzas");
      // const data = await res.json();
      // setTardanzas(data);

      // SIN DATOS (vacío por ahora)
      setTardanzas([]);

    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTardanzas();
  }, []);

  // 📊 cálculos dinámicos
  const total = tardanzas.length;

  const promedio =
    total > 0
      ? Math.round(
          tardanzas.reduce((acc, t) => acc + t.minutos, 0) / total
        )
      : 0;

  return (
    <ScrollView style={styles.container}>

      {/* SI NO HAY DATOS */}
      {!loading && total === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            No tienes tardanzas registradas
          </Text>
        </View>
      )}

      {/* LOADING */}
      {loading && (
        <ActivityIndicator size="large" style={styles.loadingIndicator} />
      )}

      {/* CONTENIDO */}
      {!loading && total > 0 && (
        <>
          {/* ALERTA */}
          <View style={styles.alertBox}>
            <AlertTriangle size={20} color="#b45309" />
            <View style={styles.alertTextWrap}>
              <Text style={styles.alertTitle}>Atención</Text>
              <Text style={styles.alertText}>
                Has acumulado {total} tardanzas.
              </Text>
            </View>
          </View>

          {/* CARDS */}
          <View style={styles.statsContainer}>

            <View style={styles.cardLeft}>
              <Clock size={20} color="white" />
              <Text style={styles.cardNumber}>{total}</Text>
              <Text style={styles.cardText}>Total Tardanzas</Text>
            </View>

            <View style={styles.cardRight}>
              <Clock size={20} color="white" />
              <Text style={styles.cardNumber}>{promedio}</Text>
              <Text style={styles.cardText}>Promedio (min)</Text>
            </View>

          </View>

          {/* LISTA */}
          <Text style={styles.sectionTitle}>Registro de Tardanzas</Text>

          {tardanzas.map((item, index) => (
            <View key={index} style={styles.itemBox}>

              <View style={styles.itemHeader}>
                <View style={styles.iconBox}>
                  <Clock size={18} color="#ca8a04" />
                </View>

                <View style={styles.itemInfo}>
                  <Text style={styles.materia}>{item.materia}</Text>
                  <Text style={styles.fecha}>{item.fecha}</Text>
                </View>

                <View style={styles.badge}>
                  <Text style={styles.badgeText}>+{item.minutos} min</Text>
                  <Text style={styles.hora}>{item.hora}</Text>
                </View>
              </View>

              <View style={styles.motivoBox}>
                <Text style={styles.motivoText}>
                  Motivo: {item.motivo}
                </Text>
              </View>

            </View>
          ))}
        </>
      )}

      {/* CONSEJOS (SIEMPRE VISIBLES) */}
      <View style={styles.tipsBox}>
        <View style={styles.tipsHeader}>
          <Lightbulb size={18} color="#1d4ed8" />
          <Text style={styles.tipsTitle}> Consejos para mejorar</Text>
        </View>

        <Text style={styles.tip}>• Establece alarmas 15 minutos antes</Text>
        <Text style={styles.tip}>• Prepara todo la noche anterior</Text>
        <Text style={styles.tip}>• Revisa rutas de transporte</Text>
      </View>

    </ScrollView>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#f3f4f6",
      padding: scale(15),
    },

    emptyBox: {
      marginTop: verticalScale(50),
      alignItems: "center",
    },

    emptyText: {
      color: "gray",
    },

    loadingIndicator: { marginTop: verticalScale(50) },

    alertBox: {
      flexDirection: "row",
      backgroundColor: "#fef3c7",
      padding: scale(12),
      borderRadius: RADIUS_LG,
      marginBottom: verticalScale(15),
      borderWidth: 1,
      borderColor: "#facc15",
    },

    alertTextWrap: { marginLeft: scale(10) },

    alertTitle: {
      fontWeight: "bold",
      color: "#92400e",
    },

    // 12 no coincide con ningún token — huérfano, font() directo.
    alertText: {
      fontSize: font(12),
      color: "#92400e",
    },

    statsContainer: {
      flexDirection: "row",
      marginBottom: verticalScale(20),
    },

    cardLeft: {
      flex: 1,
      backgroundColor: "#d97706",
      padding: scale(15),
      borderRadius: RADIUS_LG,
      marginRight: scale(5),
      alignItems: "center",
    },

    cardRight: {
      flex: 1,
      backgroundColor: "#ea580c",
      padding: scale(15),
      borderRadius: RADIUS_LG,
      marginLeft: scale(5),
      alignItems: "center",
    },

    // 24 está fuera del rango documentado de la escala (FONT_XS=11 a
    // FONT_XXL=25) — huérfano, font() directo, no se le asigna token.
    cardNumber: {
      fontSize: font(24),
      color: "white",
      fontWeight: "bold",
    },

    // 12 no coincide con ningún token — huérfano, font() directo.
    cardText: {
      color: "white",
      fontSize: font(12),
    },

    // 16 no coincide con ningún token — huérfano, font() directo.
    sectionTitle: {
      fontWeight: "bold",
      fontSize: font(16),
      marginBottom: verticalScale(10),
    },

    itemBox: {
      backgroundColor: "#fef9c3",
      borderRadius: RADIUS_LG,
      padding: scale(12),
      marginBottom: verticalScale(12),
      borderWidth: 1,
      borderColor: "#fde047",
    },

    itemHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: verticalScale(10),
    },

    iconBox: {
      backgroundColor: "#fde68a",
      padding: scale(8),
      borderRadius: RADIUS_SM,
      marginRight: scale(10),
    },

    itemInfo: { flex: 1 },

    materia: {
      fontWeight: "bold",
    },

    // 12 no coincide con ningún token — huérfano, font() directo.
    fecha: {
      fontSize: font(12),
      color: "gray",
    },

    badge: {
      alignItems: "flex-end",
    },

    // 12 no coincide con ningún token — huérfano, font() directo.
    badgeText: {
      backgroundColor: "#fde047",
      paddingHorizontal: scale(8),
      borderRadius: RADIUS_MD,
      fontSize: font(12),
      fontWeight: "bold",
    },

    // 10 está fuera del rango documentado de la escala (FONT_XS=11 a
    // FONT_XXL=25) — huérfano, font() directo, no se le asigna token.
    hora: {
      fontSize: font(10),
      color: "gray",
    },

    motivoBox: {
      backgroundColor: "#e5e7eb",
      padding: scale(8),
      borderRadius: RADIUS_SM,
    },

    // 12 no coincide con ningún token — huérfano, font() directo.
    motivoText: {
      fontSize: font(12),
    },

    tipsBox: {
      marginTop: verticalScale(20),
      backgroundColor: "#dbeafe",
      padding: scale(12),
      borderRadius: RADIUS_LG,
    },

    tipsHeader: { flexDirection: "row", alignItems: "center" },

    tipsTitle: {
      fontWeight: "bold",
      color: "#1d4ed8",
    },

    // 12 no coincide con ningún token — huérfano, font() directo.
    tip: {
      fontSize: font(12),
      marginTop: verticalScale(3),
      color: "#1e3a8a",
    },

  });
}
