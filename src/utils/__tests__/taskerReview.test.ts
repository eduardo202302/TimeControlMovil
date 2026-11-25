/// <reference types="jest" />
import axios from "axios";
import {
  addTaskerTaskComment,
  buildEvaluationBody,
  buildStateChangeBody,
  buildTaskrCommentBody,
  fetchTaskerStates,
  fetchTaskerTaskStates,
  formatTaskrDateTime,
  mapTaskrStates,
  mapTaskrTaskList,
  mapTaskrTaskStates,
  patchTaskerTask,
  TASKER_ATTACHMENTS_TOO_LARGE_ERROR,
  TASKER_COMMENT_SEND_ERROR,
  TASKER_EVALUATION_SEND_ERROR,
  TASKER_NETWORK_ERROR,
  TASKER_PATCH_ERROR,
  TASKER_STATES_ERROR,
  TASKER_TASK_STATES_ERROR,
  TASKR_TASK_MAX_BYTES,
} from "../taskerApi";
import {
  canCommentOnTask,
  canEvaluateItem,
  canEvaluateTask,
  canSaveEvaluation,
  countUnevaluated,
  evaluationRequirements,
  getCompleteConfirmMessage,
  getReviewClosedNotice,
  getReviewStateName,
  getStateChangeSuccessTitle,
  getTaskListStateName,
  shouldCloseReviewSheet,
  TASKER_INCOMPLETE_COMMENT_REQUIRED,
  TASKER_REVIEW_STATE_NAMES,
  TASKER_STATE_INCOMPLETE,
  TASKER_STATE_REVISION,
  TASKR_TASK_GONE_MESSAGE,
} from "../taskerFollowUpRules";
import type {
  TaskerTaskListItem,
  TaskerTaskState,
  TaskrPatchBody,
} from "../../../types/typesTasker/TaskerTypes";

jest.mock("axios");

const mockedGet = axios.get as unknown as jest.Mock;
const mockedPatch = axios.patch as unknown as jest.Mock;

const URL = "https://api.colegio.test";
const TOKEN = "school.jwt.token";
const AUTH = { token: TOKEN, urlColegio: URL };
const PNG = "data:image/png;base64,iVBORw0KGgo=";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore?.();
});

const taskState = (overrides: Partial<TaskerTaskState> = {}): TaskerTaskState => ({
  id: 4,
  name: "Bueno",
  requiresComment: false,
  requiresDate: false,
  suggestImage: false,
  ...overrides,
});

const item = (overrides: Partial<TaskerTaskListItem> = {}): TaskerTaskListItem => ({
  id: 10,
  text: "Compresor",
  order: 1,
  isChecked: "checked",
  checkedDate: null,
  isDisabled: false,
  taskStateId: null,
  taskState: null,
  ...overrides,
});

/** 2026-11-25 14:05:09 UTC = 10:05:09 en RD (UTC-4). */
const NOW = new Date(Date.UTC(2026, 10, 25, 14, 5, 9));

// ─── Mapeo ──────────────────────────────────────────────────────────────────

