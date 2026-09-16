// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import axios from "axios";
import {
  EXCUSE_FIELDS,
  EXCUSES_ROWS,
  EXCUSE_PATCH_FIELDS,
  EXCUSE_REJECTION_MESSAGE,
  allowedStateTags,
  buildExcuseCreatePayload,
  buildExcuseEditPayload,
  buildExcusesParams,
  buildExcusesQueryString,
  canDeleteExcuse,
  canEditExcuse,
  createExcuse,
  defaultExcuseStateTag,
  deleteExcuse,
  emptyExcuseEditDraft,
  excuseAdminName,
  excuseDeleteConfirmationLabel,
  excuseEditSnapshot,
  excuseJustificationError,
  excuseReporterName,
  fetchAdminExcusesPage,
  fetchExcuseDetail,
  getExcuseDateRange,
  getGotoTagIds,
  isRejectionExcuseStateName,
  isRejectionExcuseStateTag,
  patchExcuse,
  readExcuseCategoryIds,
  resolveStateTagDefinition,
  updateExcuseState,
  type ExcuseEditDraft,
  type ExcuseEditSnapshot,
  type ExcuseTag,
} from "../excusesRules";

jest.mock("axios");

const mockedGet = axios.get as unknown as jest.Mock;
const mockedPost = axios.post as unknown as jest.Mock;
const mockedPatch = axios.patch as unknown as jest.Mock;
const mockedDelete = axios.delete as unknown as jest.Mock;

const URL = "https://timecontrol.example.net:8600";
const TOKEN = "jwt.token.here";

/** Igual que adminPermissionRules.test.ts: 16:00 UTC = 12:00 en RD. */
const NOW = new Date("2026-09-10T16:00:00.000Z");

const tag = (over: Partial<ExcuseTag> = {}): ExcuseTag => ({
  id: 1,
  name: "Solicitado",
  ...over,
});

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPatch.mockReset();
  mockedDelete.mockReset();
});

// ─── Fields ──────────────────────────────────────────────────────────────────

describe("EXCUSE_FIELDS", () => {
  it("es copia literal del TABLE_FIELDS del webapp (Excuses/index.jsx:61)", () => {
    expect(EXCUSE_FIELDS).toBe(
      "id,createdDate,stateTag.id,stateTag.name,stateTag.color,stateTag.fontColor,stateTag.edit,stateTag.readonly,typeTag.name,typeTag.color,typeTag.fontColor,student.fullName,enrollment:course.fullName,parent.fullName,parent.phone,parent.email,modifiedByUser:user.fullName,createdByUser:user.fullName,description",
    );
  });

  it("joins de 1 nivel van con punto, sin dos puntos", () => {
    const oneLevel = EXCUSE_FIELDS.split(",").filter((f) =>
      /^(stateTag|typeTag|student|parent)\./.test(f),
    );
    expect(oneLevel.length).toBeGreaterThan(0);
    for (const field of oneLevel) expect(field).not.toContain(":");
  });

  it("joins de 2 niveles llevan dos puntos entre relaciones y punto antes de la columna", () => {
    const nested = EXCUSE_FIELDS.split(",").filter((f) =>
      /^(enrollment|modifiedByUser|createdByUser)/.test(f),
    );
    expect(nested).toEqual([
      "enrollment:course.fullName",
      "modifiedByUser:user.fullName",
      "createdByUser:user.fullName",
    ]);
  });
});

// ─── Params del listado ──────────────────────────────────────────────────────

