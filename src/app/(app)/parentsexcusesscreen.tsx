import { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Picker } from "@react-native-picker/picker";

import {
  Calendar,
  Clock,
  MessageSquare,
  Paperclip,
  Plus,
  User,
} from "lucide-react-native";

import { getStudents } from "../../api/getStudents";

export default function ParentsExcusesScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [estudiante, setEstudiante] = useState("");
  const [estudiantes, setEstudiantes] = useState<any[]>([]);

  //  CARGAR ESTUDIANTES AUTOMÁTICO
  useEffect(() => {
    const cargarEstudiantes = async () => {
      const data = await getStudents();
      setEstudiantes(data);
    };

    cargarEstudiantes();
  }, []);

  return (
    <View style={styles.container}>
      {/* CONTADORES */}

      <View style={styles.stats}>
        <View style={[styles.card, { backgroundColor: "#e8f8ee" }]}>
          <Text style={styles.number}>0</Text>
          <Text style={styles.cardText}>Aprobadas</Text>
        </View>

        <View style={[styles.card, { backgroundColor: "#fff6dd" }]}>
          <Text style={styles.number}>0</Text>
          <Text style={styles.cardText}>Pendientes</Text>
        </View>

        <View style={[styles.card, { backgroundColor: "#ffeaea" }]}>
          <Text style={styles.number}>0</Text>
          <Text style={styles.cardText}>Rechazadas</Text>
        </View>
      </View>

      {/* BOTON */}

      <TouchableOpacity
        style={styles.button}
        onPress={() => setModalVisible(true)}
      >
        <Plus color="white" size={20} />
        <Text style={styles.buttonText}>Enviar Nueva Excusa</Text>
      </TouchableOpacity>

      {/* VACIO */}

      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No hay excusas registradas</Text>

        <Text style={styles.emptyText}>
          Presiona "Enviar Nueva Excusa" para crear una.
        </Text>
      </View>

      {/* MODAL */}

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.overlay}>
          <ScrollView style={styles.sheet}>
            <Text style={styles.title}>Nueva Excusa</Text>

            {/* ESTUDIANTE */}

            <View style={styles.section}>
              <View style={styles.labelRow}>
                <User size={18} color="#2563eb" />
                <Text style={styles.label}>Estudiante</Text>
              </View>

              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={estudiante}
                  onValueChange={(itemValue) => setEstudiante(itemValue)}
                >
                  {estudiantes.length === 0 ? (
                    <Picker.Item
                      label="No hay estudiantes disponibles"
                      value=""
                    />
                  ) : (
                    estudiantes.map((e) => (
                      <Picker.Item key={e.id} label={e.name} value={e.id} />
                    ))
                  )}
                </Picker>
              </View>
            </View>

            {/* MOTIVO */}

            <View style={styles.section}>
              <View style={styles.labelRow}>
                <MessageSquare size={18} color="#2563eb" />
                <Text style={styles.label}>Motivo de la excusa</Text>
              </View>

              <TextInput
                placeholder="Describe el motivo de la ausencia o tardanza"
                style={[styles.input, { height: 80 }]}
                multiline
              />
            </View>

            {/* PERIODO */}

            <View style={styles.section}>
              <View style={styles.labelRow}>
                <Calendar size={18} color="#2563eb" />
                <Text style={styles.label}>Período de ausencia</Text>
              </View>

              <Text style={styles.subLabel}>Fecha</Text>

              <View style={styles.dateInput}>
                <TextInput placeholder="dd/mm/aaaa" style={{ flex: 1 }} />
                <Calendar size={18} />
              </View>

              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Hora desde</Text>

                  <View style={styles.dateInput}>
                    <TextInput placeholder="--:--" style={{ flex: 1 }} />
                    <Clock size={18} />
                  </View>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Hora hasta</Text>

                  <View style={styles.dateInput}>
                    <TextInput placeholder="--:--" style={{ flex: 1 }} />
                    <Clock size={18} />
                  </View>
                </View>
              </View>
            </View>

            {/* DOCUMENTO */}

            <View style={styles.section}>
              <View style={styles.labelRow}>
                <Paperclip size={18} color="#2563eb" />
                <Text style={styles.label}>Documento de respaldo</Text>
              </View>

              <TouchableOpacity style={styles.fileInput}>
                <Text>Seleccionar archivo</Text>
              </TouchableOpacity>

              <Text style={styles.helpText}>
                Adjunta un certificado médico u otro documento si aplica
              </Text>
            </View>

            {/* BOTONES */}

            <View style={styles.buttons}>
              <TouchableOpacity style={styles.send}>
                <Text style={styles.sendText}>Enviar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancel}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
    backgroundColor: "#f3f4f6",
  },

  stats: {
    flexDirection: "row",
    marginBottom: 15,
  },

  card: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
    marginHorizontal: 3,
  },

  number: {
    fontWeight: "bold",
    fontSize: 18,
  },

  cardText: {
    fontSize: 12,
  },

  button: {
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },

  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyTitle: {
    fontWeight: "600",
    fontSize: 16,
  },

  emptyText: {
    fontSize: 13,
    color: "#6b7280",
  },

  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.3)",
  },

  sheet: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
  },

  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 15,
  },

  section: {
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },

  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },

  label: {
    fontWeight: "600",
  },

  subLabel: {
    fontSize: 12,
    marginTop: 6,
    marginBottom: 4,
  },

  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },

  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    justifyContent: "space-between",
  },

  timeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },

  pickerContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },

  fileInput: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },

  helpText: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
  },

  buttons: {
    flexDirection: "row",
    marginTop: 15,
    gap: 10,
  },

  send: {
    flex: 1,
    backgroundColor: "#2563eb",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },

  cancel: {
    flex: 1,
    backgroundColor: "#e5e7eb",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },

  sendText: {
    color: "#fff",
    fontWeight: "600",
  },

  cancelText: {
    fontWeight: "600",
  },
});
