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
import { APP_BACKGROUND } from "@/constants/colors";
import {
  MAX_CONTENT_WIDTH,
  RADIUS_MD,
  useResponsive,
} from "@/constants/responsive";
import { useSchoolStore } from "../../../store/useSchoolStore";
import ExcuseCard from "../../components/faceclass/ExcuseCard";
import ExcuseCrudModal from "../../components/faceclass/ExcuseCrudModal";
import { useTagsByCategory } from "../../hooks/useTagsByCategory";
import {
  EXCUSES_ROWS,
  fetchExcuseDetail,
  fetchMyExcusesPage,
  readExcuseCategoryIds,
  resolveStateTagDefinition,
  type Excuse,
  type ExcuseCategoryIds,
  type ExcuseTag,
  type MyExcuse,
} from "../../utils/excusesRules";
import { readSchoolUsersId } from "../../utils/permissionRules";
import { decodeJWT } from "../../utils/session";
import * as Storage from "../../utils/storage";

const SEARCH_DEBOUNCE_MS = 400;

/**
 * "Mis Excusas" (menú id:41) — la vista SOLO-LECTURA del propio usuario,
 * calcada de Features/MyExcuses del webapp.
 *
 * Reusa ExcuseCard + ExcuseCrudModal en modo "watch" siempre: sin editar, sin
 * eliminar y sin cambiar de estado. Combina `excuses` + `excusesh` con la
 * paginación cruzada de fetchMyExcusesPage, y filtra por `schoolUsersId` solo
 * si el rol es padre/tutor — el admin ve todas las de la escuela.
 */
