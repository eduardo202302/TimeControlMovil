import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Clock, AlertTriangle, Lightbulb } from "lucide-react-native";

export default function Tardanza() {

  const [tardanzas, setTardanzas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);


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
        <ActivityIndicator size="large" style={{ marginTop: 50 }} />
      )}

      {/* CONTENIDO */}
      {!loading && total > 0 && (
        <>
          {/* ALERTA */}
          <View style={styles.alertBox}>
            <AlertTriangle size={20} color="#b45309" />
            <View style={{ marginLeft: 10 }}>
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

                <View style={{ flex: 1 }}>
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
        <View style={{ flexDirection: "row", alignItems: "center" }}>
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

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    padding: 15,
  },

  emptyBox: {
    marginTop: 50,
    alignItems: "center",
  },

  emptyText: {
    color: "gray",
  },

  alertBox: {
    flexDirection: "row",
    backgroundColor: "#fef3c7",
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#facc15",
  },

  alertTitle: {
    fontWeight: "bold",
    color: "#92400e",
  },

  alertText: {
    fontSize: 12,
    color: "#92400e",
  },

  statsContainer: {
    flexDirection: "row",
    marginBottom: 20,
  },

  cardLeft: {
    flex: 1,
    backgroundColor: "#d97706",
    padding: 15,
    borderRadius: 12,
    marginRight: 5,
    alignItems: "center",
  },

  cardRight: {
    flex: 1,
    backgroundColor: "#ea580c",
    padding: 15,
    borderRadius: 12,
    marginLeft: 5,
    alignItems: "center",
  },

  cardNumber: {
    fontSize: 24,
    color: "white",
    fontWeight: "bold",
  },

  cardText: {
    color: "white",
    fontSize: 12,
  },

  sectionTitle: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 10,
  },

  itemBox: {
    backgroundColor: "#fef9c3",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#fde047",
  },

  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  iconBox: {
    backgroundColor: "#fde68a",
    padding: 8,
    borderRadius: 8,
    marginRight: 10,
  },

  materia: {
    fontWeight: "bold",
  },

  fecha: {
    fontSize: 12,
    color: "gray",
  },

  badge: {
    alignItems: "flex-end",
  },

  badgeText: {
    backgroundColor: "#fde047",
    paddingHorizontal: 8,
    borderRadius: 10,
    fontSize: 12,
    fontWeight: "bold",
  },

  hora: {
    fontSize: 10,
    color: "gray",
  },

  motivoBox: {
    backgroundColor: "#e5e7eb",
    padding: 8,
    borderRadius: 8,
  },

  motivoText: {
    fontSize: 12,
  },

  tipsBox: {
    marginTop: 20,
    backgroundColor: "#dbeafe",
    padding: 12,
    borderRadius: 12,
  },

  tipsTitle: {
    fontWeight: "bold",
    color: "#1d4ed8",
  },

  tip: {
    fontSize: 12,
    marginTop: 3,
    color: "#1e3a8a",
  },

});