describe("buildExcusesParams", () => {
  it("por defecto: orderKey=id/desc, rows=15, sin `all` ni filtro de estado", () => {
    const qs = buildExcusesQueryString(buildExcusesParams({}));
    expect(qs).toBe(
      `page=1&orderKey=id&orderDir=desc&rows=${EXCUSES_ROWS}&fields=${encodeURIComponent(EXCUSE_FIELDS).replace(/%20/g, "+")}`,
    );
    expect(qs).not.toContain("all=");
    expect(qs).not.toMatch(/&stateTag\.id=/);
  });

  it("con búsqueda agrega `all` recortado antes de `fields`", () => {
    const params = buildExcusesParams({ search: "  García ", page: 3 });
    expect(params.all).toBe("García");
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
    expect(buildExcusesParams({ search: "   " })).not.toHaveProperty("all");
  });

  it("el filtro por estado viaja como columna stateTag.id", () => {
    const params = buildExcusesParams({ stateTagId: 7 });
    expect(params["stateTag.id"]).toBe(7);
    expect(params).not.toHaveProperty("stateTagId");
  });

  it("un stateTagId inválido (0, NaN) no viaja", () => {
    expect(buildExcusesParams({ stateTagId: 0 })).not.toHaveProperty("stateTag.id");
    expect(buildExcusesParams({ stateTagId: null })).not.toHaveProperty("stateTag.id");
  });
});

// ─── Rango de ausencia ───────────────────────────────────────────────────────

describe("getExcuseDateRange", () => {
  it("un solo día: from=to, 1 día, no es rango", () => {
    expect(getExcuseDateRange({ absentDays: ["2026-09-10"] })).toEqual({
      from: "2026-09-10",
      to: "2026-09-10",
      totalDays: 1,
      isRange: false,
    });
  });

  it("rango de días inclusive", () => {
    expect(getExcuseDateRange({ absentDays: ["2026-09-10", "2026-09-12"] })).toEqual({
      from: "2026-09-10",
      to: "2026-09-12",
      totalDays: 3,
      isRange: true,
    });
  });

  it("acepta el string JSON (p. ej. de filas de histórico)", () => {
    expect(getExcuseDateRange({ absentDays: '["2026-09-10","2026-09-12"]' })).toEqual({
      from: "2026-09-10",
      to: "2026-09-12",
      totalDays: 3,
      isRange: true,
    });
  });

  it("cruza meses sin corrimiento de zona horaria", () => {
    expect(getExcuseDateRange({ absentDays: ["2026-09-28", "2026-10-02"] })?.totalDays).toBe(5);
  });

  it("descarta fechas mal formadas y usa las válidas", () => {
    expect(getExcuseDateRange({ absentDays: ["no-es-fecha", "2026-09-12"] })).toEqual({
      from: "2026-09-12",
      to: "2026-09-12",
      totalDays: 1,
      isRange: false,
    });
  });

  it("si ninguna fecha es válida, queda vacío", () => {
    expect(getExcuseDateRange({ absentDays: ["no-es-fecha", "tampoco"] })).toEqual({
      from: "",
      to: "",
      totalDays: 0,
      isRange: false,
    });
  });

  it("sin días: vacío, 0 días", () => {
    expect(getExcuseDateRange({ absentDays: null })).toEqual({
      from: "",
      to: "",
      totalDays: 0,
      isRange: false,
    });
    expect(getExcuseDateRange(null)).toEqual({
      from: "",
      to: "",
      totalDays: 0,
      isRange: false,
    });
    expect(getExcuseDateRange({ absentDays: "  " })).toEqual({
      from: "",
      to: "",
      totalDays: 0,
      isRange: false,
    });
  });
});

// ─── Rechazo / cancelación ───────────────────────────────────────────────────

describe("isRejectionExcuseStateName", () => {
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
    expect(isRejectionExcuseStateName(name)).toBe(expected);
  });

  it("null / undefined no son rechazo", () => {
    expect(isRejectionExcuseStateName(null)).toBe(false);
    expect(isRejectionExcuseStateName(undefined)).toBe(false);
    expect(isRejectionExcuseStateTag(null)).toBe(false);
  });

  it("isRejectionExcuseStateTag lee el nombre del tag", () => {
    expect(isRejectionExcuseStateTag(tag({ name: "Cancelado" }))).toBe(true);
    expect(isRejectionExcuseStateTag(tag({ name: "Aprobado" }))).toBe(false);
  });
});

