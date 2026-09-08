import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
  RADIUS_XL,
  useResponsive,
} from "@/constants/responsive";
import { useSchoolStore } from "../../../store/useSchoolStore";
import PermissionDetailView from "../../components/timeoff/PermissionDetailView";
import { formatDisplayDate, formatDisplayTime } from "../../components/timeoff/RevisionFinalModal";
import {
  fetchMyPermissionsPage,
  fetchPermissionDetail,
  initialPermissionCursor,
  MY_PERMISSIONS_ROWS,
  parsePermissionScope,
  PERMISSION_SCOPE_LABELS,
  PERMISSION_SCOPE_STORAGE_KEY,
  PERMISSION_SCOPES,
  permissionDateKey,
  readSchoolUsersId,
  type MyPermission,
  type PermissionScope,
  type PermissionTagRef,
} from "../../utils/permissionRules";
import { decodeJWT } from "../../utils/session";
import * as Storage from "../../utils/storage";

/** Colores por defecto de un chip cuando el tag no trae los suyos. */
const CHIP_FALLBACK = { background: "#E5E7EB", text: "#374151" };

function chipColors(tag: PermissionTagRef | null | undefined) {
  return {
    backgroundColor: tag?.color || CHIP_FALLBACK.background,
    color: tag?.fontColor || CHIP_FALLBACK.text,
  };
}

/** "9:00 a.m. — 11:00 a.m.", o "—" si el permiso no trae horas. */
function scheduleLabel(permission: MyPermission): string {
  const from = permission.fromTime ? formatDisplayTime(permission.fromTime) : "";
  const to = permission.toTime ? formatDisplayTime(permission.toTime) : "";
  if (!from && !to) return "—";
  if (!to) return from;
  if (!from) return to;
  return `${from} — ${to}`;
}

