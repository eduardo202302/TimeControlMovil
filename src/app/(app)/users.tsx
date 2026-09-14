import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  APP_BACKGROUND,
  ROW_ALERT_TINT_BACKGROUND,
  ROW_ALERT_TINT_BORDER,
} from "@/constants/colors";
import {
  MAX_CONTENT_WIDTH,
  RADIUS_MD,
  RADIUS_PILL,
  RADIUS_SM,
  RADIUS_XL,
  useResponsive,
} from "@/constants/responsive";
import { useSchoolStore } from "../../../store/useSchoolStore";
import * as Storage from "../../utils/storage";
import TagOptionSheet from "../../components/permissions/TagOptionSheet";
import UserFormModal from "../../components/users/UserFormModal";
import type { PermissionCatalogTag } from "../../utils/adminPermissionRules";
import {
  displayCedula,
  displayPhone,
  fetchUsers,
  getUserCategories,
  userTagNamesForCategory,
  USERS_ROWS,
  USERS_SEARCH_DEBOUNCE_MS,
  USERS_STATUS_OPTIONS,
  type SchoolUserRow,
  type UserCategory,
  type UsersStatusFilter,
} from "../../utils/usersRules";

type Styles = ReturnType<typeof createStyles>;

/**
 * TagOptionSheet trabaja con ids numéricos: se mapea cada valor del dropdown
 * a un id estable (y un color de punto) para reutilizar el mismo selector que
 * permissions.tsx en vez de armar otro.
 */
const STATUS_SHEET_IDS: Record<UsersStatusFilter, number> = { all: -1, "1": 1, "0": 0 };
const STATUS_SHEET_COLORS: Record<UsersStatusFilter, string> = {
  all: "#9CA3AF",
  "1": "#15803D",
  "0": "#B91C1C",
};
const STATUS_SHEET_OPTIONS: PermissionCatalogTag[] = USERS_STATUS_OPTIONS.map((option) => ({
  id: STATUS_SHEET_IDS[option.value],
  name: option.label,
  color: STATUS_SHEET_COLORS[option.value],
}));

function statusFromSheetId(id: number | undefined): UsersStatusFilter {
  return USERS_STATUS_OPTIONS.find((o) => STATUS_SHEET_IDS[o.value] === id)?.value ?? "1";
}

interface UserCardProps {
  item: SchoolUserRow;
  categories: UserCategory[];
  styles: Styles;
  onOpen: (item: SchoolUserRow) => void;
}

