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
  RADIUS_SM,
  RADIUS_XL,
  useResponsive,
} from "@/constants/responsive";
import { useSchoolStore } from "../../../store/useSchoolStore";
import AdminPermissionCreateModal from "../../components/permissions/AdminPermissionCreateModal";
import AdminPermissionDetailModal from "../../components/permissions/AdminPermissionDetailModal";
import AdminPermissionEditModal from "../../components/permissions/AdminPermissionEditModal";
import TagOptionSheet from "../../components/permissions/TagOptionSheet";
import {
  formatDisplayDate,
  formatDisplayTime,
} from "../../components/timeoff/RevisionFinalModal";
import {
  ADMIN_PERMISSION_ROWS,
  ADMIN_PERMISSION_SOURCE_LABELS,
  allowedStateTags,
  canDeletePermission,
  canEditPermission,
  canViewPermission,
  deletePermission,
  fetchAdminPermissionDetail,
  fetchAdminPermissionsPage,
  fetchPermissionCatalog,
  isPermissionExpired,
  isRejectionStateTag,
  patchPermission,
  resolveStateTagDefinition,
  updatePermissionState,
  type CategoryDefaultIds,
  type PermissionCatalog,
  type PermissionCatalogTag,
} from "../../utils/adminPermissionRules";
import {
  permissionDateKey,
  type MyPermission,
  type PermissionSource,
  type PermissionTagRef,
} from "../../utils/permissionRules";
import { normalizePermissionName } from "../../utils/punchRules";
import * as Storage from "../../utils/storage";

const SOURCES: PermissionSource[] = ["local", "historico"];
const SOURCE_STORAGE_KEY = "permissions.source";
const SEARCH_DEBOUNCE_MS = 400;
/** El webapp re-evalúa el vencimiento cada minuto; sin esto una fila que
 * vence con la pantalla abierta seguiría mostrando Editar/Eliminar. */
const NOW_TICK_MS = 60_000;
const AUSENCIA_ACTION_NAME = "ausencia";
const CHIP_FALLBACK = { background: "#E2E8F0", text: "#475569" };
const EMPTY_CATALOG: PermissionCatalog = { actionTags: [], stateTags: [], typeCategoryId: null };

function chipColors(tag: PermissionTagRef | null | undefined) {
  return {
    backgroundColor: tag?.color || CHIP_FALLBACK.background,
    color: tag?.fontColor || CHIP_FALLBACK.text,
  };
}

/** Ausencia es día completo: el webapp anula fromTime/toTime de esas filas. */
function scheduleLabel(permission: MyPermission): string {
  if (normalizePermissionName(permission.actionTag?.name) === AUSENCIA_ACTION_NAME) {
    return "Todo el día";
  }
  const from = permission.fromTime ? formatDisplayTime(permission.fromTime) : "";
  const to = permission.toTime ? formatDisplayTime(permission.toTime) : "";
  if (!from && !to) return "—";
  if (!to) return from;
  if (!from) return to;
  return `${from} — ${to}`;
}

type ScreenStyles = ReturnType<typeof createStyles>;

interface RowDecision {
  stateDef: PermissionCatalogTag | null;
  expired: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canView: boolean;
}

interface PermissionCardProps {
  item: MyPermission;
  decision: RowDecision;
  isHistorical: boolean;
  styles: ScreenStyles;
  onOpen: (item: MyPermission) => void;
  onStatePress: (item: MyPermission, stateDef: PermissionCatalogTag | null) => void;
  onEdit: (item: MyPermission) => void;
  onDelete: (item: MyPermission) => void;
}

