/// <reference types="jest" />
import axios from "axios";
import {
  buildTaskrTaskAddress,
  buildTaskrTaskBody,
  createTaskerTask,
  fetchTaskerFaultActions,
  mapTaskerClient,
  mapTaskerCompanyConfig,
  mapTaskerFaultActions,
  mapTaskerSession,
  readTaskrMessage,
  serializeTaskrTaskBody,
  TASKER_ACTIONS_ERROR,
  TASKER_ACTIONS_PARAMS,
  TASKER_ATTACHMENTS_TOO_LARGE_ERROR,
  TASKER_DISCONNECTED_CONFIG,
  TASKER_NETWORK_ERROR,
  TASKER_SEND_ERROR,
  TASKR_TASK_MAX_BYTES,
  utf8ByteLength,
  type TaskrTaskForm,
} from "../taskerApi";
import type { TaskerReportAddress } from "../../../types/typesTasker/TaskerTypes";

jest.mock("axios");

const mockedGet = axios.get as unknown as jest.Mock;
const mockedPost = axios.post as unknown as jest.Mock;

const URL = "https://api.colegio.test";
const TOKEN = "school.jwt.token";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore?.();
});

// ─── chooseschool: taskrCompany ─────────────────────────────────────────────

describe("mapTaskerCompanyConfig", () => {
  it("taskrCompany null o ausente → no conectada", () => {
    expect(mapTaskerCompanyConfig(null)).toEqual(TASKER_DISCONNECTED_CONFIG);
    expect(mapTaskerCompanyConfig(undefined)).toEqual(TASKER_DISCONNECTED_CONFIG);
  });
  it("forma rara (no objeto) → no conectada", () => {
    expect(mapTaskerCompanyConfig("x").connected).toBe(false);
    expect(mapTaskerCompanyConfig([]).connected).toBe(false);
  });
  it("con settings → conectada, isFailureReport y labels", () => {
    expect(
      mapTaskerCompanyConfig({
        id: 1,
        settings: {
          isFailureReport: true,
          failureReportMenuLabel: "Reportar Avería",
          failureReportLabel: "Tipo de avería",
          clientLabel: "Sucursal",
        },
      }),
    ).toEqual({
      connected: true,
      appliesFault: true,
      failureReportMenuLabel: "Reportar Avería",
      failureReportLabel: "Tipo de avería",
      clientLabel: "Sucursal",
    });
  });
  it("settings faltantes → conectada, sin averías y labels null", () => {
    for (const company of [{ id: 1 }, { id: 1, settings: null }, { id: 1, settings: "x" }]) {
      expect(mapTaskerCompanyConfig(company)).toEqual({
        connected: true,
        appliesFault: false,
        failureReportMenuLabel: null,
        failureReportLabel: null,
        clientLabel: null,
      });
    }
  });
  it("isFailureReport solo cuenta si es exactamente true", () => {
    for (const isFailureReport of ["true", 1, null, undefined, false]) {
      expect(mapTaskerCompanyConfig({ settings: { isFailureReport } }).appliesFault).toBe(false);
    }
  });
  it("labels que no son texto → null; texto vacío se conserva (lo resuelven los getters)", () => {
    const c = mapTaskerCompanyConfig({
      settings: { failureReportMenuLabel: 5, failureReportLabel: { a: 1 }, clientLabel: "" },
    });
    expect(c.failureReportMenuLabel).toBeNull();
    expect(c.failureReportLabel).toBeNull();
    expect(c.clientLabel).toBe("");
  });
  it("no copia nada más de la compañía ni de settings", () => {
    const c = mapTaskerCompanyConfig({
      id: 1,
      channel: "canal",
      token: "secreto",
      settings: { isFailureReport: true, otherSetting: "x" },
    });
    expect(Object.keys(c).sort()).toEqual(
      ["appliesFault", "clientLabel", "connected", "failureReportLabel", "failureReportMenuLabel"].sort(),
    );
  });
});

// ─── chooseschool: taskrClients ─────────────────────────────────────────────

