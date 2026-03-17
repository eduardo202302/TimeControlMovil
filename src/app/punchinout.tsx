import {
  Briefcase,
  Clock,
  Coffee,
  LogIn,
  LogOut,
  Utensils,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function EntradaSalida() {
  const [hora, setHora] = useState(new Date());
  const [entradaActiva, setEntradaActiva] = useState(false);
  const [categoria, setCategoria] = useState("jornada");

  useEffect(() => {
    const timer = setInterval(() => {
      setHora(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const registrar = () => {
    setEntradaActiva(!entradaActiva);
  };

  const formatearFecha = (fecha: Date) => {
    return fecha.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <View style={styles.container}>
      {/* TARJETA HORA */}
      <View style={styles.timeCard}>
        <View style={styles.timeHeader}>
          <Clock color="white" size={18} />
          <Text style={styles.timeLabel}>Hora Actual</Text>
        </View>

        <Text style={styles.hora}>{hora.toLocaleTimeString()}</Text>

        <Text style={styles.fecha}>{formatearFecha(hora)}</Text>
      </View>

      {/* SELECCIONAR CATEGORIA */}

      <View style={styles.categoriaCard}>
        <Text style={styles.tituloCategoria}>Seleccionar Categoría</Text>

        <View style={styles.categorias}>
          {/* JORNADA */}

          <TouchableOpacity
            style={[
              styles.categoriaBtn,
              categoria === "jornada" && styles.categoriaActiva,
            ]}
            onPress={() => setCategoria("jornada")}
          >
            <Briefcase
              size={20}
              color={categoria === "jornada" ? "white" : "#555"}
            />

            <Text
              style={
                categoria === "jornada"
                  ? styles.textoActivo
                  : styles.textoCategoria
              }
            >
              Jornada
            </Text>
          </TouchableOpacity>

          {/* ALMUERZO */}

          <TouchableOpacity
            style={[
              styles.categoriaBtn,
              categoria === "almuerzo" && styles.categoriaActiva,
            ]}
            onPress={() => setCategoria("almuerzo")}
          >
            <Utensils
              size={20}
              color={categoria === "almuerzo" ? "white" : "#555"}
            />

            <Text
              style={
                categoria === "almuerzo"
                  ? styles.textoActivo
                  : styles.textoCategoria
              }
            >
              Almuerzo
            </Text>
          </TouchableOpacity>

          {/* BREAK */}

          <TouchableOpacity
            style={[
              styles.categoriaBtn,
              categoria === "break" && styles.categoriaActiva,
            ]}
            onPress={() => setCategoria("break")}
          >
            <Coffee
              size={20}
              color={categoria === "break" ? "white" : "#555"}
            />

            <Text
              style={
                categoria === "break"
                  ? styles.textoActivo
                  : styles.textoCategoria
              }
            >
              Break
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* BOTON REGISTRAR */}

      {!entradaActiva ? (
        <TouchableOpacity style={styles.btnEntrada} onPress={registrar}>
          <LogIn color="white" size={26} />
          <Text style={styles.textBtn}>Registrar Entrada</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.btnSalida} onPress={registrar}>
          <LogOut color="white" size={26} />
          <Text style={styles.textBtn}>Registrar Salida</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb",
    padding: 20,
  },

  timeCard: {
    backgroundColor: "#2563eb",
    padding: 22,
    borderRadius: 18,
    marginBottom: 20,
  },

  timeHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 6,
  },

  timeLabel: {
    color: "white",
    fontSize: 16,
  },

  hora: {
    color: "white",
    fontSize: 36,
    fontWeight: "bold",
  },

  fecha: {
    color: "#dbeafe",
    marginTop: 5,
  },

  categoriaCard: {
    backgroundColor: "white",
    padding: 18,
    borderRadius: 15,
    marginBottom: 25,
  },

  tituloCategoria: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 14,
  },

  categorias: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  categoriaBtn: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  categoriaActiva: {
    backgroundColor: "#2563eb",
  },

  textoCategoria: {
    color: "#333",
  },

  textoActivo: {
    color: "white",
    fontWeight: "600",
  },

  btnEntrada: {
    backgroundColor: "#22c55e",
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },

  btnSalida: {
    backgroundColor: "#ef4444",
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },

  textBtn: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
});
