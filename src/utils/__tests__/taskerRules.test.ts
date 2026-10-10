import {
  addTaskerAddress,
  applyTaskerGeocode,
  buildCommentPayload,
  buildLocalComment,
  buildMapsUrl,
  buildTaskerAddress,
  canSubmitComment,
  getCommentAttachmentKind,
  emptyTaskerAddressDraft,
  formatTaskerAddress,
  getSelectedTaskerAddress,
  isTaskerAddressComplete,
  nextTaskerAddressId,
  removeTaskerAddress,
  resolveTaskerAddressConfig,
  resolveTaskerInitialPoint,
  TASKER_ADDRESS_DRAFT_FIELDS,
  taskerDraftFromAddress,
  toggleTaskerAddressSelected,
  updateTaskerAddress,
  formatActivityRange,
  formatElapsed,
  formatPhone,
  formatTaskerDate,
  getActivityTime,
  getAddressFields,
  getInitials,
  getStateActivities,
  getStateChipColors,
  getTagChipTone,
  resolveTaskerReportConfig,
  sortComments,
  TASKER_DESCRIPTION_REQUIRED_FALLBACK,
  TASKER_SERVICE_NAME_LABEL_FALLBACK,
  TASKER_STATE_COLOR_FALLBACK,
  validateReport,
} from "../taskerRules";
import {
  getTaskerOpenTask,
  getTaskerReportContext,
  TASKER_STATE_CANCELLED,
  TASKER_STATE_COMPLETED,
} from "../../constants/taskerMock";
import type { CompanySettings } from "../../../types/typeStore/SchoolStoreType";
import type { GeocodeResult } from "../addressRules";
import type {
  TaskerActivity,
  TaskerAddress,
  TaskerAddressDraft,
  TaskerAttachment,
  TaskerComment,
  TaskerReportAddress,
} from "../../../types/typesTasker/TaskerTypes";

