/// <reference types="jest" />
import axios from "axios";
import {
  addTaskerTaskComment,
  buildTaskrCommentBody,
  fetchTaskerTask,
  fetchTaskerTasks,
  mapTaskrTaskDetail,
  mapTaskrTasks,
  readTaskrMessage,
  serializeTaskrCommentBody,
  taskrFailure,
  TASKER_ATTACHMENTS_TOO_LARGE_ERROR,
  TASKER_COMMENT_SEND_ERROR,
  TASKER_NETWORK_ERROR,
  TASKER_TASK_ERROR,
  TASKER_TASKS_ERROR,
  TASKR_TASK_MAX_BYTES,
  TASKR_TASKS_PARAMS,
  utf8ByteLength,
} from "../taskerApi";
import {
  buildTaskrFileUrl,
  canCommentOnTask,
  createExclusiveRunner,
  getActivityActorName,
  getClosedTaskNotice,
  getCommentDiscardedNotice,
  getStateActivityTitle,
  getTaskerClientName,
  getTaskerCommentAuthorName,
  getTaskerStateLabel,
  getTicketGoneNotice,
  isTaskInList,
  isTaskrTaskGoneMessage,
  parseFollowUpTicketParam,
  resolveRequestedTicket,
  SEGUIMIENTO_REFRESH_MS,
  shouldDiscardOpenComment,
  TASKER_NO_CLIENT_LABEL,
  TASKER_SYSTEM_ACTOR,
  TASKER_UNKNOWN_AUTHOR,
  TASKR_TASK_GONE_MESSAGE,
} from "../taskerFollowUpRules";
import { getActivityTime, getStateActivities, sortComments } from "../taskerRules";
import type {
  TaskerAttachment,
  TaskerComment,
  TaskerCommentDraft,
} from "../../../types/typesTasker/TaskerTypes";

jest.mock("axios");

const mockedGet = axios.get as unknown as jest.Mock;
const mockedPatch = axios.patch as unknown as jest.Mock;