const SEDE = {
  id: 77,
  order: 3,
  selected: true,
  title: "Sede Naco",
  province: "D.N.",
  city: "Santo Domingo",
  sector: "Naco",
  zone: "",
  street: "Av. Tiradentes",
  streetNumber: "25",
  postalCode: "10122",
  address: "Av. Tiradentes 25, Santo Domingo",
  formattedAddress: "Av. Tiradentes 25, Naco, Santo Domingo, D.N.",
  referenceToArrive: "Frente a la plaza",
  whoReceives: "Recepción",
  restrictions: "",
  latitude: 18.4775,
  longitude: -69.9273,
  location: { lat: 18.4775, lng: -69.9273 },
};
const SUCURSAL = { title: "Sucursal", city: "Santiago", street: "Calle Sol", latitude: 19.45, longitude: -70.69 };

describe("mapTaskerClient", () => {
  it("solo id, name, defaultAddress y addresses (sin token, faceClassUsers ni otros)", () => {
    const c = mapTaskerClient({
      id: 301,
      name: "Clínica",
      token: "token-cliente",
      faceClassUsers: [{ id: 1 }],
      phone: "809",
      defaultAddress: SEDE,
      addresses: [],
    });
    expect(c && Object.keys(c).sort()).toEqual(["addresses", "defaultAddress", "id", "name"]);
    expect(JSON.stringify(c)).not.toContain("token");
  });
  it("defaultAddress presente → es la predeterminada y va primera", () => {
    const c = mapTaskerClient({ id: 1, name: "X", defaultAddress: SEDE, addresses: [SUCURSAL] })!;
    expect(c.addresses.map((a) => a.title)).toEqual(["Sede Naco", "Sucursal"]);
    expect(c.addresses.map((a) => a.isDefault)).toEqual([true, false]);
    expect(c.defaultAddress).toEqual(c.addresses[0]);
  });
  it("sin defaultAddress (null, ausente o vacía) → la primera de addresses", () => {
    for (const defaultAddress of [null, undefined, {}, { title: "", latitude: null }]) {
      const c = mapTaskerClient({ id: 1, name: "X", defaultAddress, addresses: [SUCURSAL, SEDE] })!;
      expect(c.defaultAddress?.title).toBe("Sucursal");
      expect(c.addresses.map((a) => a.isDefault)).toEqual([true, false]);
    }
  });
  it("sin defaultAddress ni addresses → defaultAddress null y lista vacía", () => {
    const c = mapTaskerClient({ id: 1, name: "X", defaultAddress: null })!;
    expect(c.defaultAddress).toBeNull();
    expect(c.addresses).toEqual([]);
  });
  it("defaultAddress repetida en addresses → no se duplica", () => {
    const c = mapTaskerClient({ id: 1, name: "X", defaultAddress: SEDE, addresses: [SEDE, SUCURSAL] })!;
    expect(c.addresses.map((a) => a.title)).toEqual(["Sede Naco", "Sucursal"]);
  });
  it("ids propios 1..N (los de Taskr se descartan) y fuera order/selected", () => {
    const c = mapTaskerClient({ id: 1, name: "X", defaultAddress: SEDE, addresses: [SUCURSAL] })!;
    expect(c.addresses.map((a) => a.id)).toEqual([1, 2]);
    expect(c.addresses[0]).not.toHaveProperty("order");
    expect(c.addresses[0]).not.toHaveProperty("selected");
  });
  it("dirección normalizada: textos faltantes en '' y coordenadas con location", () => {
    const [a] = mapTaskerClient({ id: 1, name: "X", addresses: [SUCURSAL] })!.addresses;
    expect(a).toMatchObject({
      title: "Sucursal",
      province: "",
      sector: "",
      building: "",
      postalCode: "",
      latitude: 19.45,
      longitude: -70.69,
      location: { lat: 19.45, lng: -70.69 },
    });
  });
  it("dirección sin lat/lng → null y sin location", () => {
    const [a] = mapTaskerClient({
      id: 1,
      name: "X",
      addresses: [{ title: "Sin mapa", latitude: null, longitude: "abc" }],
    })!.addresses;
    expect(a.latitude).toBeNull();
    expect(a.longitude).toBeNull();
    expect(a).not.toHaveProperty("location");
  });
  it("solo con location → se toman de ahí", () => {
    const [a] = mapTaskerClient({
      id: 1,
      name: "X",
      addresses: [{ title: "Loc", location: { lat: 18.1, lng: -69.1 } }],
    })!.addresses;
    expect([a.latitude, a.longitude]).toEqual([18.1, -69.1]);
  });
  it("sin id numérico → null; sin nombre → ''", () => {
    expect(mapTaskerClient({ name: "X" })).toBeNull();
    expect(mapTaskerClient({ id: "1", name: "X" })).toBeNull();
    expect(mapTaskerClient(null)).toBeNull();
    expect(mapTaskerClient({ id: 1 })!.name).toBe("");
  });
});