// Las fechas se arman con new Date(año, mes, día, ...) o con strings sin zona
// (que el motor interpreta como hora local), así los tests no dependen de la
// zona horaria de la máquina.
const pad2 = (n: number) => String(n).padStart(2, "0");
/** Mismo formato que manda Tasker: "YYYY-MM-DDTHH:mm:ss", hora local. */
function localIso(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string {
  return `${y}-${pad2(mo + 1)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}:${pad2(s)}`;
}

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "Ahora" fijo para el ejemplo de taskerMock: sus fechas se arman desde acá. */
const MOCK_NOW = new Date(2026, 9, 7, 18, 11, 48).getTime();
const ms = (value: string | null) => (value ? new Date(value).getTime() : NaN);

function activity(over: Partial<TaskerActivity>): TaskerActivity {
  return {
    id: 1,
    type: "state",
    action: "Pendiente",
    message: "",
    beginDate: localIso(2026, 9, 6, 9, 58, 11),
    endDate: null,
    user: { name: "Jeremy Domínguez" },
    time: null,
    coordinates: null,
    ...over,
  };
}

function emptyAddress(over: Partial<TaskerAddress> = {}): TaskerAddress {
  return {
    title: "",
    province: "",
    city: "",
    sector: "",
    zone: "",
    street: "",
    streetNumber: "",
    building: "",
    apartmentNumber: "",
    latitude: null,
    longitude: null,
    referenceToArrive: "",
    whoReceives: "",
    restrictions: "",
    ...over,
  };
}

describe("formatTaskerDate", () => {
  it("formatea en DD/MM/YYYY hh:mm:ss A (mañana)", () => {
    expect(formatTaskerDate(new Date(2026, 9, 6, 9, 58, 11))).toBe("06/10/2026 09:58:11 AM");
  });
  it("tarde → PM con hora en 12h", () => {
    expect(formatTaskerDate(new Date(2026, 9, 7, 23, 6, 5))).toBe("07/10/2026 11:06:05 PM");
  });
  it("mediodía es 12 PM y medianoche 12 AM", () => {
    expect(formatTaskerDate(new Date(2026, 0, 1, 12, 0, 0))).toBe("01/01/2026 12:00:00 PM");
    expect(formatTaskerDate(new Date(2026, 0, 1, 0, 0, 0))).toBe("01/01/2026 12:00:00 AM");
  });
  it("acepta el string sin zona de Tasker como hora local", () => {
    expect(formatTaskerDate(localIso(2026, 9, 6, 9, 58, 11))).toBe("06/10/2026 09:58:11 AM");
  });
  it("acepta milisegundos", () => {
    expect(formatTaskerDate(new Date(2026, 9, 6, 9, 58, 11).getTime())).toBe(
      "06/10/2026 09:58:11 AM",
    );
  });
  it("vacío, null o inválido → cadena vacía", () => {
    expect(formatTaskerDate("")).toBe("");
    expect(formatTaskerDate(null)).toBe("");
    expect(formatTaskerDate(undefined)).toBe("");
    expect(formatTaskerDate("no es fecha")).toBe("");
  });
});

describe("formatElapsed", () => {
  const from = new Date(2026, 9, 6, 9, 58, 11).getTime();
  it("menos de un minuto → Xs", () => {
    expect(formatElapsed(from, from)).toBe("0s");
    expect(formatElapsed(from, from + 42 * SEC)).toBe("42s");
  });
  it("menos de una hora → Xm Ys", () => {
    expect(formatElapsed(from, from + 5 * MIN + 3 * SEC)).toBe("5m 3s");
  });
  it("menos de un día → Xh Ym Zs", () => {
    expect(formatElapsed(from, from + 7 * HOUR + 5 * MIN + 33 * SEC)).toBe("7h 5m 33s");
  });
  it("un día o más → Xd Xh Ym Zs", () => {
    expect(formatElapsed(from, from + DAY + HOUR + 8 * MIN + 4 * SEC)).toBe("1d 1h 8m 4s");
    expect(formatElapsed(from, from + 2 * DAY)).toBe("2d 0h 0m 0s");
  });
  it("trunca fracciones de segundo", () => {
    expect(formatElapsed(from, from + 1999)).toBe("1s");
  });
  it("ahora anterior al inicio → 0s", () => {
    expect(formatElapsed(from, from - 10 * SEC)).toBe("0s");
  });
});

describe("getStateActivities", () => {
  it("filtra type === 'state' y ordena por id descendente", () => {
    const result = getStateActivities([
      activity({ id: 1 }),
      activity({ id: 4, type: "assignedUser" }),
      activity({ id: 3 }),
      activity({ id: 2 }),
    ]);
    expect(result.map((a) => a.id)).toEqual([3, 2, 1]);
  });
  it("no muta el arreglo original", () => {
    const input = [activity({ id: 1 }), activity({ id: 2 })];
    getStateActivities(input);
    expect(input.map((a) => a.id)).toEqual([1, 2]);
  });
  it("con los datos fijos quedan 3 actividades de estado", () => {
    expect(getStateActivities(getTaskerOpenTask().task.activities)).toHaveLength(3);
  });
});

describe("historial de ejemplo (taskerMock)", () => {
  const { task } = getTaskerOpenTask(MOCK_NOW);
  // Del más viejo al más nuevo: Pendiente → Asignada → Iniciada.
  const states = getStateActivities(task.activities).reverse();
  const durationMs = (a: TaskerActivity) =>
    (a.endDate ? ms(a.endDate) : MOCK_NOW) - ms(a.beginDate);

  it("fechas armadas hacia atrás desde now", () => {
    expect(task.createdDate).toBe(localIso(2026, 9, 6, 9, 58, 11));
    expect(states.map((a) => [a.action, a.beginDate, a.endDate])).toEqual([
      ["Pendiente", localIso(2026, 9, 6, 9, 58, 11), localIso(2026, 9, 6, 10, 4, 0)],
      ["Asignada", localIso(2026, 9, 6, 10, 4, 0), localIso(2026, 9, 7, 11, 6, 15)],
      ["Iniciada", localIso(2026, 9, 7, 11, 6, 15), null],
    ]);
  });
  it("ningún estado dura 0", () => {
    for (const a of states) {
      expect(durationMs(a)).toBeGreaterThan(0);
      expect(getActivityTime(a, task.stateId, MOCK_NOW)).not.toBe("0s");
    }
  });
  it("cada estado empieza donde termina el anterior", () => {
    for (let i = 1; i < states.length; i++) {
      expect(states[i].beginDate).toBe(states[i - 1].endDate);
    }
    expect(states[0].beginDate).toBe(task.createdDate);
  });
  it("time de los cerrados coincide con sus fechas", () => {
    for (const a of states.filter((s) => s.endDate)) {
      expect(a.time).toBe(formatElapsed(ms(a.beginDate), ms(a.endDate)));
    }
  });
  it("la suma de los tres da el Transcurrido", () => {
    const total = states.reduce((sum, a) => sum + durationMs(a), 0);
    expect(total).toBe(MOCK_NOW - ms(task.createdDate));
    expect(formatElapsed(0, total)).toBe(formatElapsed(ms(task.createdDate), MOCK_NOW));
  });
  it("en pantalla: Transcurrido 1d 8h 13m 37s e Iniciada 7h 5m 33s", () => {
    expect(formatElapsed(ms(task.createdDate), MOCK_NOW)).toBe("1d 8h 13m 37s");
    expect(states.map((a) => getActivityTime(a, task.stateId, MOCK_NOW))).toEqual([
      "5m 49s",
      "1d 1h 2m 15s",
      "7h 5m 33s",
    ]);
  });
  it("sin depender del día: con otro now (y fracción de segundo) da lo mismo", () => {
    const later = MOCK_NOW + 3 * DAY + 999;
    const other = getTaskerOpenTask(later).task;
    expect(formatElapsed(ms(other.createdDate), later)).toBe("1d 8h 13m 37s");
  });
  it("comentarios y actividad de responsable relativos al historial", () => {
    const assigned = task.activities.find((a) => a.type === "assignedUser");
    expect(assigned?.beginDate).toBe(states[1].beginDate);
    const byAuthor = Object.fromEntries(task.comments.map((c) => [c.addUser.name, c.createdDate]));
    expect(byAuthor["Jeremy Móvil"]).toBe(localIso(2026, 9, 6, 10, 18, 11));
    expect(byAuthor["Jeremy Domínguez"]).toBe(localIso(2026, 9, 7, 11, 15, 42));
  });
});

describe("getActivityTime", () => {
  const now = new Date(2026, 9, 7, 18, 11, 48).getTime();
  const open = activity({ beginDate: localIso(2026, 9, 7, 11, 6, 15), time: null });

  it("si trae time, lo devuelve tal cual", () => {
    expect(getActivityTime(activity({ time: "1d 1h 8m 4s" }), 3, now)).toBe("1d 1h 8m 4s");
    expect(getActivityTime(activity({ time: "0s" }), TASKER_STATE_COMPLETED, now)).toBe("0s");
  });
  it("sin time y ticket abierto → calcula de beginDate a ahora", () => {
    expect(getActivityTime(open, 3, now)).toBe("7h 5m 33s");
  });
  it("sin time y ticket Completado o Cancelado → null", () => {
    expect(getActivityTime(open, TASKER_STATE_COMPLETED, now)).toBeNull();
    expect(getActivityTime(open, TASKER_STATE_CANCELLED, now)).toBeNull();
  });
  it("sin time y beginDate inválido → null", () => {
    expect(getActivityTime(activity({ beginDate: "" }), 3, now)).toBeNull();
  });
});

describe("formatActivityRange", () => {
  it("solo beginDate cuando endDate es null o vacío", () => {
    const begin = localIso(2026, 9, 7, 11, 6, 15);
    expect(formatActivityRange(activity({ beginDate: begin, endDate: null }))).toBe(
      "07/10/2026 11:06:15 AM",
    );
    expect(formatActivityRange(activity({ beginDate: begin, endDate: "" }))).toBe(
      "07/10/2026 11:06:15 AM",
    );
  });
  it("beginDate - endDate cuando hay fin", () => {
    expect(
      formatActivityRange(
        activity({
          beginDate: localIso(2026, 9, 6, 9, 58, 11),
          endDate: localIso(2026, 9, 7, 11, 6, 15),
        }),
      ),
    ).toBe("06/10/2026 09:58:11 AM - 07/10/2026 11:06:15 AM");
  });
});

describe("sortComments", () => {
  const comment = (id: number, createdDate: string): TaskerComment => ({
    id,
    addUser: { name: "X" },
    createdDate,
    comment: "",
    images: [],
  });
  const list = [
    comment(1, localIso(2026, 9, 6, 10)),
    comment(2, localIso(2026, 9, 8, 10)),
    comment(3, localIso(2026, 9, 7, 10)),
  ];

  it("por defecto desc (más reciente primero)", () => {
    expect(sortComments(list).map((c) => c.id)).toEqual([2, 3, 1]);
  });
  it("asc (más viejo primero)", () => {
    expect(sortComments(list, "asc").map((c) => c.id)).toEqual([1, 3, 2]);
  });
  it("no muta el arreglo original", () => {
    sortComments(list, "asc");
    expect(list.map((c) => c.id)).toEqual([1, 2, 3]);
  });
  it("fecha inválida cuenta como la más vieja", () => {
    const withBad = [...list, comment(4, "")];
    expect(sortComments(withBad, "asc")[0].id).toBe(4);
  });
});

describe("comentarios de Seguimiento", () => {
  const PNG = "data:image/jpeg;base64,AAAA";
  const PDF = "data:application/pdf;base64,BBBB";
  const file = (id: string, dataUri: string): TaskerAttachment => ({
    id,
    name: `${id}.bin`,
    mimeType: dataUri.slice(5, dataUri.indexOf(";")),
    dataUri,
  });

  describe("canSubmitComment", () => {
    it("sin texto ni adjuntos → false", () => {
      expect(canSubmitComment("", [])).toBe(false);
    });
    it("solo espacios y saltos no cuentan como texto", () => {
      expect(canSubmitComment("  \n\t ", [])).toBe(false);
    });
    it("con texto → true", () => {
      expect(canSubmitComment(" hola ", [])).toBe(true);
    });
    it("sin texto pero con adjuntos → true", () => {
      expect(canSubmitComment("   ", [file("a", PNG)])).toBe(true);
    });
  });

  describe("buildLocalComment", () => {
    const task = { addUser: { id: 21, name: "Jeremy Domínguez" } };
    const now = new Date(2026, 9, 9, 14, 5, 7);

    it("autor = task.addUser (el solicitante), como Tasker", () => {
      const c = buildLocalComment({ text: "x", attachments: [], task, now });
      expect(c.addUser).toEqual({ name: "Jeremy Domínguez" });
    });
    it("fecha de ese momento, sin zona, en hora local", () => {
      const c = buildLocalComment({ text: "x", attachments: [], task, now });
      expect(c.createdDate).toBe(localIso(2026, 9, 9, 14, 5, 7));
      expect(formatTaskerDate(c.createdDate)).toBe("09/10/2026 02:05:07 PM");
    });
    it("texto recortado al inicio y al final", () => {
      const c = buildLocalComment({ text: "  hola\nmundo \n", attachments: [], task, now });
      expect(c.comment).toBe("hola\nmundo");
    });
    it("images = data-URIs de los adjuntos, en orden", () => {
      const c = buildLocalComment({
        text: "",
        attachments: [file("a", PNG), file("b", PDF)],
        task,
        now,
      });
      expect(c.images).toEqual([PNG, PDF]);
    });
    it("id negativo (no choca con los del servidor)", () => {
      const c = buildLocalComment({ text: "x", attachments: [], task, now });
      expect(c.id).toBeLessThan(0);
    });
    it("queda más reciente que los del ejemplo al ordenar desc", () => {
      const local = buildLocalComment({ text: "x", attachments: [], task, now });
      const sorted = sortComments([...getTaskerOpenTask(MOCK_NOW).task.comments, local], "desc");
      expect(sorted[0]).toBe(local);
    });
  });

  describe("buildCommentPayload", () => {
    it("forma exacta de Tasker", () => {
      expect(buildCommentPayload("  hola  ", [file("a", PNG), file("b", PDF)])).toEqual({
        taskComments: [{ comment: "hola", images: [PNG, PDF], localAttachments: [] }],
      });
    });
    it("sin adjuntos → images vacío", () => {
      expect(buildCommentPayload("hola", [])).toEqual({
        taskComments: [{ comment: "hola", images: [], localAttachments: [] }],
      });
    });
  });

  describe("getCommentAttachmentKind", () => {
    it("data-URI de imagen → image", () => {
      expect(getCommentAttachmentKind(PNG)).toBe("image");
      expect(getCommentAttachmentKind("data:image/png;base64,AAAA")).toBe("image");
    });
    it("data-URI de otro tipo (PDF) → file", () => {
      expect(getCommentAttachmentKind(PDF)).toBe("file");
    });
    it("ruta guardada del servidor → server", () => {
      expect(getCommentAttachmentKind("comentarios/4045/adjunto-1.jpg")).toBe("server");
    });
  });

  describe("comentarios de ejemplo", () => {
    it("hay dos, con fechas distintas, para que el orden se note", () => {
      const { comments } = getTaskerOpenTask(MOCK_NOW).task;
      expect(comments).toHaveLength(2);
      expect(sortComments(comments, "desc").map((c) => c.id)).toEqual([1, 2]);
      expect(sortComments(comments, "asc").map((c) => c.id)).toEqual([2, 1]);
    });
  });
});

describe("getAddressFields", () => {
  it("null → lista vacía", () => {
    expect(getAddressFields(null)).toEqual([]);
  });
  it("respeta el orden y las etiquetas de Tasker con todos los campos", () => {
    const fields = getAddressFields({
      title: "T",
      province: "P",
      city: "C",
      sector: "S",
      zone: "Z",
      street: "Ca",
      streetNumber: "1",
      building: "E",
      apartmentNumber: "2B",
      latitude: 18.5,
      longitude: -69.9,
      referenceToArrive: "R",
      whoReceives: "Q",
      restrictions: "X",
    });
    expect(fields.map((f) => f.label)).toEqual([
      "Título",
      "Provincia",
      "Ciudad",
      "Sector",
      "Zona",
      "Calle",
      "Número",
      "Edificio",
      "N° de Apartamento",
      "Latitud",
      "Longitud",
      "Referencias para llegar",
      "Quién recibe",
      "Restricciones",
    ]);
    expect(fields.find((f) => f.key === "latitude")?.value).toBe("18.5");
  });
  it("oculta vacíos, espacios y nulos; conserva el 0 numérico", () => {
    const fields = getAddressFields(
      emptyAddress({ title: "Casa", city: "   ", latitude: 0, longitude: null }),
    );
    expect(fields).toEqual([
      { key: "title", label: "Título", value: "Casa" },
      { key: "latitude", label: "Latitud", value: "0" },
    ]);
  });
  it("con los datos fijos oculta Zona, N° de Apartamento y Restricciones", () => {
    const labels = getAddressFields(getTaskerOpenTask().task.address).map((f) => f.label);
    expect(labels).not.toContain("Zona");
    expect(labels).not.toContain("N° de Apartamento");
    expect(labels).not.toContain("Restricciones");
    expect(labels).toHaveLength(11);
  });
});

describe("getTagChipTone", () => {
  it("elige por posición y da vuelta al final de la paleta", () => {
    const first = getTagChipTone(0);
    expect(getTagChipTone(1)).not.toEqual(first);
    expect(getTagChipTone(6)).toEqual(first);
  });
  it("tolera posiciones negativas", () => {
    expect(getTagChipTone(-6)).toEqual(getTagChipTone(0));
  });
});

describe("getStateChipColors", () => {
  it("color válido → punto con ese color y fondo atenuado", () => {
    expect(getStateChipColors("#D97706")).toEqual({
      dot: "#D97706",
      background: "rgba(217,119,6,0.14)",
    });
  });
  it("color faltante o mal formado → #ccc", () => {
    for (const bad of [null, undefined, "", "#ccc", "D97706", "#GGGGGG", "red"]) {
      expect(getStateChipColors(bad)).toEqual({
        dot: TASKER_STATE_COLOR_FALLBACK,
        background: "rgba(204,204,204,0.14)",
      });
    }
  });
});

describe("formatPhone", () => {
  it("10 dígitos → (809) 555-0100", () => {
    expect(formatPhone("8095550100")).toBe("(809) 555-0100");
  });
  it("cualquier otro caso, sin cambios", () => {
    expect(formatPhone("809-555-0100")).toBe("809-555-0100");
    expect(formatPhone("18095550100")).toBe("18095550100");
    expect(formatPhone("")).toBe("");
  });
  it("null o undefined → cadena vacía", () => {
    expect(formatPhone(null)).toBe("");
    expect(formatPhone(undefined)).toBe("");
  });
});

describe("buildMapsUrl", () => {
  it("arma la búsqueda de Google Maps", () => {
    expect(buildMapsUrl(18.4571092, -69.9524086)).toBe(
      "https://www.google.com/maps/search/?api=1&query=18.4571092,-69.9524086",
    );
    expect(buildMapsUrl("18.1", "-69.2")).toBe(
      "https://www.google.com/maps/search/?api=1&query=18.1,-69.2",
    );
  });
});

describe("getInitials", () => {
  it("primeras letras de las dos primeras palabras", () => {
    expect(getInitials("Jeremy Domínguez")).toBe("JD");
    expect(getInitials("  ana  maría  pérez ")).toBe("AM");
    expect(getInitials("Jeremy")).toBe("J");
  });
  it("vacío o null → cadena vacía", () => {
    expect(getInitials("")).toBe("");
    expect(getInitials(null)).toBe("");
  });
});

describe("validateReport", () => {
  const required = { serviceNameLabel: "Servicio", isDescriptionRequired: true };
  const optional = { serviceNameLabel: "Servicio", isDescriptionRequired: false };

  it("sin tipo ni descripción y descripción requerida → ambos errores", () => {
    expect(validateReport({ typeId: null, description: "  " }, required)).toEqual({
      typeId: "Tipo es un campo requerido",
      description: "La descripción es un campo requerido",
    });
  });
  it("descripción no requerida → solo el error de tipo", () => {
    expect(validateReport({ typeId: undefined, description: "" }, optional)).toEqual({
      typeId: "Tipo es un campo requerido",
    });
  });
  it("todo completo → sin errores", () => {
    expect(validateReport({ typeId: 11, description: "Falla" }, required)).toEqual({});
  });
  it("tipo con id 0 cuenta como elegido", () => {
    expect(validateReport({ typeId: 0, description: "x" }, required)).toEqual({});
  });
});

describe("resolveTaskerReportConfig", () => {
  const settings = (over: Partial<CompanySettings>): CompanySettings => ({
    categoryDefaultIds: {},
    schedulesAdd: [],
    entryTime: "",
    exitTime: "",
    daysLateAbsence: 3,
    tardinessMode: "Automatica",
    attendanceMode: "",
    serviceNameLabel: TASKER_SERVICE_NAME_LABEL_FALLBACK,
    isDescriptionRequired: TASKER_DESCRIPTION_REQUIRED_FALLBACK,
    ...over,
  });

  it("respaldos: 'Servicio' y descripción requerida", () => {
    expect(TASKER_SERVICE_NAME_LABEL_FALLBACK).toBe("Servicio");
    expect(TASKER_DESCRIPTION_REQUIRED_FALLBACK).toBe(true);
  });
  it("sin companySettings → respaldos", () => {
    expect(resolveTaskerReportConfig(null)).toEqual({
      serviceNameLabel: "Servicio",
      isDescriptionRequired: true,
    });
  });
  it("con companySettings → toma sus dos claves y nada más", () => {
    expect(
      resolveTaskerReportConfig(
        settings({ serviceNameLabel: "Área", isDescriptionRequired: false }),
      ),
    ).toEqual({ serviceNameLabel: "Área", isDescriptionRequired: false });
  });
  it("el resultado alimenta validateReport", () => {
    const config = resolveTaskerReportConfig(settings({ isDescriptionRequired: false }));
    expect(validateReport({ typeId: 11, description: "" }, config)).toEqual({});
  });
});

// ─── Direcciones de Reportar Avería ──────────────────────────────────────────

function draft(over: Partial<TaskerAddressDraft> = {}): TaskerAddressDraft {
  return { ...emptyTaskerAddressDraft(), ...over };
}

function listAddress(
  over: Partial<TaskerReportAddress> & { id: number; order: number },
): TaskerReportAddress {
  return { ...emptyAddress(), selected: false, ...over };
}

const FULL_GEOCODE: GeocodeResult = {
  formatted_address: "C. Luis F. Thomén 412, Santo Domingo, República Dominicana",
  geometry: { location: { lat: 18.457123456789, lng: -69.952412345678 } },
  address_components: [
    { long_name: "412", types: ["street_number"] },
    { long_name: "Calle Luis F. Thomén", types: ["route"] },
    { long_name: "El Millón", types: ["neighborhood", "political"] },
    { long_name: "Sub El Millón", types: ["sublocality_level_1", "sublocality", "political"] },
    { long_name: "Santo Domingo de Guzmán", types: ["locality", "political"] },
    { long_name: "Santo Domingo", types: ["administrative_area_level_2", "political"] },
    { long_name: "Distrito Nacional", types: ["administrative_area_level_1", "political"] },
    { long_name: "10148", types: ["postal_code"] },
    { long_name: "Torre Azul", types: ["establishment", "point_of_interest"] },
    { long_name: "5B", types: ["subpremise"] },
  ],
};

describe("TASKER_ADDRESS_DRAFT_FIELDS / borrador", () => {
  it("orden de Tasker, más postalCode al final", () => {
    expect(TASKER_ADDRESS_DRAFT_FIELDS).toEqual([
      "title",
      "province",
      "city",
      "sector",
      "zone",
      "street",
      "streetNumber",
      "building",
      "apartmentNumber",
      "referenceToArrive",
      "whoReceives",
      "restrictions",
      "postalCode",
    ]);
  });
  it("borrador vacío: todos los campos en ''", () => {
    const empty = emptyTaskerAddressDraft();
    expect(Object.keys(empty)).toEqual(TASKER_ADDRESS_DRAFT_FIELDS);
    expect(Object.values(empty).every((v) => v === "")).toBe(true);
  });
  it("taskerDraftFromAddress: null → vacío", () => {
    expect(taskerDraftFromAddress(null)).toEqual(emptyTaskerAddressDraft());
  });
  it("taskerDraftFromAddress: copia los campos, faltantes en '' y no arrastra coordenadas", () => {
    const loaded = taskerDraftFromAddress(
      emptyAddress({ title: "Casa", street: "Duarte", postalCode: "10101", latitude: 18 }),
    );
    expect(loaded).toEqual(draft({ title: "Casa", street: "Duarte", postalCode: "10101" }));
    expect(taskerDraftFromAddress(emptyAddress()).postalCode).toBe("");
  });
});

describe("isTaskerAddressComplete", () => {
  const complete = draft({
    province: "D.N.",
    city: "Santo Domingo",
    sector: "Piantini",
    street: "Gustavo Mejía Ricart",
    streetNumber: "54",
  });
  it("los 5 obligatorios con texto → true (title y el resto no cuentan)", () => {
    expect(isTaskerAddressComplete(complete)).toBe(true);
  });
  it.each(["province", "city", "sector", "street", "streetNumber"] as const)(
    "falta %s → false",
    (key) => {
      expect(isTaskerAddressComplete({ ...complete, [key]: "" })).toBe(false);
    },
  );
  it("solo espacios cuenta como vacío", () => {
    expect(isTaskerAddressComplete({ ...complete, streetNumber: "   " })).toBe(false);
  });
});

describe("resolveTaskerInitialPoint", () => {
  it("null → null", () => {
    expect(resolveTaskerInitialPoint(null)).toBeNull();
  });
  it("usa location si la trae (sobre latitude/longitude)", () => {
    expect(
      resolveTaskerInitialPoint(
        emptyAddress({ location: { lat: 1.5, lng: 2.5 }, latitude: 9, longitude: 9 }),
      ),
    ).toEqual({ lat: 1.5, lng: 2.5 });
  });
  it("E2: sin location, usa latitude/longitude numéricos", () => {
    expect(
      resolveTaskerInitialPoint(emptyAddress({ latitude: 18.4571092, longitude: -69.9524086 })),
    ).toEqual({ lat: 18.4571092, lng: -69.9524086 });
  });
  it("E2: acepta latitude/longitude como texto numérico", () => {
    expect(resolveTaskerInitialPoint(emptyAddress({ latitude: "18.5", longitude: "-69.9" }))).toEqual(
      { lat: 18.5, lng: -69.9 },
    );
  });
  it("sin location ni coordenadas válidas → null", () => {
    expect(resolveTaskerInitialPoint(emptyAddress())).toBeNull();
    expect(resolveTaskerInitialPoint(emptyAddress({ latitude: "", longitude: "" }))).toBeNull();
    expect(resolveTaskerInitialPoint(emptyAddress({ latitude: "abc", longitude: 1 }))).toBeNull();
    expect(resolveTaskerInitialPoint(emptyAddress({ latitude: 18, longitude: null }))).toBeNull();
  });
  it("location incompleta → cae a latitude/longitude", () => {
    expect(
      resolveTaskerInitialPoint(
        emptyAddress({ location: {} as never, latitude: 3, longitude: 4 }),
      ),
    ).toEqual({ lat: 3, lng: 4 });
  });
});

describe("applyTaskerGeocode", () => {
  const user = draft({
    title: "Oficina",
    referenceToArrive: "Frente al parque",
    whoReceives: "Ana",
    restrictions: "Solo de día",
  });
  it("llena los 9 campos con el mapeo de Tasker", () => {
    expect(applyTaskerGeocode(user, FULL_GEOCODE)).toEqual({
      ...user,
      province: "Distrito Nacional",
      city: "Santo Domingo de Guzmán",
      sector: "El Millón",
      zone: "Santo Domingo",
      street: "Calle Luis F. Thomén",
      streetNumber: "412",
      postalCode: "10148",
      building: "Torre Azul",
      apartmentNumber: "5B",
    });
  });
  it("sector: sin neighborhood usa sublocality_level_1", () => {
    const result = applyTaskerGeocode(draft(), {
      address_components: [{ long_name: "Gazcue", types: ["sublocality_level_1"] }],
    });
    expect(result.sector).toBe("Gazcue");
  });
  it("sobrescribe con '' lo que Google no trae, aunque el usuario lo hubiera escrito", () => {
    const typed = draft({
      ...user,
      province: "P",
      city: "C",
      sector: "S",
      zone: "Z",
      street: "Ca",
      streetNumber: "1",
      postalCode: "2",
      building: "E",
      apartmentNumber: "3",
    });
    expect(applyTaskerGeocode(typed, {})).toEqual(user);
  });
  it("no toca title, referenceToArrive, whoReceives ni restrictions", () => {
    const result = applyTaskerGeocode(user, FULL_GEOCODE);
    expect(result.title).toBe("Oficina");
    expect(result.referenceToArrive).toBe("Frente al parque");
    expect(result.whoReceives).toBe("Ana");
    expect(result.restrictions).toBe("Solo de día");
  });
});

describe("formatTaskerAddress", () => {
  it("Calle Número, Zona, Sector, Ciudad, Provincia (Zona antes que Sector)", () => {
    expect(
      formatTaskerAddress(
        draft({
          street: "Duarte",
          streetNumber: "45",
          zone: "Zona Norte",
          sector: "Centro",
          city: "La Vega",
          province: "La Vega",
        }),
      ),
    ).toBe("Duarte 45, Zona Norte, Centro, La Vega, La Vega");
  });
  it("salta los vacíos", () => {
    expect(formatTaskerAddress(draft({ street: "Duarte", sector: "Centro", province: "La Vega" }))).toBe(
      "Duarte, Centro, La Vega",
    );
    expect(formatTaskerAddress(draft({ streetNumber: "45", city: "  " }))).toBe("45");
    expect(formatTaskerAddress(draft())).toBe("");
  });
});

describe("buildTaskerAddress", () => {
  const filled = draft({
    title: "",
    province: "D.N.",
    city: "Santo Domingo",
    sector: "Piantini",
    street: "Gustavo Mejía Ricart",
    streetNumber: "54",
  });

  it("nueva con geocode: coordenadas del resultado, sin redondear, y address de Google", () => {
    const built = buildTaskerAddress({
      previous: null,
      draft: { ...filled, title: "Casa" },
      geocode: FULL_GEOCODE,
      initialPoint: { lat: 1, lng: 1 },
    });
    expect(built).toEqual({
      ...filled,
      title: "Casa",
      formattedAddress: "Gustavo Mejía Ricart 54, Piantini, Santo Domingo, D.N.",
      address: FULL_GEOCODE.formatted_address,
      location: { lat: 18.457123456789, lng: -69.952412345678 },
      latitude: 18.457123456789,
      longitude: -69.952412345678,
    });
  });
  it("sin búsqueda: coordenadas del punto inicial", () => {
    const built = buildTaskerAddress({
      previous: null,
      draft: filled,
      geocode: null,
      initialPoint: { lat: 18.4, lng: -69.9 },
    });
    expect(built.location).toEqual({ lat: 18.4, lng: -69.9 });
    expect(built.latitude).toBe(18.4);
    expect(built.longitude).toBe(-69.9);
  });
  it("geocode sin geometry → también el punto inicial", () => {
    const built = buildTaskerAddress({
      previous: null,
      draft: filled,
      geocode: { formatted_address: "X" },
      initialPoint: { lat: 5, lng: 6 },
    });
    expect(built.location).toEqual({ lat: 5, lng: 6 });
    expect(built.address).toBe("X");
  });
  it("E4 — sin geocode ni punto inicial: latitude/longitude null y sin location (Tasker pondría el centro de Santo Domingo)", () => {
    const built = buildTaskerAddress({
      previous: emptyAddress({ location: { lat: 1, lng: 2 } }),
      draft: filled,
      geocode: null,
      initialPoint: null,
    });
    expect(built.latitude).toBeNull();
    expect(built.longitude).toBeNull();
    expect("location" in built).toBe(false);
  });
  it("al editar conserva todas las claves de previous y pisa los campos del borrador", () => {
    const previous = {
      ...listAddress({ id: 7, order: 2, selected: true }),
      title: "Viejo",
      street: "Vieja",
      address: "Dirección anterior de Google",
      extraKey: "se conserva",
    } as TaskerReportAddress & { extraKey: string };
    const built = buildTaskerAddress({
      previous,
      draft: { ...filled, title: "Nuevo" },
      geocode: null,
      initialPoint: { lat: 1, lng: 2 },
    }) as TaskerReportAddress & { extraKey: string };
    expect(built.id).toBe(7);
    expect(built.order).toBe(2);
    expect(built.selected).toBe(true);
    expect(built.extraKey).toBe("se conserva");
    expect(built.title).toBe("Nuevo");
    expect(built.street).toBe("Gustavo Mejía Ricart");
    expect(built.address).toBe("Dirección anterior de Google");
  });
  it("address: formatted_address de Google > address anterior > ''", () => {
    const base = { draft: filled, initialPoint: null };
    expect(
      buildTaskerAddress({ ...base, previous: emptyAddress({ address: "Ant" }), geocode: FULL_GEOCODE })
        .address,
    ).toBe(FULL_GEOCODE.formatted_address);
    expect(
      buildTaskerAddress({ ...base, previous: emptyAddress({ address: "Ant" }), geocode: null }).address,
    ).toBe("Ant");
    expect(buildTaskerAddress({ ...base, previous: null, geocode: null }).address).toBe("");
  });
  it("title vacío se rellena con sector; sin sector, con city", () => {
    const base = { previous: null, geocode: null, initialPoint: null };
    expect(buildTaskerAddress({ ...base, draft: filled }).title).toBe("Piantini");
    expect(buildTaskerAddress({ ...base, draft: { ...filled, title: "  " } }).title).toBe("Piantini");
    expect(buildTaskerAddress({ ...base, draft: { ...filled, sector: "" } }).title).toBe(
      "Santo Domingo",
    );
  });
  it("incluye postalCode del borrador", () => {
    const built = buildTaskerAddress({
      previous: null,
      draft: { ...filled, postalCode: "10148" },
      geocode: null,
      initialPoint: null,
    });
    expect(built.postalCode).toBe("10148");
  });
});

describe("lista de direcciones", () => {
  const a1 = listAddress({ id: 1, order: 1, selected: true, title: "Uno" });
  const a2 = listAddress({ id: 5, order: 2, title: "Dos" });
  const a3 = listAddress({ id: 3, order: 3, title: "Tres" });

  describe("nextTaskerAddressId (E1)", () => {
    it("lista vacía → 1", () => {
      expect(nextTaskerAddressId([])).toBe(1);
    });
    it("el id mayor + 1, no la longitud", () => {
      expect(nextTaskerAddressId([a1, a2, a3])).toBe(6);
    });
  });

  describe("addTaskerAddress", () => {
    it("lista vacía: id 1, order 1, marcada", () => {
      const result = addTaskerAddress([], emptyAddress({ title: "Nueva" }));
      expect(result).toEqual([{ ...emptyAddress({ title: "Nueva" }), id: 1, order: 1, selected: true }]);
    });
    it("entra al final, marcada; las demás pasan a false", () => {
      const result = addTaskerAddress([a1, a2], emptyAddress({ title: "Nueva" }));
      expect(result.map((a) => [a.id, a.order, a.selected])).toEqual([
        [1, 1, false],
        [5, 2, false],
        [6, 3, true],
      ]);
    });
    it("no muta la lista original", () => {
      const list = [a1];
      addTaskerAddress(list, emptyAddress());
      expect(list[0].selected).toBe(true);
      expect(list).toHaveLength(1);
    });
    it("los ids de las demás no cambian (E1)", () => {
      const result = addTaskerAddress([a1, a2, a3], emptyAddress());
      expect(result.map((a) => a.id)).toEqual([1, 5, 3, 6]);
    });
  });

  describe("updateTaskerAddress", () => {
    it("reemplaza por id sin tocar las demás", () => {
      const result = updateTaskerAddress([a1, a2, a3], { ...a2, title: "Editada" });
      expect(result.map((a) => a.title)).toEqual(["Uno", "Editada", "Tres"]);
      expect(result[0]).toBe(a1);
    });
    it("ordena por order", () => {
      const result = updateTaskerAddress([a3, a1, a2], { ...a1, title: "X" });
      expect(result.map((a) => a.order)).toEqual([1, 2, 3]);
    });
    it("id inexistente: no agrega nada", () => {
      expect(updateTaskerAddress([a1], { ...a2 })).toEqual([a1]);
    });
  });

  describe("removeTaskerAddress", () => {
    it("quita por id y renumera order 1..N", () => {
      const result = removeTaskerAddress([a1, a2, a3], 5);
      expect(result.map((a) => [a.id, a.order])).toEqual([
        [1, 1],
        [3, 2],
      ]);
    });
    it("si era la principal, no queda ninguna marcada", () => {
      const result = removeTaskerAddress([a1, a2, a3], 1);
      expect(result.some((a) => a.selected)).toBe(false);
      expect(getSelectedTaskerAddress(result)).toBeUndefined();
    });
    it("borrar la última deja la lista vacía", () => {
      expect(removeTaskerAddress([a1], 1)).toEqual([]);
    });
  });

  describe("toggleTaskerAddressSelected", () => {
    it("marca esa y desmarca las demás", () => {
      const result = toggleTaskerAddressSelected([a1, a2, a3], 3);
      expect(result.map((a) => a.selected)).toEqual([false, false, true]);
    });
    it("si ya estaba marcada, la desmarca y no queda ninguna", () => {
      const result = toggleTaskerAddressSelected([a1, a2, a3], 1);
      expect(result.map((a) => a.selected)).toEqual([false, false, false]);
    });
  });

  describe("getSelectedTaskerAddress", () => {
    it("la primera con selected true", () => {
      const both = [a2, { ...a3, selected: true }, { ...a1, selected: true }];
      expect(getSelectedTaskerAddress(both)?.id).toBe(3);
    });
    it("ninguna o lista vacía → undefined", () => {
      expect(getSelectedTaskerAddress([a2, a3])).toBeUndefined();
      expect(getSelectedTaskerAddress([])).toBeUndefined();
    });
  });
});

describe("resolveTaskerAddressConfig", () => {
  it("Quién Recibe y Restricciones ocultos hasta que el backend los exponga", () => {
    expect(resolveTaskerAddressConfig()).toEqual({
      showWhoReceives: false,
      showRestrictions: false,
    });
  });
});

describe("getTaskerReportContext (direcciones de ejemplo)", () => {
  it("no trae adjuntos de ejemplo: la lista arranca vacía", () => {
    expect(getTaskerReportContext()).not.toHaveProperty("attachments");
  });
  it("cada dirección trae id, order y selected booleano", () => {
    const { addresses } = getTaskerReportContext();
    addresses.forEach((a, index) => {
      expect(typeof a.id).toBe("number");
      expect(a.order).toBe(index + 1);
      expect(typeof a.selected).toBe("boolean");
    });
  });
  it("si hay una sola, va marcada", () => {
    const { addresses } = getTaskerReportContext();
    if (addresses.length === 1) expect(addresses[0].selected).toBe(true);
    expect(addresses.filter((a) => a.selected).length).toBeLessThanOrEqual(1);
  });
});