// ─── Visibilidad de acciones ─────────────────────────────────────────────────

describe("canDeleteExcuse", () => {
  it("visible con stateTag.delet (el typo real del backend)", () => {
    expect(canDeleteExcuse({ stateTag: tag({ delet: true }) })).toBe(true);
  });

  it("`delete` bien escrito también cuenta (fallback del webapp)", () => {
    const spelledRight = { ...tag(), delet: undefined, delete: true } as unknown as ExcuseTag;
    expect(canDeleteExcuse({ stateTag: spelledRight })).toBe(true);
  });

  it("oculto sin flag y sin stateTag", () => {
    const noFlags = { ...tag({ delet: false }), delete: false } as unknown as ExcuseTag;
    expect(canDeleteExcuse({ stateTag: noFlags })).toBe(false);
    expect(canDeleteExcuse({ stateTag: null })).toBe(false);
    expect(canDeleteExcuse(null)).toBe(false);
    expect(canDeleteExcuse(undefined)).toBe(false);
  });
});

describe("canEditExcuse", () => {
  it("visible con stateTag.edit de la fila", () => {
    expect(canEditExcuse({ stateTag: tag({ edit: true }) })).toBe(true);
  });

  it("oculto sin edit en la fila", () => {
    expect(canEditExcuse({ stateTag: tag({ edit: false }) })).toBe(false);
    expect(canEditExcuse({ stateTag: tag({ edit: null }) })).toBe(false);
  });

  it("oculto si es readonly sin gotoTags — el caso real del listado", () => {
    expect(canEditExcuse({ stateTag: tag({ edit: false, readonly: true }) })).toBe(false);
  });

  it("readonly + gotoTags en la fila habilita", () => {
    expect(
      canEditExcuse({ stateTag: tag({ edit: false, readonly: true, gotoTags: [tag({ id: 2 })] }) }),
    ).toBe(true);
  });

  it("oculto sin stateTag", () => {
    expect(canEditExcuse({ stateTag: null })).toBe(false);
    expect(canEditExcuse(null)).toBe(false);
  });
});

// ─── Etiquetas del detalle/confirmación ──────────────────────────────────────

describe("excuseDeleteConfirmationLabel", () => {
  it("usa el nombre del estudiante", () => {
    expect(
      excuseDeleteConfirmationLabel({ id: 3, student: { fullName: "María Núñez" } }),
    ).toBe("María Núñez");
  });

  it('sin nombre, cae a "Excusa #{id}"', () => {
    expect(excuseDeleteConfirmationLabel({ id: 3, student: { fullName: "" } })).toBe("Excusa #3");
    expect(excuseDeleteConfirmationLabel({ id: 4, student: null })).toBe("Excusa #4");
  });

  it('sin excusa: "esta excusa"', () => {
    expect(excuseDeleteConfirmationLabel(null)).toBe("esta excusa");
    expect(excuseDeleteConfirmationLabel(undefined)).toBe("esta excusa");
  });
});

describe("excuseReporterName / excuseAdminName", () => {
  it("excuseReporterName es el padre/tutor, y queda vacío si no hay nombre (sin 'No disponible')", () => {
    expect(excuseReporterName({ parent: { fullName: "Juan Pérez" } })).toBe("Juan Pérez");
    expect(excuseReporterName({ parent: {} })).toBe("");
    expect(excuseReporterName({})).toBe("");
    expect(excuseReporterName(null)).toBe("");
    expect(excuseReporterName(undefined)).toBe("");
  });

  it("excuseAdminName prefiere modifiedByUser y cae a createdByUser", () => {
    expect(
      excuseAdminName({
        modifiedByUser: { user: { fullName: "Ana García" } },
        createdByUser: { user: { fullName: "Pedro" } },
      } as any),
    ).toBe("Ana García");
    expect(
      excuseAdminName({
        modifiedByUser: { user: null },
        createdByUser: { user: { fullName: "Pedro" } },
      } as any),
    ).toBe("Pedro");
    expect(excuseAdminName(null)).toBe("");
  });
});

