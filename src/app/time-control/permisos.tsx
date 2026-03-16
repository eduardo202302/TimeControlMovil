import React from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";

export default function Permisos() {

  const permisos = [
    { id: "1", tipo: "Médico", fecha: "15 Mar 2026", estado: "Pendiente" },
    { id: "2", tipo: "Personal", fecha: "10 Mar 2026", estado: "Aprobado" },
    { id: "3", tipo: "Vacaciones", fecha: "1 Mar 2026", estado: "Rechazado" }
  ];

  return (
    <View style={styles.container}>

      <FlatList
        data={permisos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (

          <View style={styles.card}>
            <Text style={styles.tipo}>{item.tipo}</Text>
            <Text>Fecha: {item.fecha}</Text>
            <Text>Estado: {item.estado}</Text>
          </View>

        )}
      />

    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    padding: 20
  },

  card: {
    backgroundColor: "#eee",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10
  },

  tipo: {
    fontWeight: "bold",
    fontSize: 16
  }

});