function PermissionCard({
  item,
  decision,
  isHistorical,
  styles,
  onOpen,
  onStatePress,
  onEdit,
  onDelete,
}: PermissionCardProps) {
  const state = chipColors(item.stateTag);
  const action = chipColors(item.actionTag);
  const type = chipColors(item.typeTag);
  const date = permissionDateKey(item.permissionDate);
  // El dropdown de estado solo se habilita cuando la fila admite edición —
  // mismo `disabled={!canEdit}` del Dropdown del webapp.
  const stateEditable = !isHistorical && decision.canEdit;

  return (
    <TouchableOpacity
      style={[styles.card, decision.expired && styles.cardExpired]}
      onPress={() => onOpen(item)}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <TouchableOpacity
          style={[styles.stateChip, { backgroundColor: state.backgroundColor }]}
          onPress={() => onStatePress(item, decision.stateDef)}
          disabled={!stateEditable}
          activeOpacity={0.75}
          hitSlop={6}
        >
          <Text style={[styles.stateChipText, { color: state.color }]}>
            {item.stateTag?.name ?? "N/A"}
          </Text>
          {stateEditable && <Ionicons name="chevron-down" size={12} color={state.color} />}
        </TouchableOpacity>
        <View style={styles.cardTopRight}>
          {decision.expired && (
            <View style={styles.expiredMark}>
              <Ionicons name="alert-circle" size={11} color="#B91C1C" />
              <Text style={styles.expiredMarkText}>Vencido</Text>
            </View>
          )}
          <Text style={styles.cardDate}>{date ? formatDisplayDate(date) : "—"}</Text>
        </View>
      </View>

      <Text style={styles.requesterLabel}>Solicitado por</Text>
      <Text style={styles.requesterName} numberOfLines={2}>
        {item.schoolUser?.user?.fullName || "—"}
      </Text>

      <View style={styles.cardTags}>
        {!!item.actionTag?.name && (
          <View style={[styles.chipSm, { backgroundColor: action.backgroundColor }]}>
            <Text style={[styles.chipSmText, { color: action.color }]}>{item.actionTag.name}</Text>
          </View>
        )}
        {!!item.typeTag?.name && (
          <View style={[styles.chipSm, { backgroundColor: type.backgroundColor }]}>
            <Text style={[styles.chipSmText, { color: type.color }]}>{item.typeTag.name}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.cardFooterInfo}>
          <View style={styles.footerLine}>
            <Ionicons name="time-outline" size={13} color="#6B7280" />
            <Text style={styles.cardFooterText} numberOfLines={1}>
              {scheduleLabel(item)}
            </Text>
          </View>
          {!!item.groupWeekDays?.length && (
            <View style={styles.footerLine}>
              <Ionicons name="repeat-outline" size={13} color="#6B7280" />
              <Text style={styles.cardFooterText} numberOfLines={1}>
                {item.groupWeekDays.join(", ")}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.rowActions}>
          {decision.canView && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => onOpen(item)}
              hitSlop={6}
              accessibilityLabel="Ver"
            >
              <Ionicons name="eye-outline" size={18} color="#2185D0" />
            </TouchableOpacity>
          )}
          {decision.canDelete && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => onDelete(item)}
              hitSlop={6}
              accessibilityLabel="Eliminar"
            >
              <Ionicons name="trash-outline" size={18} color="#B43333" />
            </TouchableOpacity>
          )}
          {decision.canEdit && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => onEdit(item)}
              hitSlop={6}
              accessibilityLabel="Editar"
            >
              <Ionicons name="create-outline" size={18} color="#3F7EA3" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function PermissionsScreen() {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { user, urlColegio, school } = useSchoolStore();
  const schoolUser = user?.user?.schoolUsers?.[0];
  const schoolId: number | null =
    schoolUser?.schoolId ?? (user as any)?.school?.id ?? school?.id ?? null;
  const seedCategoryIds = useMemo(
    () =>
      (schoolUser?.school?.settings?.categoryDefaultIds ??
        (user as any)?.school?.settings?.categoryDefaultIds ??
        school?.settings?.categoryDefaultIds) as CategoryDefaultIds | undefined,
    [schoolUser, user, school],
  );

  const [token, setToken] = useState<string | null>(() => useSchoolStore.getState().token);

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [source, setSource] = useState<PermissionSource>("local");
  /** Hasta leer el modo persistido no se pide la primera página. */
  const [sourceReady, setSourceReady] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const isHistorical = source === "historico";

  // ── Listado ───────────────────────────────────────────────────────────────
  const [items, setItems] = useState<MyPermission[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const pageRef = useRef(1);
  /** Sella cada carga: una respuesta vieja (el usuario cambió de modo o de
   * búsqueda mientras viajaba) se descarta en vez de pisar la lista buena. */
  const requestIdRef = useRef(0);

  const [now, setNow] = useState(() => new Date());

  // ── Catálogo ──────────────────────────────────────────────────────────────
  const [catalog, setCatalog] = useState<PermissionCatalog>(EMPTY_CATALOG);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // ── Detalle ───────────────────────────────────────────────────────────────
  const [detailVisible, setDetailVisible] = useState(false);
  const [detail, setDetail] = useState<MyPermission | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Edición ───────────────────────────────────────────────────────────────
  const [editVisible, setEditVisible] = useState(false);
  const [editPermission, setEditPermission] = useState<MyPermission | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [editPreselect, setEditPreselect] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ── Estado inline / eliminar / crear ──────────────────────────────────────
  const [stateTarget, setStateTarget] = useState<{
    permission: MyPermission;
    stateDef: PermissionCatalogTag | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MyPermission | null>(null);
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

  // ── Modo persistido ───────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    Storage.getItemAsync(SOURCE_STORAGE_KEY)
      .then((raw) => {
        if (!alive) return;
        setSource(raw === "historico" ? "historico" : "local");
        setSourceReady(true);
      })
      .catch(() => {
        if (alive) setSourceReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const chooseSource = useCallback((next: PermissionSource) => {
    setSource(next);
    Storage.setItemAsync(SOURCE_STORAGE_KEY, next).catch(() => undefined);
  }, []);

  // ── Búsqueda con debounce ─────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Reloj de vencimiento ──────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // ── Catálogo ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !urlColegio) return;
    let alive = true;
    fetchPermissionCatalog({ token, urlColegio, categoryIds: seedCategoryIds, schoolId })
      .then((result) => {
        if (!alive) return;
        setCatalog(result);
        setCatalogError(
          result.actionTags.length === 0 && result.typeCategoryId == null
            ? "La escuela no tiene configurado el catálogo de permisos."
            : null,
        );
      })
      .catch((error: any) => {
        console.error("permissions/catalog:", error?.response?.data?.message ?? error?.message);
        if (alive) setCatalogError("No se pudo cargar el catálogo de permisos.");
      });
    return () => {
      alive = false;
    };
  }, [token, urlColegio, seedCategoryIds, schoolId]);

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
        const result = await fetchAdminPermissionsPage({
          token,
          urlColegio,
          source,
          page,
          rows: ADMIN_PERMISSION_ROWS,
          search,
        });
        if (requestId !== requestIdRef.current) return;
        pageRef.current = page;
        setHasMore(result.hasMore);
        setItems((previous) => (mode === "append" ? [...previous, ...result.items] : result.items));
      } catch (error: any) {
        if (requestId !== requestIdRef.current) return;
        console.error("permissions/load:", error?.response?.data?.message ?? error?.message);
        setListError("No se pudieron cargar los permisos.");
        if (mode !== "append") setItems([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [urlColegio, token, source, search],
  );

  // Primera carga, cambio de modo y cambio de búsqueda reinician el listado.
  useEffect(() => {
    if (!sourceReady) return;
    // Mismo patrón de fetch-on-mount que mypermissions.tsx: `load` prende el
    // spinner de forma síncrona para no dejar un frame con la lista vieja.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver arriba
    load("replace");
  }, [load, sourceReady]);

  const handleEndReached = useCallback(() => {
    if (loading || loadingMore || refreshing || !hasMore) return;
    load("append");
  }, [loading, loadingMore, refreshing, hasMore, load]);

  const handleRefresh = useCallback(() => load("refresh"), [load]);

  // ── Decisiones por fila ───────────────────────────────────────────────────
  const decide = useCallback(
    (permission: MyPermission): RowDecision => {
      const stateDef = resolveStateTagDefinition(permission, catalog.stateTags);
      const context = { isHistorical: permission.source === "historico", now };
      return {
        stateDef,
        expired: isPermissionExpired(permission, now),
        // Editar/dropdown se deciden con el stateTag de la fila, no con stateDef.
        canEdit: canEditPermission(permission, context),
        canDelete: canDeletePermission(permission, stateDef, context),
        canView: canViewPermission(context),
      };
    },
    [catalog.stateTags, now],
  );

  // ── Detalle ───────────────────────────────────────────────────────────────
  const openDetail = useCallback(
    async (permission: MyPermission) => {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      setDetailVisible(true);
      if (!urlColegio || !token) {
        setDetailLoading(false);
        setDetailError("No hay sesión activa.");
        return;
      }
      try {
        const result = await fetchAdminPermissionDetail({
          token,
          urlColegio,
          id: permission.id,
          source: permission.source,
        });
        if (!result) setDetailError("Permiso no encontrado");
        // El detalle trae el grafo completo, pero no siempre `stateTag`
        // expandido igual que el listado: la fila queda de respaldo.
        else setDetail({ ...permission, ...result });
      } catch (error: any) {
        console.error("permissions/detail:", error?.response?.data?.message ?? error?.message);
        setDetailError("Permiso no encontrado");
      } finally {
        setDetailLoading(false);
      }
    },
    [urlColegio, token],
  );

  // ── Edición ───────────────────────────────────────────────────────────────
  const openEdit = useCallback(
    async (permission: MyPermission, preselectStateTagId: number | null = null) => {
      setDetailVisible(false);
      setEditPermission(null);
      setEditLoadError(null);
      setEditError(null);
      setEditPreselect(preselectStateTagId);
      setEditLoading(true);
      setEditVisible(true);
      if (!urlColegio || !token) {
        setEditLoading(false);
        setEditLoadError("No hay sesión activa.");
        return;
      }
      try {
        // Se edita contra el DETALLE: el listado no trae adjuntos ni
        // comentarios, y el diff de attachmentsD se calcula sobre el array real.
        const result = await fetchAdminPermissionDetail({
          token,
          urlColegio,
          id: permission.id,
          source: permission.source,
        });
        if (!result) setEditLoadError("Permiso no encontrado");
        else setEditPermission({ ...permission, ...result });
      } catch (error: any) {
        console.error("permissions/openEdit:", error?.response?.data?.message ?? error?.message);
        setEditLoadError("Permiso no encontrado");
      } finally {
        setEditLoading(false);
      }
    },
    [urlColegio, token],
  );

  const submitEdit = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!editPermission || !urlColegio || !token) return;
      setEditSaving(true);
      setEditError(null);
      const result = await patchPermission({
        token,
        urlColegio,
        source: editPermission.source,
        id: editPermission.id,
        body: payload,
      });
      setEditSaving(false);
      if (!result.ok) {
        setEditError(result.message || "No se pudo guardar el permiso.");
        return;
      }
      setEditVisible(false);
      load("refresh");
    },
    [editPermission, urlColegio, token, load],
  );

  // ── Cambio de estado inline ───────────────────────────────────────────────
  const chooseState = useCallback(
    async (tag: PermissionCatalogTag) => {
      const target = stateTarget;
      setStateTarget(null);
      if (!target || !urlColegio || !token) return;
      if (Number(tag.id) === Number(target.permission.stateTag?.id)) return;

      // Rechazo/cancelación NO se PATCHea directo: exige comentario o adjunto,
      // y esa regla solo existe del lado del cliente.
      if (isRejectionStateTag(tag)) {
        openEdit(target.permission, Number(tag.id));
        return;
      }

      const result = await updatePermissionState({
        token,
        urlColegio,
        source: target.permission.source,
        id: target.permission.id,
        stateTagId: Number(tag.id),
      });
      if (!result.ok) {
        Alert.alert("No se pudo cambiar el estado", result.message || "Intenta de nuevo.");
        setNow(new Date());
        return;
      }
      load("refresh");
    },
    [stateTarget, urlColegio, token, openEdit, load],
  );

  // ── Eliminar ──────────────────────────────────────────────────────────────
  const confirmDelete = useCallback(async () => {
    const target = deleteTarget;
    if (!target || !urlColegio || !token) return;
    setDeleting(true);
    const result = await deletePermission({
      token,
      urlColegio,
      source: target.source,
      id: target.id,
    });
    setDeleting(false);
    setDeleteTarget(null);
    if (!result.ok) {
      Alert.alert("No se pudo eliminar", result.message || "Intenta de nuevo.");
      setNow(new Date());
      return;
    }
    setDetailVisible(false);
    load("refresh");
  }, [deleteTarget, urlColegio, token, load]);

  // ── Crear ─────────────────────────────────────────────────────────────────
  const handleCreated = useCallback(
    (message: string) => {
      setCreateVisible(false);
      Alert.alert("Permiso registrado", message);
      // Lo nuevo nace en la tabla local: en Histórico no hay nada que refrescar.
      if (source === "local") load("refresh");
    },
    [source, load],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: MyPermission }) => (
      <PermissionCard
        item={item}
        decision={decide(item)}
        isHistorical={item.source === "historico"}
        styles={styles}
        onOpen={openDetail}
        onStatePress={(permission, stateDef) => setStateTarget({ permission, stateDef })}
        onEdit={(permission) => openEdit(permission)}
        onDelete={setDeleteTarget}
      />
    ),
    [decide, styles, openDetail, openEdit],
  );

  const detailDecision = useMemo(() => (detail ? decide(detail) : null), [detail, decide]);

  const stateOptions = useMemo(
    () => (stateTarget ? allowedStateTags(stateTarget.stateDef, catalog.stateTags) : []),
    [stateTarget, catalog.stateTags],
  );

  return (
    <View style={styles.screen}>
      {/* ── Local / Histórico + búsqueda ── */}
      <View style={[styles.toolbar, isTablet && styles.contentTablet]}>
        <View style={styles.segmented}>
          {SOURCES.map((option) => {
            const active = source === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => chooseSource(option)}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {ADMIN_PERMISSION_SOURCE_LABELS[option]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Buscar permisos…"
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
          <Text style={styles.stateText}>Cargando permisos…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.source}-${item.id}`}
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
                {listError ?? (search ? "Sin resultados para la búsqueda" : "No hay permisos que mostrar")}
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

      {/* Agregar: el webapp lo oculta en Histórico (addButton vacío). */}
      {!isHistorical && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setCreateVisible(true)}
          activeOpacity={0.85}
          accessibilityLabel="Agregar permiso"
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}

      <TagOptionSheet
        visible={stateTarget !== null}
        title="Cambiar estado"
        options={stateOptions}
        selectedId={stateTarget?.permission.stateTag?.id ?? null}
        emptyText="El catálogo de estados no está disponible."
        onSelect={chooseState}
        onClose={() => setStateTarget(null)}
      />

      <AdminPermissionDetailModal
        visible={detailVisible}
        permission={detail}
        loading={detailLoading}
        error={detailError}
        urlColegio={urlColegio}
        isHistorical={detail?.source === "historico"}
        expired={detailDecision?.expired ?? false}
        canEdit={detailDecision?.canEdit ?? false}
        canDelete={detailDecision?.canDelete ?? false}
        onClose={() => setDetailVisible(false)}
        onEdit={() => detail && openEdit(detail)}
        onDelete={() => detail && setDeleteTarget(detail)}
      />

      <AdminPermissionEditModal
        visible={editVisible}
        permission={editPermission}
        loading={editLoading}
        loadError={editLoadError}
        stateTags={catalog.stateTags}
        preselectedStateTagId={editPreselect}
        saving={editSaving}
        submitError={editError}
        onClose={() => setEditVisible(false)}
        onSubmit={submitEdit}
      />

      <AdminPermissionCreateModal
        visible={createVisible}
        token={token}
        urlColegio={urlColegio}
        actionTags={catalog.actionTags}
        typeCategoryId={catalog.typeCategoryId}
        catalogError={catalogError}
        onClose={() => setCreateVisible(false)}
        onCreated={handleCreated}
      />

      {/* ── Confirmar eliminar — mismo patrón visual que el logout del drawer ── */}
      <Modal
        transparent
        visible={deleteTarget !== null}
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirmar Eliminar</Text>
            <Text style={styles.modalMessage}>¿Está seguro que desea eliminar este permiso?</Text>
            {!!deleteTarget?.subject && (
              <Text style={styles.modalFocus} numberOfLines={2}>
                {deleteTarget.subject}
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
      gap: verticalScale(10),
    },
    segmented: {
      flexDirection: "row",
      backgroundColor: "#fff",
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: RADIUS_MD,
      padding: scale(3),
      gap: scale(3),
    },
    segment: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS_MD,
      paddingVertical: verticalScale(8),
    },
    segmentActive: { backgroundColor: "#2563EB" },
    segmentText: { fontSize: font(13), fontWeight: "600", color: "#6B7280" },
    segmentTextActive: { color: "#fff", fontWeight: "700" },
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
    /** Mismo tinte que setRowStyle del webapp para filas vencidas. */
    cardExpired: { backgroundColor: "#FFF1F2", borderColor: "#FFCDD2" },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: scale(8),
    },
    cardTopRight: { alignItems: "flex-end", gap: verticalScale(3) },
    stateChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(4),
      borderRadius: RADIUS_SM,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(5),
    },
    stateChipText: { fontSize: font(12), fontWeight: "700" },
    expiredMark: { flexDirection: "row", alignItems: "center", gap: scale(3) },
    expiredMarkText: { fontSize: font(10), color: "#B91C1C", fontWeight: "700" },
    cardDate: { fontSize: font(12), color: "#374151", fontWeight: "700" },
    requesterLabel: {
      fontSize: font(11),
      color: "#6B7280",
      fontWeight: "600",
      marginTop: verticalScale(10),
    },
    requesterName: {
      fontSize: font(14),
      fontWeight: "700",
      color: "#111827",
      marginTop: verticalScale(2),
    },
    cardTags: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: scale(6),
      marginTop: verticalScale(8),
    },
    chipSm: {
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(3),
    },
    chipSmText: { fontSize: font(10), fontWeight: "700" },
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(8),
      marginTop: verticalScale(9),
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
      paddingTop: verticalScale(9),
    },
    cardFooterInfo: { flex: 1, gap: verticalScale(3) },
    footerLine: { flexDirection: "row", alignItems: "center", gap: scale(6) },
    cardFooterText: { flex: 1, fontSize: font(12), color: "#6B7280" },
    rowActions: { flexDirection: "row", alignItems: "center", gap: scale(4) },
    iconBtn: {
      padding: scale(6),
      borderRadius: RADIUS_SM,
      backgroundColor: "#F9FAFB",
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