describe("mapTaskrTaskList: evaluación de cada acción", () => {
  it("taskStateId y taskState { id, name }", () => {
    const [mapped] = mapTaskrTaskList([
      { id: 1, text: "A", taskStateId: 4, taskState: { id: 4, name: "Bueno", companyId: 2 } },
    ]);
    expect(mapped.taskStateId).toBe(4);
    expect(mapped.taskState).toEqual({ id: 4, name: "Bueno" });
  });
  it("sin evaluar (null o ausente) → null y null", () => {
    const list = mapTaskrTaskList([
      { id: 1, text: "A", taskStateId: null, taskState: null },
      { id: 2, text: "B" },
    ]);
    expect(list.map((f) => [f.taskStateId, f.taskState])).toEqual([
      [null, null],
      [null, null],
    ]);
  });
  it("taskStateId sin taskState → el id queda, taskState null (la fila usa el catálogo)", () => {
    const [mapped] = mapTaskrTaskList([{ id: 1, text: "A", taskStateId: 4 }]);
    expect(mapped.taskStateId).toBe(4);
    expect(mapped.taskState).toBeNull();
  });
  it("solo taskState con id → toma ese id; taskState sin nombre → null", () => {
    const list = mapTaskrTaskList([
      { id: 1, text: "A", order: 1, taskState: { id: 5, name: " Malo " } },
      { id: 2, text: "B", order: 2, taskStateId: 6, taskState: { id: 6, name: "  " } },
    ]);
    expect(list[0]).toMatchObject({ taskStateId: 5, taskState: { id: 5, name: "Malo" } });
    expect(list[1]).toMatchObject({ taskStateId: 6, taskState: null });
  });
  it("taskStateId que no es número (como el resto de los ids) → null", () => {
    const [mapped] = mapTaskrTaskList([{ id: 1, text: "A", taskStateId: "4" }]);
    expect(mapped.taskStateId).toBeNull();
    expect(mapped.taskState).toBeNull();
  });
});

describe("mapTaskrTaskStates", () => {
  it("id, nombre recortado y banderas solo con true; descarta sin id o sin nombre", () => {
    expect(
      mapTaskrTaskStates([
        { id: 1, name: " Bueno ", requiresComment: true, requiresDate: "true", suggestImage: 1, companyId: 2 },
        { id: 2, name: "Malo", requiresComment: false, requiresDate: true, suggestImage: true },
        { id: null, name: "Sin id" },
        { id: 3, name: "" },
        "x",
      ]),
    ).toEqual([
      { id: 1, name: "Bueno", requiresComment: true, requiresDate: false, suggestImage: false },
      { id: 2, name: "Malo", requiresComment: false, requiresDate: true, suggestImage: true },
    ]);
  });
  it("data que no es arreglo → []", () => {
    expect(mapTaskrTaskStates({})).toEqual([]);
    expect(mapTaskrTaskStates(null)).toEqual([]);
  });
});

describe("mapTaskrStates", () => {
  it("id, nombre y color; sin color → ''", () => {
    expect(
      mapTaskrStates([
        { id: 5, name: "Completada", color: "#64C27B", order: 7 },
        { id: 9, name: "Incompleta" },
        { id: "7", name: "Revisión" },
      ]),
    ).toEqual([
      { id: 5, name: "Completada", color: "#64C27B" },
      { id: 9, name: "Incompleta", color: "" },
    ]);
  });
});

// ─── Builders ───────────────────────────────────────────────────────────────

describe("formatTaskrDateTime (startDate, hora RD sin zona)", () => {
  it("UTC-4 fijo", () => {
    expect(formatTaskrDateTime(NOW)).toBe("2026-11-25 10:05:09");
  });
  it("cruza la medianoche hacia atrás", () => {
    expect(formatTaskrDateTime(new Date(Date.UTC(2026, 10, 26, 2, 0, 0)))).toBe(
      "2026-11-25 22:00:00",
    );
  });
});