const URL = "https://api.colegio.test";
const TOKEN = "school.jwt.token";
const AUTH = { token: TOKEN, urlColegio: URL };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore?.();
});

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Formato sin zona de Tasker, en hora local. */
function localIso(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string {
  return `${y}-${pad2(mo + 1)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}:${pad2(s)}`;
}

// ─── Datos de prueba con la forma de FaceClass ──────────────────────────────

const LIST_ITEM = {
  id: 4045,
  createdDate: "2026-10-20T08:15:00",
  stateId: 3,
  state: { id: 3, name: "Iniciada", color: "#D97706" },
  client: { id: 301, name: "Clínica Las Marías", phone: "8095550100" },
  assignedUser: { id: 22, name: "Jeremy Móvil" },
  priority: { id: 2, name: "Alta", color: "#DC2626" },
  addUserId: 21,
};

const ADDRESS = {
  id: 9,
  title: "Clínica Las Marías",
  province: "Distrito Nacional",
  city: "Santo Domingo",
  sector: "Sector Norte",
  street: "Av. Las Marías",
  streetNumber: "104",
  latitude: 18.4571092,
  longitude: "-69.9524086",
};

const DETAIL = {
  ...LIST_ITEM,
  action: "No enfría la sala de recuperación.",
  externalUserName: "María Recepción",
  address: ADDRESS,
  taskList: [
    { id: 3, action: "Termostato", order: 2 },
    { id: 1, action: "Compresor", order: 1 },
    { id: 2, action: "", order: 0 },
  ],
  comments: [
    {
      id: 12,
      createdDate: "2026-10-20T10:00:00",
      comment: "Voy en camino",
      images: [],
      addUser: { id: 22, name: "Jeremy Móvil" },
    },
    {
      id: 10,
      createdDate: "2026-10-20T08:16:00",
      comment: "",
      images: ["uploads/tasks/4045/foto.jpg", "https://cdn.test/otra.png"],
      addUser: { id: 21, name: "Master" },
    },
    {
      id: 11,
      createdDate: "2026-10-20T09:00:00",
      comment: "Sin autor",
      images: [],
      addUser: null,
    },
  ],
  activities: [
    {
      id: 1,
      type: "state",
      action: "Pendiente",
      message: "",
      beginDate: "2026-10-20T08:15:00",
      endDate: "2026-10-20T09:50:20",
      user: { id: 21, name: "Master" },
      time: "1h 35m 20s",
    },
    {
      id: 4,
      type: "assignedUser",
      action: "Responsable",
      message: "Jeremy Móvil",
      beginDate: "2026-10-20T09:50:20",
      endDate: null,
      user: { id: 21, name: "Master" },
      time: null,
    },
    {
      id: 3,
      type: "state",
      action: "Iniciada",
      message: "",
      beginDate: "2026-10-20T10:48:35",
      endDate: null,
      user: null,
      time: null,
      coordinates: { latitude: 18.45, longitude: -69.95 },
    },
    {
      id: 2,
      type: "state",
      action: "Asignada",
      message: "a Jeremy Móvil",
      beginDate: "2026-10-20T09:50:20",
      endDate: "2026-10-20T10:48:35",
      user: { id: 30, name: "Oficina Central" },
      time: "58m 15s",
    },
  ],
};

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const PDF = "data:application/pdf;base64,JVBERi0=";
const file = (id: string, dataUri: string): TaskerAttachment => ({
  id,
  name: id,
  mimeType: /^data:([^;,]+)/.exec(dataUri)?.[1] ?? "",
  dataUri,
});
const draft = (text: string, attachments: TaskerAttachment[] = []): TaskerCommentDraft => ({
  text,
  attachments,
});

// ─── Lista ──────────────────────────────────────────────────────────────────

describe("mapTaskrTasks", () => {
  it("mapea la tarjeta: id, fecha, estado, cliente, responsable y prioridad", () => {
    const { tasks, count } = mapTaskrTasks({ items: [LIST_ITEM], count: 1 });
    expect(count).toBe(1);
    expect(tasks).toEqual([
      {
        id: 4045,
        createdDate: "2026-10-20T08:15:00",
        stateId: 3,
        state: { id: 3, name: "Iniciada", color: "#D97706" },
        client: { id: 301, name: "Clínica Las Marías", phone: "8095550100" },
        assignedUser: { id: 22, name: "Jeremy Móvil" },
        priority: { id: 2, name: "Alta", color: "#DC2626" },
      },
    ]);
  });
  it("sin cliente, sin responsable y sin prioridad → null", () => {
    const [task] = mapTaskrTasks({
      items: [{ ...LIST_ITEM, client: null, assignedUser: null, priority: undefined }],
    }).tasks;
    expect(task.client).toBeNull();
    expect(task.assignedUser).toBeNull();
    expect(task.priority).toBeNull();
    expect(getTaskerClientName(task.client)).toBe(TASKER_NO_CLIENT_LABEL);
  });
  it("respeta el orden del servidor y omite los que no tienen id numérico", () => {
    const { tasks } = mapTaskrTasks({
      items: [{ ...LIST_ITEM, id: 2 }, { id: "x" }, null, { ...LIST_ITEM, id: 1 }],
    });
    expect(tasks.map((t) => t.id)).toEqual([2, 1]);
  });
  it("sin count → la cantidad mapeada; data rara → lista vacía", () => {
    expect(mapTaskrTasks({ items: [LIST_ITEM] }).count).toBe(1);
    expect(mapTaskrTasks(null)).toEqual({ tasks: [], count: 0 });
    expect(mapTaskrTasks({ items: "x" })).toEqual({ tasks: [], count: 0 });
  });
  it("sin stateId usa state.id; sin state → nombre y color vacíos", () => {
    const [a, b] = mapTaskrTasks({
      items: [
        { ...LIST_ITEM, stateId: undefined, state: { id: 5, name: "Completada" } },
        { ...LIST_ITEM, state: null },
      ],
    }).tasks;
    expect(a.stateId).toBe(5);
    expect(a.state).toEqual({ id: 5, name: "Completada", color: "" });
    expect(b.state).toEqual({ id: 3, name: "", color: "" });
  });
});

// ─── Detalle ────────────────────────────────────────────────────────────────

describe("mapTaskrTaskDetail", () => {
  const task = mapTaskrTaskDetail(DETAIL, URL)!;

  it("campos del ticket", () => {
    expect(task.id).toBe(4045);
    expect(task.action).toBe("No enfría la sala de recuperación.");
    expect(task.externalUserName).toBe("María Recepción");
    expect(task.addUserId).toBe(21);
    expect(task.state.name).toBe("Iniciada");
    expect(task.client?.name).toBe("Clínica Las Marías");
    expect(task.assignedUser?.name).toBe("Jeremy Móvil");
  });
  it("averías: textos de taskList ordenados por order, sin vacíos", () => {
    expect(task.faults).toEqual(["Compresor", "Termostato"]);
  });
  it("averías: sin order van al final en su orden; acepta text o name", () => {
    const t = mapTaskrTaskDetail({
      ...DETAIL,
      taskList: [{ name: "B" }, { text: "A", order: 1 }, { name: "C" }],
    }, URL)!;
    expect(t.faults).toEqual(["A", "B", "C"]);
  });
  it("dirección: lat/lng numéricos (texto numérico se convierte)", () => {
    expect(task.address).toMatchObject({
      title: "Clínica Las Marías",
      street: "Av. Las Marías",
      latitude: 18.4571092,
      longitude: -69.9524086,
    });
    expect(task.address).not.toHaveProperty("id");
  });
  it("sin dirección (null, vacía o no objeto) → null", () => {
    for (const address of [null, undefined, {}, { title: "  " }, "x"]) {
      expect(mapTaskrTaskDetail({ ...DETAIL, address }, URL)!.address).toBeNull();
    }
  });
  it("coordenadas inválidas → lat/lng null (sin botón de mapa)", () => {
    const t = mapTaskrTaskDetail({
      ...DETAIL,
      address: { ...ADDRESS, latitude: "abc", longitude: null },
    }, URL)!;
    expect(t.address?.latitude).toBeNull();
    expect(t.address?.longitude).toBeNull();
  });
  it("sin cliente, sin responsable, sin prioridad, sin listas", () => {
    const t = mapTaskrTaskDetail({
      id: 7,
      stateId: 1,
      client: null,
      assignedUser: null,
      priority: null,
    }, URL)!;
    expect(t.client).toBeNull();
    expect(t.assignedUser).toBeNull();
    expect(t.priority).toBeNull();
    expect(t.address).toBeNull();
    expect(t.faults).toEqual([]);
    expect(t.comments).toEqual([]);
    expect(t.activities).toEqual([]);
    expect(t.externalUserName).toBe("");
    expect(t.addUserId).toBeNull();
  });
  it("sin id numérico → null", () => {
    expect(mapTaskrTaskDetail({ ...DETAIL, id: "4045" }, URL)).toBeNull();
    expect(mapTaskrTaskDetail(null, URL)).toBeNull();
  });
  it("actividades: user con id y nombre, o null; coordenadas válidas o null", () => {
    const started = task.activities.find((a) => a.id === 3)!;
    expect(started.user).toBeNull();
    expect(task.activities.find((a) => a.id === 2)!.user).toEqual({ id: 30, name: "Oficina Central" });
    expect(started.coordinates).toEqual({ latitude: 18.45, longitude: -69.95 });
    expect(task.activities.find((a) => a.id === 1)!.coordinates).toBeNull();
  });
});

describe("comentarios del detalle", () => {
  const task = mapTaskrTaskDetail(DETAIL, URL)!;

  it("ordenados por id", () => {
    expect(task.comments.map((c) => c.id)).toEqual([10, 11, 12]);
  });
  it("autor: misma cuenta que creó la tarea → externalUserName; otro → su nombre; null → externalUserName", () => {
    const byId = Object.fromEntries(task.comments.map((c) => [c.id, c.addUser.name]));
    expect(byId[10]).toBe("María Recepción");
    expect(byId[12]).toBe("Jeremy Móvil");
    expect(byId[11]).toBe("María Recepción");
  });
  it("imágenes: relativa → urlColegio/taskr/downloads/ruta; absoluta → tal cual", () => {
    expect(task.comments[0].images).toEqual([
      `${URL}/taskr/downloads/uploads/tasks/4045/foto.jpg`,
      "https://cdn.test/otra.png",
    ]);
  });
  it("en pantalla: createdDate ordena y el id desempata", () => {
    const same = "2026-10-20T10:00:00";
    const list: TaskerComment[] = [
      { id: 3, addUser: { name: "A" }, createdDate: same, comment: "", images: [] },
      { id: 1, addUser: { name: "A" }, createdDate: same, comment: "", images: [] },
      { id: 2, addUser: { name: "A" }, createdDate: "2026-10-20T09:00:00", comment: "", images: [] },
    ];
    expect(sortComments(list, "asc").map((c) => c.id)).toEqual([2, 1, 3]);
    expect(sortComments(list, "desc").map((c) => c.id)).toEqual([3, 1, 2]);
  });
});

describe("historial del detalle (Acciones)", () => {
  const task = mapTaskrTaskDetail(DETAIL, URL)!;
  const states = getStateActivities(task.activities);

  it("solo type 'state', más reciente arriba (beginDate desc)", () => {
    expect(states.map((a) => a.action)).toEqual(["Iniciada", "Asignada", "Pendiente"]);
  });
  it("'Pendiente' se muestra como 'Reportado'; los demás igual", () => {
    expect(states.map((a) => getStateActivityTitle(a).state)).toEqual([
      "Iniciada",
      "Asignada",
      "Reportado",
    ]);
  });
  it("activities.message va junto al estado cuando viene", () => {
    expect(states.map(getStateActivityTitle)).toEqual([
      { state: "Iniciada", message: "" },
      { state: "Asignada", message: "a Jeremy Móvil" },
      { state: "Reportado", message: "" },
    ]);
    expect(
      getStateActivityTitle({ action: "Asignada", message: "  a Usuario Representante 1 " }),
    ).toEqual({ state: "Asignada", message: "a Usuario Representante 1" });
  });
  it("time si viene; en curso (endDate null) se calcula en vivo desde beginDate", () => {
    const at = (h: number, mi: number, s: number) =>
      new Date(localIso(2026, 9, 20, h, mi, s)).getTime();
    expect(getActivityTime(states[1], task.stateId, at(12, 0, 0))).toBe("58m 15s");
    expect(getActivityTime(states[0], task.stateId, at(11, 10, 45))).toBe("22m 10s");
    expect(getActivityTime(states[0], task.stateId, at(11, 10, 46))).toBe("22m 11s");
  });
});

// ─── Reglas ─────────────────────────────────────────────────────────────────

describe("getActivityActorName (historial: nunca la cuenta del puente)", () => {
  const owner = { addUserId: 21, externalUserName: "María Recepción" };
  const bridge = { id: 21, name: "Master" };

  it("cuenta del puente en el reporte → el empleado que reportó", () => {
    expect(getActivityActorName({ action: "Pendiente", user: bridge }, owner)).toBe("María Recepción");
    expect(getActivityActorName({ action: "Reportado", user: bridge }, owner)).toBe("María Recepción");
  });
  it("user null en el reporte → el empleado que reportó", () => {
    expect(getActivityActorName({ action: "Pendiente", user: null }, owner)).toBe("María Recepción");
  });
  it("cuenta del puente o user null en otra acción (asignación automática) → 'Sistema'", () => {
    expect(getActivityActorName({ action: "Asignada", user: bridge }, owner)).toBe(TASKER_SYSTEM_ACTOR);
    expect(getActivityActorName({ action: "Iniciada", user: null }, owner)).toBe("Sistema");
  });
  it("otro usuario (técnico u oficina) → su nombre, también en el reporte", () => {
    const tech = { id: 22, name: "Jeremy Móvil" };
    expect(getActivityActorName({ action: "Iniciada", user: tech }, owner)).toBe("Jeremy Móvil");
    expect(getActivityActorName({ action: "Pendiente", user: tech }, owner)).toBe("Jeremy Móvil");
  });
  it("user sin id no se toma como la cuenta del puente; sin nombre → '—'", () => {
    expect(getActivityActorName({ action: "Asignada", user: { id: null, name: "Ana" } }, owner)).toBe("Ana");
    expect(getActivityActorName({ action: "Asignada", user: { id: 9, name: " " } }, owner)).toBe("—");
  });
  it("reporte del puente sin externalUserName → 'Sin nombre' (nunca 'Master')", () => {
    expect(
      getActivityActorName({ action: "Pendiente", user: bridge }, { ...owner, externalUserName: "" }),
    ).toBe("Sin nombre");
  });
  it("en el detalle mapeado ningún 'Por:' ni autor de comentario es la cuenta del puente", () => {
    const task = mapTaskrTaskDetail(DETAIL, URL)!;
    const actors = getStateActivities(task.activities).map((a) => getActivityActorName(a, task));
    expect(actors).toEqual(["Sistema", "Oficina Central", "María Recepción"]);
    expect(actors).not.toContain("Master");
    expect(task.comments.map((c) => c.addUser.name)).not.toContain("Master");
  });
});

describe("getTaskerCommentAuthorName", () => {
  const owner = { addUserId: 21, externalUserName: "María Recepción" };

  it("misma cuenta que creó la tarea → externalUserName", () => {
    expect(getTaskerCommentAuthorName({ id: 21, name: "Cuenta App" }, owner)).toBe(
      "María Recepción",
    );
  });
  it("otro usuario → su nombre", () => {
    expect(getTaskerCommentAuthorName({ id: 22, name: "Jeremy Móvil" }, owner)).toBe(
      "Jeremy Móvil",
    );
  });
  it("addUser null → externalUserName", () => {
    expect(getTaskerCommentAuthorName(null, owner)).toBe("María Recepción");
  });
  it("sin id del autor no se toma como la misma cuenta", () => {
    expect(getTaskerCommentAuthorName({ id: null, name: "Ana" }, owner)).toBe("Ana");
  });
  it("tarea sin addUserId: nunca es la misma cuenta", () => {
    expect(
      getTaskerCommentAuthorName({ id: 21, name: "Ana" }, { ...owner, addUserId: null }),
    ).toBe("Ana");
  });
  it("sin nombre en ningún lado → 'Sin nombre'", () => {
    expect(getTaskerCommentAuthorName({ id: 9, name: " " }, owner)).toBe("María Recepción");
    expect(getTaskerCommentAuthorName(null, { addUserId: 21, externalUserName: "" })).toBe(
      TASKER_UNKNOWN_AUTHOR,
    );
  });
});

describe("canCommentOnTask", () => {
  it.each([1, 2, 3, 4, 7, 8])("estado %i → se puede comentar", (stateId) => {
    expect(canCommentOnTask(stateId)).toBe(true);
  });
  it.each([5, 6])("estado %i (Completada / Cancelada) → no", (stateId) => {
    expect(canCommentOnTask(stateId)).toBe(false);
  });
});

describe("shouldDiscardOpenComment", () => {
  it("solo al pasar de abierto a cerrado", () => {
    expect(shouldDiscardOpenComment(3, 5)).toBe(true);
    expect(shouldDiscardOpenComment(4, 6)).toBe(true);
    expect(shouldDiscardOpenComment(3, 4)).toBe(false);
    expect(shouldDiscardOpenComment(5, 5)).toBe(false);
    expect(shouldDiscardOpenComment(5, 3)).toBe(false);
  });
});

describe("textos de Seguimiento", () => {
  it("ticket cerrado, en masculino", () => {
    expect(getClosedTaskNotice(5)).toBe("Ticket completado: ya no admite comentarios.");
    expect(getClosedTaskNotice(6)).toBe("Ticket cancelado: ya no admite comentarios.");
  });
  it("comentario descartado al cerrarse, en masculino", () => {
    expect(getCommentDiscardedNotice(5)).toBe(
      "El ticket fue completado; tu comentario no se envió.",
    );
    expect(getCommentDiscardedNotice(6)).toBe(
      "El ticket fue cancelado; tu comentario no se envió.",
    );
  });
  it("ticket no disponible", () => {
    expect(getTicketGoneNotice(4045)).toBe("El ticket #4045 ya no está disponible.");
  });
  it("cliente: nombre o 'Sin cliente'", () => {
    expect(getTaskerClientName({ name: "Clínica" })).toBe("Clínica");
    expect(getTaskerClientName({ name: "  " })).toBe("Sin cliente");
    expect(getTaskerClientName(null)).toBe("Sin cliente");
  });
  it("isTaskInList", () => {
    expect(isTaskInList([{ id: 1 }, { id: 2 }], 2)).toBe(true);
    expect(isTaskInList([{ id: 1 }], 2)).toBe(false);
  });
  it("recarga automática cada 30 s", () => {
    expect(SEGUIMIENTO_REFRESH_MS).toBe(30000);
  });
});

describe("getTaskerStateLabel", () => {
  it("stateId 1 → 'Reportado', aunque el nombre sea otro", () => {
    expect(getTaskerStateLabel({ id: 1, name: "Pendiente" })).toBe("Reportado");
    expect(getTaskerStateLabel({ id: 1, name: "" })).toBe("Reportado");
  });
  it("sin id (actividades): 'Pendiente' → 'Reportado'", () => {
    expect(getTaskerStateLabel({ name: "Pendiente" })).toBe("Reportado");
    expect(getTaskerStateLabel({ name: " Pendiente " })).toBe("Reportado");
  });
  it("los demás estados, tal cual", () => {
    expect(getTaskerStateLabel({ id: 3, name: "Iniciada" })).toBe("Iniciada");
    expect(getTaskerStateLabel({ id: 5, name: "Completada" })).toBe("Completada");
    expect(getTaskerStateLabel({ name: "Asignada" })).toBe("Asignada");
  });
  it("tarjetas y detalle mapeados con stateId 1 se muestran como 'Reportado'", () => {
    const pending = { ...LIST_ITEM, stateId: 1, state: { id: 1, name: "Pendiente", color: "#ccc" } };
    const [card] = mapTaskrTasks({ items: [pending] }).tasks;
    expect(getTaskerStateLabel(card.state)).toBe("Reportado");
    expect(getTaskerStateLabel(mapTaskrTaskDetail({ ...DETAIL, ...pending }, URL)!.state)).toBe(
      "Reportado",
    );
  });
});

describe("buildTaskrFileUrl", () => {
  const COLEGIO = "https://api.colegio.test";

  it("relativa → `${urlColegio}/taskr/downloads/${ruta}`", () => {
    expect(buildTaskrFileUrl("uploads/a.jpg", COLEGIO)).toBe(
      "https://api.colegio.test/taskr/downloads/uploads/a.jpg",
    );
  });
  it("con '/' inicial (o urlColegio con '/' final) → sin barra doble", () => {
    expect(buildTaskrFileUrl("/uploads/a.jpg", COLEGIO)).toBe(
      "https://api.colegio.test/taskr/downloads/uploads/a.jpg",
    );
    expect(buildTaskrFileUrl("//uploads/a.jpg", `${COLEGIO}/`)).toBe(
      "https://api.colegio.test/taskr/downloads/uploads/a.jpg",
    );
  });
  it("absoluta (http o https) → tal cual, sin pasar por FaceClass", () => {
    expect(buildTaskrFileUrl("https://otro.test/a.jpg", COLEGIO)).toBe("https://otro.test/a.jpg");
    expect(buildTaskrFileUrl("HTTP://otro.test/a.jpg", COLEGIO)).toBe("HTTP://otro.test/a.jpg");
  });
  it("vacía → ''", () => {
    expect(buildTaskrFileUrl("  ", COLEGIO)).toBe("");
  });
});

describe("createExclusiveRunner", () => {
  it("no lanza una tarea mientras la anterior no termina", async () => {
    const run = createExclusiveRunner();
    let release!: () => void;
    const task = jest.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const first = run(task);
    await expect(run(task)).resolves.toBe(false);
    expect(task).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toBe(true);
    await expect(run(async () => undefined)).resolves.toBe(true);
  });
  it("si la tarea falla, libera el turno", async () => {
    const run = createExclusiveRunner();
    await expect(run(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await expect(run(async () => undefined)).resolves.toBe(true);
  });
});

// ─── Comentario nuevo (PATCH) ───────────────────────────────────────────────

describe("buildTaskrCommentBody", () => {
  it("texto recortado + data URIs", () => {
    expect(buildTaskrCommentBody(draft("  hola  ", [file("a", PNG), file("b", PDF)]))).toEqual({
      taskComments: [{ comment: "hola", images: [PNG, PDF] }],
    });
  });
  it("solo imágenes → comment '' (siempre presente)", () => {
    const body = buildTaskrCommentBody(draft("   ", [file("a", PNG)]));
    expect(body.taskComments[0]).toHaveProperty("comment", "");
    expect(JSON.parse(JSON.stringify(body))).toEqual({
      taskComments: [{ comment: "", images: [PNG] }],
    });
  });
  it("sin adjuntos → images []; descarta lo que no es data URI", () => {
    expect(buildTaskrCommentBody(draft("x", [file("a", "uploads/a.jpg")]))).toEqual({
      taskComments: [{ comment: "x", images: [] }],
    });
  });
});

describe("serializeTaskrCommentBody (tope de 9.5 MB)", () => {
  const bodyOfBytes = (total: number) => {
    const empty = JSON.stringify({ taskComments: [{ comment: "", images: [] }] });
    return { taskComments: [{ comment: "a".repeat(total - empty.length), images: [] }] };
  };
  it("justo en el tope → se envía", () => {
    const result = serializeTaskrCommentBody(bodyOfBytes(TASKR_TASK_MAX_BYTES));
    expect(result.ok).toBe(true);
    if (result.ok) expect(utf8ByteLength(result.json)).toBe(TASKR_TASK_MAX_BYTES);
  });
  it("un byte más → error de adjuntos", () => {
    expect(serializeTaskrCommentBody(bodyOfBytes(TASKR_TASK_MAX_BYTES + 1))).toEqual({
      ok: false,
      message: TASKER_ATTACHMENTS_TOO_LARGE_ERROR,
    });
  });
});

// ─── Normalización de message ───────────────────────────────────────────────

describe("message de success:false", () => {
  it("texto no vacío → ese texto; objeto, vacío o ausente → genérico", () => {
    expect(readTaskrMessage("No permitido", "G")).toBe("No permitido");
    expect(readTaskrMessage({ code: 1 }, "G")).toBe("G");
    expect(readTaskrMessage("   ", "G")).toBe("G");
    expect(readTaskrMessage(undefined, "G")).toBe("G");
  });
  it("taskrFailure marca 'La tarea ya no está disponible.' como gone", () => {
    expect(taskrFailure(TASKR_TASK_GONE_MESSAGE, "G")).toEqual({
      ok: false,
      message: TASKR_TASK_GONE_MESSAGE,
      gone: true,
    });
    expect(taskrFailure({ message: TASKR_TASK_GONE_MESSAGE }, "G")).toEqual({
      ok: false,
      message: "G",
      gone: false,
    });
    expect(isTaskrTaskGoneMessage(" La tarea ya no está disponible. ")).toBe(true);
  });
});

// ─── Servicios ──────────────────────────────────────────────────────────────

describe("fetchTaskerTasks", () => {
  it("GET /taskr/tasks con SOLO los parámetros fijos y el Bearer de la sesión", async () => {
    mockedGet.mockResolvedValue({ data: { success: true, data: { items: [LIST_ITEM], count: 1 } } });
    const result = await fetchTaskerTasks(AUTH);
    expect(result).toMatchObject({ ok: true, count: 1, message: "" });
    expect(mockedGet).toHaveBeenCalledTimes(1);
    const [url, config] = mockedGet.mock.calls[0];
    expect(url).toBe(`${URL}/taskr/tasks`);
    expect(config.params).toEqual({ orderKey: "createdDate", orderDir: "desc" });
    expect(config.params).toEqual({ ...TASKR_TASKS_PARAMS });
    expect(config.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });
  it("los parámetros fijos no se pueden cambiar", () => {
    expect(Object.isFrozen(TASKR_TASKS_PARAMS)).toBe(true);
  });
  it("success:false con message objeto → genérico", async () => {
    mockedGet.mockResolvedValue({ data: { success: false, message: { error: "x" } } });
    await expect(fetchTaskerTasks(AUTH)).resolves.toEqual({
      ok: false,
      message: TASKER_TASKS_ERROR,
      gone: false,
    });
  });
  it("sin respuesta (red) → error de conexión; nunca lanza", async () => {
    mockedGet.mockRejectedValue(new Error("Network Error"));
    await expect(fetchTaskerTasks(AUTH)).resolves.toEqual({
      ok: false,
      message: TASKER_NETWORK_ERROR,
      gone: false,
    });
  });
  it("error HTTP con message de texto → ese texto", async () => {
    mockedGet.mockRejectedValue({ response: { status: 401, data: { message: "Sesión vencida" } } });
    await expect(fetchTaskerTasks(AUTH)).resolves.toEqual({
      ok: false,
      message: "Sesión vencida",
      gone: false,
    });
  });
});

describe("fetchTaskerTask", () => {
  it("GET /taskr/tasks/{id} → detalle mapeado", async () => {
    mockedGet.mockResolvedValue({ data: { success: true, data: DETAIL } });
    const result = await fetchTaskerTask({ ...AUTH, id: 4045 });
    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/taskr/tasks/4045`);
    expect(mockedGet.mock.calls[0][1].headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(result.ok && result.task.faults).toEqual(["Compresor", "Termostato"]);
  });
  it("'La tarea ya no está disponible.' → gone", async () => {
    mockedGet.mockResolvedValue({ data: { success: false, message: TASKR_TASK_GONE_MESSAGE } });
    await expect(fetchTaskerTask({ ...AUTH, id: 4045 })).resolves.toEqual({
      ok: false,
      message: TASKR_TASK_GONE_MESSAGE,
      gone: true,
    });
  });
  it("data sin id → error genérico", async () => {
    mockedGet.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(fetchTaskerTask({ ...AUTH, id: 4045 })).resolves.toEqual({
      ok: false,
      message: TASKER_TASK_ERROR,
      gone: false,
    });
  });
  it("id que no es entero positivo → no llama", async () => {
    for (const id of [0, -1, 1.5, NaN]) {
      await expect(fetchTaskerTask({ ...AUTH, id })).resolves.toMatchObject({ ok: false });
    }
    expect(mockedGet).not.toHaveBeenCalled();
  });
});

describe("addTaskerTaskComment", () => {
  const body = buildTaskrCommentBody(draft("", [file("a", PNG)]));

  it("PATCH /taskr/tasks/{id} con { taskComments: [{ comment, images }] }", async () => {
    mockedPatch.mockResolvedValue({ data: { success: true, data: { id: 4045, comments: [] } } });
    await expect(addTaskerTaskComment({ ...AUTH, id: 4045, body })).resolves.toEqual({
      ok: true,
      message: "",
    });
    const [url, json, config] = mockedPatch.mock.calls[0];
    expect(url).toBe(`${URL}/taskr/tasks/4045`);
    expect(JSON.parse(json)).toEqual({ taskComments: [{ comment: "", images: [PNG] }] });
    expect(config.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    });
  });
  it("rechazo del servidor (p. ej. ticket cerrado) → su message", async () => {
    mockedPatch.mockResolvedValue({
      data: { success: false, message: "La tarea está completada." },
    });
    await expect(addTaskerTaskComment({ ...AUTH, id: 4045, body })).resolves.toEqual({
      ok: false,
      message: "La tarea está completada.",
      gone: false,
    });
  });
  it("message objeto → genérico", async () => {
    mockedPatch.mockResolvedValue({ data: { success: false, message: { a: 1 } } });
    await expect(addTaskerTaskComment({ ...AUTH, id: 4045, body })).resolves.toEqual({
      ok: false,
      message: TASKER_COMMENT_SEND_ERROR,
      gone: false,
    });
  });
  it("pasa de 9.5 MB → no envía", async () => {
    const big = { taskComments: [{ comment: "a".repeat(TASKR_TASK_MAX_BYTES), images: [] }] };
    await expect(addTaskerTaskComment({ ...AUTH, id: 4045, body: big })).resolves.toEqual({
      ok: false,
      message: TASKER_ATTACHMENTS_TOO_LARGE_ERROR,
      gone: false,
    });
    expect(mockedPatch).not.toHaveBeenCalled();
  });
  it("sin respuesta (red) → error de conexión", async () => {
    mockedPatch.mockRejectedValue(new Error("timeout"));
    await expect(addTaskerTaskComment({ ...AUTH, id: 4045, body })).resolves.toEqual({
      ok: false,
      message: TASKER_NETWORK_ERROR,
      gone: false,
    });
  });
});

describe("parseFollowUpTicketParam (?ticket= de Ver seguimiento)", () => {
  it("entero positivo en texto → número", () => {
    expect(parseFollowUpTicketParam("482")).toBe(482);
    expect(parseFollowUpTicketParam(" 7 ")).toBe(7);
  });
  it("arreglo → el primero", () => {
    expect(parseFollowUpTicketParam(["12", "13"])).toBe(12);
  });
  it("ausente, vacío, cero, negativo, decimal o texto → null", () => {
    for (const value of [undefined, "", "0", "-3", "4.5", "abc", "12abc", []]) {
      expect(parseFollowUpTicketParam(value as string | string[] | undefined)).toBeNull();
    }
  });
  it("fuera de rango seguro → null", () => {
    expect(parseFollowUpTicketParam("99999999999999999999")).toBeNull();
  });
});

describe("resolveRequestedTicket (selección inicial de Seguimiento)", () => {
  const tasks = [{ id: 10 }, { id: 482 }, { id: 7 }];
  it("pedido y en la lista → ese", () => {
    expect(resolveRequestedTicket(tasks, 482)).toBe(482);
  });
  it("pedido pero no está en la lista → null (ninguno elegido, como hoy)", () => {
    expect(resolveRequestedTicket(tasks, 999)).toBeNull();
  });
  it("sin pedido → null", () => {
    expect(resolveRequestedTicket(tasks, null)).toBeNull();
  });
  it("lista vacía → null", () => {
    expect(resolveRequestedTicket([], 482)).toBeNull();
  });
});
