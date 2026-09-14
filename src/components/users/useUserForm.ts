import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSchoolStore } from "../../../store/useSchoolStore";
import {
  applyCategoryTags,
  applyCreatedTag,
  applyRoleChange,
  applyScheduleBulk,
  applySelectAllCategory,
  applySettingToggle,
  buildCreateUserPayload,
  buildEmptyUserForm,
  buildPatchUserPayload,
  buildSimpleTagPayload,
  buildUserFormFromDetail,
  clearAllSchedules,
  clearLunchSchedules,
  computeScheduleDiff,
  createDefaultScheduleRows,
  createTag,
  createUser,
  fetchRolesAll,
  fetchTagsAll,
  fetchUserDetail,
  generateUserPin,
  hasScheduleChanges,
  patchUser,
  readCompanyScheduleContext,
  readCompanyUserSettings,
  resolveRoleCapabilities,
  schedulesFromDetail,
  snapshotUserForm,
  validateScheduleRows,
  validateTagName,
  validateUserForm,
  type ScheduleBulkScope,
  type ScheduleField,
  type ScheduleRow,
  type UserDetail,
  type UserFormData,
  type UserFormErrorKey,
  type UserFormErrors,
  type UserFormMode,
  type UserFormTag,
  type UserRole,
  type UserSettingKey,
} from "../../utils/userFormRules";
import { getUserCategories, type UserCategory } from "../../utils/usersRules";
import {
  addressLocation,
  applyFormattedAddressEdit,
  applyGeocodeToDraft,
  buildAddressToSave,
  DEFAULT_MAP_CENTER,
  draftFromAddress,
  emptyAddressDraft,
  formatAddress,
  geocodeLocation,
  type AddressDraft,
  type AddressTextField,
  type GeocodeResult,
  type LatLng,
} from "../../utils/addressRules";

/** Campos de texto editables directamente con setField. */
export type UserTextField =
  | "fullName"
  | "nickName"
  | "email"
  | "code"
  | "pin"
  | "phone"
  | "waId"
  | "password"
  | "cedula";

const FIELD_ERROR: Partial<Record<UserTextField, UserFormErrorKey>> = {
  fullName: "fullName",
  email: "email",
  phone: "phone",
  password: "password",
  cedula: "cedula",
};

interface UseUserFormArgs {
  initialMode: UserFormMode;
  userId: number | null;
  token: string | null;
  urlColegio: string | null;
}

export type UserSubmitResult =
  | { status: "invalid"; tab: "info" | "schedules" }
  | { status: "error"; message: string }
  | { status: "saved"; mode: "add" | "edit"; messageAlert: string | null };

export type CreateTagResult = { ok: true } | { ok: false; message: string };

/**
 * Estado centralizado del formulario de Usuario (equivalente a los useState
 * de MtnUserCrud en el webapp). Las tabs solo leen/llaman a lo que expone.
 */
