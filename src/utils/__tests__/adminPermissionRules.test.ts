// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import axios from "axios";
import {
  ADMIN_PERMISSION_FIELDS,
  ADMIN_PERMISSION_ROWS,
  allowedStateTags,
  buildAdminPermissionPayload,
  buildAdminPermissionsParams,
  buildAdminPermissionsQueryString,
  buildPermissionEditPayload,
  canDeletePermission,
  canEditPermission,
  canViewPermission,
  deletePermission,
  emptyPermissionEditDraft,
  fetchAdminPermissionsPage,
  fetchPermissionCatalog,
  getGotoTagIds,
  isOverTimeLocked,
  isOvertimeAction,
  isPermissionExpired,
  isRejectionStateName,
  isRejectionStateTag,
  nowStampRD,
  patchPermission,
  PERMISSION_PATCH_FIELDS,
  permissionEditSnapshot,
  permissionDeleteConfirmationLabel,
  permissionRequesterName,
  readCategoryId,
  readOverTime,
  rejectionJustificationError,
  REJECTION_JUSTIFICATION_MESSAGE,
  resolveStateTagDefinition,
  typeTagsForAction,
  updatePermissionState,
  type PermissionCatalogTag,
  type PermissionEditDraft,
  type PermissionEditSnapshot,
} from "../adminPermissionRules";

jest.mock("axios");

const mockedGet = axios.get as unknown as jest.Mock;
const mockedPatch = axios.patch as unknown as jest.Mock;
const mockedDelete = axios.delete as unknown as jest.Mock;

const URL = "https://timecontrol.example.net:8600";
const TOKEN = "jwt.token.here";

/**
 * 16:00 UTC = 12:00 en RD (UTC-4, sin horario de verano). Todas las pruebas
 * de vencimiento se anclan acá para no depender de la zona del runner.
 */
const NOW = new Date("2026-09-10T16:00:00.000Z");

/** Una fila que NO vence respecto de NOW. */
const FUTURE = { permissionDate: "2026-09-11", toTime: "17:00" };
/** Una fila que ya venció respecto de NOW. */
const PAST = { permissionDate: "2026-09-10", toTime: "11:59" };

const tag = (over: Partial<PermissionCatalogTag> = {}): PermissionCatalogTag => ({
  id: 1,
  name: "Solicitado",
  ...over,
});

beforeEach(() => {
  mockedGet.mockReset();
  mockedPatch.mockReset();
  mockedDelete.mockReset();
});

// ─── Fields ──────────────────────────────────────────────────────────────────

describe("ADMIN_PERMISSION_FIELDS", () => {
  it("es copia literal del TABLE_FIELDS del webapp (Permissions/index.jsx:64)", () => {
    expect(ADMIN_PERMISSION_FIELDS).toBe(
      "id,permissionDate,fromTime,toTime,schoolUser:user.fullName,schoolUser:user.phone,schoolUser:user.email,stateTag.id,stateTag.name,stateTag.color,stateTag.fontColor,stateTag.edit,stateTag.readonly,typeTag.name,typeTag.color,typeTag.fontColor,actionTag.name,actionTag.color,actionTag.fontColor,adminUser:user.fullName",
    );
  });

  it("joins de 1 nivel van con punto, sin dos puntos", () => {
    const oneLevel = ADMIN_PERMISSION_FIELDS.split(",").filter((f) =>
      /^(stateTag|typeTag|actionTag)\./.test(f),
    );
    expect(oneLevel.length).toBeGreaterThan(0);
    for (const field of oneLevel) expect(field).not.toContain(":");
  });

  it("joins de 2 niveles llevan dos puntos entre relaciones y punto antes de la columna", () => {
    const nested = ADMIN_PERMISSION_FIELDS.split(",").filter((f) =>
      /^(schoolUser|adminUser)/.test(f),
    );
    expect(nested).toEqual([
      "schoolUser:user.fullName",
      "schoolUser:user.phone",
      "schoolUser:user.email",
      "adminUser:user.fullName",
    ]);
    // La forma aplanada es la que produce el 500 "Unknown column".
    expect(ADMIN_PERMISSION_FIELDS).not.toMatch(/schoolUser\.user\./);
    expect(ADMIN_PERMISSION_FIELDS).not.toMatch(/user:(fullName|phone|email)/);
  });

  it("pide el nombre del solicitante — la lista es de toda la escuela", () => {
    expect(ADMIN_PERMISSION_FIELDS.split(",")).toContain("schoolUser:user.fullName");
  });
});

