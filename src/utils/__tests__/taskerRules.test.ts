import {
  addTaskerAddress,
  addTaskerComment,
  applyTaskerGeocode,
  buildCommentPayload,
  buildLocalComment,
  buildMapsUrl,
  buildTaskerAddress,
  canEditTaskerComment,
  canSaveTaskerComment,
  canSubmitComment,
  commentImagesToAttachments,
  getCommentAttachmentKind,
  getCommentComposerTransition,
  resolveCommentComposer,
  isTaskerCommentDraftChanged,
  isTaskerCommentTextValid,
  removeTaskerComment,
  TASKER_COMMENT_MAX_LENGTH,
  taskerCommentDraftFrom,
  updateTaskerComment,
  emptyTaskerAddressDraft,
  formatTaskerAddress,
  getSelectedTaskerAddress,
  fitTaskerAttachments,
  getDataUriFileBytes,
  getTaskerCommentsAttachmentBytes,
  TASKER_REPORT_ATTACHMENTS_MAX_BYTES,
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
  getTaskerAddressLines,
  getInitials,
  getStateActivities,
  getStateChipColors,
  getTagChipTone,
  sortComments,
  TASKER_STATE_COLOR_FALLBACK,
} from "../taskerRules";
import {
  getTaskerOpenTask,
  TASKER_STATE_CANCELLED,
  TASKER_STATE_COMPLETED,
} from "../../constants/taskerMock";
import type { GeocodeResult } from "../addressRules";
import type {
  TaskerActivity,
  TaskerAddress,
  TaskerAddressDraft,
  TaskerAttachment,
  TaskerComment,
  TaskerCommentAuthor,
  TaskerCommentDraft,
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
  // Del más viejo al más nuevo: Reportado → Asignada → Iniciada.
  const states = getStateActivities(task.activities).reverse();
  const durationMs = (a: TaskerActivity) =>
    (a.endDate ? ms(a.endDate) : MOCK_NOW) - ms(a.beginDate);
  const allDates = (t: typeof task) => [
    t.createdDate,
    ...t.activities.flatMap((a) => [a.beginDate, a.endDate]).filter((d): d is string => !!d),
    ...t.comments.map((c) => c.createdDate),
  ];
  /** "1h 35m 20s" → ms, para comparar los time fijos. */
  const parseElapsed = (value: string | null) =>
    (value ?? "").split(" ").reduce((total, part) => {
      const n = parseInt(part, 10);
      const unit = { d: DAY, h: HOUR, m: MIN, s: SEC }[part.slice(-1)] ?? NaN;
      return total + n * unit;
    }, 0);

  it("horas fijas de oficina sobre el día de now", () => {
    expect(task.createdDate).toBe(localIso(2026, 9, 7, 8, 15));
    expect(states.map((a) => [a.action, a.beginDate, a.endDate, a.time])).toEqual([
      ["Reportado", localIso(2026, 9, 7, 8, 15), localIso(2026, 9, 7, 9, 50, 20), "1h 35m 20s"],
      ["Asignada", localIso(2026, 9, 7, 9, 50, 20), localIso(2026, 9, 7, 10, 48, 35), "58m 15s"],
      ["Iniciada", localIso(2026, 9, 7, 10, 48, 35), null, "22m 10s"],
    ]);
    const assigned = task.activities.find((a) => a.type === "assignedUser");
    expect(assigned?.beginDate).toBe(localIso(2026, 9, 7, 9, 50, 20));
  });
  it("el ticket de ejemplo llega sin comentarios", () => {
    expect(task.comments).toEqual([]);
    expect(getTaskerOpenTask().task.comments).toEqual([]);
  });
  it("todas las fechas caen en el mismo día", () => {
    const days = new Set(allDates(task).map((d) => d.slice(0, 10)));
    expect([...days]).toEqual(["2026-10-07"]);
  });
  it("tiempos de mayor a menor: Reportado > Asignada > Iniciada", () => {
    const [reported, assigned, started] = states.map((a) =>
      parseElapsed(getActivityTime(a, task.stateId, MOCK_NOW)),
    );
    expect(reported).toBeGreaterThan(assigned);
    expect(assigned).toBeGreaterThan(started);
  });
  it("Iniciada muestra su time fijo aunque now avance", () => {
    const late = new Date(2026, 9, 7, 23, 59, 59).getTime();
    const started = getStateActivities(getTaskerOpenTask(late).task.activities)[0];
    expect(started.action).toBe("Iniciada");
    expect(getActivityTime(started, task.stateId, late)).toBe("22m 10s");
  });
  it("ningún estado dura 0", () => {
    for (const a of states) {
      expect(durationMs(a)).toBeGreaterThan(0);
      expect(getActivityTime(a, task.stateId, MOCK_NOW)).not.toBe("0s");
    }
  });
  it("cada estado empieza donde termina el anterior", () => {
    expect(states[0].beginDate).toBe(task.createdDate);
    for (let i = 1; i < states.length; i++) {
      expect(states[i].beginDate).toBe(states[i - 1].endDate);
    }
  });
  it("time de los cerrados coincide con sus fechas", () => {
    for (const a of states.filter((s) => s.endDate)) {
      expect(a.time).toBe(formatElapsed(ms(a.beginDate), ms(a.endDate)));
    }
  });
  it("con now a las 08:00 AM el día base es el anterior", () => {
    const early = new Date(2026, 9, 7, 8, 0).getTime();
    const t = getTaskerOpenTask(early).task;
    expect(new Set(allDates(t).map((d) => d.slice(0, 10)))).toEqual(new Set(["2026-10-06"]));
    expect(allDates(t).every((d) => ms(d) <= early)).toBe(true);
  });
  it("el corte es a las 11:30: 11:29:59 → día anterior, 11:30:00 → mismo día", () => {
    expect(getTaskerOpenTask(new Date(2026, 9, 7, 11, 29, 59).getTime()).task.createdDate).toBe(
      localIso(2026, 9, 6, 8, 15),
    );
    expect(getTaskerOpenTask(new Date(2026, 9, 7, 11, 30).getTime()).task.createdDate).toBe(
      localIso(2026, 9, 7, 8, 15),
    );
  });
  it("justo en el corte ninguna fecha queda en el futuro", () => {
    const cutoff = new Date(2026, 9, 7, 11, 30).getTime();
    expect(allDates(getTaskerOpenTask(cutoff).task).every((d) => ms(d) <= cutoff)).toBe(true);
  });
  it("antes del corte el primer día del mes cae en el último del mes anterior", () => {
    const t = getTaskerOpenTask(new Date(2026, 9, 1, 7, 0).getTime()).task;
    expect(t.createdDate).toBe(localIso(2026, 8, 30, 8, 15));
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
  /** Dos comentarios "del servidor" (sin id de autor ni isLocal), con fechas distintas. */
  const SERVER_COMMENTS: TaskerComment[] = [
    {
      id: 1,
      addUser: { name: "Jeremy Domínguez" },
      createdDate: localIso(2026, 9, 7, 10, 55),
      comment: "Contacto establecido con el supervisor en planta.",
      images: ["comentarios/4045/adjunto-1.jpg"],
    },
    {
      id: 2,
      addUser: { name: "Jeremy Móvil" },
      createdDate: localIso(2026, 9, 7, 9, 55),
      comment: "Se recibió el reporte. Técnico asignado para la visita.",
      images: [],
    },
  ];
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
    it("solo adjunto, texto vacío → true", () => {
      expect(canSubmitComment("", [file("a", PDF)])).toBe(true);
    });
    it("texto + adjuntos → true", () => {
      expect(canSubmitComment("hola", [file("a", PNG), file("b", PDF)])).toBe(true);
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
    it("marcado isLocal (lo deja editar y borrar sin id de autor)", () => {
      const c = buildLocalComment({ text: "x", attachments: [], task, now });
      expect(c.isLocal).toBe(true);
      expect(c.addUser.id).toBeUndefined();
    });
    it("queda más reciente que los del servidor al ordenar desc", () => {
      const local = buildLocalComment({ text: "x", attachments: [], task, now });
      const sorted = sortComments([...SERVER_COMMENTS, local], "desc");
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

  describe("validación del texto (1000 caracteres)", () => {
    it("el tope es 1000", () => {
      expect(TASKER_COMMENT_MAX_LENGTH).toBe(1000);
    });
    it("exactamente 1000 → válido; 1001 → no", () => {
      expect(isTaskerCommentTextValid("a".repeat(1000))).toBe(true);
      expect(isTaskerCommentTextValid("a".repeat(1001))).toBe(false);
    });
    it("cuenta el texto recortado: espacios de los bordes no suman", () => {
      expect(isTaskerCommentTextValid(`   ${"a".repeat(1000)}  \n`)).toBe(true);
    });
    it("vacío es válido para el tope (lo frena canSubmitComment)", () => {
      expect(isTaskerCommentTextValid("")).toBe(true);
    });
  });

  describe("canSaveTaskerComment", () => {
    it("sin texto ni adjuntos → false", () => {
      expect(canSaveTaskerComment({ text: "  ", attachments: [] })).toBe(false);
    });
    it("solo adjuntos → true", () => {
      expect(canSaveTaskerComment({ text: "", attachments: [file("a", PNG)] })).toBe(true);
    });
    it("texto de más de 1000 → false, aunque tenga adjuntos", () => {
      expect(
        canSaveTaskerComment({ text: "a".repeat(1001), attachments: [file("a", PNG)] }),
      ).toBe(false);
    });
  });

  describe("commentImagesToAttachments / taskerCommentDraftFrom", () => {
    const SERVER = "comentarios/4045/adjunto-1.jpg";
    it("conserva cada valor tal cual en dataUri, en orden", () => {
      const list = commentImagesToAttachments([PNG, PDF, SERVER]);
      expect(list.map((a) => a.dataUri)).toEqual([PNG, PDF, SERVER]);
    });
    it("mimeType sale del data-URI; ruta del servidor → vacío", () => {
      const list = commentImagesToAttachments([PNG, PDF, SERVER]);
      expect(list.map((a) => a.mimeType)).toEqual(["image/jpeg", "application/pdf", ""]);
    });
    it("ids únicos", () => {
      const list = commentImagesToAttachments([PNG, PNG]);
      expect(new Set(list.map((a) => a.id)).size).toBe(2);
    });
    it("borrador de un comentario nuevo: vacío", () => {
      expect(taskerCommentDraftFrom(null)).toEqual({ text: "", attachments: [] });
    });
    it("borrador al editar: texto y adjuntos que ya tenía", () => {
      const c: TaskerComment = {
        id: 3,
        addUser: { name: "Ana" },
        createdDate: localIso(2026, 9, 9, 10),
        comment: "hola",
        images: [PNG, SERVER],
      };
      const draft = taskerCommentDraftFrom(c);
      expect(draft.text).toBe("hola");
      expect(draft.attachments.map((a) => a.dataUri)).toEqual([PNG, SERVER]);
    });
  });

  describe("isTaskerCommentDraftChanged", () => {
    const base: TaskerCommentDraft = { text: "hola", attachments: [file("a", PNG)] };
    it("igual → false", () => {
      expect(isTaskerCommentDraftChanged(base, { ...base })).toBe(false);
    });
    it("cambia el texto → true", () => {
      expect(isTaskerCommentDraftChanged(base, { ...base, text: "hola!" })).toBe(true);
    });
    it("quita un adjunto → true", () => {
      expect(isTaskerCommentDraftChanged(base, { ...base, attachments: [] })).toBe(true);
    });
    it("cambia un adjunto por otro → true", () => {
      expect(isTaskerCommentDraftChanged(base, { ...base, attachments: [file("b", PDF)] })).toBe(
        true,
      );
    });
  });

  describe("resolveCommentComposer (reinicio tras enviar el reporte)", () => {
    const add = { mode: "add" } as const;
    const edit2 = { mode: "edit", id: 2 } as const;

    it("sin reinicio → el formulario abierto tal cual", () => {
      expect(resolveCommentComposer(add, [1, 2])).toBe(add);
      expect(resolveCommentComposer(edit2, [1, 2], { key: 3, seenKey: 3 })).toBe(edit2);
      expect(resolveCommentComposer(null, [1])).toBeNull();
    });
    it("resetKey nuevo → cerrado, esté agregando o editando (sin preguntar)", () => {
      expect(resolveCommentComposer(add, [1, 2], { key: 1, seenKey: 0 })).toBeNull();
      expect(resolveCommentComposer(edit2, [1, 2], { key: 1, seenKey: 0 })).toBeNull();
    });
    it("editando un comentario que ya no existe → cerrado", () => {
      expect(resolveCommentComposer(edit2, [1, 3])).toBeNull();
      expect(resolveCommentComposer(edit2, [])).toBeNull();
    });
    it("agregar no depende de la lista (vacía tras enviar sigue abierto si no hubo reinicio)", () => {
      expect(resolveCommentComposer(add, [])).toBe(add);
    });
    it("tras cerrarse, abrir de nuevo no pide confirmación", () => {
      const closed = resolveCommentComposer(add, [], { key: 1, seenKey: 0 });
      expect(getCommentComposerTransition(closed, add, true)).toBe("apply");
    });
  });

  describe("getCommentComposerTransition (formulario abierto en la tarjeta)", () => {
    const add = { mode: "add" } as const;
    const edit = (id: number) => ({ mode: "edit", id }) as const;

    it("ninguno abierto → se abre sin preguntar", () => {
      expect(getCommentComposerTransition(null, add, false)).toBe("apply");
      expect(getCommentComposerTransition(null, edit(1), false)).toBe("apply");
    });
    it("abierto sin cambios → se cambia o se cierra sin preguntar", () => {
      expect(getCommentComposerTransition(add, null, false)).toBe("apply");
      expect(getCommentComposerTransition(add, edit(1), false)).toBe("apply");
      expect(getCommentComposerTransition(edit(1), edit(2), false)).toBe("apply");
    });
    it("abierto con cambios → pide confirmar (Ocultar, Cancelar u otro formulario)", () => {
      expect(getCommentComposerTransition(add, null, true)).toBe("confirm");
      expect(getCommentComposerTransition(edit(1), null, true)).toBe("confirm");
      expect(getCommentComposerTransition(add, edit(1), true)).toBe("confirm");
      expect(getCommentComposerTransition(edit(1), add, true)).toBe("confirm");
      expect(getCommentComposerTransition(edit(1), edit(2), true)).toBe("confirm");
    });
    it("el mismo formulario → nada, aunque tenga cambios", () => {
      expect(getCommentComposerTransition(add, add, true)).toBe("none");
      expect(getCommentComposerTransition(edit(3), edit(3), true)).toBe("none");
      expect(getCommentComposerTransition(null, null, false)).toBe("none");
    });
  });

  describe("lista de comentarios", () => {
    const now = new Date(2026, 9, 9, 14, 5, 7);
    const me: TaskerCommentAuthor = { id: 7, name: "Ana Pérez" };
    const draft = (text: string, attachments: TaskerAttachment[] = []): TaskerCommentDraft => ({
      text,
      attachments,
    });
    const existing = (id: number, over: Partial<TaskerComment> = {}): TaskerComment => ({
      id,
      addUser: { name: "Otro" },
      createdDate: localIso(2026, 9, 6, 10),
      comment: `c${id}`,
      images: [],
      ...over,
    });

    describe("addTaskerComment", () => {
      it("lista vacía → id 1 (E1)", () => {
        const list = addTaskerComment([], draft("hola"), me, now);
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe(1);
      });
      it("id = el mayor + 1, aunque haya huecos (E1)", () => {
        const list = addTaskerComment([existing(2), existing(9), existing(4)], draft("x"), me, now);
        expect(list[3].id).toBe(10);
      });
      it("ids negativos (locales de Seguimiento) no bajan del 1", () => {
        const list = addTaskerComment([existing(-500)], draft("x"), me, now);
        expect(list[1].id).toBe(1);
      });
      it("autor = usuario en sesión, fecha de ese momento, isLocal", () => {
        const [c] = addTaskerComment([], draft("hola"), me, now);
        expect(c.addUser).toEqual({ id: 7, name: "Ana Pérez" });
        expect(c.addUser).not.toBe(me);
        expect(c.createdDate).toBe(localIso(2026, 9, 9, 14, 5, 7));
        expect(c.isLocal).toBe(true);
      });
      it("texto recortado e images = dataUri de los adjuntos, en orden", () => {
        const [c] = addTaskerComment([], draft("  hola \n", [file("a", PNG), file("b", PDF)]), me, now);
        expect(c.comment).toBe("hola");
        expect(c.images).toEqual([PNG, PDF]);
      });
      it("entra al final y no muta la lista recibida", () => {
        const prev = [existing(1)];
        const next = addTaskerComment(prev, draft("x"), me, now);
        expect(next[0]).toBe(prev[0]);
        expect(prev).toHaveLength(1);
      });
      it("borrador vacío o de más de 1000 → lista igual", () => {
        const prev = [existing(1)];
        expect(addTaskerComment(prev, draft("   "), me, now)).toBe(prev);
        expect(addTaskerComment(prev, draft("a".repeat(1001)), me, now)).toBe(prev);
      });
    });

    describe("updateTaskerComment", () => {
      const original = existing(2, {
        addUser: { id: 7, name: "Ana Pérez" },
        images: ["comentarios/1/a.jpg"],
        isLocal: true,
      });
      const list = [existing(1), original, existing(3)];

      it("cambia texto y adjuntos", () => {
        const next = updateTaskerComment(list, 2, draft(" nuevo ", [file("b", PDF)]));
        expect(next[1].comment).toBe("nuevo");
        expect(next[1].images).toEqual([PDF]);
      });
      it("no cambia autor, fecha de creación, id ni isLocal", () => {
        const next = updateTaskerComment(list, 2, draft("nuevo"));
        expect(next[1].id).toBe(2);
        expect(next[1].addUser).toEqual(original.addUser);
        expect(next[1].createdDate).toBe(original.createdDate);
        expect(next[1].isLocal).toBe(true);
      });
      it("conserva los adjuntos que ya tenía si siguen en el borrador", () => {
        const kept = taskerCommentDraftFrom(original);
        const next = updateTaskerComment(list, 2, { ...kept, text: "otro" });
        expect(next[1].images).toEqual(["comentarios/1/a.jpg"]);
      });
      it("los demás quedan iguales y en su lugar", () => {
        const next = updateTaskerComment(list, 2, draft("nuevo"));
        expect(next[0]).toBe(list[0]);
        expect(next[2]).toBe(list[2]);
      });
      it("id inexistente → lista igual", () => {
        expect(updateTaskerComment(list, 99, draft("nuevo"))).toBe(list);
      });
      it("lista vacía → lista vacía", () => {
        expect(updateTaskerComment([], 1, draft("nuevo"))).toEqual([]);
      });
      it("borrador que no se puede guardar → lista igual", () => {
        expect(updateTaskerComment(list, 2, draft(""))).toBe(list);
        expect(updateTaskerComment(list, 2, draft("a".repeat(1001)))).toBe(list);
      });
    });

    describe("removeTaskerComment", () => {
      const list = [existing(1), existing(2), existing(3)];
      it("quita por id", () => {
        expect(removeTaskerComment(list, 2).map((c) => c.id)).toEqual([1, 3]);
      });
      it("id inexistente → mismos comentarios", () => {
        expect(removeTaskerComment(list, 99)).toEqual(list);
      });
      it("lista vacía → vacía", () => {
        expect(removeTaskerComment([], 1)).toEqual([]);
      });
      it("no muta la lista recibida", () => {
        removeTaskerComment(list, 1);
        expect(list).toHaveLength(3);
      });
    });

    describe("tope de adjuntos sumando todos los comentarios (archivos reales)", () => {
      /** data-URI de un archivo de exactamente `bytes` bytes. */
      const fileOf = (bytes: number, mime = "image/jpeg") =>
        `data:${mime};base64,${btoa("x".repeat(bytes))}`;
      const withImages = (id: number, ...images: string[]) => existing(id, { images });
      const list = [
        withImages(1, fileOf(40)),
        withImages(2, fileOf(30), fileOf(20, "application/pdf")),
        withImages(3),
      ];
      const attachment = (name: string, bytes: number) => ({
        id: name,
        name,
        mimeType: "image/jpeg",
        dataUri: fileOf(bytes),
      });

      it("el tope de Reportar es 7 MB", () => {
        expect(TASKER_REPORT_ATTACHMENTS_MAX_BYTES).toBe(7 * 1024 * 1024);
      });
      it("getDataUriFileBytes: bytes del archivo decodificado, sin encabezado ni relleno", () => {
        for (const bytes of [0, 1, 2, 3, 4, 5, 1000, 1001]) {
          expect(getDataUriFileBytes(fileOf(bytes))).toBe(bytes);
        }
        expect(getDataUriFileBytes("data:text/plain,hola")).toBe(4);
      });
      it("suma los archivos reales de todos los comentarios (no el largo del base64)", () => {
        expect(getTaskerCommentsAttachmentBytes(list)).toBe(90);
      });
      it("excludeId deja fuera el comentario que se edita", () => {
        expect(getTaskerCommentsAttachmentBytes(list, 2)).toBe(40);
        expect(getTaskerCommentsAttachmentBytes(list, 99)).toBe(90);
      });
      it("lista vacía → 0", () => {
        expect(getTaskerCommentsAttachmentBytes([])).toBe(0);
      });
      it("fitTaskerAttachments: entran en orden los que caben; justo en el tope entra", () => {
        const result = fitTaskerAttachments(
          [attachment("a.jpg", 30), attachment("b.pdf", 50), attachment("c.jpg", 10)],
          60,
          100,
        );
        expect(result.accepted.map((a) => a.name)).toEqual(["a.jpg", "c.jpg"]);
        expect(result.rejected).toHaveLength(1);
        expect(result.rejected[0]).toMatch(/^b\.pdf \(supera el límite total de /);
      });
      it("fitTaskerAttachments: el texto del rechazo lleva el tope en MB", () => {
        const max = TASKER_REPORT_ATTACHMENTS_MAX_BYTES;
        const used = getTaskerCommentsAttachmentBytes(list);
        const result = fitTaskerAttachments([attachment("foto.jpg", max - used + 1)], used, max);
        expect(result.accepted).toEqual([]);
        expect(result.rejected).toEqual(["foto.jpg (supera el límite total de 7MB)"]);
        expect(fitTaskerAttachments([attachment("ok.jpg", max - used)], used, max).accepted).toHaveLength(1);
      });
      it("7 MB de archivos caben en el cuerpo de 9.5 MB", () => {
        const base64Chars = Math.ceil(TASKER_REPORT_ATTACHMENTS_MAX_BYTES / 3) * 4;
        expect(base64Chars).toBeLessThan(9.5 * 1024 * 1024);
      });
    });

    describe("canEditTaskerComment", () => {
      it("con id de autor: el mismo usuario → true", () => {
        expect(canEditTaskerComment(existing(1, { addUser: { id: 7, name: "Ana" } }), me)).toBe(
          true,
        );
      });
      it("con id de autor: autor ajeno → false, aunque sea local", () => {
        const c = existing(1, { addUser: { id: 8, name: "Ana Pérez" }, isLocal: true });
        expect(canEditTaskerComment(c, me)).toBe(false);
      });
      it("con id de autor pero sin usuario en sesión → false", () => {
        expect(canEditTaskerComment(existing(1, { addUser: { id: 7, name: "Ana" } }), null)).toBe(
          false,
        );
        expect(
          canEditTaskerComment(existing(1, { addUser: { id: 7, name: "Ana" } }), { name: "Ana" }),
        ).toBe(false);
      });
      it("sin id de autor: solo los creados en local", () => {
        expect(canEditTaskerComment(existing(1, { isLocal: true }), me)).toBe(true);
        expect(canEditTaskerComment(existing(1), me)).toBe(false);
      });
      it("sin id de autor: el mismo nombre no alcanza", () => {
        expect(canEditTaskerComment(existing(1, { addUser: { name: "Ana Pérez" } }), me)).toBe(
          false,
        );
      });
      it("los del servidor son de solo lectura", () => {
        expect(SERVER_COMMENTS.every((c) => !canEditTaskerComment(c, me))).toBe(true);
      });
      it("los de buildLocalComment (Seguimiento) y addTaskerComment (Reportar) se editan", () => {
        const task = { addUser: { id: 21, name: "Jeremy Domínguez" } };
        const local = buildLocalComment({ text: "x", attachments: [], task, now });
        const [reported] = addTaskerComment([], draft("x"), me, now);
        expect(canEditTaskerComment(local, me)).toBe(true);
        expect(canEditTaskerComment(reported, me)).toBe(true);
      });
    });
  });

  describe("comentarios del servidor (datos de prueba)", () => {
    it("dos con fechas distintas: el orden se nota", () => {
      expect(SERVER_COMMENTS).toHaveLength(2);
      expect(sortComments(SERVER_COMMENTS, "desc").map((c) => c.id)).toEqual([1, 2]);
      expect(sortComments(SERVER_COMMENTS, "asc").map((c) => c.id)).toEqual([2, 1]);
    });
  });
});

describe("getTaskerAddressLines", () => {
  it("completa: título, calle con #número y sector, ciudad, provincia", () => {
    expect(
      getTaskerAddressLines(
        emptyAddress({
          title: "El Millón",
          street: "Calle Luis F. Thomén",
          streetNumber: "412",
          sector: "Sector El Millón",
          city: "Santo Domingo de Guzmán",
          province: "D.N.",
        }),
      ),
    ).toEqual({
      title: "El Millón",
      streetLine: "Calle Luis F. Thomén #412",
      areaLine: "Sector El Millón, Santo Domingo de Guzmán, D.N.",
    });
  });
  it("con vacíos: se saltan sin dejar comas sueltas", () => {
    expect(getTaskerAddressLines(emptyAddress({ title: "Casa", city: "Santiago" }))).toEqual({
      title: "Casa",
      streetLine: "",
      areaLine: "Santiago",
    });
    expect(
      getTaskerAddressLines(emptyAddress({ sector: "Gazcue", province: "D.N." })).areaLine,
    ).toBe("Gazcue, D.N.");
    expect(getTaskerAddressLines(emptyAddress())).toEqual({
      title: "",
      streetLine: "",
      areaLine: "",
    });
  });
  it("sin número: solo la calle, sin #", () => {
    expect(getTaskerAddressLines(emptyAddress({ street: "Av. Las Marías" })).streetLine).toBe(
      "Av. Las Marías",
    );
  });
  it("sin calle: solo #número", () => {
    expect(getTaskerAddressLines(emptyAddress({ streetNumber: "104" })).streetLine).toBe("#104");
  });
  it("con la dirección de ejemplo de Seguimiento", () => {
    expect(getTaskerAddressLines(getTaskerOpenTask(MOCK_NOW).task.address!)).toEqual({
      title: "Clínica Las Marías",
      streetLine: "Av. Las Marías #104",
      areaLine: "Sector Norte, Santo Domingo, Distrito Nacional",
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

// ─── Direcciones de Reportar Avería ──────────────────────────────────────────

function draft(over: Partial<TaskerAddressDraft> = {}): TaskerAddressDraft {
  return { ...emptyTaskerAddressDraft(), ...over };
}

function listAddress(
  over: Partial<TaskerReportAddress> & { id: number; order: number },
): TaskerReportAddress {
  return { ...emptyAddress(), selected: false, locked: false, fromClient: false, ...over };
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
    it("lista vacía: id 1, order 1, marcada y desbloqueada", () => {
      const result = addTaskerAddress([], emptyAddress({ title: "Nueva" }));
      expect(result).toEqual([
        {
          ...emptyAddress({ title: "Nueva" }),
          id: 1,
          order: 1,
          selected: true,
          locked: false,
          fromClient: false,
        },
      ]);
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
