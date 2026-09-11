import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { APP_BACKGROUND } from "@/constants/colors";
import {
  MAX_CONTENT_WIDTH,
  RADIUS_MD,
  RADIUS_PILL,
  RADIUS_SM,
  RADIUS_XL,
  useResponsive,
} from "@/constants/responsive";
import { useSchoolStore } from "../../../store/useSchoolStore";
import HolidaysFormModal from "../../components/holidays/HolidaysFormModal";
import {
  capitalizeDay,
  deleteHoliday,
  fetchHolidaysPage,
  HOLIDAYS_FILTER_LABELS,
  HOLIDAYS_ROWS,
  isHolidayEditable,
  type Holiday,
  type HolidaysFilter,
} from "../../utils/holidaysRules";
import { formatDisplayDate } from "../../components/timeoff/RevisionFinalModal";

const FILTER_OPTIONS: HolidaysFilter[] = ["true", "false", "all"];

type Styles = ReturnType<typeof createStyles>;

interface HolidayCardProps {
  item: Holiday;
  styles: Styles;
  onView: (item: Holiday) => void;
  onEdit: (item: Holiday) => void;
  onDelete: (item: Holiday) => void;
}

function HolidayCard({ item, styles, onView, onEdit, onDelete }: HolidayCardProps) {
  const editable = isHolidayEditable(item.holidayDate);
  const date = formatDisplayDate(item.holidayDate);
  const day = capitalizeDay(item.day);

  return (
    <TouchableOpacity
      style={[styles.card, !item.isActive && styles.cardInactive]}
      onPress={() => onView(item)}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardName} numberOfLines={2}>
          {item.name}
        </Text>
        <View
          style={[
            styles.workingBadge,
            item.working ? styles.workingBadgeOn : styles.workingBadgeOff,
          ]}
        >
          <Text
            style={[
              styles.workingBadgeText,
              item.working ? styles.workingBadgeTextOn : styles.workingBadgeTextOff,
            ]}
          >
            {item.working ? "Laborable" : "No laborable"}
          </Text>
        </View>
      </View>

      <View style={styles.cardMetaRow}>
        <Ionicons name="calendar-outline" size={13} color="#6B7280" />
        <Text style={styles.cardMetaText}>
          {date} {day ? `· ${day}` : ""}
        </Text>
      </View>

      {item.working && !!item.rangeHours && (
        <View style={styles.cardMetaRow}>
          <Ionicons name="time-outline" size={13} color="#6B7280" />
          <Text style={styles.cardMetaText}>{item.rangeHours}</Text>
        </View>
      )}

      {!item.isActive && (
        <View style={styles.cardMetaRow}>
          <Ionicons name="alert-circle-outline" size={13} color="#B91C1C" />
          <Text style={styles.inactiveText}>Inactivo</Text>
        </View>
      )}

      {editable && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => onDelete(item)}
            hitSlop={6}
            accessibilityLabel="Eliminar"
          >
            <Ionicons name="trash-outline" size={18} color="#B43333" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => onEdit(item)}
            hitSlop={6}
            accessibilityLabel="Editar"
          >
            <Ionicons name="create-outline" size={18} color="#3F7EA3" />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function HolidaysScreen() {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { token, urlColegio } = useSchoolStore();

  const [filter, setFilter] = useState<HolidaysFilter>("true");
  const [items, setItems] = useState<Holiday[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const pageRef = useRef(1);
  /** Sella cada carga: una respuesta vieja se descarta en vez de pisar la
   * lista buena — mismo patrón que permissions.tsx. */
  const requestIdRef = useRef(0);

  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit" | "view">("create");
  const [formHoliday, setFormHoliday] = useState<Holiday | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(
    async (mode: "replace" | "refresh" | "append") => {
      if (mode === "append") setLoadingMore(true);
      else if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      if (!urlColegio || !token) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        setListError("No hay sesión activa.");
        return;
      }

      const requestId = ++requestIdRef.current;
      const page = mode === "append" ? pageRef.current + 1 : 1;
      if (mode !== "append") setListError(null);

      try {
        const result = await fetchHolidaysPage({
          token,
          urlColegio,
          page,
          rows: HOLIDAYS_ROWS,
          isActive: filter,
        });
        if (requestId !== requestIdRef.current) return;
        pageRef.current = page;
        setHasMore(result.hasMore);
        setItems((previous) => (mode === "append" ? [...previous, ...result.items] : result.items));
      } catch (error: any) {
        if (requestId !== requestIdRef.current) return;
        console.error("holidays/load:", error?.response?.data?.message ?? error?.message);
        setListError("No se pudieron cargar los feriados.");
        if (mode !== "append") setItems([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [urlColegio, token, filter],
  );

  useEffect(() => {
    load("replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` ya depende de `filter`
  }, [filter]);

  const handleEndReached = useCallback(() => {
    if (loading || loadingMore || refreshing || !hasMore) return;
    load("append");
  }, [loading, loadingMore, refreshing, hasMore, load]);

  const handleRefresh = useCallback(() => load("refresh"), [load]);

  const openCreate = useCallback(() => {
    setFormMode("create");
    setFormHoliday(null);
    setFormVisible(true);
  }, []);

  const openEdit = useCallback((item: Holiday) => {
    setFormMode("edit");
    setFormHoliday(item);
    setFormVisible(true);
  }, []);

  /** Tocar la card completa (no los íconos) abre solo-lectura — mismo patrón
   * `onOpen`/PermissionCard de permissions.tsx. */
  const openView = useCallback((item: Holiday) => {
    setFormMode("view");
    setFormHoliday(item);
    setFormVisible(true);
  }, []);

  const handleSaved = useCallback(() => {
    setFormVisible(false);
    load("refresh");
  }, [load]);

  const confirmDelete = useCallback(async () => {
    const target = deleteTarget;
    if (!target || !urlColegio || !token) return;
    setDeleting(true);
    const result = await deleteHoliday({ token, urlColegio, id: target.id });
    setDeleting(false);
    setDeleteTarget(null);
    if (!result.ok) {
      setListError(result.message || "No se pudo eliminar el feriado.");
      return;
    }
    load("refresh");
  }, [deleteTarget, urlColegio, token, load]);

  const renderItem = useCallback(
    ({ item }: { item: Holiday }) => (
      <HolidayCard
        item={item}
        styles={styles}
        onView={openView}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
      />
    ),
    [styles, openView, openEdit],
  );

  return (
    <View style={styles.screen}>
      {/* ── Filtro Activos / Inactivos / Todos ── */}
      <View style={[styles.segmented, isTablet && styles.contentTablet]}>
        {FILTER_OPTIONS.map((option) => {
          const active = filter === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => setFilter(option)}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {HOLIDAYS_FILTER_LABELS[option]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Listado ── */}
      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Cargando feriados…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={[styles.listContent, isTablet && styles.contentTablet]}
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.stateBox}>
              <Ionicons
                name={listError ? "alert-circle-outline" : "calendar-outline"}
                size={30}
                color="#9CA3AF"
              />
              <Text style={styles.stateTitle}>
                {listError ?? "No hay feriados registrados"}
              </Text>
              {!!listError && (
                <TouchableOpacity onPress={() => load("replace")} activeOpacity={0.75}>
                  <Text style={styles.retryText}>Reintentar</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#2563EB" />
              </View>
            ) : null
          }
        />
      )}

      {/* ── Nuevo — mismo FAB circular de permissions.tsx ── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openCreate}
        activeOpacity={0.85}
        accessibilityLabel="Agregar feriado"
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <HolidaysFormModal
        visible={formVisible}
        mode={formMode}
        holiday={formHoliday}
        token={token}
        urlColegio={urlColegio}
        onClose={() => setFormVisible(false)}
        onSaved={handleSaved}
      />

      {/* ── Confirmar eliminar — mismo patrón visual que permissions.tsx ── */}
      <Modal
        transparent
        visible={deleteTarget !== null}
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteTarget(null)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Confirmar Eliminar</Text>
            <Text style={styles.confirmMessage}>
              ¿Está seguro que desea eliminar el día feriado?
            </Text>
            {!!deleteTarget?.name && (
              <Text style={styles.confirmFocus} numberOfLines={2}>
                {deleteTarget.name}
              </Text>
            )}
            <View style={styles.confirmButtons}>
              <TouchableOpacity onPress={() => setDeleteTarget(null)} disabled={deleting}>
                <Text style={styles.confirmCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} disabled={deleting}>
                {deleting ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Text style={styles.confirmConfirm}>Eliminar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
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
    screen: {
      flex: 1,
      backgroundColor: APP_BACKGROUND,
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(12),
    },
    contentTablet: {
      maxWidth: MAX_CONTENT_WIDTH,
      alignSelf: "center",
      width: "100%",
    },
    segmented: {
      flexDirection: "row",
      backgroundColor: "#fff",
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      padding: scale(3),
      gap: scale(3),
      marginBottom: verticalScale(12),
    },
    segment: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_MD,
      paddingVertical: verticalScale(7),
    },
    segmentActive: { backgroundColor: "#2563EB" },
    segmentText: { fontSize: font(12), fontWeight: "600", color: "#6B7280" },
    segmentTextActive: { color: "#fff", fontWeight: "700" },
    list: { flex: 1 },
    // paddingBottom deja aire para que el FAB no tape la última card — mismo
    // valor que permissions.tsx.
    listContent: { gap: verticalScale(8), paddingBottom: verticalScale(96) },
    card: {
      backgroundColor: "#fff",
      borderRadius: RADIUS_XL,
      borderWidth: 1.5,
      borderColor: "#E5E7EB",
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    cardInactive: { backgroundColor: "#F9FAFB" },
    cardTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: scale(8),
    },
    cardName: { flex: 1, fontSize: font(14), fontWeight: "700", color: "#111827" },
    workingBadge: {
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(3),
    },
    workingBadgeOn: { backgroundColor: "#DCFCE7" },
    workingBadgeOff: { backgroundColor: "#F3F4F6" },
    workingBadgeText: { fontSize: font(10), fontWeight: "700" },
    workingBadgeTextOn: { color: "#15803D" },
    workingBadgeTextOff: { color: "#6B7280" },
    cardMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      marginTop: verticalScale(6),
    },
    cardMetaText: { fontSize: font(12), color: "#6B7280" },
    inactiveText: { fontSize: font(12), color: "#B91C1C", fontWeight: "600" },
    cardActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: scale(4),
      marginTop: verticalScale(8),
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
      paddingTop: verticalScale(8),
    },
    iconBtn: {
      padding: scale(6),
      borderRadius: RADIUS_SM,
      backgroundColor: "#F9FAFB",
    },
    stateBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: verticalScale(8),
      paddingVertical: verticalScale(36),
    },
    stateText: { fontSize: font(13), color: "#6B7280" },
    stateTitle: {
      fontSize: font(13),
      fontWeight: "600",
      color: "#374151",
      textAlign: "center",
    },
    retryText: { fontSize: font(13), fontWeight: "700", color: "#2563EB", marginTop: verticalScale(4) },
    footerLoader: { paddingVertical: verticalScale(14) },
    // Copia literal de permissions.tsx:967-982 — misma fuente que el resto
    // de los FABs de la app.
    fab: {
      position: "absolute",
      right: scale(20),
      bottom: verticalScale(28),
      width: scale(56),
      height: scale(56),
      borderRadius: RADIUS_PILL,
      backgroundColor: "#2563EB",
      alignItems: "center",
      justifyContent: "center",
      elevation: 6,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
    },
    /* ── Confirmar eliminar: mismo patrón que permissions.tsx (modalOverlay/modalBox) ── */
    confirmOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    confirmBox: {
      backgroundColor: "#fff",
      borderRadius: RADIUS_XL,
      padding: scale(24),
      width: "80%",
      maxWidth: 400,
      elevation: 5,
    },
    confirmTitle: {
      fontSize: font(15),
      fontWeight: "700",
      color: "#DC2626",
      marginBottom: verticalScale(8),
    },
    confirmMessage: { fontSize: font(14), color: "#444" },
    confirmFocus: {
      fontSize: font(13),
      fontWeight: "700",
      color: "#111827",
      marginTop: verticalScale(8),
    },
    confirmButtons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: scale(20),
      marginTop: verticalScale(24),
    },
    confirmCancel: { color: "#6B7280", fontWeight: "600", fontSize: font(14) },
    confirmConfirm: { color: "#DC2626", fontWeight: "600", fontSize: font(14) },
  });
}