describe("mapTaskerSession", () => {
  const data = {
    token: "x",
    taskrCompany: { settings: { isFailureReport: true } },
    taskrClients: [{ id: 1, name: "A", addresses: [SUCURSAL] }, { name: "sin id" }],
  };
  it("conectada → config y los clientes válidos", () => {
    const s = mapTaskerSession(data);
    expect(s.config.connected).toBe(true);
    expect(s.clients.map((c) => c.id)).toEqual([1]);
  });
  it("taskrCompany null → no conectada y sin clientes aunque vengan", () => {
    expect(mapTaskerSession({ ...data, taskrCompany: null })).toEqual({
      config: TASKER_DISCONNECTED_CONFIG,
      clients: [],
    });
  });
  it("taskrClients ausente o no-array → []", () => {
    expect(mapTaskerSession({ taskrCompany: {} }).clients).toEqual([]);
    expect(mapTaskerSession({ taskrCompany: {}, taskrClients: {} }).clients).toEqual([]);
  });
  it("sin data → no conectada", () => {
    expect(mapTaskerSession(undefined).config.connected).toBe(false);
  });
});

// ─── message ────────────────────────────────────────────────────────────────

describe("readTaskrMessage", () => {
  it("texto no vacío → ese texto", () => {
    expect(readTaskrMessage("Ese cliente no está ligado a este usuario.", "F")).toBe(
      "Ese cliente no está ligado a este usuario.",
    );
  });
  it("objeto, vacío, solo espacios o ausente → el respaldo", () => {
    for (const message of [{ name: "Error", code: 1 }, [], "", "   ", null, undefined, 42]) {
      expect(readTaskrMessage(message, "F")).toBe("F");
    }
  });
});

// ─── Averías ────────────────────────────────────────────────────────────────

describe("mapTaskerFaultActions", () => {
  it("items → { id, name: action, clientId }", () => {
    expect(
      mapTaskerFaultActions({
        items: [
          { id: 1, action: "Falla eléctrica", clientId: null, categoryId: 4 },
          { id: 2, action: "Fuga", clientId: 301, categoryId: null },
        ],
        count: 2,
      }),
    ).toEqual([
      { id: 1, name: "Falla eléctrica", clientId: null },
      { id: 2, name: "Fuga", clientId: 301 },
    ]);
  });
  it("sin id, sin texto o con forma rara → se omiten; sin items → []", () => {
    expect(
      mapTaskerFaultActions({ items: [{ action: "x" }, { id: 3, action: " " }, null, { id: 4, action: "Ok" }] }),
    ).toEqual([{ id: 4, name: "Ok", clientId: null }]);
    expect(mapTaskerFaultActions(null)).toEqual([]);
    expect(mapTaskerFaultActions({ items: "x" })).toEqual([]);
  });
});