export default function MyExcusesScreen() {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { user, role, urlColegio, school } = useSchoolStore();
  const schoolUser = user?.user?.schoolUsers?.[0];

  const [token, setToken] = useState<string | null>(
    () => useSchoolStore.getState().token,
  );

  // ── Filtro por rol ────────────────────────────────────────────────────────
  // El webapp (MyExcuses) manda `schoolUsersId` solo si el rol es
  // padre/tutor; un admin ve todas las excusas de la escuela. Es 100% una
  // decisión del cliente — el backend NO filtra por usuario.
  const roleName = String(user?.role?.name ?? role?.name ?? "").toLowerCase();
  const isParent = roleName.includes("padre") || roleName.includes("tutor");
  const schoolUsersId = useMemo(
    () => (isParent && token ? readSchoolUsersId(decodeJWT(token)) : null),
    [isParent, token],
  );

  // ── Categorías del catálogo (configurables por escuela) ──────────────────
  const categoryIds = useMemo(
    () =>
      (schoolUser?.school?.settings?.categoryDefaultIds ??
        (user as any)?.school?.settings?.categoryDefaultIds ??
        school?.settings?.categoryDefaultIds) as ExcuseCategoryIds | undefined,
    [schoolUser, user, school],
  );
  const { stateCategoryId } = useMemo(
    () => readExcuseCategoryIds(categoryIds),
    [categoryIds],
  );

  const stateCatalog = useTagsByCategory(stateCategoryId);
  /** Estructuralmente compatibles con ExcuseTag (see excusesRules.ts). */
  const stateTags = useMemo(
    () => stateCatalog.tags as ExcuseTag[],
    [stateCatalog.tags],
  );

  // ── Búsqueda (debounce) ───────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // ── Listado ───────────────────────────────────────────────────────────────
  const [items, setItems] = useState<MyExcuse[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const pageRef = useRef(1);
  /** Sella cada carga: una respuesta vieja (cambió la búsqueda mientras
   * viajaba) se descarta en vez de pisar la lista buena. */
  const requestIdRef = useRef(0);

  // ── Modal unificado (watch, sin edición) ──────────────────────────────────
  const [crudVisible, setCrudVisible] = useState(false);
  const [crudExcuse, setCrudExcuse] = useState<MyExcuse | null>(null);
  const [crudLoading, setCrudLoading] = useState(false);
  const [crudLoadError, setCrudLoadError] = useState<string | null>(null);

  // ── Token ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const resolve = async () =>
      useSchoolStore.getState().token ?? (await Storage.getItemAsync("token"));
    resolve().then((value) => {
      if (alive) setToken(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── Búsqueda con debounce ─────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Carga ─────────────────────────────────────────────────────────────────
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
        const result = await fetchMyExcusesPage({
          token,
          urlColegio,
          page,
          rows: EXCUSES_ROWS,
          search,
          schoolUsersId: isParent ? schoolUsersId : null,
        });
        if (requestId !== requestIdRef.current) return;
        pageRef.current = page;
        setHasMore(result.hasMore);
        setItems((previous) => (mode === "append" ? [...previous, ...result.items] : result.items));
      } catch (error: any) {
        if (requestId !== requestIdRef.current) return;
        console.error("myexcuses/load:", error?.response?.data?.message ?? error?.message);
        setListError("No se pudieron cargar las excusas.");
        if (mode !== "append") setItems([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [urlColegio, token, search, isParent, schoolUsersId],
  );

  // Primera carga y cambio de búsqueda reinician el listado.
  useEffect(() => {
    // Mismo patrón de fetch-on-mount que permissions.tsx: `load` prende el
    // spinner de forma síncrona para no dejar un frame con la lista vieja.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver arriba
    load("replace");
  }, [load]);

  const handleEndReached = useCallback(() => {
    if (loading || loadingMore || refreshing || !hasMore) return;
    load("append");
  }, [loading, loadingMore, refreshing, hasMore, load]);

  const handleRefresh = useCallback(() => load("refresh"), [load]);

  // ── Abrir detalle (watch) ─────────────────────────────────────────────────
  const openExcuse = useCallback(
    async (excuse: MyExcuse) => {
      setCrudExcuse(null);
      setCrudLoadError(null);
      setCrudLoading(true);
      setCrudVisible(true);
      if (!urlColegio || !token) {
        setCrudLoading(false);
        setCrudLoadError("No hay sesión activa.");
        return;
      }
      try {
        // Se abre contra el DETALLE (el listado no trae adjuntos ni
        // comentario). Las filas del histórico (isHistorical) pegan a
        // /excusesh/{id}: los ids se repiten entre las dos tablas.
        const result = await fetchExcuseDetail({
          token,
          urlColegio,
          id: excuse.id,
          table: excuse.isHistorical ? "excusesh" : "excuses",
        });
        if (!result) setCrudLoadError("Excusa no encontrada");
        else setCrudExcuse({ ...excuse, ...result });
      } catch (error: any) {
        console.error("myexcuses/openExcuse:", error?.response?.data?.message ?? error?.message);
        setCrudLoadError("Excusa no encontrada");
      } finally {
        setCrudLoading(false);
      }
    },
    [urlColegio, token],
  );

  const openCards = useCallback(
    // ExcuseCard pasa sus props como `Excuse`; la fila renderizada es siempre
    // una MyExcuse (con isHistorical), así que el cast no pierde nada.
    (excuse: Excuse) => openExcuse(excuse as MyExcuse),
    [openExcuse],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: MyExcuse }) => (
      // Solo-lectura SIEMPRE: el lápiz, el icono de eliminar y el dropdown de
      // estado dependen de canEdit/canDelete, no del stateTag de la fila.
      <ExcuseCard
        item={item}
        stateDef={resolveStateTagDefinition(item, stateTags)}
        canEdit={false}
        canDelete={false}
        onOpen={openCards}
        onEdit={() => {}}
        onStatePress={() => {}}
        onDelete={() => {}}
      />
    ),
    [stateTags, openCards],
  );

  return (
    <View style={styles.screen}>
      {/* ── Búsqueda ── */}
      <View style={[styles.toolbar, isTablet && styles.contentTablet]}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Buscar excusas…"
            placeholderTextColor="#9CA3AF"
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!searchInput && (
            <TouchableOpacity onPress={() => setSearchInput("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Cargando excusas…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          // Los ids se repiten entre excuses y excusesh: el prefijo separa las
          // keys de ambas tablas (mismo criterio que mypermissions.tsx).
          keyExtractor={(item) => `${item.isHistorical ? "h" : "a"}-${item.id}`}
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
                name={listError ? "alert-circle-outline" : "document-outline"}
                size={34}
                color="#9CA3AF"
              />
              <Text style={styles.stateTitle}>
                {listError ??
                  (search ? "Sin resultados para la búsqueda" : "No hay excusas que mostrar")}
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

      <ExcuseCrudModal
        visible={crudVisible}
        excuse={crudExcuse}
        loading={crudLoading}
        loadError={crudLoadError}
        stateTags={stateTags}
        preselectedStateTagId={null}
        initialMode="watch"
        canEdit={false}
        saving={false}
        submitError={null}
        urlColegio={urlColegio}
        onClose={() => setCrudVisible(false)}
        onSubmit={() => {}}
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
    /** Centra y limita el contenido en tablet, igual que mypermissions.tsx. */
    contentTablet: {
      maxWidth: MAX_CONTENT_WIDTH,
      alignSelf: "center",
      width: "100%",
    },
    toolbar: {
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(12),
      paddingBottom: verticalScale(2),
    },
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
      flexGrow: 1,
    },
    stateBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: verticalScale(10),
      paddingVertical: verticalScale(60),
      paddingHorizontal: scale(24),
    },
    stateText: { fontSize: font(13), color: "#6B7280" },
    stateTitle: {
      fontSize: font(14),
      fontWeight: "700",
      color: "#374151",
      textAlign: "center",
    },
    retryText: { fontSize: font(13), fontWeight: "700", color: "#2563EB" },
    footerLoader: { paddingVertical: verticalScale(16) },
  });
}