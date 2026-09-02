import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
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
import { APP_BACKGROUND } from "@/constants/colors";
import {
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_SM,
  useResponsive,
} from "@/constants/responsive";

export default function ParentsExcusesScreen() {
  const { scale, verticalScale, font } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const [modalVisible, setModalVisible] = useState(false);
  const [estudiante, setEstudiante] = useState("");
  const [estudiantes, setEstudiantes] = useState<any[]>([]);

  // ✅ CARGAR ESTUDIANTES AUTOMÁTICO
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
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={0}
            style={{ flex: 1 }}
          >
            <ScrollView style={styles.sheet} keyboardShouldPersistTaps="handled">
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
                  style={[styles.input, styles.textarea]}
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
                  <TextInput placeholder="dd/mm/aaaa" style={styles.dateInputField} />
                  <Calendar size={18} />
                </View>

                <View style={styles.timeRow}>
                  <View style={styles.timeCol}>
                    <Text style={styles.subLabel}>Hora desde</Text>

                    <View style={styles.dateInput}>
                      <TextInput placeholder="--:--" style={styles.dateInputField} />
                      <Clock size={18} />
                    </View>
                  </View>

                  <View style={styles.timeCol}>
                    <Text style={styles.subLabel}>Hora hasta</Text>

                    <View style={styles.dateInput}>
                      <TextInput placeholder="--:--" style={styles.dateInputField} />
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
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
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
      padding: scale(15),
      backgroundColor: "#f3f4f6",
    },

    stats: {
      flexDirection: "row",
      marginBottom: verticalScale(15),
    },

    card: {
      flex: 1,
      padding: scale(10),
      borderRadius: RADIUS_MD,
      alignItems: "center",
      marginHorizontal: scale(3),
    },

    number: {
      fontWeight: "bold",
      fontSize: font(18),
    },

    cardText: {
      fontSize: font(12),
    },

    button: {
      backgroundColor: "#2563eb",
      padding: scale(14),
      borderRadius: RADIUS_LG,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: scale(10),
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
      fontSize: font(16),
    },

    emptyText: {
      fontSize: font(13),
      color: "#6b7280",
    },

    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      // Necesario para que `maxWidth` en `sheet` centre en tablet en vez de
      // pegarse a la izquierda (mismo patrón que modalOverlay en DrawerMenu.tsx).
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.3)",
    },

    sheet: {
      backgroundColor: "#fff",
      padding: scale(20),
      // Único riesgo estructural real de este archivo (auditoría FASE A): sin
      // tope, el bottom sheet se estira a pantalla completa en tablet. Mismo
      // valor/criterio que modalBox en DrawerMenu.tsx.
      width: "100%",
      maxWidth: 400,
      // 25 no coincide con ningún RADIUS_* (entre LG=12 y 2XL=20 y 3XL=32) —
      // huérfano, scale() directo.
      borderTopLeftRadius: scale(25),
      borderTopRightRadius: scale(25),
    },

    title: {
      fontSize: font(18),
      fontWeight: "600",
      marginBottom: verticalScale(15),
    },

    section: {
      backgroundColor: APP_BACKGROUND,
      padding: scale(12),
      borderRadius: RADIUS_MD,
      marginBottom: verticalScale(12),
    },

    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      marginBottom: verticalScale(6),
    },

    label: {
      fontWeight: "600",
    },

    subLabel: {
      fontSize: font(12),
      marginTop: verticalScale(6),
      marginBottom: verticalScale(4),
    },

    input: {
      backgroundColor: "#fff",
      borderRadius: RADIUS_SM,
      padding: scale(10),
      borderWidth: 1,
      borderColor: "#ddd",
    },

    textarea: { height: verticalScale(80) },

    dateInput: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#fff",
      borderRadius: RADIUS_SM,
      padding: scale(10),
      borderWidth: 1,
      borderColor: "#ddd",
      justifyContent: "space-between",
    },

    dateInputField: { flex: 1 },

    timeRow: {
      flexDirection: "row",
      gap: scale(10),
      marginTop: verticalScale(10),
    },

    timeCol: { flex: 1 },

    pickerContainer: {
      backgroundColor: "#fff",
      borderRadius: RADIUS_SM,
      borderWidth: 1,
      borderColor: "#ddd",
    },

    fileInput: {
      backgroundColor: "#fff",
      padding: scale(12),
      borderRadius: RADIUS_SM,
      borderWidth: 1,
      borderColor: "#ddd",
    },

    helpText: {
      fontSize: font(11),
      color: "#6b7280",
      marginTop: verticalScale(4),
    },

    buttons: {
      flexDirection: "row",
      marginTop: verticalScale(15),
      gap: scale(10),
    },

    send: {
      flex: 1,
      backgroundColor: "#2563eb",
      padding: scale(12),
      borderRadius: RADIUS_SM,
      alignItems: "center",
    },

    cancel: {
      flex: 1,
      backgroundColor: "#e5e7eb",
      padding: scale(12),
      borderRadius: RADIUS_SM,
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
}