describe("buildEvaluationBody (calca etaskr-mobile TaskDetails.js:252-253 / 483-487)", () => {
  const target = { id: 10, text: "Compresor" };

  it("sin comentario ni imágenes → solo list, sin comentario automático", () => {
    expect(buildEvaluationBody(target, taskState(), "   ", [], NOW)).toEqual({
      list: [{ id: 10, taskStateId: 4 }],
      taskComments: [],
    });
  });
  it("con comentario → 'Evaluación de {texto} [{estado}]\\n{comentario}' con taskListId", () => {
    expect(buildEvaluationBody(target, taskState(), "  Cambiado  ", [], NOW)).toEqual({
      list: [{ id: 10, taskStateId: 4 }],
      taskComments: [
        { comment: "Evaluación de Compresor [Bueno]\nCambiado", images: [], taskListId: 10 },
      ],
    });
  });
  it("requiresDate → startDate = ahora en hora RD", () => {
    const body = buildEvaluationBody(target, taskState({ requiresDate: true }), "", [], NOW);
    expect(body.list).toEqual([{ id: 10, taskStateId: 4, startDate: "2026-11-25 10:05:09" }]);
  });
  it("sin requiresDate → sin la clave startDate", () => {
    const body = buildEvaluationBody(target, taskState(), "", [], NOW);
    expect(body.list?.[0]).not.toHaveProperty("startDate");
  });
  it("suggestImage + solo imágenes → comentario = título, con las imágenes", () => {
    const body = buildEvaluationBody(target, taskState({ suggestImage: true }), "", [PNG], NOW);
    expect(body.taskComments).toEqual([
      { comment: "Evaluación de Compresor [Bueno]", images: [PNG], taskListId: 10 },
    ]);
  });
  it("sin suggestImage → las imágenes no viajan (Evaluation.js:26)", () => {
    expect(buildEvaluationBody(target, taskState(), "", [PNG], NOW).taskComments).toEqual([]);
    expect(buildEvaluationBody(target, taskState(), "ok", [PNG], NOW).taskComments[0].images).toEqual(
      [],
    );
  });
  it("descarta lo que no es data URI", () => {
    const body = buildEvaluationBody(
      target,
      taskState({ suggestImage: true }),
      "x",
      ["uploads/a.jpg", PNG],
      NOW,
    );
    expect(body.taskComments[0].images).toEqual([PNG]);
  });
  it("nunca lleva stateId", () => {
    expect(buildEvaluationBody(target, taskState(), "x", [], NOW)).not.toHaveProperty("stateId");
  });
});

describe("buildStateChangeBody", () => {
  it("Completada sin comentario → { stateId: 5, taskComments: [] }", () => {
    expect(buildStateChangeBody(5)).toEqual({ ok: true, body: { stateId: 5, taskComments: [] } });
  });
  it("Completada con comentario → uno sin adjuntos ni acción", () => {
    expect(buildStateChangeBody(5, " listo ")).toEqual({
      ok: true,
      body: { stateId: 5, taskComments: [{ comment: "listo", images: [], taskListId: null }] },
    });
  });
  it("Incompleta exige comentario (trim)", () => {
    for (const comment of [undefined, "", "   \n "]) {
      expect(buildStateChangeBody(9, comment)).toEqual({
        ok: false,
        message: TASKER_INCOMPLETE_COMMENT_REQUIRED,
      });
    }
  });
  it("Incompleta con comentario → stateId 9 (número) y el comentario recortado", () => {
    const result = buildStateChangeBody(9, "  Falta el filtro  ");
    expect(result).toEqual({
      ok: true,
      body: {
        stateId: 9,
        taskComments: [{ comment: "Falta el filtro", images: [], taskListId: null }],
      },
    });
    if (result.ok) expect(typeof result.body.stateId).toBe("number");
  });
});

// ─── Servicios ──────────────────────────────────────────────────────────────

