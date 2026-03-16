import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const LIMIT_OPTIONS = [20, 25, 50];

interface SelectFieldProps {
  label: string;
  value: string | number;
  onValueChange: (value: string | number) => void;
  placeholder?: string;
  error?: string;
  labelColor: string;
  rowColor: string;
  searchIconColor: string;
  modalheight: number;
  panelColor: string;
  required?: boolean;
  data?: any[];
}

const IkarFlatList = ({
  label,
  value,
  onValueChange,
  error,
  labelColor,
  rowColor,
  searchIconColor,
  modalheight,
  panelColor,
  placeholder,
  required,
  data,
}: SelectFieldProps) => {
  const [opciones, setOpciones] = useState<any[]>([]);
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [SelectedLabel, setSelectedLabel] = useState("");
  const [isActivo, setIsActivo] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [limitVisible, setLimitVisible] = useState(false);

  useEffect(() => {
    const lista = (data ?? [])
      .filter((item) => item.categoryId === 22)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({ label: item.name, value: item.id }));

    if (value) {
      const seleccionada = lista.filter((c) => c.value === value);
      const resto = lista.filter((c) => c.value !== value);
      setOpciones([...seleccionada, ...resto]);
    } else {
      setOpciones(lista);
    }
  }, [data, value]);

  useEffect(() => {
    if (value && opciones.length > 0) {
      const encontrada = opciones.find((c) => c.value === value);
      if (encontrada) setSelectedLabel(encontrada.label);
    }
  }, [value, opciones]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const opcionesFiltradas = opciones.filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase()),
  );

  const total = opcionesFiltradas.length;
  const totalPaginas = Math.ceil(total / limit);
  const inicio = (page - 1) * limit;
  const opcionesPaginadas = opcionesFiltradas.slice(inicio, inicio + limit);

  const handleSelect = (item: any) => {
    onValueChange(item.value);
    setSelectedLabel(item.label);
    setVisible(false);
    setSearch("");
    setPage(1);
  };

  const cerrar = () => {
    setVisible(false);
    setSearch("");
    setPage(1);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label} {required && <Text style={{ color: "#EF4444" }}>*</Text>}
      </Text>
      <TouchableOpacity
        style={[styles.container, error ? { borderColor: "#EF4444" } : null]}
        onPress={() => setVisible(true)}
      >
        <Text
          style={[
            value ? styles.selectedText : styles.placeholder,
            { color: value ? labelColor : "#bbb" },
          ]}
        >
          {SelectedLabel || placeholder || label}
        </Text>
        <Ionicons name="chevron-down-outline" size={18} color="#0d1012" />
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}

      <Modal transparent animationType="fade" visible={visible}>
        <TouchableOpacity
          style={styles.overlay}
          onPress={cerrar}
          activeOpacity={1}
        >
          <TouchableOpacity
            style={[
              styles.modal,
              { height: modalheight, backgroundColor: panelColor },
            ]}
            activeOpacity={1}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <Switch
                value={isActivo}
                onValueChange={setIsActivo}
                trackColor={{ false: "rgba(11, 11, 11, 0.3)", true: "#47ee44" }}
                thumbColor="white"
              />
              <Text style={[styles.modalTitulo, { color: labelColor }]}>
                {label}
              </Text>
              <Ionicons
                name="close"
                size={36}
                color="rgba(221, 20, 20, 0.7)"
                onPress={cerrar}
              />
            </View>

            {/* Búsqueda */}
            {isActivo && (
              <View style={styles.searchContainer}>
                <Ionicons
                  name="search-outline"
                  size={16}
                  color={searchIconColor}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar..."
                  placeholderTextColor={labelColor}
                  value={search}
                  onChangeText={setSearch}
                />
                {search ? (
                  <TouchableOpacity onPress={() => setSearch("")}>
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color="rgba(234, 7, 7, 0.7)"
                    />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {/* Lista */}
            <FlatList
              data={opcionesPaginadas}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.opcion,
                    { backgroundColor: rowColor },
                    item.value === value ? styles.opcionActiva : null,
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <Text
                    style={[
                      styles.opcionText,
                      { color: labelColor },
                      item.value === value && {
                        ...styles.opcionTextActiva,
                        color: "#1A73E8",
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.value === value && (
                    <Ionicons name="checkmark" size={18} color="#f1192b" />
                  )}
                </TouchableOpacity>
              )}
            />

            {/* Paginación */}
            {totalPaginas > 1 && (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.btn, page === 1 && styles.btnDisabled]}
                  onPress={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  <Text style={styles.btnText}>‹</Text>
                </TouchableOpacity>

                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(
                  (p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.btn, p === page && styles.btnActivo]}
                      onPress={() => setPage(p)}
                    >
                      <Text
                        style={[
                          styles.btnText,
                          p === page && styles.btnTextActivo,
                        ]}
                      >
                        {p}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}

                <TouchableOpacity
                  style={[
                    styles.btn,
                    page === totalPaginas && styles.btnDisabled,
                  ]}
                  onPress={() => setPage(page + 1)}
                  disabled={page === totalPaginas}
                >
                  <Text style={styles.btnText}>›</Text>
                </TouchableOpacity>

                <Text style={styles.info}>
                  {inicio + 1}-{Math.min(page * limit, total)} / {total}
                </Text>

                <View style={styles.limitRow}>
                  <Text style={styles.info}>Filas:</Text>
                  <TouchableOpacity
                    style={styles.limitBtn}
                    onPress={() => setLimitVisible(true)}
                  >
                    <Text style={styles.btnText}>{limit} ▾</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {/* Modal selector de filas */}
            <Modal transparent animationType="fade" visible={limitVisible}>
              <TouchableOpacity
                style={styles.limitOverlay}
                onPress={() => setLimitVisible(false)}
                activeOpacity={1}
              >
                <View style={styles.limitModal}>
                  {LIMIT_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.limitOpcion,
                        opt === limit && styles.limitOpcionActiva,
                      ]}
                      onPress={() => {
                        setLimit(opt);
                        setPage(1);
                        setLimitVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.btnText,
                          opt === limit && {
                            fontWeight: "bold",
                            color: "#1A73E8",
                          },
                        ]}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableOpacity>
            </Modal>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { marginBottom: 20, marginTop: 10 },
  label: {
    position: "absolute",
    top: -9,
    left: 12,
    backgroundColor: "white",
    paddingHorizontal: 4,
    fontSize: 12,
    color: "#333333cd",
    zIndex: 1,
    fontWeight: "600",
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: "#99999953",
    borderRadius: 10,
    backgroundColor: "white",
    height: 52,
    paddingHorizontal: 12,
  },
  placeholder: { fontSize: 14 },
  selectedText: { fontSize: 14, color: "#090e15", fontWeight: "500" },
  error: { color: "#EF4444", fontSize: 11, marginTop: 4, marginLeft: 16 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 30, 60, 0.6)",
    justifyContent: "center",
    padding: 24,
  },
  modal: {
    borderRadius: 20,
    padding: 16,
    height: "70%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 4,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  modalTitulo: {
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 13, color: "#010408", marginLeft: 6 },
  opcion: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderColor: "rgba(255,255,255,0.2)",
    borderWidth: 0.5,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: "rgba(103, 162, 213, 0.1)",
  },
  opcionActiva: {
    backgroundColor: "white",
    borderRadius: 10,
    paddingHorizontal: 12,
    borderColor: "white",
  },
  opcionText: { fontSize: 15, fontWeight: "400" },
  opcionTextActiva: { color: "#1A73E8", fontWeight: "700" },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 4,
  },
  btn: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "white",
  },
  btnActivo: { backgroundColor: "#1A73E8", borderColor: "#1A73E8" },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 14, color: "#374151" },
  btnTextActivo: { color: "white", fontWeight: "bold" },
  info: { fontSize: 13, color: "#6B7280", marginLeft: 4 },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 6,
  },
  limitBtn: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "white",
  },
  limitOverlay: { flex: 1, justifyContent: "flex-end", padding: 24 },
  limitModal: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  limitOpcion: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  limitOpcionActiva: { backgroundColor: "#EFF6FF" },
});

export default IkarFlatList;
