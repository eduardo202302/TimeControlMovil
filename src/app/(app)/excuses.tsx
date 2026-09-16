import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  useResponsive,
} from "@/constants/responsive";
import { useSchoolStore } from "../../../store/useSchoolStore";
import AdminExcuseCreateModal from "../../components/faceclass/AdminExcuseCreateModal";
import ExcuseCard from "../../components/faceclass/ExcuseCard";
import ExcuseCrudModal, { type ExcuseCrudMode } from "../../components/faceclass/ExcuseCrudModal";
import TagOptionSheet from "../../components/permissions/TagOptionSheet";
import { useTagsByCategory } from "../../hooks/useTagsByCategory";
import {
  EXCUSES_ROWS,
  allowedStateTags,
  canDeleteExcuse,
  canEditExcuse,
  deleteExcuse,
  excuseDeleteConfirmationLabel,
  fetchAdminExcusesPage,
  fetchExcuseDetail,
  isRejectionExcuseStateTag,
  patchExcuse,
  readExcuseCategoryIds,
  resolveStateTagDefinition,
  updateExcuseState,
  type Excuse,
  type ExcuseCategoryIds,
  type ExcuseTag,
} from "../../utils/excusesRules";
import * as Storage from "../../utils/storage";

const SEARCH_DEBOUNCE_MS = 400;

interface RowDecision {
  stateDef: ExcuseTag | null;
  canEdit: boolean;
  canDelete: boolean;
}