export default function MyPermissionsScreen() {
  const { scale, verticalScale, font, isTablet } = useResponsive();
  const styles = useMemo(
    () => createStyles(scale, verticalScale, font),
    [scale, verticalScale, font],
  );

  const { user, urlColegio } = useSchoolStore();

  /**
   * "Mis Permisos" es siempre sobre uno mismo y el listado NO pide
   * `schoolUser:user.fullName`, así que el nombre sale del usuario logueado en
   * vez de gastar un campo del request en algo que ya se tiene.
   */
  const myFullName = user?.user?.fullName ?? "";

  const [token, setToken] = useState<string | null>(
    () => useSchoolStore.getState().token,
  );

  /**
   * El schoolUsers.id que acota TODO el listado. Sale del claim del propio JWT
   * — mismo mecanismo que getStudents.ts usa con `parentId` — y no de un
   * .find() sobre el store como hace el webapp, cuyo find sin fallback puede
   * quedar undefined y terminar listando permisos de toda la escuela.
   */
  const schoolUserId = useMemo(
    () => (token ? readSchoolUsersId(decodeJWT(token)) : null),
    [token],
  );

  // ── Filtro (único de la pantalla) ─────────────────────────────────────────
  const [scope, setScope] = useState<PermissionScope>("todos");
  /** Hasta que no se leyó el filtro persistido no se pide la primera página,
   * si no se cargaría "Todos" y acto seguido lo que el usuario había dejado. */
  const [scopeReady, setScopeReady] = useState(false);

  // ── Listado ───────────────────────────────────────────────────────────────
  const [items, setItems] = useState<MyPermission[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  /** Posición de lectura en las dos tablas. En un ref porque cambia en cada
   * fetch y no debe disparar un render por sí mismo. */
  const cursorRef = useRef(initialPermissionCursor());

  /** Sella cada carga: una respuesta cuyo sello ya no es el vigente (el
   * usuario cambió de filtro mientras viajaba) se descarta en vez de pisar la
   * lista buena. */
  const requestIdRef = useRef(0);

  // ── Detalle ───────────────────────────────────────────────────────────────
  const [detailVisible, setDetailVisible] = useState(false);
  const [detail, setDetail] = useState<MyPermission | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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

  // ── Filtro persistido ─────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    Storage.getItemAsync(PERMISSION_SCOPE_STORAGE_KEY)
      .then((raw) => {
        if (!alive) return;
        setScope(parsePermissionScope(raw));
        setScopeReady(true);
      })
      .catch(() => {
        // Sin storage disponible el filtro simplemente no persiste; la
        // pantalla igual tiene que abrir.
        if (alive) setScopeReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const chooseScope = useCallback((next: PermissionScope) => {
    setScope(next);
    Storage.setItemAsync(PERMISSION_SCOPE_STORAGE_KEY, next).catch(() => undefined);
  }, []);

  // ── Carga ─────────────────────────────────────────────────────────────────
  /**
   * `mode` elige a la vez qué indicador se prende y qué se hace con lo que
   * llegue: "replace" es una carga desde cero (spinner de pantalla completa),
   * "refresh" la misma carga con el spinner del pull-to-refresh, y "append" la
   * página siguiente del scroll infinito.
   */
  const load = useCallback(
    async (mode: "replace" | "refresh" | "append") => {
      if (mode === "append") setLoadingMore(true);
      else if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      if (!urlColegio || !token || schoolUserId == null) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        setListError("No hay sesión activa.");
        return;
      }

      const requestId = ++requestIdRef.current;
      if (mode !== "append") {
        setListError(null);
        cursorRef.current = initialPermissionCursor();
      }

      try {
        const page = await fetchMyPermissionsPage({
          token,
          urlColegio,
          schoolUserId,
          scope,
          cursor: cursorRef.current,
          rows: MY_PERMISSIONS_ROWS,
        });
        if (requestId !== requestIdRef.current) return;

        cursorRef.current = page.cursor;
        setHasMore(page.hasMore);
        setItems((previous) =>
          mode === "append" ? [...previous, ...page.items] : page.items,
        );
      } catch (error: any) {
        if (requestId !== requestIdRef.current) return;
        console.error(
          "mypermissions/load:",
          error?.response?.data?.message ?? error?.message,
        );
        setListError("No se pudieron cargar tus permisos.");
        if (mode !== "append") setItems([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [urlColegio, token, schoolUserId, scope],
  );

  // Primera carga y cualquier cambio de filtro reinician el listado.
  useEffect(() => {
    if (!scopeReady) return;
    // `load` prende el spinner de forma síncrona antes de salir a la red, que
    // es justo lo que la regla marca. Es el patrón de fetch-on-mount de todo el
    // repo (punchinout.tsx, adminpunchinout.tsx) y prender el indicador después
    // del primer await dejaría un frame con la lista vieja ya invalidada por el
    // filtro nuevo.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver arriba
    load("replace");
  }, [load, scopeReady]);

  const handleEndReached = useCallback(() => {
    if (loading || loadingMore || refreshing || !hasMore) return;
    load("append");
  }, [loading, loadingMore, refreshing, hasMore, load]);

  const handleRefresh = useCallback(() => load("refresh"), [load]);

  // ── Detalle ───────────────────────────────────────────────────────────────
  const openDetail = useCallback(
    async (permission: MyPermission) => {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      setDetailVisible(true);

      if (!urlColegio || !token || schoolUserId == null) {
        setDetailLoading(false);
        setDetailError("Permiso no encontrado");
        return;
      }

      try {
        const result = await fetchPermissionDetail({
          token,
          urlColegio,
          id: permission.id,
          // El origen se guardó al listar: el detalle de un archivado solo
          // existe en userdaypermissionsh.
          source: permission.source,
          schoolUsersId: schoolUserId,
        });
        // null cubre "no existe" y "es de otro usuario" — mismo mensaje para
        // los dos, a propósito.
        if (!result) setDetailError("Permiso no encontrado");
        else setDetail(result);
      } catch (error: any) {
        console.error(
          "mypermissions/openDetail:",
          error?.response?.data?.message ?? error?.message,
        );
        setDetailError("Permiso no encontrado");
      } finally {
        setDetailLoading(false);
      }
    },
    [urlColegio, token, schoolUserId],
  );

  // ── Card ──────────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: MyPermission }) => {
      const state = chipColors(item.stateTag);
      const action = chipColors(item.actionTag);
      const type = chipColors(item.typeTag);
      const date = permissionDateKey(item.permissionDate);

      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() => openDetail(item)}
          activeOpacity={0.8}
        >
          <View style={styles.cardTop}>
            <View style={[styles.chip, { backgroundColor: state.backgroundColor }]}>
              <Text style={[styles.chipText, { color: state.color }]}>
                {item.stateTag?.name ?? "—"}
              </Text>
            </View>
            <View style={styles.cardTopRight}>
              {/* En "Todos" las dos tablas se mezclan y sin esto no hay forma
                  de distinguir un permiso archivado de uno vigente. */}
              {item.source === "historico" && (
                <View style={styles.historyMark}>
                  <Ionicons name="archive-outline" size={11} color="#6B7280" />
                  <Text style={styles.historyMarkText}>Histórico</Text>
                </View>
              )}
              <Text style={styles.cardDate}>
                {date ? formatDisplayDate(date) : "—"}
              </Text>
            </View>
          </View>

          <Text style={styles.cardSubject} numberOfLines={2}>
            {item.subject || "Sin asunto"}
          </Text>

          <View style={styles.cardTags}>
            {!!item.actionTag?.name && (
              <View
                style={[styles.chipSm, { backgroundColor: action.backgroundColor }]}
              >
                <Text style={[styles.chipSmText, { color: action.color }]}>
                  {item.actionTag.name}
                </Text>
              </View>
            )}
            {!!item.typeTag?.name && (
              <View
                style={[styles.chipSm, { backgroundColor: type.backgroundColor }]}
              >
                <Text style={[styles.chipSmText, { color: type.color }]}>
                  {item.typeTag.name}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cardFooter}>
            <Ionicons name="time-outline" size={13} color="#6B7280" />
            <Text style={styles.cardFooterText} numberOfLines={1}>
              {scheduleLabel(item)}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </View>
        </TouchableOpacity>
      );
    },
    [styles, openDetail],
  );

  return (
    <View style={styles.screen}>
      {/* ── Filtro: Todos / Local / Histórico ── */}
      <View style={[styles.filterBar, isTablet && styles.contentTablet]}>
        <View style={styles.segmented}>
          {PERMISSION_SCOPES.map((option) => {
            const active = scope === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => chooseScope(option)}
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.segmentText, active && styles.segmentTextActive]}
                >
                  {PERMISSION_SCOPE_LABELS[option]}
                </Text>
              </TouchableOpacity>
            );
          })}
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
          contentContainerStyle={[
            styles.listContent,
            isTablet && styles.contentTablet,
          ]}
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.stateBox}>
              <Ionicons
                name={listError ? "alert-circle-outline" : "document-outline"}
                size={34}
                color="#9CA3AF"
              />
              <Text style={styles.stateTitle}>
                {listError ?? "No hay permisos que mostrar"}
              </Text>
              {!!listError && (
                <TouchableOpacity
                  onPress={() => load("replace")}
                  activeOpacity={0.75}
                >
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

      <PermissionDetailView
        visible={detailVisible}
        permission={detail}
        loading={detailLoading}
        error={detailError}
        urlColegio={urlColegio}
        fallbackFullName={myFullName}
        onClose={() => setDetailVisible(false)}
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

    /**
     * Centra y limita el contenido en tablet, igual que punchinout.tsx.
     * `width: "100%"` es necesario porque `alignSelf: "center"` solo haría
     * colapsar el bloque a su ancho intrínseco.
     */
    contentTablet: {
      maxWidth: MAX_CONTENT_WIDTH,
      alignSelf: "center",
      width: "100%",
    },

    filterBar: {
      paddingHorizontal: scale(16),
      paddingTop: verticalScale(12),
      paddingBottom: verticalScale(2),
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

    listContent: {
      padding: scale(16),
      paddingTop: verticalScale(12),
      gap: verticalScale(10),
      paddingBottom: verticalScale(40),
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
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: scale(8),
    },
    cardTopRight: { alignItems: "flex-end", gap: verticalScale(3) },
    historyMark: { flexDirection: "row", alignItems: "center", gap: scale(3) },
    historyMarkText: { fontSize: font(10), color: "#6B7280", fontWeight: "600" },
    cardDate: { fontSize: font(12), color: "#374151", fontWeight: "700" },

    chip: {
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(10),
      paddingVertical: verticalScale(4),
    },
    chipText: { fontSize: font(11), fontWeight: "700" },
    chipSm: {
      borderRadius: RADIUS_PILL,
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(3),
    },
    chipSmText: { fontSize: font(10), fontWeight: "700" },

    cardSubject: {
      fontSize: font(14),
      fontWeight: "700",
      color: "#111827",
      marginTop: verticalScale(9),
    },
    cardTags: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: scale(6),
      marginTop: verticalScale(8),
    },
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(6),
      marginTop: verticalScale(9),
      borderTopWidth: 1,
      borderTopColor: "#F3F4F6",
      paddingTop: verticalScale(9),
    },
    cardFooterText: { flex: 1, fontSize: font(12), color: "#6B7280" },

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