describe("fetchTaskerFaultActions", () => {
  it("GET /taskr/actions con parámetros fijos y el header de la escuela", async () => {
    mockedGet.mockResolvedValueOnce({
      data: { success: true, data: { items: [{ id: 1, action: "A", clientId: null }], count: 1 } },
    });
    const result = await fetchTaskerFaultActions({ token: TOKEN, urlColegio: URL });
    expect(result).toEqual({ ok: true, actions: [{ id: 1, name: "A", clientId: null }], message: "" });
    expect(mockedGet).toHaveBeenCalledTimes(1);
    const [url, options] = mockedGet.mock.calls[0];
    expect(url).toBe(`${URL}/taskr/actions`);
    expect(options.params).toEqual({ rows: 500, page: 1, orderKey: "id", orderDir: "asc" });
    expect(options.params).toEqual({ ...TASKER_ACTIONS_PARAMS });
    expect(options.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });
  it("success:false con message texto → ese texto", async () => {
    mockedGet.mockResolvedValueOnce({
      data: { success: false, message: "La escuela no está conectada a Taskr." },
    });
    await expect(fetchTaskerFaultActions({ token: TOKEN, urlColegio: URL })).resolves.toEqual({
      ok: false,
      actions: [],
      message: "La escuela no está conectada a Taskr.",
    });
  });
  it("success:false con message objeto → genérico", async () => {
    mockedGet.mockResolvedValueOnce({ data: { success: false, message: { code: "E" } } });
    const result = await fetchTaskerFaultActions({ token: TOKEN, urlColegio: URL });
    expect(result.message).toBe(TASKER_ACTIONS_ERROR);
  });
  it("error de red → no lanza", async () => {
    mockedGet.mockRejectedValueOnce(new Error("Network Error"));
    await expect(fetchTaskerFaultActions({ token: TOKEN, urlColegio: URL })).resolves.toEqual({
      ok: false,
      actions: [],
      message: TASKER_ACTIONS_ERROR,
    });
  });
});

// ─── Cuerpo de la tarea ─────────────────────────────────────────────────────

const REPORT_ADDRESS: TaskerReportAddress = {
  ...SEDE,
  id: 1,
  order: 1,
  selected: true,
  locked: true,
  fromClient: true,
  building: "Torre",
  apartmentNumber: "3B",
};

function form(over: Partial<TaskrTaskForm> = {}): TaskrTaskForm {
  return {
    appliesFault: true,
    clientId: 301,
    faultIds: [5, 2, 9],
    description: "  No enfría  ",
    address: REPORT_ADDRESS,
    comments: [],
    ...over,
  };
}

const PNG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const PDF = "data:application/pdf;base64,JVBERi0xLjQ=";

describe("buildTaskrTaskBody", () => {
  it("appliesFault true → actionIds en el orden elegido y action = descripción recortada", () => {
    const body = buildTaskrTaskBody(form());
    expect(body.clientId).toBe(301);
    expect(body.actionIds).toEqual([5, 2, 9]);
    expect(body.action).toBe("No enfría");
  });
  it("appliesFault true sin descripción → action ''", () => {
    expect(buildTaskrTaskBody(form({ description: "   " })).action).toBe("");
  });
  it("appliesFault false → action = descripción y sin actionIds", () => {
    const body = buildTaskrTaskBody(form({ appliesFault: false }));
    expect(body.action).toBe("No enfría");
    expect(body).not.toHaveProperty("actionIds");
  });
  it("dirección solo con los campos permitidos (fuera id, order, selected, locked, isDefault…)", () => {
    const body = buildTaskrTaskBody(
      form({ address: { ...REPORT_ADDRESS, isDefault: true } as TaskerReportAddress }),
    );
    expect(Object.keys(body.address!).sort()).toEqual(
      [
        "title",
        "province",
        "city",
        "zone",
        "sector",
        "street",
        "streetNumber",
        "building",
        "apartmentNumber",
        "postalCode",
        "address",
        "formattedAddress",
        "referenceToArrive",
        "whoReceives",
        "restrictions",
        "latitude",
        "longitude",
        "location",
      ].sort(),
    );
    expect(body.address).toMatchObject({
      title: "Sede Naco",
      building: "Torre",
      apartmentNumber: "3B",
      latitude: 18.4775,
      longitude: -69.9273,
      location: { lat: 18.4775, lng: -69.9273 },
    });
  });
  it("textos faltantes o no-texto → '' (nunca undefined ni null)", () => {
    const address = buildTaskrTaskAddress({
      ...REPORT_ADDRESS,
      postalCode: undefined,
      formattedAddress: undefined,
      address: undefined,
      whoReceives: null as unknown as string,
      building: "",
      apartmentNumber: undefined as unknown as string,
    });
    expect(address.building).toBe("");
    expect(address.apartmentNumber).toBe("");
    expect(address.postalCode).toBe("");
    expect(address.formattedAddress).toBe("");
    expect(address.address).toBe("");
    expect(address.whoReceives).toBe("");
    expect(Object.values(address).some((v) => v === undefined || v === null)).toBe(false);
  });
  it("dirección sin coordenadas válidas → sin latitude, longitude ni location", () => {
    for (const coords of [
      { latitude: null, longitude: null },
      { latitude: "", longitude: "" },
      { latitude: Number.NaN, longitude: -69.9 },
      { latitude: 18.4, longitude: null },
    ]) {
      const { location: _loc, ...noLocation } = REPORT_ADDRESS;
      const body = buildTaskrTaskBody(
        form({ address: { ...noLocation, ...coords } as TaskerReportAddress }),
      );
      expect(body.address).not.toHaveProperty("latitude");
      expect(body.address).not.toHaveProperty("longitude");
      expect(body.address).not.toHaveProperty("location");
      expect(JSON.stringify(body)).not.toContain("null");
    }
  });
  it("coordenadas como texto numérico → números", () => {
    const body = buildTaskrTaskBody(
      form({ address: { ...REPORT_ADDRESS, latitude: "18.5", longitude: "-69.8" } }),
    );
    expect(body.address).toMatchObject({ latitude: 18.5, longitude: -69.8 });
  });
  it("sin dirección → sin la clave", () => {
    expect(buildTaskrTaskBody(form({ address: undefined }))).not.toHaveProperty("address");
  });
  it("comentarios: texto recortado, solo adjunto (comment ''), PDF; taskListId null", () => {
    const body = buildTaskrTaskBody(
      form({
        comments: [
          { comment: "  Revisar compresor ", images: [] },
          { comment: "", images: [PNG] },
          { comment: "Factura", images: [PDF, PNG] },
        ],
      }),
    );
    expect(body.taskComments).toEqual([
      { comment: "Revisar compresor", images: [], taskListId: null },
      { comment: "", images: [PNG], taskListId: null },
      { comment: "Factura", images: [PDF, PNG], taskListId: null },
    ]);
  });
  it("la clave comment va siempre, aunque falte en el comentario", () => {
    const body = buildTaskrTaskBody(
      form({ comments: [{ comment: undefined as unknown as string, images: [PNG] }] }),
    );
    expect(body.taskComments![0]).toHaveProperty("comment", "");
  });
  it("sin comentarios → sin la clave taskComments", () => {
    expect(buildTaskrTaskBody(form({ comments: [] }))).not.toHaveProperty("taskComments");
  });
  it("nunca incluye token", () => {
    const body = buildTaskrTaskBody(
      form({
        address: { ...REPORT_ADDRESS, token: "x" } as unknown as TaskerReportAddress,
        comments: [{ comment: "a", images: [PNG] }],
      }),
    );
    expect(JSON.stringify(body)).not.toMatch(/"token"/);
  });
});

// ─── Tamaño ─────────────────────────────────────────────────────────────────

describe("tamaño del cuerpo (≤ 9.5 MB)", () => {
  it("el tope es 9.5 MB", () => {
    expect(TASKR_TASK_MAX_BYTES).toBe(9.5 * 1024 * 1024);
  });
  it("utf8ByteLength cuenta bytes reales (acentos, emoji)", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("ñ")).toBe(2);
    expect(utf8ByteLength("€")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);
  });
  /** Cuerpo cuyo JSON mide exactamente `bytes`. */
  function bodyOfSize(bytes: number) {
    const base = { clientId: 1, action: "" };
    const overhead = utf8ByteLength(JSON.stringify(base));
    return { ...base, action: "a".repeat(bytes - overhead) };
  }
  it("justo en el tope → se envía", () => {
    const result = serializeTaskrTaskBody(bodyOfSize(TASKR_TASK_MAX_BYTES));
    expect(result.ok).toBe(true);
  });
  it("un byte más → error de adjuntos", () => {
    expect(serializeTaskrTaskBody(bodyOfSize(TASKR_TASK_MAX_BYTES + 1))).toEqual({
      ok: false,
      message: TASKER_ATTACHMENTS_TOO_LARGE_ERROR,
    });
  });
  it("cuenta en UTF-8, no en caracteres", () => {
    const base = { clientId: 1, action: "" };
    const overhead = utf8ByteLength(JSON.stringify(base));
    const chars = Math.ceil((TASKR_TASK_MAX_BYTES - overhead) / 2) + 1;
    // Menos caracteres que el tope, pero más bytes.
    expect(serializeTaskrTaskBody({ ...base, action: "ñ".repeat(chars) }).ok).toBe(false);
  });
});