describe("patchTaskerTask", () => {
  const body: TaskrPatchBody = {
    list: [{ id: 10, taskStateId: 4 }],
    taskComments: [{ comment: "Evaluación de A [Bueno]", images: [], taskListId: 10 }],
  };

  it("PATCH /taskr/tasks/{id} con el cuerpo tal cual y JSON", async () => {
    mockedPatch.mockResolvedValue({ data: { success: true, data: { id: 4045 } } });
    await expect(patchTaskerTask({ ...AUTH, id: 4045, body })).resolves.toEqual({
      ok: true,
      message: "",
    });
    const [url, json, config] = mockedPatch.mock.calls[0];
    expect(url).toBe(`${URL}/taskr/tasks/4045`);
    expect(JSON.parse(json)).toEqual(body);
    expect(config.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    });
  });
  it("stateId viaja como número", async () => {
    mockedPatch.mockResolvedValue({ data: { success: true, data: {} } });
    const change = buildStateChangeBody(9, "x");
    if (!change.ok) throw new Error("debía armarse");
    await patchTaskerTask({ ...AUTH, id: 4045, body: change.body });
    expect(JSON.parse(mockedPatch.mock.calls[0][1]).stateId).toBe(9);
  });
  it("stateId que no es el número 5 o 9 → no envía", async () => {
    for (const stateId of ["9", 7, 1, null]) {
      const bad = { stateId, taskComments: [] } as unknown as TaskrPatchBody;
      await expect(
        patchTaskerTask({ ...AUTH, id: 4045, body: bad, errorMessage: "E" }),
      ).resolves.toEqual({ ok: false, message: "E", gone: false });
    }
    expect(mockedPatch).not.toHaveBeenCalled();
  });
  it("success:false con message de texto → ese texto; sin texto → errorMessage", async () => {
    mockedPatch.mockResolvedValueOnce({ data: { success: false, message: "Estado no válido" } });
    await expect(
      patchTaskerTask({ ...AUTH, id: 4045, body, errorMessage: TASKER_EVALUATION_SEND_ERROR }),
    ).resolves.toEqual({ ok: false, message: "Estado no válido", gone: false });
    mockedPatch.mockResolvedValueOnce({ data: { success: false, message: { a: 1 } } });
    await expect(
      patchTaskerTask({ ...AUTH, id: 4045, body, errorMessage: TASKER_EVALUATION_SEND_ERROR }),
    ).resolves.toEqual({ ok: false, message: TASKER_EVALUATION_SEND_ERROR, gone: false });
  });
  it("sin errorMessage → genérico del PATCH", async () => {
    mockedPatch.mockResolvedValue({ data: { success: false } });
    await expect(patchTaskerTask({ ...AUTH, id: 4045, body })).resolves.toEqual({
      ok: false,
      message: TASKER_PATCH_ERROR,
      gone: false,
    });
  });
  it("'La tarea ya no está disponible.' → gone", async () => {
    mockedPatch.mockResolvedValue({ data: { success: false, message: TASKR_TASK_GONE_MESSAGE } });
    await expect(patchTaskerTask({ ...AUTH, id: 4045, body })).resolves.toMatchObject({
      gone: true,
    });
  });
  it("id inválido o cuerpo de más de 9.5 MB → no envía", async () => {
    await expect(patchTaskerTask({ ...AUTH, id: 0, body })).resolves.toMatchObject({ ok: false });
    const big: TaskrPatchBody = {
      taskComments: [{ comment: "a".repeat(TASKR_TASK_MAX_BYTES), images: [], taskListId: null }],
    };
    await expect(patchTaskerTask({ ...AUTH, id: 4045, body: big })).resolves.toEqual({
      ok: false,
      message: TASKER_ATTACHMENTS_TOO_LARGE_ERROR,
      gone: false,
    });
    expect(mockedPatch).not.toHaveBeenCalled();
  });
  it("sin respuesta (red) → error de conexión; nunca lanza", async () => {
    mockedPatch.mockRejectedValue(new Error("timeout"));
    await expect(patchTaskerTask({ ...AUTH, id: 4045, body })).resolves.toEqual({
      ok: false,
      message: TASKER_NETWORK_ERROR,
      gone: false,
    });
  });
  it("addTaskerTaskComment sigue con su genérico y taskListId null", async () => {
    mockedPatch.mockResolvedValue({ data: { success: false } });
    const comment = buildTaskrCommentBody({ text: "hola", attachments: [] });
    await expect(addTaskerTaskComment({ ...AUTH, id: 4045, body: comment })).resolves.toEqual({
      ok: false,
      message: TASKER_COMMENT_SEND_ERROR,
      gone: false,
    });
    expect(JSON.parse(mockedPatch.mock.calls[0][1])).toEqual({
      taskComments: [{ comment: "hola", images: [], taskListId: null }],
    });
  });
});