export default function ExcusesScreen() {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { user, urlColegio, school } = useSchoolStore();
  const schoolUser = user?.user?.schoolUsers?.[0];

  const [token, setToken] = useState<string | null>(() => useSchoolStore.getState().token);

  // ── Categorías del catálogo (configurables por escuela) ──────────────────
  const categoryIds = useMemo(
    () =>
      (schoolUser?.school?.settings?.categoryDefaultIds ??
        (user as any)?.school?.settings?.categoryDefaultIds ??
        school?.settings?.categoryDefaultIds) as ExcuseCategoryIds | undefined,
    [schoolUser, user, school],
  );
  const { typeCategoryId, stateCategoryId } = useMemo(
    () => readExcuseCategoryIds(categoryIds),
    [categoryIds],
  );

  const typeCatalog = useTagsByCategory(typeCategoryId);
  const stateCatalog = useTagsByCategory(stateCategoryId);

  /** Estructuralmente compatibles con ExcuseTag (see excusesRules.ts). */
  const typeTags = useMemo(
    () => typeCatalog.tags as ExcuseTag[],
    [typeCatalog.tags],
  );
  const stateTags = useMemo(
    () => stateCatalog.tags as ExcuseTag[],
    [stateCatalog.tags],
  );

  const catalogError = useMemo(() => {
    if (typeCatalog.error || stateCatalog.error) {
      return "No se pudo cargar el catálogo de excusas.";
    }
    if (typeCategoryId == null && stateCategoryId == null) {
      return "La escuela no tiene configurado el catálogo de excusas.";
    }
    return null;
  }, [typeCatalog.error, stateCatalog.error, typeCategoryId, stateCategoryId]);

  // ── Búsqueda (debounce) ───────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // ── Listado ───────────────────────────────────────────────────────────────
  const [items, setItems] = useState<Excuse[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const pageRef = useRef(1);
  /** Sella cada carga: una respuesta vieja (cambió la búsqueda mientras
   * viajaba) se descarta en vez de pisar la lista buena. */
  const requestIdRef = useRef(0);

  // ── Modal unificado (watch/edit) ──────────────────────────────────────────
  const [crudVisible, setCrudVisible] = useState(false);
  const [crudExcuse, setCrudExcuse] = useState<Excuse | null>(null);
  const [crudLoading, setCrudLoading] = useState(false);
  const [crudLoadError, setCrudLoadError] = useState<string | null>(null);
  const [crudMode, setCrudMode] = useState<ExcuseCrudMode>("watch");
  const [crudPreselect, setCrudPreselect] = useState<number | null>(null);
  const [crudSaving, setCrudSaving] = useState(false);
  const [crudError, setCrudError] = useState<string | null>(null);

  // ── Estado inline / eliminar / crear ──────────────────────────────────────
  const [stateTarget, setStateTarget] = useState<{
    excuse: Excuse;
    stateDef: ExcuseTag | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Excuse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);

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
        const result = await fetchAdminExcusesPage({
          token,
          urlColegio,
          page,
          rows: EXCUSES_ROWS,
          search,
        });
        if (requestId !== requestIdRef.current) return;
        pageRef.current = page;
        setHasMore(result.hasMore);
        setItems((previous) => (mode === "append" ? [...previous, ...result.items] : result.items));
      } catch (error: any) {
        if (requestId !== requestIdRef.current) return;
        console.error("excuses/load:", error?.response?.data?.message ?? error?.message);
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
    [urlColegio, token, search],
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

  // ── Decisiones por fila ───────────────────────────────────────────────────
  const decide = useCallback(
    (excuse: Excuse): RowDecision => ({
      stateDef: resolveStateTagDefinition(excuse, stateTags),
      // Editar/dropdown se deciden con el stateTag de la fila (puede no tener
      // gotoTags: el listado los recorta) — igual que en el webapp.
      canEdit: canEditExcuse(excuse),
      canDelete: canDeleteExcuse(excuse),
    }),
    [stateTags],
  );

  // ── Modal unificado ───────────────────────────────────────────────────────
  const openExcuse = useCallback(
    async (
      excuse: Excuse,
      initialMode: ExcuseCrudMode,
      preselectStateTagId: number | null = null,
    ) => {
      setCrudExcuse(null);
      setCrudLoadError(null);
      setCrudError(null);
      setCrudMode(initialMode);
      setCrudPreselect(preselectStateTagId);
      setCrudLoading(true);
      setCrudVisible(true);
      if (!urlColegio || !token) {
        setCrudLoading(false);
        setCrudLoadError("No hay sesión activa.");
        return;
      }
      try {
        // Se abre contra el DETALLE: el listado no trae adjuntos ni el
        // comentario, y el diff de attachmentsAdm se calcula sobre el array real.
        const result = await fetchExcuseDetail({ token, urlColegio, id: excuse.id });
        if (!result) setCrudLoadError("Excusa no encontrada");
        // El detalle trae el grafo completo (adjuntos, comment, absentDays);
        // la fila queda de respaldo para el stateTag recortado del listado.
        else setCrudExcuse({ ...excuse, ...result });
      } catch (error: any) {
        console.error("excuses/openExcuse:", error?.response?.data?.message ?? error?.message);
        setCrudLoadError("Excusa no encontrada");
      } finally {
        setCrudLoading(false);
      }
    },
    [urlColegio, token],
  );

  const submitCrud = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!crudExcuse || !urlColegio || !token) return;
      setCrudSaving(true);
      setCrudError(null);
      const result = await patchExcuse({
        token,
        urlColegio,
        id: crudExcuse.id,
        body: payload,
      });
      setCrudSaving(false);
      if (!result.ok) {
        setCrudError(result.message || "No se pudo guardar la excusa.");
        return;
      }
      setCrudVisible(false);
      load("refresh");
    },
    [crudExcuse, urlColegio, token, load],
  );

  // ── Cambio de estado inline ───────────────────────────────────────────────
  const chooseState = useCallback(
    async (tag: ExcuseTag) => {
      const target = stateTarget;
      setStateTarget(null);
      if (!target || !urlColegio || !token) return;
      if (Number(tag.id) === Number(target.excuse.stateTag?.id)) return;

      // Rechazo/cancelación NO se PATCHea directo: exige comentario o adjunto,
      // y esa regla solo existe del lado del cliente. Se abre el modal
      // unificado ya en modo "edit" con el estado destino preseleccionado.
      if (isRejectionExcuseStateTag(tag)) {
        openExcuse(target.excuse, "edit", Number(tag.id));
        return;
      }

      const result = await updateExcuseState({
        token,
        urlColegio,
        id: target.excuse.id,
        stateTagId: Number(tag.id),
      });
      if (!result.ok) {
        Alert.alert("No se pudo cambiar el estado", result.message || "Intenta de nuevo.");
        return;
      }
      load("refresh");
    },
    [stateTarget, urlColegio, token, openExcuse, load],
  );

  // ── Eliminar ──────────────────────────────────────────────────────────────
  const confirmDelete = useCallback(async () => {
    const target = deleteTarget;
    if (!target || !urlColegio || !token) return;
    setDeleting(true);
    const result = await deleteExcuse({ token, urlColegio, id: target.id });
    setDeleting(false);
    setDeleteTarget(null);
    if (!result.ok) {
      Alert.alert("No se pudo eliminar", result.message || "Intenta de nuevo.");
      return;
    }
    setCrudVisible(false);
    load("refresh");
  }, [deleteTarget, urlColegio, token, load]);

  // ── Crear ─────────────────────────────────────────────────────────────────
  const handleCreated = useCallback(
    (message: string) => {
      setCreateVisible(false);
      Alert.alert("Excusa registrada", message);
      load("refresh");
    },
    [load],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: Excuse }) => {
      const decision = decide(item);
      return (
        <ExcuseCard
          item={item}
          stateDef={decision.stateDef}
          canEdit={decision.canEdit}
          canDelete={decision.canDelete}
          onOpen={(excuse) => openExcuse(excuse, "watch")}
          onEdit={(excuse) => openExcuse(excuse, "edit")}
          onStatePress={(excuse, stateDef) => setStateTarget({ excuse, stateDef })}
          onDelete={setDeleteTarget}
        />
      );
    },
    [decide, openExcuse],
  );

  const crudDecision = useMemo(
    () => (crudExcuse ? decide(crudExcuse) : null),
    [crudExcuse, decide],
  );

  const stateOptions = useMemo(
    () => (stateTarget ? allowedStateTags(stateTarget.stateDef, stateTags) : []),
    [stateTarget, stateTags],
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

      {/* Agregar excusa */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setCreateVisible(true)}
        activeOpacity={0.85}
        accessibilityLabel="Agregar excusa"
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <TagOptionSheet
        visible={stateTarget !== null}
        title="Cambiar estado"
        options={stateOptions}
        selectedId={stateTarget?.excuse.stateTag?.id ?? null}
        emptyText="El catálogo de estados no está disponible."
        onSelect={chooseState}
        onClose={() => setStateTarget(null)}
      />

      <ExcuseCrudModal
        visible={crudVisible}
        excuse={crudExcuse}
        loading={crudLoading}
        loadError={crudLoadError}
        stateTags={stateTags}
        preselectedStateTagId={crudPreselect}
        initialMode={crudMode}
        canEdit={crudDecision?.canEdit ?? false}
        saving={crudSaving}
        submitError={crudError}
        urlColegio={urlColegio}
        onClose={() => setCrudVisible(false)}
        onSubmit={submitCrud}
      />

      <AdminExcuseCreateModal
        visible={createVisible}
        token={token}
        urlColegio={urlColegio}
        typeTags={typeTags}
        stateTags={stateTags}
        catalogError={catalogError}
        onClose={() => setCreateVisible(false)}
        onCreated={handleCreated}
      />

      {/* ── Confirmar eliminar — mismo patrón visual que permissions.tsx ── */}
      <Modal
        transparent
        visible={deleteTarget !== null}
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirmar Eliminar</Text>
            <Text style={styles.modalMessage}>¿Está seguro que desea eliminar esta excusa?</Text>
            {!!deleteTarget && (
              <Text style={styles.modalFocus} numberOfLines={2}>
                {excuseDeleteConfirmationLabel(deleteTarget)}
              </Text>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setDeleteTarget(null)} disabled={deleting}>
                <Text style={styles.modalCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} disabled={deleting}>
                {deleting ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Text style={styles.modalConfirm}>Eliminar</Text>
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
      // Deja aire para que el FAB no tape la última card.
      paddingBottom: verticalScale(96),
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
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    modalBox: {
      backgroundColor: "#fff",
      borderRadius: RADIUS_LG,
      padding: scale(24),
      width: "80%",
      // Mismo tope que el modal de logout de DrawerMenu.tsx.
      maxWidth: 400,
      elevation: 5,
    },
    modalTitle: {
      fontSize: font(15),
      fontWeight: "700",
      color: "#DC2626",
      marginBottom: verticalScale(8),
    },
    modalMessage: { fontSize: font(14), color: "#444" },
    modalFocus: {
      fontSize: font(13),
      fontWeight: "700",
      color: "#111827",
      marginTop: verticalScale(8),
    },
    modalButtons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: scale(20),
      marginTop: verticalScale(24),
    },
    modalCancel: { color: "#6B7280", fontWeight: "600", fontSize: font(14) },
    modalConfirm: { color: "#DC2626", fontWeight: "600", fontSize: font(14) },
  });
}