// ─── Transiciones y estado default ───────────────────────────────────────────

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

  it("getGotoTagIds acepta gotoTagIds/gotoTagId sueltos (número o arreglo)", () => {
    expect(getGotoTagIds({ ...tag(), gotoTagIds: [8, 9] } as ExcuseTag)).toEqual([8, 9]);
    expect(getGotoTagIds({ ...tag(), gotoTagIds: 8 } as unknown as ExcuseTag)).toEqual([8]);
    expect(getGotoTagIds({ ...tag(), gotoTagId: 6 } as ExcuseTag)).toEqual([6]);
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

describe("defaultExcuseStateTag", () => {
  it("elige el tag marcado `add` aunque no se llame Pendiente", () => {
    const tags = [tag({ id: 2, name: "Aprobado" }), tag({ id: 1, name: "Solicitado", add: true })];
    expect(defaultExcuseStateTag(tags)?.id).toBe(1);
  });

  it('sin `add`, el que se llama "Pendiente"', () => {
    const tags = [tag({ id: 2, name: "Aprobado" }), tag({ id: 9, name: "Pendiente" })];
    expect(defaultExcuseStateTag(tags)?.id).toBe(9);
  });

  it("sin candidatos devuelve null", () => {
    expect(defaultExcuseStateTag([])).toBeNull();
    expect(defaultExcuseStateTag([tag({ id: 2, name: "Aprobado" })])).toBeNull();
  });
});

// ─── Edición ─────────────────────────────────────────────────────────────────

describe("excuseEditSnapshot", () => {
  it("toma estado, comentario, asunto/motivo/fechas y adjuntos ADMIN del detalle", () => {
    expect(
      excuseEditSnapshot({
        id: 7,
        stateTag: { id: 3, name: "Rechazado" },
        comment: "sin justificación",
        attachmentsAdm: ["adm/a.pdf"],
        attachments: ["a.pdf"],
        subject: "S",
        description: null,
        absentDays: ["2026-09-10", "2026-09-12"],
      } as any),
    ).toEqual({
      stateTagId: 3,
      comment: "sin justificación",
      subject: "S",
      description: "",
      absentDays: ["2026-09-10", "2026-09-12"],
      attachmentsAdm: ["adm/a.pdf"],
    });
  });

  it("sin adjuntos ni estado legible queda vacío", () => {
    expect(excuseEditSnapshot({ id: 1 } as any)).toEqual({
      stateTagId: null,
      comment: "",
      subject: "",
      description: "",
      absentDays: [],
      attachmentsAdm: [],
    });
  });
});

describe("buildExcuseEditPayload", () => {
  const snapshot: ExcuseEditSnapshot = {
    stateTagId: 1,
    comment: "",
    subject: "Cita médica",
    description: "Consultorio distrito 4B",
    absentDays: ["2026-09-10", "2026-09-10"],
    attachmentsAdm: ["adm/a.pdf"],
  };
  const draft = (over: Partial<ExcuseEditDraft> = {}): ExcuseEditDraft => ({
    ...emptyExcuseEditDraft(snapshot, null),
    ...over,
  });

  it("sin cambios → cuerpo vacío", () => {
    expect(buildExcuseEditPayload(snapshot, draft())).toEqual({});
  });

  it("incluye subject/description cuando cambian", () => {
    const payload = buildExcuseEditPayload(snapshot, {
      ...draft(),
      subject: "Asunto cambiado",
      description: "Motivo cambiado por completo",
    });

    expect(payload).toEqual({
      subject: "Asunto cambiado",
      description: "Motivo cambiado por completo",
    });
  });

  it("incluye absentDays solo si el rango nuevo es válido y distinto", () => {
    expect(
      buildExcuseEditPayload(snapshot, {
        ...draft(),
        absentDays: ["2026-09-12", "2026-09-13"],
      }),
    ).toEqual({ absentDays: ["2026-09-12", "2026-09-13"] });

    // rango en blanco → nunca viaja (evita borrar días con un array vacío)
    expect(buildExcuseEditPayload(snapshot, { ...draft(), absentDays: [] })).toEqual({});
  });

  it("solo emite campos de la lista blanca del backend", () => {
    const payload = buildExcuseEditPayload(
      snapshot,
      draft({
        stateTagId: 2,
        comment: "ok",
        subject: "S",
        absentDays: ["2026-09-15", "2026-09-15"],
        newAdminAttachments: ["data:x;base64,AAA"],
      }),
    );
    for (const key of Object.keys(payload)) expect(EXCUSE_PATCH_FIELDS).toContain(key);
  });

  it("solo manda los campos que cambiaron", () => {
    expect(buildExcuseEditPayload(snapshot, draft({ stateTagId: 2, comment: "ok" }))).toEqual({
      stateTagId: 2,
      comment: "ok",
    });
  });

  it("attachmentsAdm lleva SOLO las data-URIs nuevas, no las rutas ya guardadas", () => {
    const payload = buildExcuseEditPayload(
      snapshot,
      draft({ newAdminAttachments: ["data:x;base64,AAA", "data:y;base64,BBB"] }),
    );
    expect(payload).toEqual({
      attachmentsAdm: ["data:x;base64,AAA", "data:y;base64,BBB"],
    });
    expect(payload.attachmentsAdm).not.toContain("adm/a.pdf");
  });
});

describe("excuseJustificationError", () => {
  const rechazo = tag({ id: 3, name: "Rechazado" });
  const aprobado = tag({ id: 2, name: "Aprobado" });
  const withAdm: ExcuseEditSnapshot = {
    stateTagId: 1,
    comment: "",
    subject: "",
    description: "",
    absentDays: [],
    attachmentsAdm: ["adm/a.pdf"],
  };
  const bare: ExcuseEditSnapshot = { ...withAdm, attachmentsAdm: [] };

  it("rechazo sin comentario ni adjuntos → error", () => {
    expect(excuseJustificationError(rechazo, bare, emptyExcuseEditDraft(bare, null))).toBe(
      EXCUSE_REJECTION_MESSAGE,
    );
  });

  it("un comentario lo satisface", () => {
    expect(
      excuseJustificationError(rechazo, bare, {
        ...emptyExcuseEditDraft(bare, null),
        comment: "No aplica",
      }),
    ).toBeNull();
  });

  it("un comentario de solo espacios NO lo satisface", () => {
    expect(
      excuseJustificationError(rechazo, bare, {
        ...emptyExcuseEditDraft(bare, null),
        comment: "   ",
      }),
    ).toBe(EXCUSE_REJECTION_MESSAGE);
  });

  it("un adjunto ADMIN existente lo satisface", () => {
    expect(
      excuseJustificationError(rechazo, withAdm, emptyExcuseEditDraft(withAdm, null)),
    ).toBeNull();
  });

  it("un adjunto nuevo lo satisface", () => {
    expect(
      excuseJustificationError(rechazo, bare, {
        ...emptyExcuseEditDraft(bare, null),
        newAdminAttachments: ["data:x;base64,AAA"],
      }),
    ).toBeNull();
  });

  it("un estado que no es rechazo nunca exige justificación", () => {
    expect(excuseJustificationError(aprobado, bare, emptyExcuseEditDraft(bare, null))).toBeNull();
  });
});

// ─── Creación ────────────────────────────────────────────────────────────────

describe("buildExcuseCreatePayload", () => {
  const base = {
    studentIds: [8, 9, 8],
    subject: "Cita médica",
    description: "Consultorio distrito 4B, hora 14:30",
    typeTagId: 20,
    absentDays: ["2026-09-12", "2026-09-12"],
  };

  it("arma el cuerpo del POST igual que el de padres, con studentIds sin repetidos", () => {
    expect(buildExcuseCreatePayload(base)).toEqual({
      studentIds: [8, 9],
      subject: "Cita médica",
      description: "Consultorio distrito 4B, hora 14:30",
      typeTagId: 20,
      absentDays: ["2026-09-12", "2026-09-12"],
    });
  });

  it("recorta el asunto a 255 y adjunta solo si hay", () => {
    const longSubject = "A".repeat(300);
    expect(
      buildExcuseCreatePayload({ ...base, subject: longSubject }).subject,
    ).toHaveLength(255);
    expect(buildExcuseCreatePayload(base)).not.toHaveProperty("attachments");
    expect(
      buildExcuseCreatePayload({ ...base, attachments: ["data:a"] }).attachments,
    ).toEqual(["data:a"]);
  });

  it("stateTagId solo viaja si se manda", () => {
    expect(buildExcuseCreatePayload(base)).not.toHaveProperty("stateTagId");
    expect(buildExcuseCreatePayload({ ...base, stateTagId: 4 }).stateTagId).toBe(4);
  });
});

describe("readExcuseCategoryIds", () => {
  it("lee las dos categorías normalizando el shape del settings", () => {
    const ids = readExcuseCategoryIds({
      catExcusesId: { label: "Tipos", value: "30" },
      catExcuseStatedId: 40,
    });
    expect(ids).toEqual({ typeCategoryId: 30, stateCategoryId: 40 });
  });

  it("sin datos devuelve null en ambas", () => {
    expect(readExcuseCategoryIds(undefined)).toEqual({
      typeCategoryId: null,
      stateCategoryId: null,
    });
    expect(readExcuseCategoryIds({ catExcusesId: 0, catExcuseStatedId: null })).toEqual({
      typeCategoryId: null,
      stateCategoryId: null,
    });
  });
});

// ─── Red ─────────────────────────────────────────────────────────────────────

describe("fetchAdminExcusesPage", () => {
  const body = (items: unknown[], count?: number) => ({
    data: { success: true, data: { items, count: count ?? items.length } },
  });

  it("pega a /excuses con los params del listado", async () => {
    mockedGet.mockResolvedValue(body([{ id: 1 }]));

    const page = await fetchAdminExcusesPage({ token: TOKEN, urlColegio: URL, search: "ana" });

    expect(page.items).toEqual([{ id: 1 }]);
    expect(mockedGet).toHaveBeenCalledTimes(1);
    const [url, config] = mockedGet.mock.calls[0];
    expect(url).toBe(`${URL}/excuses`);
    expect(config.params).toMatchObject({
      page: 1,
      orderKey: "id",
      orderDir: "desc",
      rows: EXCUSES_ROWS,
      all: "ana",
      fields: EXCUSE_FIELDS,
    });
  });

  it("el filtro de estado va como stateTag.id en el query string", async () => {
    mockedGet.mockResolvedValue(body([{ id: 1 }]));

    await fetchAdminExcusesPage({
      token: TOKEN,
      urlColegio: URL,
      stateTagId: 3,
    });

    const params = mockedGet.mock.calls[0][1].params;
    expect(params["stateTag.id"]).toBe(3);
    expect(params).not.toHaveProperty("stateTagId");
  });

  it("hasMore: página llena y count pendiente → true; página corta → false", async () => {
    const full = Array.from({ length: EXCUSES_ROWS }, (_, i) => ({ id: i + 1 }));
    mockedGet.mockResolvedValueOnce(body(full, 40));
    expect(
      (await fetchAdminExcusesPage({ token: TOKEN, urlColegio: URL })).hasMore,
    ).toBe(true);

    mockedGet.mockResolvedValueOnce(body([{ id: 1 }], 40));
    expect(
      (await fetchAdminExcusesPage({ token: TOKEN, urlColegio: URL, page: 3 })).hasMore,
    ).toBe(false);
  });

  it("hasMore: el count dice que ya se leyó todo → false aunque la página venga llena", async () => {
    const full = Array.from({ length: EXCUSES_ROWS }, (_, i) => ({ id: i + 1 }));
    mockedGet.mockResolvedValueOnce(body(full, EXCUSES_ROWS));
    expect(
      (await fetchAdminExcusesPage({ token: TOKEN, urlColegio: URL })).hasMore,
    ).toBe(false);
  });

  it("una respuesta sin success devuelve página vacía", async () => {
    mockedGet.mockResolvedValue({ data: { success: false } });
    const page = await fetchAdminExcusesPage({ token: TOKEN, urlColegio: URL });
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
  });
});

describe("fetchExcuseDetail", () => {
  it("pega a /excuses/{id} y devuelve el grafo", async () => {
    mockedGet.mockResolvedValue({ data: { success: true, data: { id: 42 } } });

    const excuse = await fetchExcuseDetail({ token: TOKEN, urlColegio: URL, id: 42 });

    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/excuses/42`);
    expect(excuse?.id).toBe(42);
  });

  it("sin data devuelve null", async () => {
    mockedGet.mockResolvedValue({ data: { success: true, data: null } });
    expect(await fetchExcuseDetail({ token: TOKEN, urlColegio: URL, id: 1 })).toBeNull();
  });
});

describe("mutaciones", () => {
  it("updateExcuseState: PATCH /excuses/{id} con { stateTagId }", async () => {
    mockedPatch.mockResolvedValue({ data: { success: true } });

    const result = await updateExcuseState({ token: TOKEN, urlColegio: URL, id: 42, stateTagId: 2 });

    expect(result.ok).toBe(true);
    expect(mockedPatch).toHaveBeenCalledWith(
      `${URL}/excuses/42`,
      { stateTagId: 2 },
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
  });

  it("deleteExcuse: DELETE /excuses/{id}", async () => {
    mockedDelete.mockResolvedValue({ data: { success: true } });

    const result = await deleteExcuse({ token: TOKEN, urlColegio: URL, id: 42 });

    expect(result.ok).toBe(true);
    expect(mockedDelete.mock.calls[0][0]).toBe(`${URL}/excuses/42`);
  });

  it("patchExcuse devuelve TAL CUAL el rechazo del backend (success:false con HTTP 200)", async () => {
    const message = "Ya existe una excusa para ese periodo.";
    mockedPatch.mockResolvedValue({ data: { success: false, message } });

    const result = await patchExcuse({
      token: TOKEN,
      urlColegio: URL,
      id: 9,
      body: { stateTagId: 3 },
    });

    expect(result).toEqual({ ok: false, message });
    expect(mockedPatch).toHaveBeenCalledWith(
      `${URL}/excuses/9`,
      { stateTagId: 3 },
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
  });

  it("un error de red se devuelve como ok:false con el mensaje del backend", async () => {
    mockedPatch.mockRejectedValue({ response: { data: { message: "Sin permiso" } } });
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await updateExcuseState({ token: TOKEN, urlColegio: URL, id: 1, stateTagId: 2 });

    expect(result).toEqual({ ok: false, message: "Sin permiso" });
  });

  it("createExcuse: POST a /excuses con Content-Type JSON", async () => {
    mockedPost.mockResolvedValue({ data: { success: true, message: "ok" } });

    const result = await createExcuse({
      token: TOKEN,
      urlColegio: URL,
      payload: { studentIds: [1] },
    });

    expect(result.ok).toBe(true);
    expect(mockedPost).toHaveBeenCalledWith(
      `${URL}/excuses`,
      { studentIds: [1] },
      { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } },
    );
  });
});

// Ponches/hooks que no se usan acá no se importan — pero este describe
// documenta que el módulo completo compila y que `NOW` se mantiene anclado.
describe("sanity", () => {
  it("el anchor de la suite es 2026-09-10 16:00 UTC", () => {
    expect(NOW.toISOString()).toBe("2026-09-10T16:00:00.000Z");
  });
});