describe("buildAdminPermissionsParams", () => {
  it("Local sin búsqueda: orderKey=permissionDate/asc, sin `all` ni `schoolUserId`", () => {
    const qs = buildAdminPermissionsQueryString(
      buildAdminPermissionsParams({ source: "local" }),
    );
    expect(qs).toBe(
      `page=1&orderKey=permissionDate&orderDir=asc&rows=${ADMIN_PERMISSION_ROWS}&fields=${encodeURIComponent(ADMIN_PERMISSION_FIELDS).replace(/%20/g, "+")}`,
    );
    expect(qs).not.toContain("all=");
    expect(qs).not.toContain("schoolUserId");
  });

  it("Histórico sin búsqueda: orderKey=id/desc, sin cambios", () => {
    const qs = buildAdminPermissionsQueryString(
      buildAdminPermissionsParams({ source: "historico" }),
    );
    expect(qs).toBe(
      `page=1&orderKey=id&orderDir=desc&rows=${ADMIN_PERMISSION_ROWS}&fields=${encodeURIComponent(ADMIN_PERMISSION_FIELDS).replace(/%20/g, "+")}`,
    );
  });

  it("con búsqueda: agrega `all` recortado, antes de `fields`", () => {
    const params = buildAdminPermissionsParams({ source: "local", search: "  Pérez ", page: 3 });
    expect(params.all).toBe("Pérez");
    expect(params.page).toBe(3);
    expect(Object.keys(params)).toEqual([
      "page",
      "orderKey",
      "orderDir",
      "rows",
      "all",
      "fields",
    ]);
  });

  it("una búsqueda de solo espacios no manda `all`", () => {
    expect(
      buildAdminPermissionsParams({ source: "local", search: "   " }),
    ).not.toHaveProperty("all");
  });
});

// ─── Rechazo / cancelación ───────────────────────────────────────────────────

describe("isRejectionStateName", () => {
  it.each([
    ["Rechazado", true],
    ["Rechazada", true],
    ["RECHAZADO", true],
    ["Cancelado", true],
    ["  cancelada ", true],
    ["Aprobado", false],
    ["Solicitado", false],
    ["Pendiente", false],
    ["", false],
  ])("%p → %p", (name, expected) => {
    expect(isRejectionStateName(name)).toBe(expected);
  });

  it("null / undefined no son rechazo", () => {
    expect(isRejectionStateName(null)).toBe(false);
    expect(isRejectionStateName(undefined)).toBe(false);
    expect(isRejectionStateTag(null)).toBe(false);
  });

  it("isRejectionStateTag lee el nombre del tag", () => {
    expect(isRejectionStateTag(tag({ name: "Cancelado" }))).toBe(true);
    expect(isRejectionStateTag(tag({ name: "Aprobado" }))).toBe(false);
  });
});

// ─── Vencimiento ─────────────────────────────────────────────────────────────

describe("isPermissionExpired", () => {
  it("nowStampRD convierte a hora RD", () => {
    expect(nowStampRD(NOW)).toBe("2026-09-10 12:00:00");
  });

  it("vencido si fecha+toTime ya pasó en RD", () => {
    expect(isPermissionExpired(PAST, NOW)).toBe(true);
    expect(isPermissionExpired({ permissionDate: "2026-09-09", toTime: "23:59" }, NOW)).toBe(true);
  });

  it("vigente si aún no llega", () => {
    expect(isPermissionExpired(FUTURE, NOW)).toBe(false);
    expect(isPermissionExpired({ permissionDate: "2026-09-10", toTime: "12:30" }, NOW)).toBe(false);
  });

  it("acepta permissionDate ISO y toTime con segundos", () => {
    expect(
      isPermissionExpired(
        { permissionDate: "2026-09-10T00:00:00.000Z", toTime: "11:00:00" },
        NOW,
      ),
    ).toBe(true);
  });

  it("sin fecha o sin hora de fin no vence", () => {
    expect(isPermissionExpired({ permissionDate: "2026-01-01", toTime: null }, NOW)).toBe(false);
    expect(isPermissionExpired({ permissionDate: null, toTime: "08:00" }, NOW)).toBe(false);
  });
});

// ─── Visibilidad de botones ──────────────────────────────────────────────────