describe("fetchTaskerTaskStates / fetchTaskerStates", () => {
  it("GET /taskr/taskStates con el Bearer → mapeado", async () => {
    mockedGet.mockResolvedValue({
      data: { success: true, data: [{ id: 4, name: "Bueno", requiresComment: true }] },
    });
    await expect(fetchTaskerTaskStates(AUTH)).resolves.toEqual({
      ok: true,
      taskStates: [
        { id: 4, name: "Bueno", requiresComment: true, requiresDate: false, suggestImage: false },
      ],
      message: "",
    });
    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/taskr/taskStates`);
    expect(mockedGet.mock.calls[0][1].headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(mockedGet.mock.calls[0][1]).not.toHaveProperty("params");
  });
  it("GET /taskr/states → mapeado", async () => {
    mockedGet.mockResolvedValue({
      data: { success: true, data: [{ id: 5, name: "Completada", color: "#64C27B" }] },
    });
    await expect(fetchTaskerStates(AUTH)).resolves.toEqual({
      ok: true,
      states: [{ id: 5, name: "Completada", color: "#64C27B" }],
      message: "",
    });
    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/taskr/states`);
  });
  it("success:false sin texto → genérico; red → conexión; nunca lanza", async () => {
    mockedGet.mockResolvedValueOnce({ data: { success: false, message: {} } });
    await expect(fetchTaskerTaskStates(AUTH)).resolves.toEqual({
      ok: false,
      message: TASKER_TASK_STATES_ERROR,
      gone: false,
    });
    mockedGet.mockResolvedValueOnce({ data: { success: false } });
    await expect(fetchTaskerStates(AUTH)).resolves.toEqual({
      ok: false,
      message: TASKER_STATES_ERROR,
      gone: false,
    });
    mockedGet.mockRejectedValueOnce(new Error("Network Error"));
    await expect(fetchTaskerTaskStates(AUTH)).resolves.toEqual({
      ok: false,
      message: TASKER_NETWORK_ERROR,
      gone: false,
    });
  });
});

// ─── Reglas ─────────────────────────────────────────────────────────────────

describe("estados de Revisión", () => {
  it("Revisión 7, Incompleta 9; Incompleta se puede comentar", () => {
    expect(TASKER_STATE_REVISION).toBe(7);
    expect(TASKER_STATE_INCOMPLETE).toBe(9);
    expect(canCommentOnTask(9)).toBe(true);
  });
  it("canEvaluateTask: solo en 7", () => {
    expect(canEvaluateTask(7)).toBe(true);
    for (const stateId of [1, 2, 3, 4, 5, 6, 8, 9]) expect(canEvaluateTask(stateId)).toBe(false);
  });
});

describe("canEvaluateItem", () => {
  it("hecha o en rojo, con id → sí", () => {
    expect(canEvaluateItem(item({ isChecked: "checked" }))).toBe(true);
    expect(canEvaluateItem(item({ isChecked: "indeterminate" }))).toBe(true);
  });
  it("pendiente, título de grupo o sin id → no", () => {
    expect(canEvaluateItem(item({ isChecked: "unchecked" }))).toBe(false);
    expect(canEvaluateItem(item({ isDisabled: true }))).toBe(false);
    expect(canEvaluateItem(item({ id: null }))).toBe(false);
  });
});

describe("evaluationRequirements / canSaveEvaluation", () => {
  it("banderas de la evaluación elegida; sin elegir → nada", () => {
    expect(evaluationRequirements(taskState({ requiresComment: true, suggestImage: true }))).toEqual({
      commentRequired: true,
      showImages: true,
    });
    expect(evaluationRequirements(null)).toEqual({ commentRequired: false, showImages: false });
  });
  it("sin evaluación elegida → no se guarda", () => {
    expect(canSaveEvaluation(null, "x", 1)).toBe(false);
  });
  it("sin requiresComment → siempre", () => {
    expect(canSaveEvaluation(taskState(), "", 0)).toBe(true);
  });
  it("requiresComment → comentario (trim) o imagen", () => {
    const st = taskState({ requiresComment: true, suggestImage: true });
    expect(canSaveEvaluation(st, "  ", 0)).toBe(false);
    expect(canSaveEvaluation(st, " ok ", 0)).toBe(true);
    expect(canSaveEvaluation(st, "", 1)).toBe(true);
  });
  it("requiresComment sin suggestImage → la imagen no cuenta", () => {
    expect(canSaveEvaluation(taskState({ requiresComment: true }), "", 2)).toBe(false);
  });
});

