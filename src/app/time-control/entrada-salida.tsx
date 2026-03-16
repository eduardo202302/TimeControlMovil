import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LogIn, LogOut } from "lucide-react-native";

export default function EntradaSalida() {

  const [hora, setHora] = useState(new Date());
  const [entradaActiva, setEntradaActiva] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setHora(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const registrar = () => {
    setEntradaActiva(!entradaActiva);
  };

  return (
    <View style={styles.container}>

      <Text style={styles.hora}>
        {hora.toLocaleTimeString()}
      </Text>

      {!entradaActiva ? (

        <TouchableOpacity
          style={styles.btnEntrada}
          onPress={registrar}
        >
          <LogIn color="white" size={30} />
          <Text style={styles.textBtn}>Registrar Entrada</Text>
        </TouchableOpacity>

      ) : (

        <TouchableOpacity
          style={styles.btnSalida}
          onPress={registrar}
        >
          <LogOut color="white" size={30} />
          <Text style={styles.textBtn}>Registrar Salida</Text>
        </TouchableOpacity>

      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },

  hora: {
    fontSize: 40,
    marginBottom: 40,
    fontWeight: "bold"
  },

  btnEntrada: {
    backgroundColor: "green",
    padding: 20,
    borderRadius: 10
  },

  btnSalida: {
    backgroundColor: "red",
    padding: 20,
    borderRadius: 10
  },

  textBtn: {
    color: "white",
    marginTop: 10,
    fontWeight: "bold"
  }
});