describe("canDeletePermission", () => {
  const local = { isHistorical: false, now: NOW };

  it("visible con stateTag.delet, local y vigente", () => {
    expect(canDeletePermission(FUTURE, tag({ delet: true }), local)).toBe(true);
  });

  it("el flag es `delet` (typo del backend) — `delete` bien escrito NO cuenta", () => {
    const spelledRight = { ...tag(), delete: true } as unknown as PermissionCatalogTag;
    expect(canDeletePermission(FUTURE, spelledRight, local)).toBe(false);
  });

  it("oculto sin delet", () => {
    expect(canDeletePermission(FUTURE, tag({ delet: false }), local)).toBe(false);
    expect(canDeletePermission(FUTURE, null, local)).toBe(false);
  });

  it("oculto en histórico aunque tenga delet", () => {
    expect(
      canDeletePermission(FUTURE, tag({ delet: true }), { isHistorical: true, now: NOW }),
    ).toBe(false);
  });

  it("oculto si venció aunque tenga delet", () => {
    expect(canDeletePermission(PAST, tag({ delet: true }), local)).toBe(false);
  });
});

describe("canEditPermission (Editar + habilitación del dropdown de Estado)", () => {
  const local = { isHistorical: false, now: NOW };
  /** Una fila vigente con el stateTag tal cual lo trae el listado. */
  const row = (stateTag: PermissionCatalogTag | null) => ({ ...FUTURE, stateTag });

  it("visible con stateTag.edit de la fila", () => {
    expect(canEditPermission(row(tag({ edit: true })), local)).toBe(true);
  });

  it("oculto sin edit en la fila", () => {
    expect(canEditPermission(row(tag({ edit: false })), local)).toBe(false);
    expect(canEditPermission(row(tag({ edit: null })), local)).toBe(false);
  });

  it("oculto si es readonly sin gotoTags en la fila — el caso real del listado", () => {
    expect(canEditPermission(row(tag({ edit: false, readonly: true })), local)).toBe(false);
  });

  it("gotoTags del catálogo NO afectan la decisión aunque estén presentes", () => {
    // Como llega del listado: readonly, sin edit y SIN gotoTags.
    const rowTag = tag({ id: 1, edit: false, readonly: true });
    const catalog = [
      tag({ id: 1, edit: false, readonly: true, gotoTags: [tag({ id: 2, name: "Aprobado" })] }),
      tag({ id: 2, name: "Aprobado" }),
    ];

    // La definición resuelta con el catálogo SÍ trae transiciones — eso
    // alimenta las opciones del dropdown…
    const resolved = resolveStateTagDefinition({ stateTag: rowTag }, catalog);
    expect(getGotoTagIds(resolved)).toEqual([2]);
    expect(allowedStateTags(resolved, catalog).map((t) => t.id)).toEqual([1, 2]);

    // …pero la habilitación se decide con la fila y queda deshabilitada.
    expect(canEditPermission(row(rowTag), local)).toBe(false);
  });

  it("si el listado algún día manda gotoTags propios, readonly + transiciones habilita", () => {
    expect(
      canEditPermission(
        row(tag({ edit: false, readonly: true, gotoTags: [tag({ id: 2, name: "Aprobado" })] })),
        local,
      ),
    ).toBe(true);
  });

  it("gotoTags propios sin readonly ni edit no habilitan", () => {
    expect(
      canEditPermission(
        row(tag({ edit: false, readonly: false, gotoTags: [tag({ id: 2, name: "Aprobado" })] })),
        local,
      ),
    ).toBe(false);
  });

  it("oculto sin stateTag", () => {
    expect(canEditPermission(row(null), local)).toBe(false);
    expect(canEditPermission(FUTURE, local)).toBe(false);
  });

  it("oculto en histórico aunque la fila tenga edit", () => {
    expect(
      canEditPermission(row(tag({ edit: true })), { isHistorical: true, now: NOW }),
    ).toBe(false);
  });

  it("oculto si venció aunque la fila tenga edit", () => {
    expect(canEditPermission({ ...PAST, stateTag: tag({ edit: true }) }, local)).toBe(false);
  });
});

describe("canViewPermission", () => {
  it("solo en histórico", () => {
    expect(canViewPermission({ isHistorical: true })).toBe(true);
    expect(canViewPermission({ isHistorical: false })).toBe(false);
  });
});

// ─── Transiciones ────────────────────────────────────────────────────────────