export function useUserForm({ initialMode, userId, token, urlColegio }: UseUserFormArgs) {
  const settings = useSchoolStore((s) => s.user?.school?.settings ?? s.school?.settings);
  const company = useMemo(() => readCompanyUserSettings(settings), [settings]);
  const companySchedule = useMemo(() => readCompanyScheduleContext(settings), [settings]);
  /** Solo para sembrar el formulario: si el store refresca `settings` con el
   * modal abierto no se vuelve a pedir el usuario (pisaría lo editado). */
  const companyRef = useRef(company);
  useEffect(() => {
    companyRef.current = company;
  }, [company]);

  const [mode, setMode] = useState<UserFormMode>(initialMode);
  const [initialForm, setInitialForm] = useState<UserFormData>(() => buildEmptyUserForm(company));
  const [form, setForm] = useState<UserFormData>(initialForm);
  const [errors, setErrors] = useState<UserFormErrors>({});

  // ── Horarios ──────────────────────────────────────────────────────────────
  const [initialSchedules, setInitialSchedules] = useState<ScheduleRow[]>(createDefaultScheduleRows);
  const [schedules, setSchedules] = useState<ScheduleRow[]>(initialSchedules);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // ── Dirección (borrador del MapAddressSelector) ───────────────────────────
  // Vive en el hook y no en la tab para no perderse al cambiar de tab. Se
  // vuelca a `form.address` con saveAddressDraft (el "Guardar" del modal del
  // webapp); el textarea de formattedAddress escribe directo en form.address.
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(emptyAddressDraft);
  const [addressCoords, setAddressCoords] = useState<LatLng>({ ...DEFAULT_MAP_CENTER });
  /** false = sin coordenadas guardadas ni pin movido: el mapa queda en el centro por defecto. */
  const [addressHasLocation, setAddressHasLocation] = useState(false);
  /** El usuario escribió el textarea a mano: ya no se autogenera al editar campos. */
  const [formattedManual, setFormattedManual] = useState(false);

  const seedAddress = useCallback((address: UserFormData["address"]) => {
    const saved = address?.[0] ?? null;
    const coords = addressLocation(saved);
    setAddressDraft(draftFromAddress(saved));
    setAddressCoords(coords ?? { ...DEFAULT_MAP_CENTER });
    setAddressHasLocation(coords !== null);
    setFormattedManual(false);
  }, []);

  // ── Catálogos ─────────────────────────────────────────────────────────────
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [allTags, setAllTags] = useState<UserFormTag[]>([]);
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !urlColegio) return;
    let alive = true;
    Promise.allSettled([
      fetchRolesAll({ token, urlColegio }),
      fetchTagsAll({ token, urlColegio }),
      getUserCategories({ token, urlColegio }),
    ]).then(([rolesResult, tagsResult, categoriesResult]) => {
      if (!alive) return;
      if (rolesResult.status === "fulfilled") setRoles(rolesResult.value);
      if (tagsResult.status === "fulfilled") setAllTags(tagsResult.value);
      if (categoriesResult.status === "fulfilled") setCategories(categoriesResult.value);
      const failed = [rolesResult, tagsResult, categoriesResult].some((r) => r.status === "rejected");
      setCatalogError(failed ? "No se pudieron cargar roles, sucursales o departamentos." : null);
    });
    return () => {
      alive = false;
    };
  }, [token, urlColegio]);

  // ── Prefetch del registro completo (edit/watch) ───────────────────────────
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(initialMode !== "add" && userId != null);
  const [detailError, setDetailError] = useState<string | null>(null);

  /**
   * El snapshot inicial refleja EXACTAMENTE lo que vino del backend: el
   * apagado de settings de TC por rol solo ocurre en setRole (cambio del
   * dropdown), nunca al sembrar — así "cambios sin guardar" se comporta
   * igual que en el webapp.
   */
  const seedFromDetail = useCallback((result: UserDetail) => {
    const seeded = buildUserFormFromDetail(result, companyRef.current);
    const seededSchedules = schedulesFromDetail(result);
    setDetail(result);
    setInitialForm(seeded);
    setForm(seeded);
    setInitialSchedules(seededSchedules);
    setSchedules(seededSchedules);
    seedAddress(seeded.address);
  }, [seedAddress]);

  const loadDetail = useCallback(async () => {
    if (initialMode === "add" || userId == null) return;
    if (!token || !urlColegio) {
      setDetailLoading(false);
      setDetailError("No hay sesión activa.");
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    try {
      const result = await fetchUserDetail({ token, urlColegio, id: userId });
      if (!result) {
        setDetailError("No se pudo cargar el usuario.");
        return;
      }
      seedFromDetail(result);
    } catch (error: any) {
      console.error("users/detail:", error?.response?.data?.message ?? error?.message);
      setDetailError("No se pudo cargar el usuario.");
    } finally {
      setDetailLoading(false);
    }
  }, [initialMode, userId, token, urlColegio, seedFromDetail]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, mismo patrón que permissions.tsx
    loadDetail();
  }, [loadDetail]);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const capabilities = useMemo(() => resolveRoleCapabilities(roles, form.role), [roles, form.role]);

  const isUserImageRequired =
    company.companyIsImageRequired &&
    capabilities.canApplyTimeControl &&
    form.isImageRequired === true;

  const showScheduleTab = capabilities.canApplySchedule && company.companyIsTimeControlDefault;

  const scheduleDirty = useMemo(
    () => capabilities.canApplySchedule && hasScheduleChanges(computeScheduleDiff(initialSchedules, schedules)),
    [capabilities.canApplySchedule, initialSchedules, schedules],
  );

  const isDirty = useMemo(
    () => scheduleDirty || snapshotUserForm(initialForm, mode) !== snapshotUserForm(form, mode),
    [scheduleDirty, initialForm, form, mode],
  );

  // ── Acciones: datos básicos ───────────────────────────────────────────────
  const clearError = useCallback((key: UserFormErrorKey | undefined) => {
    if (!key) return;
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const setField = useCallback(
    (field: UserTextField, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      clearError(FIELD_ERROR[field]);
    },
    [clearError],
  );

  const setActive = useCallback((value: boolean) => {
    setForm((prev) => ({ ...prev, isActive: value }));
  }, []);

  const setPhoto = useCallback(
    (dataUrl: string | null) => {
      setForm((prev) => ({ ...prev, photourl: dataUrl ? [dataUrl] : [] }));
      clearError("image");
    },
    [clearError],
  );

  /** Único punto donde se resetean isCreateExcuses y los settings de TC por rol. */
  const setRole = useCallback(
    (roleId: number | "") => {
      setForm((prev) => applyRoleChange(prev, roleId, roles));
      clearError("role");
    },
    [roles, clearError],
  );

  const toggleSetting = useCallback((key: UserSettingKey, value: boolean) => {
    setForm((prev) => applySettingToggle(prev, key, value));
  }, []);

  // ── Acciones: tags ────────────────────────────────────────────────────────
  const setCategoryTags = useCallback(
    (categoryId: number, selectedIds: number[]) => {
      setForm((prev) => applyCategoryTags(prev, categoryId, selectedIds, allTags, categories));
    },
    [allTags, categories],
  );

  const selectAllCategory = useCallback(
    (categoryId: number, checked: boolean) => {
      setForm((prev) => applySelectAllCategory(prev, categoryId, checked, allTags, categories));
    },
    [allTags, categories],
  );

  const setDefTag = useCallback((field: "branchTagId" | "departmentTagId", value: number | "") => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  /** Botón "+": POST /tags con los defaults de TagsCrud y autoselección. */
  const createCategoryTag = useCallback(
    async (category: UserCategory, name: string): Promise<CreateTagResult> => {
      const nameError = validateTagName(name);
      if (nameError) return { ok: false, message: nameError };
      if (!token || !urlColegio) return { ok: false, message: "No hay sesión activa." };
      const result = await createTag({
        token,
        urlColegio,
        payload: buildSimpleTagPayload(name, category),
      });
      if (!result.ok || !result.data) {
        return { ok: false, message: result.message || "No se pudo crear la etiqueta." };
      }
      const created = result.data;
      // Updates funcionales: si el usuario tocó el form mientras viajaba el
      // POST, no se pisa. La búsqueda de tags incluye los ya seleccionados
      // del form por si allTags cambió en el medio.
      setAllTags((prev) =>
        prev.some((tag) => tag.id === created.id)
          ? prev
          : [...prev, { ...created, categoryId: created.categoryId ?? category.id }],
      );
      setForm(
        (prev) => applyCreatedTag(prev, [...allTags, ...prev.tags], created, category.id, categories).form,
      );
      return { ok: true };
    },
    [token, urlColegio, allTags, categories],
  );

  // ── Acciones: horarios ────────────────────────────────────────────────────
  const setScheduleField = useCallback((weekDay: string, field: ScheduleField, value: string) => {
    setSchedules((prev) => prev.map((row) => (row.weekDay === weekDay ? { ...row, [field]: value } : row)));
    setScheduleError(null);
  }, []);

  const applyBulk = useCallback(
    (scope: ScheduleBulkScope, values: Partial<Pick<ScheduleRow, ScheduleField>>) => {
      setSchedules((prev) => applyScheduleBulk(prev, scope, values));
      setScheduleError(null);
    },
    [],
  );

  const clearSchedules = useCallback(() => {
    setSchedules((prev) => clearAllSchedules(prev));
    setScheduleError(null);
  }, []);

  const clearLunch = useCallback(() => {
    setSchedules((prev) => clearLunchSchedules(prev));
    setScheduleError(null);
  }, []);

  // ── Acciones: dirección ───────────────────────────────────────────────────
  const setAddressField = useCallback(
    (field: Exclude<AddressTextField, "formattedAddress">, value: string) => {
      setAddressDraft((prev) => {
        const next = { ...prev, [field]: value };
        return formattedManual ? next : { ...next, formattedAddress: formatAddress(next) };
      });
    },
    [formattedManual],
  );

  /** Textarea "Dirección:" — texto manual que reemplaza al autogenerado. */
  const setAddressFormatted = useCallback((text: string) => {
    setFormattedManual(true);
    setAddressDraft((prev) => ({ ...prev, formattedAddress: text }));
    setForm((prev) => ({ ...prev, address: applyFormattedAddressEdit(prev.address, text) }));
  }, []);

  /**
   * Resultado del reverse geocode (sugerencia elegida, pin arrastrado o toque
   * en el mapa): pisa los 7 campos de Google, toma geometry.location como
   * ubicación (igual que el webapp) y regenera formattedAddress — es una
   * acción explícita del usuario, así que también reinicia el modo manual.
   */
  const applyAddressGeocode = useCallback((result: GeocodeResult, pinned: LatLng) => {
    setAddressDraft((prev) => {
      const next = applyGeocodeToDraft(prev, result);
      return { ...next, formattedAddress: formatAddress(next) };
    });
    setAddressCoords(geocodeLocation(result) ?? pinned);
    setAddressHasLocation(true);
    setFormattedManual(false);
  }, []);

  /** "Guardar" del MapAddressSelector: sin validar coordenadas (decisión tomada). */
  const saveAddressDraft = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      address: [buildAddressToSave(prev.address?.[0], addressDraft, addressCoords)],
    }));
  }, [addressDraft, addressCoords]);

  /** onAddressDelete de AdressEntity → address: null en el payload (nunca []). */
  const clearAddress = useCallback(() => {
    setForm((prev) => ({ ...prev, address: null }));
    seedAddress(null);
  }, [seedAddress]);

  // ── Pin ───────────────────────────────────────────────────────────────────
  const [pinLoading, setPinLoading] = useState(false);
  /** Rellena el campo — no autoguarda (handlerChangePin del webapp). */
  const generatePin = useCallback(async () => {
    if (!token || !urlColegio) return;
    setPinLoading(true);
    try {
      const pin = await generateUserPin({ token, urlColegio });
      if (pin) setForm((prev) => ({ ...prev, pin }));
    } catch (error: any) {
      console.error("users/generatePin:", error?.response?.data?.message ?? error?.message);
    } finally {
      setPinLoading(false);
    }
  }, [token, urlColegio]);

  // ── Guardado ──────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * handlerSaved del webapp. Con `isActive === false` se saltan TODAS las
   * validaciones (formulario y horarios). El horario se valida solo si la
   * tab Horarios está visible (si no, el error apuntaría a una tab oculta).
   */
  const submit = useCallback(async (): Promise<UserSubmitResult | null> => {
    if (mode === "watch" || submitting) return null;

    const found = validateUserForm({ form, mode, isUserImageRequired });
    const scheduleResult = showScheduleTab
      ? validateScheduleRows(schedules, companySchedule, {
          isScheduleRequired: capabilities.canApplyTimeControl,
        })
      : ({ isValid: true } as const);
    const hasFormError = Object.keys(found).length > 0;
    const hasScheduleError = !scheduleResult.isValid;

    if (form.isActive && (hasFormError || hasScheduleError)) {
      setErrors(found);
      setScheduleError(scheduleResult.isValid ? null : scheduleResult.message);
      return { status: "invalid", tab: hasFormError ? "info" : "schedules" };
    }
    setErrors({});
    setScheduleError(null);

    if (!token || !urlColegio) {
      setSubmitError("No hay sesión activa.");
      return { status: "error", message: "No hay sesión activa." };
    }

    const common = {
      form,
      roles,
      canApplySchedule: capabilities.canApplySchedule,
      initialSchedules,
      schedules,
    };

    setSubmitting(true);
    setSubmitError(null);
    const result =
      mode === "add"
        ? await createUser({ token, urlColegio, payload: buildCreateUserPayload(common) })
        : await patchUser({
            token,
            urlColegio,
            id: userId as number,
            payload: buildPatchUserPayload({ ...common, initialForm }),
          });
    setSubmitting(false);

    if (!result.ok) {
      const message = result.message || "No se pudo guardar el usuario.";
      setSubmitError(message);
      return { status: "error", message };
    }

    if (mode === "add") {
      // Igual que el webapp: el modal queda abierto y limpio para seguir agregando.
      const empty = buildEmptyUserForm(companyRef.current);
      const emptySchedules = createDefaultScheduleRows();
      setInitialForm(empty);
      setForm(empty);
      setInitialSchedules(emptySchedules);
      setSchedules(emptySchedules);
      seedAddress(null);
      return { status: "saved", mode: "add", messageAlert: result.messageAlert };
    }
    return { status: "saved", mode: "edit", messageAlert: result.messageAlert };
  }, [
    mode,
    submitting,
    form,
    isUserImageRequired,
    showScheduleTab,
    schedules,
    companySchedule,
    capabilities,
    token,
    urlColegio,
    roles,
    initialSchedules,
    userId,
    initialForm,
    seedAddress,
  ]);

  const toggleWatch = useCallback(() => {
    setMode((prev) => (prev === "watch" ? "edit" : prev === "edit" ? "watch" : prev));
  }, []);

  return {
    company,
    mode,
    isWatch: mode === "watch",
    toggleWatch,
    form,
    initialForm,
    errors,
    detail,
    detailLoading,
    detailError,
    reloadDetail: loadDetail,
    roles,
    allTags,
    categories,
    catalogError,
    capabilities,
    isUserImageRequired,
    showScheduleTab,
    isDirty,
    pinLoading,
    schedules,
    scheduleError,
    addressDraft,
    addressCoords,
    addressHasLocation,
    submitting,
    submitError,
    setField,
    setActive,
    setPhoto,
    setRole,
    toggleSetting,
    setCategoryTags,
    selectAllCategory,
    setDefTag,
    createCategoryTag,
    setScheduleField,
    applyBulk,
    clearSchedules,
    clearLunch,
    setAddressField,
    setAddressFormatted,
    applyAddressGeocode,
    saveAddressDraft,
    clearAddress,
    generatePin,
    submit,
  };
}

export type UserFormController = ReturnType<typeof useUserForm>;