// ─── Envío ──────────────────────────────────────────────────────────────────

describe("createTaskerTask", () => {
  const body = buildTaskrTaskBody(form({ comments: [{ comment: "", images: [PNG] }] }));

  it("POST /taskr/tasks con el JSON, header de la escuela y sin token en URL ni body", async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: true, data: { id: 4051, action: "x" } } });
    await expect(createTaskerTask({ token: TOKEN, urlColegio: URL, body })).resolves.toEqual({
      ok: true,
      id: 4051,
      message: "",
    });
    const [url, sent, options] = mockedPost.mock.calls[0];
    expect(url).toBe(`${URL}/taskr/tasks`);
    expect(url).not.toMatch(/token/i);
    expect(JSON.parse(sent)).toEqual(body);
    expect(sent).not.toMatch(/"token"/);
    expect(options.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    });
    expect(options).not.toHaveProperty("params");
  });
  it("éxito sin id numérico → id null", async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await expect(createTaskerTask({ token: TOKEN, urlColegio: URL, body })).resolves.toEqual({
      ok: true,
      id: null,
      message: "",
    });
  });
  it("success:false con message texto → ese texto", async () => {
    mockedPost.mockResolvedValueOnce({
      data: { success: false, message: "Ese cliente no está ligado a este usuario." },
    });
    await expect(createTaskerTask({ token: TOKEN, urlColegio: URL, body })).resolves.toEqual({
      ok: false,
      message: "Ese cliente no está ligado a este usuario.",
    });
  });
  it("success:false con message objeto, vacío o ausente → genérico", async () => {
    for (const data of [
      { success: false, message: { name: "ValidationError" } },
      { success: false, message: "" },
      { success: false },
    ]) {
      mockedPost.mockResolvedValueOnce({ data });
      await expect(createTaskerTask({ token: TOKEN, urlColegio: URL, body })).resolves.toEqual({
        ok: false,
        message: TASKER_SEND_ERROR,
      });
    }
  });
  it("HTTP de error con respuesta (p. ej. 413) → message normalizado", async () => {
    mockedPost.mockRejectedValueOnce({
      message: "Request failed with status code 413",
      response: { status: 413, data: { message: { statusCode: 413 } } },
    });
    await expect(createTaskerTask({ token: TOKEN, urlColegio: URL, body })).resolves.toEqual({
      ok: false,
      message: TASKER_SEND_ERROR,
    });
  });
  it("error de red o timeout (sin respuesta) → 'No se pudo conectar'", async () => {
    mockedPost.mockRejectedValueOnce(new Error("Network Error"));
    await expect(createTaskerTask({ token: TOKEN, urlColegio: URL, body })).resolves.toEqual({
      ok: false,
      message: TASKER_NETWORK_ERROR,
    });
    mockedPost.mockRejectedValueOnce(
      Object.assign(new Error("timeout of 90000ms exceeded"), { code: "ECONNABORTED" }),
    );
    await expect(createTaskerTask({ token: TOKEN, urlColegio: URL, body })).resolves.toEqual({
      ok: false,
      message: TASKER_NETWORK_ERROR,
    });
  });
  it("pasado de 9.5 MB → error y no envía", async () => {
    const big = buildTaskrTaskBody(
      form({ comments: [{ comment: "", images: [`data:image/jpeg;base64,${"A".repeat(TASKR_TASK_MAX_BYTES)}`] }] }),
    );
    await expect(createTaskerTask({ token: TOKEN, urlColegio: URL, body: big })).resolves.toEqual({
      ok: false,
      message: TASKER_ATTACHMENTS_TOO_LARGE_ERROR,
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });
});