describe("transiciones de estado", () => {
  const solicitado = tag({
    id: 1,
    name: "Solicitado",
    gotoTags: [tag({ id: 2, name: "Aprobado" }), tag({ id: 3, name: "Rechazado" })],
  });
  const catalog = [
    solicitado,
    tag({ id: 2, name: "Aprobado" }),
    tag({ id: 3, name: "Rechazado" }),
    tag({ id: 4, name: "Cancelado", delet: true }),
  ];

  it("getGotoTagIds lee los ids de los Tag completos, sin repetidos", () => {
    expect(getGotoTagIds(solicitado)).toEqual([2, 3]);
    expect(
      getGotoTagIds(tag({ gotoTags: [tag({ id: 5 }), tag({ id: 5 }), tag({ id: 0 })] })),
    ).toEqual([5]);
    expect(getGotoTagIds(null)).toEqual([]);
  });

  it("allowedStateTags: actual + gotoTags", () => {
    expect(allowedStateTags(solicitado, catalog).map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("allowedStateTags: sin transiciones ofrece el catálogo entero", () => {
    expect(allowedStateTags(tag({ id: 2, gotoTags: [] }), catalog)).toHaveLength(4);
  });

  it("resolveStateTagDefinition completa la fila recortada con el catálogo", () => {
    const row = { stateTag: { id: 4, name: "Cancelado", color: "#f00" } };
    const def = resolveStateTagDefinition(row, catalog);
    expect(def?.delet).toBe(true);
    expect(def?.color).toBe("#f00");
  });

  it("resolveStateTagDefinition cae a la fila si el estado no está en el catálogo", () => {
    const row = { stateTag: { id: 99, name: "Viejo" } };
    expect(resolveStateTagDefinition(row, catalog)).toEqual({ id: 99, name: "Viejo" });
  });
});

// ─── Edición ─────────────────────────────────────────────────────────────────

describe("buildPermissionEditPayload", () => {
  const snapshot: PermissionEditSnapshot = {
    stateTagId: 1,
    comments: "",
    overTime: false,
    attachments: ["a.pdf", "b.png", "c.jpg"],
  };
  const draft = (over: Partial<PermissionEditDraft> = {}): PermissionEditDraft => ({
    ...emptyPermissionEditDraft(snapshot),
    ...over,
  });

  it("sin cambios → cuerpo vacío", () => {
    expect(buildPermissionEditPayload(snapshot, draft())).toEqual({});
  });

  it("NUNCA incluye subject/description aunque el objeto los traiga distintos", () => {
    // El PATCH de edición no los acepta (handlers.js:771): el builder no los
    // lee aunque algo en el cliente los meta en el borrador.
    const polluted = {
      ...draft({ stateTagId: 2 }),
      subject: "Asunto cambiado",
      description: "Motivo cambiado por completo",
    } as PermissionEditDraft;

    const payload = buildPermissionEditPayload(snapshot, polluted);

    expect(payload).toEqual({ stateTagId: 2 });
    expect(payload).not.toHaveProperty("subject");
    expect(payload).not.toHaveProperty("description");
  });

  it("solo emite campos de la lista blanca del backend", () => {
    const payload = buildPermissionEditPayload(
      snapshot,
      draft({
        stateTagId: 2,
        overTime: true,
        comments: "ok",
        newAttachments: ["data:x;base64,AAA"],
        removedAttachmentIndexes: [1],
      }),
    );
    const allowed = [...PERMISSION_PATCH_FIELDS, "attachments", "attachmentsD"];
    for (const key of Object.keys(payload)) expect(allowed).toContain(key);
  });

  it("overTime viaja solo si cambió respecto del original", () => {
    expect(buildPermissionEditPayload(snapshot, draft({ overTime: true }))).toEqual({
      overTime: true,
    });
    // Igual al original → no viaja, en ninguna de las dos direcciones.
    expect(buildPermissionEditPayload(snapshot, draft({ overTime: false }))).toEqual({});
    const onSnapshot = { ...snapshot, overTime: true };
    expect(
      buildPermissionEditPayload(onSnapshot, {
        ...emptyPermissionEditDraft(onSnapshot),
        overTime: true,
      }),
    ).toEqual({});
    expect(
      buildPermissionEditPayload(onSnapshot, {
        ...emptyPermissionEditDraft(onSnapshot),
        overTime: false,
      }),
    ).toEqual({ overTime: false });
  });

  it("solo manda los campos que cambiaron", () => {
    expect(
      buildPermissionEditPayload(snapshot, draft({ stateTagId: 2, comments: "ok" })),
    ).toEqual({ stateTagId: 2, comments: "ok" });
  });

  it("attachmentsD son ÍNDICES, ordenados y sin repetidos", () => {
    expect(
      buildPermissionEditPayload(snapshot, draft({ removedAttachmentIndexes: [2, 0, 2] })),
    ).toEqual({ attachmentsD: [0, 2] });
  });

  it("los adjuntos nuevos van en `attachments`", () => {
    expect(
      buildPermissionEditPayload(snapshot, draft({ newAttachments: ["data:x;base64,AAA"] })),
    ).toEqual({ attachments: ["data:x;base64,AAA"] });
  });

  it("permissionEditSnapshot toma el estado del detalle, sin subject/description", () => {
    const snap = permissionEditSnapshot({
      id: 7,
      source: "local",
      stateTag: { id: 3, name: "Aprobado" },
      subject: "S",
      description: null,
      comments: "c",
      overTime: 1,
      attachments: ["x.pdf"],
    });
    expect(snap).toEqual({
      stateTagId: 3,
      comments: "c",
      overTime: true,
      attachments: ["x.pdf"],
    });
  });
});

describe("rejectionJustificationError", () => {
  const rechazo = tag({ id: 3, name: "Rechazado" });
  const aprobado = tag({ id: 2, name: "Aprobado" });
  const withAttachments: PermissionEditSnapshot = {
    stateTagId: 1,
    comments: "",
    overTime: false,
    attachments: ["a.pdf"],
  };
  const bare: PermissionEditSnapshot = { ...withAttachments, attachments: [] };

  it("rechazo sin comentario ni adjuntos → error", () => {
    expect(rejectionJustificationError(rechazo, bare, emptyPermissionEditDraft(bare))).toBe(
      REJECTION_JUSTIFICATION_MESSAGE,
    );
  });

  it("un comentario lo satisface", () => {
    expect(
      rejectionJustificationError(rechazo, bare, {
        ...emptyPermissionEditDraft(bare),
        comments: "No aplica",
      }),
    ).toBeNull();
  });

  it("un comentario de solo espacios NO lo satisface", () => {
    expect(
      rejectionJustificationError(rechazo, bare, {
        ...emptyPermissionEditDraft(bare),
        comments: "   ",
      }),
    ).toBe(REJECTION_JUSTIFICATION_MESSAGE);
  });

  it("un adjunto existente que sobrevive lo satisface", () => {
    expect(
      rejectionJustificationError(
        rechazo,
        withAttachments,
        emptyPermissionEditDraft(withAttachments),
      ),
    ).toBeNull();
  });

  it("si se borran todos los existentes y no hay nuevos → error", () => {
    expect(
      rejectionJustificationError(rechazo, withAttachments, {
        ...emptyPermissionEditDraft(withAttachments),
        removedAttachmentIndexes: [0],
      }),
    ).toBe(REJECTION_JUSTIFICATION_MESSAGE);
  });

  it("un adjunto nuevo lo satisface", () => {
    expect(
      rejectionJustificationError(rechazo, bare, {
        ...emptyPermissionEditDraft(bare),
        newAttachments: ["data:x;base64,AAA"],
      }),
    ).toBeNull();
  });

  it("un estado que no es rechazo nunca exige justificación", () => {
    expect(rejectionJustificationError(aprobado, bare, emptyPermissionEditDraft(bare))).toBeNull();
  });
});

// ─── Creación ────────────────────────────────────────────────────────────────

describe("buildAdminPermissionPayload", () => {
  const base = {
    schoolUserId: 88,
    actionTagId: 10,
    typeTagId: 20,
    subject: "Diligencia",
    description: "Trámite bancario",
    fromDate: "2026-09-12",
    toDate: "2026-09-12",
    fromTime: "09:00",
    toTime: "11:00",
    isFullDay: false,
  };

  it("lleva schoolUserId del empleado elegido y NO manda canal", () => {
    const payload = buildAdminPermissionPayload(base);
    expect(payload.schoolUserId).toBe(88);
    expect(payload).not.toHaveProperty("canal");
    expect(payload).toEqual({
      schoolUserId: 88,
      subject: "Diligencia",
      description: "Trámite bancario",
      typeTagId: 20,
      actionTagId: 10,
      fromDate: "2026-09-12",
      toDate: "2026-09-12",
      fromTime: "09:00",
      toTime: "11:00",
    });
  });

  it("Ausencia (día completo) no manda horas", () => {
    const payload = buildAdminPermissionPayload({ ...base, isFullDay: true });
    expect(payload).not.toHaveProperty("fromTime");
    expect(payload).not.toHaveProperty("toTime");
  });

  it("adjuntos y weekDays solo viajan si hay", () => {
    expect(buildAdminPermissionPayload(base)).not.toHaveProperty("attachments");
    expect(buildAdminPermissionPayload(base)).not.toHaveProperty("weekDays");
    const full = buildAdminPermissionPayload({
      ...base,
      attachments: ["data:a"],
      weekDays: ["Lunes"],
    });
    expect(full.attachments).toEqual(["data:a"]);
    expect(full.weekDays).toEqual(["Lunes"]);
  });
});

// ─── Catálogo ────────────────────────────────────────────────────────────────

describe("readCategoryId", () => {
  it.each([
    [25, 25],
    ["25", 25],
    [{ label: "Estados", value: "25" }, 25],
    [0, undefined],
    [null, undefined],
    [{ label: "x" }, undefined],
  ])("%p → %p", (raw, expected) => {
    expect(readCategoryId(raw)).toBe(expected);
  });
});

describe("fetchPermissionCatalog", () => {
  const tags = [
    { id: 1, name: "Solicitado", categoryId: 30, delet: true, gotoTags: [{ id: 2 }] },
    { id: 2, name: "Aprobado", categoryId: 30 },
    { id: 10, name: "Salida", categoryId: 40, gotoTags: [{ id: 21, name: "Médico", categoryId: 50 }, { id: 99, name: "Otro", categoryId: 30 }] },
    { id: 11, name: "Ausencia", categoryId: 40 },
    { id: 20, name: "Médico", categoryId: 50 },
  ];
  const categoryIds = {
    catPermStatedId: { label: "Estados", value: "30" },
    catPermissionActionsId: { label: "Acciones", value: "40" },
    catPermTypeId: { label: "Tipos", value: "50" },
  };

  it("usa /tags/all (no /tags/permState) y separa por categoría", async () => {
    mockedGet.mockResolvedValue({ data: { success: true, data: tags } });

    const catalog = await fetchPermissionCatalog({ token: TOKEN, urlColegio: URL, categoryIds });

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/tags/all`);
    expect(catalog.stateTags.map((t) => t.id)).toEqual([2, 1]); // Aprobado, Solicitado
    expect(catalog.actionTags.map((t) => t.id)).toEqual([11, 10]); // Ausencia, Salida
    expect(catalog.typeCategoryId).toBe(50);
    // El flag `delet` (typo real) llega intacto al catálogo.
    expect(catalog.stateTags.find((t) => t.id === 1)?.delet).toBe(true);
  });

  it("typeTagsForAction filtra los gotoTags de la acción por la categoría de tipos", async () => {
    mockedGet.mockResolvedValue({ data: { success: true, data: tags } });
    const catalog = await fetchPermissionCatalog({ token: TOKEN, urlColegio: URL, categoryIds });
    const salida = catalog.actionTags.find((t) => t.id === 10);
    expect(typeTagsForAction(salida, catalog.typeCategoryId).map((t) => t.id)).toEqual([21]);
    expect(typeTagsForAction(null, catalog.typeCategoryId)).toEqual([]);
  });

  it("con schoolId refresca los ids contra /schools/{id}", async () => {
    mockedGet.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/schools/5")
          ? { data: { success: true, data: { settings: { categoryDefaultIds: categoryIds } } } }
          : { data: { success: true, data: tags } },
      ),
    );

    const catalog = await fetchPermissionCatalog({
      token: TOKEN,
      urlColegio: URL,
      categoryIds: undefined,
      schoolId: 5,
    });

    expect(catalog.stateTags).toHaveLength(2);
  });

  it("si /schools falla sigue con la semilla", async () => {
    mockedGet.mockImplementation((url: string) =>
      url.endsWith("/schools/5")
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ data: { success: true, data: tags } }),
    );
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    const catalog = await fetchPermissionCatalog({
      token: TOKEN,
      urlColegio: URL,
      categoryIds,
      schoolId: 5,
    });

    expect(catalog.stateTags).toHaveLength(2);
  });
});

// ─── Red ─────────────────────────────────────────────────────────────────────

describe("fetchAdminPermissionsPage", () => {
  const body = (items: unknown[], count?: number) => ({
    data: { success: true, data: { items, count: count ?? items.length } },
  });

  it("Local pega a userdaypermissions, sin schoolUserId, y marca el source", async () => {
    mockedGet.mockResolvedValue(body([{ id: 1 }]));

    const page = await fetchAdminPermissionsPage({ token: TOKEN, urlColegio: URL, source: "local" });

    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/userdaypermissions`);
    expect(mockedGet.mock.calls[0][1].params).not.toHaveProperty("schoolUserId");
    expect(page.items[0].source).toBe("local");
  });

  it("Histórico pega a userdaypermissionsh", async () => {
    mockedGet.mockResolvedValue(body([{ id: 1 }]));

    const page = await fetchAdminPermissionsPage({
      token: TOKEN,
      urlColegio: URL,
      source: "historico",
      search: "ana",
    });

    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/userdaypermissionsh`);
    expect(mockedGet.mock.calls[0][1].params.all).toBe("ana");
    expect(page.items[0].source).toBe("historico");
  });

  it("hasMore: página llena y count pendiente → true; página corta → false", async () => {
    const full = Array.from({ length: ADMIN_PERMISSION_ROWS }, (_, i) => ({ id: i + 1 }));
    mockedGet.mockResolvedValueOnce(body(full, 40));
    expect(
      (await fetchAdminPermissionsPage({ token: TOKEN, urlColegio: URL, source: "local" })).hasMore,
    ).toBe(true);

    mockedGet.mockResolvedValueOnce(body([{ id: 1 }], 40));
    expect(
      (await fetchAdminPermissionsPage({ token: TOKEN, urlColegio: URL, source: "local", page: 3 }))
        .hasMore,
    ).toBe(false);
  });

  it("hasMore: el count dice que ya se leyó todo → false aunque la página venga llena", async () => {
    const full = Array.from({ length: ADMIN_PERMISSION_ROWS }, (_, i) => ({ id: i + 1 }));
    mockedGet.mockResolvedValueOnce(body(full, ADMIN_PERMISSION_ROWS));
    expect(
      (await fetchAdminPermissionsPage({ token: TOKEN, urlColegio: URL, source: "local" })).hasMore,
    ).toBe(false);
  });
});

describe("mutaciones", () => {
  it("updatePermissionState: PATCH /{route}/{id} con { stateTagId }", async () => {
    mockedPatch.mockResolvedValue({ data: { success: true } });

    const result = await updatePermissionState({
      token: TOKEN,
      urlColegio: URL,
      source: "local",
      id: 42,
      stateTagId: 2,
    });

    expect(result.ok).toBe(true);
    expect(mockedPatch).toHaveBeenCalledWith(
      `${URL}/userdaypermissions/42`,
      { stateTagId: 2 },
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
  });

  it("deletePermission: DELETE /{route}/{id}", async () => {
    mockedDelete.mockResolvedValue({ data: { success: true } });

    const result = await deletePermission({ token: TOKEN, urlColegio: URL, source: "local", id: 42 });

    expect(result.ok).toBe(true);
    expect(mockedDelete.mock.calls[0][0]).toBe(`${URL}/userdaypermissions/42`);
  });

  it("un error de red se devuelve como ok:false con el mensaje del backend", async () => {
    mockedPatch.mockRejectedValue({ response: { data: { message: "Sin permiso" } } });
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await updatePermissionState({
      token: TOKEN,
      urlColegio: URL,
      source: "local",
      id: 1,
      stateTagId: 2,
    });

    expect(result).toEqual({ ok: false, message: "Sin permiso" });
  });

  it("patchPermission devuelve TAL CUAL el rechazo del backend por overtime", async () => {
    const message = "No hay overtime positivo disponible para aplicar horas extra.";
    mockedPatch.mockResolvedValue({ data: { success: false, message } });

    const result = await patchPermission({
      token: TOKEN,
      urlColegio: URL,
      source: "local",
      id: 9,
      body: { overTime: true },
    });

    expect(result).toEqual({ ok: false, message });
    expect(mockedPatch).toHaveBeenCalledWith(
      `${URL}/userdaypermissions/9`,
      { overTime: true },
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
  });
});

// ─── Hr. Extras Pagas (overTime) ─────────────────────────────────────────────

describe("overTime", () => {
  it("readOverTime acepta true y 1 (como lo guarda el backend)", () => {
    expect(readOverTime(true)).toBe(true);
    expect(readOverTime(1)).toBe(true);
    expect(readOverTime(false)).toBe(false);
    expect(readOverTime(0)).toBe(false);
    expect(readOverTime(null)).toBe(false);
    expect(readOverTime(undefined)).toBe(false);
  });

  it.each([
    ["Horas Extras", true],
    ["  HORAS EXTRAS pagadas ", true],
    ["Salida", false],
    ["Ausencia", false],
    [null, false],
  ])("isOvertimeAction(%p) → %p", (name, expected) => {
    expect(isOvertimeAction(name)).toBe(expected);
  });
});

// ─── Solicitante (requestedSchoolUser) ───────────────────────────────────────

describe("permissionRequesterName", () => {
  it("devuelve el nombre de quien hizo el POST, no el dueño del permiso", () => {
    expect(
      permissionRequesterName({
        requestedSchoolUser: { user: { fullName: "Juan Pérez" } },
      } as any),
    ).toBe("Juan Pérez");
  });

  it('cae a "No disponible" cuando requestedSchoolUser es null (histórico sin requestedSchoolUserId)', () => {
    expect(permissionRequesterName({ requestedSchoolUser: null } as any)).toBe(
      "No disponible",
    );
  });

  it('cae a "No disponible" cuando requestedSchoolUser.user es undefined', () => {
    expect(
      permissionRequesterName({ requestedSchoolUser: { user: undefined } } as any),
    ).toBe("No disponible");
  });

  it('cae a "No disponible" sin el permiso, y con fullName vacío/espacios', () => {
    expect(permissionRequesterName(null)).toBe("No disponible");
    expect(permissionRequesterName(undefined)).toBe("No disponible");
    expect(
      permissionRequesterName({
        requestedSchoolUser: { user: { fullName: "   " } },
      } as any),
    ).toBe("No disponible");
  });

});

// ─── Confirmar Eliminar ──────────────────────────────────────────────────────

describe("permissionDeleteConfirmationLabel", () => {
  it('con actionTag: "Permiso de {acción en minúscula} de {nombre}"', () => {
    expect(
      permissionDeleteConfirmationLabel({
        actionTag: { name: "Ausencia" },
        schoolUser: { user: { fullName: "Juan Pérez" } },
      } as any),
    ).toBe("Permiso de ausencia de Juan Pérez");
  });

  it("baja a minúscula con .toLowerCase() nativo — conserva tildes/ñ", () => {
    expect(
      permissionDeleteConfirmationLabel({
        actionTag: { name: "Salida Anticipada" },
        schoolUser: { user: { fullName: "María Núñez" } },
      } as any),
    ).toBe("Permiso de salida anticipada de María Núñez");
  });

  it('sin actionTag: NO duplica "permiso" — "Permiso de {nombre}"', () => {
    expect(
      permissionDeleteConfirmationLabel({
        actionTag: null,
        schoolUser: { user: { fullName: "Juan Pérez" } },
      } as any),
    ).toBe("Permiso de Juan Pérez");
  });

  it('sin schoolUser.user.fullName: cae a "este usuario"', () => {
    expect(
      permissionDeleteConfirmationLabel({
        actionTag: { name: "Ausencia" },
        schoolUser: null,
      } as any),
    ).toBe("Permiso de ausencia de este usuario");
  });

  it('sin permiso: "Permiso de este usuario"', () => {
    expect(permissionDeleteConfirmationLabel(null)).toBe("Permiso de este usuario");
    expect(permissionDeleteConfirmationLabel(undefined)).toBe("Permiso de este usuario");
  });
});

describe("isOverTimeLocked", () => {
  it("isOverTimeLocked: bloqueado por acción de horas extras o en modo Ver", () => {
    expect(isOverTimeLocked({ actionName: "Horas Extras", readOnly: false })).toBe(true);
    expect(isOverTimeLocked({ actionName: "Salida", readOnly: true })).toBe(true);
    expect(isOverTimeLocked({ actionName: "Salida", readOnly: false })).toBe(false);
  });

  it("una acción de horas extras fuerza overTime=true al abrir, y ese cambio viaja", () => {
    const snap: PermissionEditSnapshot = {
      stateTagId: 1,
      comments: "",
      overTime: false,
      attachments: [],
    };
    const initial = emptyPermissionEditDraft(snap, { actionName: "Horas Extras" });
    expect(initial.overTime).toBe(true);
    expect(buildPermissionEditPayload(snap, initial)).toEqual({ overTime: true });
  });

  it("sin acción de horas extras el borrador arranca con el valor guardado", () => {
    const snap: PermissionEditSnapshot = {
      stateTagId: 1,
      comments: "",
      overTime: false,
      attachments: [],
    };
    const initial = emptyPermissionEditDraft(snap, { actionName: "Salida" });
    expect(initial.overTime).toBe(false);
    expect(buildPermissionEditPayload(snap, initial)).toEqual({});
  });
});