describe("countUnevaluated", () => {
  it("cuenta solo las evaluables sin taskStateId", () => {
    expect(
      countUnevaluated([
        item({ id: 1 }),
        item({ id: 2, taskStateId: 4 }),
        item({ id: 3, isChecked: "indeterminate" }),
        item({ id: 4, isChecked: "unchecked" }),
        item({ id: 5, isDisabled: true }),
        item({ id: null }),
      ]),
    ).toBe(2);
    expect(countUnevaluated([])).toBe(0);
  });
});

describe("nombres", () => {
  it("getReviewStateName: el de GET /taskr/states o el de respaldo", () => {
    const states = [
      { id: 5, name: "Terminada" },
      { id: 9, name: "  " },
    ];
    expect(getReviewStateName(states, 5)).toBe("Terminada");
    expect(getReviewStateName(states, 9)).toBe("Incompleta");
    expect(getReviewStateName([], 5)).toBe("Completada");
    expect(TASKER_REVIEW_STATE_NAMES).toEqual({ 5: "Completada", 9: "Incompleta" });
  });
  it("getTaskListStateName: taskState propio, si no el catálogo; sin evaluar → ''", () => {
    const catalog = [{ id: 4, name: "Bueno" }];
    expect(getTaskListStateName(item({ taskStateId: 4, taskState: { id: 4, name: "Regular" } }), catalog)).toBe(
      "Regular",
    );
    expect(getTaskListStateName(item({ taskStateId: 4, taskState: null }), catalog)).toBe("Bueno");
    expect(getTaskListStateName(item({ taskStateId: 8, taskState: null }), catalog)).toBe("");
    expect(getTaskListStateName(item(), catalog)).toBe("");
  });
  it("getTaskListStateName: taskState viejo (otro id) → el del catálogo", () => {
    expect(
      getTaskListStateName(
        item({ taskStateId: 4, taskState: { id: 3, name: "Anterior" } }),
        [{ id: 4, name: "Bueno" }],
      ),
    ).toBe("Bueno");
  });
});

describe("textos de Revisión", () => {
  it("confirmación de Completada", () => {
    expect(getCompleteConfirmMessage(0, "Completada")).toBe("¿Marcar el ticket como Completada?");
    expect(getCompleteConfirmMessage(1, "Completada")).toBe(
      "Hay 1 acción sin evaluar. ¿Marcar como Completada?",
    );
    expect(getCompleteConfirmMessage(3, "Completada")).toBe(
      "Hay 3 acciones sin evaluar. ¿Marcar como Completada?",
    );
  });
  it("resultado y aviso de cierre", () => {
    expect(getStateChangeSuccessTitle("Incompleta")).toBe("Ticket marcado como Incompleta");
    expect(getReviewClosedNotice("evaluation")).toBe(
      "El ticket ya no está en revisión; tu evaluación no se guardó.",
    );
    expect(getReviewClosedNotice("incomplete")).toBe(
      "El ticket ya no está en revisión; el cambio de estado no se envió.",
    );
  });
});

describe("shouldCloseReviewSheet", () => {
  it("abierta, sin enviar y fuera de 7 → cerrar", () => {
    expect(shouldCloseReviewSheet(5, true, false)).toBe(true);
    expect(shouldCloseReviewSheet(9, true, false)).toBe(true);
  });
  it("sigue en 7, cerrada o enviando → no", () => {
    expect(shouldCloseReviewSheet(7, true, false)).toBe(false);
    expect(shouldCloseReviewSheet(5, false, false)).toBe(false);
    expect(shouldCloseReviewSheet(5, true, true)).toBe(false);
  });
});