/** Mismo contenido que UserCard del webapp (Maintenance/Users/SubComponents/UserCard). */
function UserCard({ item, categories, styles, onOpen }: UserCardProps) {
  const active = item.isActive === true;
  const phone = displayPhone(item.user?.phone);
  const cedula = displayCedula(item.user?.cedula);

  const preferences: { label: string; value: boolean }[] = [
    { label: "TC", value: !!item.settings?.isTimeControl },
    { label: "Imagen", value: !!item.settings?.isImageRequired },
    { label: "Ubicación", value: !!item.settings?.isValidLocation },
    { label: "Almuerzo", value: !!item.settings?.isWorkingLunch },
  ];

  return (
    <TouchableOpacity
      style={[styles.card, !active && styles.cardInactive]}
      onPress={() => onOpen(item)}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardName} numberOfLines={2}>
          {item.user?.fullName || "—"}
        </Text>
        <View style={[styles.statusBadge, active ? styles.statusBadgeOn : styles.statusBadgeOff]}>
          <View style={[styles.statusDot, active ? styles.statusDotOn : styles.statusDotOff]} />
          <Text style={[styles.statusText, active ? styles.statusTextOn : styles.statusTextOff]}>
            {active ? "Activo" : "Inactivo"}
          </Text>
        </View>
      </View>

      <View style={styles.badgesRow}>
        <View style={styles.idBadge}>
          <Text style={styles.idBadgeText}>ID {item.id}</Text>
        </View>
        {!!item.role?.name && (
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText} numberOfLines={1}>
              {item.role.name}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.metaRow}>
          <Ionicons name="logo-whatsapp" size={14} color="#16A34A" />
          <Text style={styles.metaText}>{phone || "—"}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="mail-outline" size={14} color="#2563EB" />
          <Text style={styles.metaText} numberOfLines={1}>
            {item.user?.email || "—"}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        {categories.map((category) => {
          const names = userTagNamesForCategory(item.tags, category.id);
          return (
            <View key={category.id} style={styles.dataRow}>
              <Text style={styles.dataLabel} numberOfLines={1}>
                {category.name}
              </Text>
              <View style={styles.dataValueBox}>
                <Text style={styles.dataValue} numberOfLines={1}>
                  {names[0] ?? "—"}
                </Text>
                {names.length > 1 && (
                  <View style={styles.moreBubble}>
                    <Text style={styles.moreBubbleText}>+{names.length - 1}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>Usuario</Text>
          <View style={styles.dataValueBox}>
            <Text style={styles.dataValue} numberOfLines={1}>
              {item.user?.nickName || "—"}
            </Text>
          </View>
        </View>
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>Cédula</Text>
          <View style={styles.dataValueBox}>
            <Text style={styles.dataValue}>{cedula || "—"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.prefRow}>
        {preferences.map((pref) => (
          <View key={pref.label} style={styles.prefChip}>
            <Text style={styles.prefLabel}>{pref.label}</Text>
            <Text style={pref.value ? styles.prefValueOn : styles.prefValueOff}>
              {pref.value ? "Sí" : "No"}
            </Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

export default function UsersScreen() {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  /** Estado local con fallback a SecureStore — mismo patrón que holidays.tsx. */
  const [token, setToken] = useState<string | null>(() => useSchoolStore.getState().token);
  const [urlColegio, setUrlColegio] = useState<string | null>(
    () => useSchoolStore.getState().urlColegio,
  );

  useEffect(() => {
    let alive = true;
    const resolve = async () => ({
      token: useSchoolStore.getState().token ?? (await Storage.getItemAsync("token")),
      urlColegio:
        useSchoolStore.getState().urlColegio ?? (await Storage.getItemAsync("urlColegio")),
    });
    resolve().then((value) => {
      if (!alive) return;
      setToken(value.token);
      setUrlColegio(value.urlColegio);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<UsersStatusFilter>("1");
  const [statusSheetVisible, setStatusSheetVisible] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // ── Categorías (una sola vez por sesión de pantalla) ──────────────────────
  const [categories, setCategories] = useState<UserCategory[]>([]);
  /** Hasta resolver /categories/all no se pide la primera página: `fields`
   * depende de ellas. Si fallan, se sigue con [] (sin líneas de categoría). */
  const [categoriesReady, setCategoriesReady] = useState(false);

  // ── Listado ───────────────────────────────────────────────────────────────
  const [items, setItems] = useState<SchoolUserRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const pageRef = useRef(1);
  /** Sella cada carga — mismo patrón que permissions.tsx/holidays.tsx. */
  const requestIdRef = useRef(0);

  // ── Búsqueda con debounce ─────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), USERS_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!token || !urlColegio) return;
    let alive = true;
    getUserCategories({ token, urlColegio })
      .then((result) => {
        if (alive) setCategories(result);
      })
      .catch((error: any) => {
        console.error("users/categories:", error?.response?.data?.message ?? error?.message);
      })
      .finally(() => {
        if (alive) setCategoriesReady(true);
      });
    return () => {
      alive = false;
    };
  }, [token, urlColegio]);

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
        const result = await fetchUsers({
          token,
          urlColegio,
          page,
          rows: USERS_ROWS,
          isActive: status,
          search,
          categories,
        });
        if (requestId !== requestIdRef.current) return;
        pageRef.current = page;
        setHasMore(result.hasMore);
        setItems((previous) => (mode === "append" ? [...previous, ...result.items] : result.items));
      } catch (error: any) {
        if (requestId !== requestIdRef.current) return;
        console.error("users/load:", error?.response?.data?.message ?? error?.message);
        setListError("No se pudieron cargar los usuarios.");
        if (mode !== "append") setItems([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [urlColegio, token, status, search, categories],
  );

  // Sin sesión no hay categorías que esperar: `load` muestra el error.
  const canLoad = categoriesReady || !token || !urlColegio;

  useEffect(() => {
    if (!canLoad) return;
    // Mismo patrón de fetch-on-mount que permissions.tsx: `load` prende el
    // spinner de forma síncrona para no dejar un frame con la lista vieja.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver arriba
    load("replace");
  }, [load, canLoad]);

  const handleEndReached = useCallback(() => {
    if (loading || loadingMore || refreshing || !hasMore) return;
    load("append");
  }, [loading, loadingMore, refreshing, hasMore, load]);

  const handleRefresh = useCallback(() => load("refresh"), [load]);

  // ── Modal de usuario ──────────────────────────────────────────────────────
  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [formUser, setFormUser] = useState<SchoolUserRow | null>(null);

  const openCreate = useCallback(() => {
    setFormMode("add");
    setFormUser(null);
    setFormVisible(true);
  }, []);

  /** Tocar la card abre en edit (el lápiz del webapp); watch solo desde el ojo del modal. */
  const openUser = useCallback((item: SchoolUserRow) => {
    setFormMode("edit");
    setFormUser(item);
    setFormVisible(true);
  }, []);

  /** Mismo refresh que el pull-to-refresh — en add el modal sigue abierto. */
  const handleSaved = useCallback(() => {
    load("refresh");
  }, [load]);

  const chooseStatus = useCallback((tag: PermissionCatalogTag) => {
    setStatus(statusFromSheetId(tag.id));
    setStatusSheetVisible(false);
  }, []);

  const statusLabel =
    USERS_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "";

  const renderItem = useCallback(
    ({ item }: { item: SchoolUserRow }) => (
      <UserCard item={item} categories={categories} styles={styles} onOpen={openUser} />
    ),
    [categories, styles, openUser],
  );

  return (
    <View style={styles.screen}>
      {/* ── Estado + búsqueda ── */}
      <View style={[styles.toolbar, isTablet && styles.contentTablet]}>
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setStatusSheetVisible(true)}
          activeOpacity={0.8}
          accessibilityLabel="Filtrar por estado"
        >
          <Text style={styles.dropdownLabel}>Estado</Text>
          <Text style={styles.dropdownValue}>{statusLabel}</Text>
          <Ionicons name="chevron-down" size={16} color="#6B7280" />
        </TouchableOpacity>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Buscar usuarios…"
            placeholderTextColor="#9CA3AF"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {!!searchInput && (
            <TouchableOpacity onPress={() => setSearchInput("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading || !canLoad ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Cargando usuarios…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, isTablet && styles.contentTablet]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.stateBox}>
              <Ionicons
                name={listError ? "alert-circle-outline" : "people-outline"}
                size={34}
                color="#9CA3AF"
              />
              <Text style={styles.stateTitle}>
                {listError ?? (search ? "Sin resultados para la búsqueda" : "No hay usuarios que mostrar")}
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

      {/* ── Nuevo — mismo FAB circular de holidays.tsx ── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openCreate}
        activeOpacity={0.85}
        accessibilityLabel="Agregar usuario"
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <UserFormModal
        visible={formVisible}
        mode={formMode}
        user={formUser}
        token={token}
        urlColegio={urlColegio}
        onClose={() => setFormVisible(false)}
        onSaved={handleSaved}
      />

      <TagOptionSheet
        visible={statusSheetVisible}
        title="Estado"
        options={STATUS_SHEET_OPTIONS}
        selectedId={STATUS_SHEET_IDS[status]}
        onSelect={chooseStatus}
        onClose={() => setStatusSheetVisible(false)}
      />
    </View>
  );
}

function createStyles(
  scale: (size: number) => number,
  verticalScale: (size: number) => number,
  font: (size: number) => number,
) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: APP_BACKGROUND },
    contentTablet: {
      maxWidth: MAX_CONTENT_WIDTH,
      alignSelf: "center",
      width: "100%",
    },
    toolbar: {
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(12),
      paddingBottom: verticalScale(2),
      gap: verticalScale(10),
    },
    dropdown: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      backgroundColor: "#fff",
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    dropdownLabel: { fontSize: font(12), fontWeight: "600", color: "#6B7280" },
    dropdownValue: { flex: 1, fontSize: font(14), fontWeight: "700", color: "#111827" },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      backgroundColor: "#fff",
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      paddingHorizontal: scale(12),
    },
    searchInput: {
      flex: 1,
      fontSize: font(14),
      color: "#111827",
      paddingVertical: verticalScale(10),
    },
    listContent: {
      padding: scale(16),
      paddingTop: verticalScale(12),
      gap: verticalScale(10),
      // Deja aire para que el FAB no tape la última card.
      paddingBottom: verticalScale(96),
      flexGrow: 1,
    },
    card: {
      backgroundColor: "#fff",
      borderRadius: RADIUS_XL,
      borderWidth: 1.5,
      borderColor: "#E5E7EB",
      paddingHorizontal: scale(14),
      paddingVertical: verticalScale(12),
    },
    /** Equivalente al `#ffcdd2` de setRowStyle del webapp para isActive === false. */
    cardInactive: {
      backgroundColor: ROW_ALERT_TINT_BACKGROUND,
      borderColor: ROW_ALERT_TINT_BORDER,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: scale(8),
    },
    cardName: { flex: 1, fontSize: font(15), fontWeight: "700", color: "#111827" },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(5),
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(3),
    },
    statusBadgeOn: { backgroundColor: "#DCFCE7" },
    statusBadgeOff: { backgroundColor: "#FEE2E2" },
    statusDot: { width: scale(6), height: scale(6), borderRadius: RADIUS_PILL },
    statusDotOn: { backgroundColor: "#15803D" },
    statusDotOff: { backgroundColor: "#B91C1C" },
    statusText: { fontSize: font(10), fontWeight: "700" },
    statusTextOn: { color: "#15803D" },
    statusTextOff: { color: "#B91C1C" },
    badgesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: scale(6),
      marginTop: verticalScale(6),
    },
    idBadge: {
      backgroundColor: "#F3F4F6",
      borderRadius: RADIUS_SM,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(2),
    },
    idBadgeText: { fontSize: font(11), fontWeight: "600", color: "#374151" },
    roleBadge: {
      backgroundColor: "#EFF6FF",
      borderRadius: RADIUS_SM,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(2),
      maxWidth: "70%",
    },
    roleBadgeText: { fontSize: font(11), fontWeight: "700", color: "#1D4ED8" },
    section: {
      marginTop: verticalScale(8),
      paddingTop: verticalScale(8),
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
      gap: verticalScale(5),
    },
    metaRow: { flexDirection: "row", alignItems: "center", gap: scale(6) },
    metaText: { flex: 1, fontSize: font(12), color: "#374151" },
    dataRow: { flexDirection: "row", alignItems: "center", gap: scale(8) },
    dataLabel: { width: "38%", fontSize: font(12), color: "#6B7280" },
    dataValueBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: scale(6) },
    dataValue: { flexShrink: 1, fontSize: font(12), fontWeight: "600", color: "#111827" },
    moreBubble: {
      backgroundColor: "#E0E7FF",
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(6),
      paddingVertical: verticalScale(1),
    },
    moreBubbleText: { fontSize: font(10), fontWeight: "700", color: "#3730A3" },
    prefRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: scale(6),
      marginTop: verticalScale(8),
      paddingTop: verticalScale(8),
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
    },
    prefChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(4),
      backgroundColor: "#F9FAFB",
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(3),
    },
    prefLabel: { fontSize: font(11), color: "#6B7280" },
    prefValueOn: { fontSize: font(11), fontWeight: "700", color: "#15803D" },
    prefValueOff: { fontSize: font(11), fontWeight: "700", color: "#B91C1C" },
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
    // Mismo FAB que holidays.tsx / permissions.tsx.
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
  });
}
