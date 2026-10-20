import {
  addTaskerAddress,
  buildReportAddresses,
  clientAddressesToReport,
  filterFaultActionsForClient,
  filterTaskerMenu,
  getDefaultClientAddressId,
  getNearestListAddressId,
  getRemovedFaultsNotice,
  getReportGate,
  getSelectedTaskerAddress,
  formatDistanceAway,
  formatSelectedFaultsSummary,
  getClientAddressHint,
  getSelectedFaultNames,
  getTaskerClientLabel,
  getTaskerFaultLabel,
  getTaskerFormRules,
  getTaskerReportTitle,
  haversineMeters,
  isTaskerEnabled,
  isTaskerPath,
  parseStoredTaskerClients,
  parseStoredTaskerConfig,
  pickNearestClientAddress,
  pruneSelectedFaults,
  removeTaskerAddress,
  sortTaskerAddresses,
  TASKER_ADDRESS_REQUIRED_ERROR,
  TASKER_DESCRIPTION_REQUIRED_ERROR,
  TASKER_FAULTS_REQUIRED_ERROR,
  TASKER_FOLLOWUP_PATH,
  TASKER_REPORT_PATH,
  toggleFaultSelection,
  toggleTaskerAddressSelected,
  updateTaskerAddress,
  validateReport,
  type ReportLocationState,
} from "../taskerRules";
import { TASKER_TEMP_MENU } from "../../constants/taskerMock";
import type { MenuTree } from "../../../utils/resolveRoute";
import type {
  TaskerClientAddress,
  TaskerCompanyConfig,
  TaskerFaultAction,
  TaskerReportAddress,
  TaskerUserClient,
} from "../../../types/typesTasker/TaskerTypes";

function config(over: Partial<TaskerCompanyConfig> = {}): TaskerCompanyConfig {
  return {
    connected: true,
    appliesFault: true,
    failureReportMenuLabel: null,
    failureReportLabel: null,
    clientLabel: null,
    ...over,
  };
}

function address(
  id: number,
  latitude: number | string | null,
  longitude: number | string | null,
  title = `Dirección ${id}`,
): TaskerClientAddress {
  return {
    id,
    title,
    province: "D.N.",
    city: "Santo Domingo",
    sector: "",
    zone: "",
    street: "Calle",
    streetNumber: "1",
    building: "",
    apartmentNumber: "",
    latitude,
    longitude,
    referenceToArrive: "",
    whoReceives: "",
    restrictions: "",
  };
}

function client(id: number, addresses: TaskerClientAddress[]): TaskerUserClient {
  return { id, name: `Cliente ${id}`, defaultAddress: addresses[0] ?? null, addresses };
}

// Puntos reales de Santo Domingo.
const PIANTINI = { latitude: 18.4706, longitude: -69.9389 };
const EL_MILLON = { latitude: 18.4571, longitude: -69.9524 };
const LOS_MINA = { latitude: 18.5005, longitude: -69.8597 };

// ─── Compañía conectada ─────────────────────────────────────────────────────

describe("isTaskerEnabled", () => {
  it("connected true → true", () => {
    expect(isTaskerEnabled(config({ connected: true }))).toBe(true);
  });
  it("connected false → false", () => {
    expect(isTaskerEnabled(config({ connected: false }))).toBe(false);
  });
  it("sin config (sesión sin cargar) → false", () => {
    expect(isTaskerEnabled(null)).toBe(false);
    expect(isTaskerEnabled(undefined)).toBe(false);
  });
});

describe("filterTaskerMenu", () => {
  const item = (id: number, path: string, parentId: number | null = null) => ({
    id,
    parentId,
    order: id,
    name: `Item ${id}`,
    icon: "circle",
    path,
    type: "menu",
  });
  const tree: MenuTree[] = [
    { parent: item(1, "/punchinout"), children: [] },
    { parent: item(2, TASKER_REPORT_PATH), children: [] },
    {
      parent: item(3, ""),
      children: [item(31, TASKER_FOLLOWUP_PATH, 3), item(32, "/holidays", 3)],
    },
    { parent: item(4, ""), children: [item(41, TASKER_REPORT_PATH, 4)] },
  ];

  it("conectada → el árbol tal cual", () => {
    expect(filterTaskerMenu(tree, true)).toBe(tree);
  });
  it("no conectada → sin Reportar ni Seguimiento (padres, hijos y grupos que quedan vacíos)", () => {
    const result = filterTaskerMenu(tree, false);
    expect(result.map((s) => s.parent.id)).toEqual([1, 3]);
    expect(result[1].children.map((c) => c.id)).toEqual([32]);
  });
  it("las entradas temporales también son rutas de Tasker", () => {
    expect(filterTaskerMenu(TASKER_TEMP_MENU, false)).toEqual([]);
    expect(TASKER_TEMP_MENU.every((s) => isTaskerPath(s.parent.path))).toBe(true);
  });
});

// ─── Títulos y reglas ───────────────────────────────────────────────────────

describe("getTaskerReportTitle", () => {
  it("lleno → recortado", () => {
    expect(getTaskerReportTitle(config({ failureReportMenuLabel: "  Reportar Avería " }))).toBe(
      "Reportar Avería",
    );
  });
  it("vacío, solo espacios o null → 'Reportar Servicio'", () => {
    for (const failureReportMenuLabel of ["", "   ", null]) {
      expect(getTaskerReportTitle(config({ failureReportMenuLabel }))).toBe("Reportar Servicio");
    }
  });
  it("sin config → 'Reportar Servicio'", () => {
    expect(getTaskerReportTitle(null)).toBe("Reportar Servicio");
  });
  it("no usa failureReportLabel ni clientLabel", () => {
    expect(
      getTaskerReportTitle(config({ failureReportLabel: "Fallas", clientLabel: "Sede" })),
    ).toBe(
      "Reportar Servicio",
    );
  });
});

describe("getTaskerFaultLabel", () => {
  it("lleno → recortado", () => {
    expect(getTaskerFaultLabel(config({ failureReportLabel: " Tipo de avería  " }))).toBe(
      "Tipo de avería",
    );
  });
  it("vacío, solo espacios o null → 'Averías'", () => {
    for (const failureReportLabel of ["", "  ", null]) {
      expect(getTaskerFaultLabel(config({ failureReportLabel }))).toBe("Averías");
    }
  });
  it("sin config → 'Averías'; no usa failureReportMenuLabel", () => {
    expect(getTaskerFaultLabel(null)).toBe("Averías");
    expect(getTaskerFaultLabel(config({ failureReportMenuLabel: "Servicio" }))).toBe("Averías");
  });
});

describe("getTaskerClientLabel", () => {
  it("lleno → recortado", () => {
    expect(getTaskerClientLabel(config({ clientLabel: "  Sucursal " }))).toBe("Sucursal");
  });
  it("vacío, solo espacios o null → 'Cliente'", () => {
    for (const clientLabel of ["", "   ", null]) {
      expect(getTaskerClientLabel(config({ clientLabel }))).toBe("Cliente");
    }
  });
  it("sin config → 'Cliente'; no usa los otros labels", () => {
    expect(getTaskerClientLabel(null)).toBe("Cliente");
    expect(getTaskerClientLabel(config({ failureReportMenuLabel: "X", failureReportLabel: "Y" }))).toBe("Cliente");
  });
});

// ─── Campo de averías ───────────────────────────────────────────────────────

describe("formatSelectedFaultsSummary", () => {
  it("0 → null (placeholder)", () => {
    expect(formatSelectedFaultsSummary([])).toBeNull();
  });
  it("1 → el nombre", () => {
    expect(formatSelectedFaultsSummary(["Fuga de agua"])).toBe("Fuga de agua");
  });
  it("2 → separados por coma", () => {
    expect(formatSelectedFaultsSummary(["Fuga de agua", "Falla eléctrica"])).toBe(
      "Fuga de agua, Falla eléctrica",
    );
  });
  it("3 → 'A, B y 1 más'; 5 → 'A, B y 3 más'", () => {
    expect(formatSelectedFaultsSummary(["A", "B", "C"])).toBe("A, B y 1 más");
    expect(formatSelectedFaultsSummary(["A", "B", "C", "D", "E"])).toBe("A, B y 3 más");
  });
});

describe("getSelectedFaultNames", () => {
  const actions: TaskerFaultAction[] = [
    { id: 1, name: "Uno", clientId: null },
    { id: 2, name: "Dos", clientId: null },
    { id: 3, name: "Tres", clientId: 1 },
  ];
  it("en el orden de selección, no el del catálogo", () => {
    expect(getSelectedFaultNames([3, 1], actions)).toEqual(["Tres", "Uno"]);
  });
  it("ids sin catálogo se omiten", () => {
    expect(getSelectedFaultNames([9, 2], actions)).toEqual(["Dos"]);
  });
});

describe("getTaskerFormRules", () => {
  it("appliesFault true → averías visibles y obligatorias, descripción opcional", () => {
    expect(getTaskerFormRules(config({ appliesFault: true }))).toEqual({
      showFaults: true,
      faultsRequired: true,
      descriptionRequired: false,
    });
  });
  it("appliesFault false → sin averías, descripción obligatoria", () => {
    expect(getTaskerFormRules(config({ appliesFault: false }))).toEqual({
      showFaults: false,
      faultsRequired: false,
      descriptionRequired: true,
    });
  });
});

// ─── Averías ────────────────────────────────────────────────────────────────

describe("filterFaultActionsForClient (por clientId)", () => {
  const actions: TaskerFaultAction[] = [
    { id: 1, name: "Cliente 301 A", clientId: 301 },
    { id: 2, name: "Cliente 302", clientId: 302 },
    { id: 3, name: "General", clientId: null },
    { id: 4, name: "Cliente 301 B", clientId: 301 },
  ];

  it("las del cliente elegido y las generales (clientId null), en su orden", () => {
    expect(filterFaultActionsForClient(actions, 301).map((a) => a.id)).toEqual([1, 3, 4]);
    expect(filterFaultActionsForClient(actions, 302).map((a) => a.id)).toEqual([2, 3]);
  });
  it("cliente sin acciones propias → solo las generales", () => {
    expect(filterFaultActionsForClient(actions, 999).map((a) => a.id)).toEqual([3]);
  });
  it("sin cliente → solo las generales", () => {
    expect(filterFaultActionsForClient(actions, null).map((a) => a.id)).toEqual([3]);
    expect(filterFaultActionsForClient(actions, undefined).map((a) => a.id)).toEqual([3]);
  });
  it("catálogo vacío → vacío", () => {
    expect(filterFaultActionsForClient([], 301)).toEqual([]);
  });
  it("no usa categoryId aunque venga en el objeto", () => {
    const withCategory = [
      { id: 7, name: "Con categoría", clientId: null, categoryId: 5 },
    ] as unknown as TaskerFaultAction[];
    expect(filterFaultActionsForClient(withCategory, 301).map((a) => a.id)).toEqual([7]);
  });
});

describe("selección de averías", () => {
  it("toggleFaultSelection agrega y quita", () => {
    expect(toggleFaultSelection([], 5)).toEqual([5]);
    expect(toggleFaultSelection([5, 6], 5)).toEqual([6]);
  });
  it("pruneSelectedFaults deja solo las que siguen disponibles", () => {
    const available: TaskerFaultAction[] = [
      { id: 2, name: "B", clientId: null },
      { id: 3, name: "C", clientId: 1 },
    ];
    expect(pruneSelectedFaults([1, 2, 3], available)).toEqual([2, 3]);
    expect(pruneSelectedFaults([1], available)).toEqual([]);
  });
});

describe("getRemovedFaultsNotice", () => {
  it("varias → plural con el número", () => {
    expect(getRemovedFaultsNotice(3)).toBe(
      "Se quitaron 3 averías que no aplican al cliente seleccionado.",
    );
  });
  it("una → singular", () => {
    expect(getRemovedFaultsNotice(1)).toBe(
      "Se quitó 1 avería que no aplica al cliente seleccionado.",
    );
  });
  it("ninguna → sin aviso", () => {
    expect(getRemovedFaultsNotice(0)).toBeNull();
    expect(getRemovedFaultsNotice(-1)).toBeNull();
    expect(getRemovedFaultsNotice(Number.NaN)).toBeNull();
  });
  it("cuenta lo que quita pruneSelectedFaults al cambiar de cliente", () => {
    const actions: TaskerFaultAction[] = [
      { id: 1, name: "Cliente 1", clientId: 1 },
      { id: 2, name: "Cliente 2", clientId: 2 },
      { id: 3, name: "General", clientId: null },
    ];
    const selected = [1, 2, 3];
    const kept = pruneSelectedFaults(selected, filterFaultActionsForClient(actions, 2));
    expect(getRemovedFaultsNotice(selected.length - kept.length)).toBe(
      "Se quitó 1 avería que no aplica al cliente seleccionado.",
    );
  });
});

// ─── Dirección más cercana ──────────────────────────────────────────────────

describe("haversineMeters", () => {
  it("mismo punto → 0", () => {
    expect(haversineMeters(PIANTINI, PIANTINI)).toBe(0);
  });
  it("Piantini → El Millón ≈ 2 km", () => {
    const d = haversineMeters(PIANTINI, EL_MILLON);
    expect(d).toBeGreaterThan(1500);
    expect(d).toBeLessThan(2500);
  });
});

describe("pickNearestClientAddress", () => {
  it("sin clientes → null", () => {
    expect(pickNearestClientAddress([], PIANTINI)).toBeNull();
  });
  it("varios clientes: la más cercana de todas, aunque sea del segundo", () => {
    const clients = [
      client(1, [address(11, LOS_MINA.latitude, LOS_MINA.longitude)]),
      client(2, [
        address(21, EL_MILLON.latitude, EL_MILLON.longitude),
        address(22, PIANTINI.latitude + 0.001, PIANTINI.longitude),
      ]),
    ];
    const result = pickNearestClientAddress(clients, PIANTINI);
    expect(result?.clientId).toBe(2);
    expect(result?.addressId).toBe(22);
    expect(result?.distanceMeters).toBeGreaterThan(100);
    expect(result?.distanceMeters).toBeLessThan(120);
  });
  it("salta las direcciones sin coordenadas (null, vacías, fuera de rango)", () => {
    const clients = [
      client(1, [
        address(11, null, null),
        address(12, "", ""),
        address(13, 200, -69.9),
        address(14, LOS_MINA.latitude, LOS_MINA.longitude),
      ]),
    ];
    expect(pickNearestClientAddress(clients, PIANTINI)?.addressId).toBe(14);
  });
  it("acepta coordenadas como texto numérico", () => {
    const clients = [client(1, [address(11, "18.4706", "-69.9389")])];
    expect(pickNearestClientAddress(clients, PIANTINI)).toEqual({
      clientId: 1,
      addressId: 11,
      distanceMeters: 0,
    });
  });
  it("ninguna con coordenadas → primer cliente y su primera dirección, sin distancia", () => {
    const clients = [
      client(1, [address(11, null, null), address(12, null, null)]),
      client(2, [address(21, null, null)]),
    ];
    expect(pickNearestClientAddress(clients, PIANTINI)).toEqual({
      clientId: 1,
      addressId: 11,
      distanceMeters: null,
    });
  });
  it("sin posición → mismo respaldo", () => {
    const clients = [client(1, [address(11, PIANTINI.latitude, PIANTINI.longitude)])];
    expect(pickNearestClientAddress(clients, null)).toEqual({
      clientId: 1,
      addressId: 11,
      distanceMeters: null,
    });
  });
  it("primer cliente sin direcciones → addressId null", () => {
    expect(pickNearestClientAddress([client(1, [])], PIANTINI)).toEqual({
      clientId: 1,
      addressId: null,
      distanceMeters: null,
    });
  });
  it("empate → gana la primera (orden de clientes y de direcciones)", () => {
    const origin = { latitude: 0, longitude: 0 };
    const sameSpot = [
      client(1, [address(11, 0, 1)]),
      client(2, [address(21, 0, 1)]),
    ];
    expect(pickNearestClientAddress(sameSpot, origin)?.addressId).toBe(11);
    // Misma distancia, distinto punto (1° al norte y 1° al este del ecuador).
    const equidistant = [client(1, [address(11, 1, 0), address(12, 0, 1)])];
    expect(pickNearestClientAddress(equidistant, origin)?.addressId).toBe(11);
  });
});

describe("pickNearestClientAddress con un solo cliente", () => {
  const near = client(2, [address(21, PIANTINI.latitude, PIANTINI.longitude)]);
  const far = client(1, [
    address(11, LOS_MINA.latitude, LOS_MINA.longitude),
    address(12, EL_MILLON.latitude, EL_MILLON.longitude),
  ]);
  it("la más cercana de ESE cliente, aunque otro tenga una más cerca", () => {
    expect(pickNearestClientAddress([far], PIANTINI)?.addressId).toBe(12);
    expect(pickNearestClientAddress([far, near], PIANTINI)?.addressId).toBe(21);
  });
  it("sin coordenadas en sus direcciones → su primera, sin distancia", () => {
    const noCoords = client(3, [address(31, null, null), address(32, null, null)]);
    expect(pickNearestClientAddress([noCoords], PIANTINI)).toEqual({
      clientId: 3,
      addressId: 31,
      distanceMeters: null,
    });
  });
});

describe("formatDistanceAway", () => {
  it("menos de 1 km → metros redondeados", () => {
    expect(formatDistanceAway(0)).toBe("a 0 m");
    expect(formatDistanceAway(349.6)).toBe("a 350 m");
    expect(formatDistanceAway(999.4)).toBe("a 999 m");
  });
  it("desde 1 km → km con un decimal", () => {
    expect(formatDistanceAway(999.6)).toBe("a 1.0 km");
    expect(formatDistanceAway(1234)).toBe("a 1.2 km");
    expect(formatDistanceAway(1260)).toBe("a 1.3 km");
    expect(formatDistanceAway(15_400)).toBe("a 15.4 km");
  });
  it("inválida → null", () => {
    expect(formatDistanceAway(null)).toBeNull();
    expect(formatDistanceAway(undefined)).toBeNull();
    expect(formatDistanceAway(Number.NaN)).toBeNull();
    expect(formatDistanceAway(-5)).toBeNull();
  });
});

describe("getClientAddressHint", () => {
  const c = client(1, [
    address(11, EL_MILLON.latitude, EL_MILLON.longitude, "Sede El Millón"),
    address(12, PIANTINI.latitude + 0.003, PIANTINI.longitude, "Sede Piantini"),
    address(13, null, null, "Almacén"),
  ]);
  const recommended = pickNearestClientAddress([c], PIANTINI);

  it("la recomendada marcada → 'Más cercana' con su distancia", () => {
    const list = buildReportAddresses(c, [], recommended?.addressId ?? null);
    const hint = getClientAddressHint(list, recommended, PIANTINI);
    expect(hint?.caption).toBe("Más cercana");
    expect(hint?.address.id).toBe(12);
    expect(hint?.distanceLabel).toBe("a 334 m");
  });
  it("otra marcada → 'Dirección seleccionada' con la distancia de esa", () => {
    const list = toggleTaskerAddressSelected(buildReportAddresses(c, [], 12), 11);
    const hint = getClientAddressHint(list, recommended, PIANTINI);
    expect(hint?.caption).toBe("Dirección seleccionada");
    expect(hint?.address.id).toBe(11);
    expect(hint?.distanceLabel).toMatch(/^a \d\.\d km$/);
  });
  it("marcada sin coordenadas → sin distancia", () => {
    const list = buildReportAddresses(c, [], 13);
    expect(getClientAddressHint(list, recommended, PIANTINI)).toMatchObject({
      caption: "Dirección seleccionada",
      distanceLabel: null,
    });
  });
  it("recomendada sin distancia (ninguna con coordenadas) → no es 'Más cercana'", () => {
    const noCoords = client(3, [address(31, null, null)]);
    const rec = pickNearestClientAddress([noCoords], PIANTINI);
    const list = buildReportAddresses(noCoords, [], 31);
    expect(getClientAddressHint(list, rec, PIANTINI)?.caption).toBe("Dirección seleccionada");
  });
  it("una agregada marcada → 'Dirección seleccionada'", () => {
    const list = addTaskerAddress(buildReportAddresses(c, [], 12), address(0, 18.48, -69.94));
    expect(getClientAddressHint(list, recommended, PIANTINI)?.caption).toBe("Dirección seleccionada");
  });
  it("ninguna marcada → null", () => {
    expect(getClientAddressHint(buildReportAddresses(c, [], null), recommended, PIANTINI)).toBeNull();
  });
});

// ─── Orden de arranque ──────────────────────────────────────────────────────

describe("getReportGate", () => {
  const clients = [client(1, [address(11, 18.4, -69.9)])];
  const ok: ReportLocationState = { status: "ok", coords: PIANTINI };
  const pending: ReportLocationState = { status: "pending" };
  const failed: ReportLocationState = { status: "failed", canAskAgain: true };

  it("no conectada → unavailable, aunque haya clientes y posición", () => {
    expect(getReportGate({ config: config({ connected: false }), clients, location: ok })).toBe(
      "unavailable",
    );
    expect(getReportGate({ config: null, clients, location: ok })).toBe("unavailable");
  });
  it("conectada sin clientes → noClients, antes que la ubicación", () => {
    expect(getReportGate({ config: config(), clients: [], location: failed })).toBe("noClients");
    expect(getReportGate({ config: config(), clients: [], location: pending })).toBe("noClients");
  });
  it("buscando la posición → locating", () => {
    expect(getReportGate({ config: config(), clients, location: pending })).toBe("locating");
  });
  it("sin ubicación → noLocation", () => {
    expect(getReportGate({ config: config(), clients, location: failed })).toBe("noLocation");
    expect(
      getReportGate({
        config: config(),
        clients,
        location: { status: "failed", canAskAgain: false },
      }),
    ).toBe("noLocation");
  });
  it("todo en orden → ready", () => {
    expect(getReportGate({ config: config(), clients, location: ok })).toBe("ready");
  });
});

// ─── Direcciones: predeterminada (locked), resto del cliente y agregadas ────

const withDefault = (a: TaskerClientAddress): TaskerClientAddress => ({ ...a, isDefault: true });

describe("getDefaultClientAddressId", () => {
  it("la marcada con isDefault, aunque no sea la primera", () => {
    expect(getDefaultClientAddressId([address(1, null, null), withDefault(address(2, null, null))])).toBe(2);
  });
  it("sin marca → la primera", () => {
    expect(getDefaultClientAddressId([address(1, null, null), address(2, null, null)])).toBe(1);
  });
  it("sin direcciones → null", () => {
    expect(getDefaultClientAddressId([])).toBeNull();
  });
});

describe("direcciones del cliente y agregadas", () => {
  // Cliente A: predeterminada = 12 (marcada, segunda en el cliente). Cliente B: sin marca → 21.
  const clientA = client(1, [
    address(11, 18.4, -69.9),
    withDefault(address(12, null, null)),
    address(13, 18.45, -69.95),
  ]);
  const clientB = client(2, [address(21, 18.5, -69.8), address(22, 18.5, -69.8)]);
  const ids = (list: TaskerReportAddress[]) => list.map((a) => a.id);

  it("solo la predeterminada es locked y va primero; todas fromClient y sin marcar", () => {
    expect(
      buildReportAddresses(clientA, [], null).map((a) => [a.id, a.order, a.selected, a.locked, a.fromClient]),
    ).toEqual([
      [12, 1, false, true, true],
      [11, 2, false, false, true],
      [13, 3, false, false, true],
    ]);
  });
  it("sin marca → la primera es la locked", () => {
    expect(clientAddressesToReport(clientB.addresses).map((a) => a.locked)).toEqual([true, false]);
  });
  it("buildReportAddresses marca la elegida", () => {
    const list = buildReportAddresses(clientA, [], 13);
    expect(getSelectedTaskerAddress(list)?.id).toBe(13);
    expect(buildReportAddresses(clientA, [], null).some((a) => a.selected)).toBe(false);
  });
  it("addTaskerAddress: al final, locked: false, fromClient: false y marcada", () => {
    const list = addTaskerAddress(buildReportAddresses(clientA, [], 11), address(0, null, null));
    expect(list[list.length - 1]).toMatchObject({
      id: 14,
      order: 4,
      selected: true,
      locked: false,
      fromClient: false,
    });
  });

  it("agregar selecciona la nueva (y solo esa); la predeterminada sigue arriba", () => {
    const list = buildReportAddresses(clientA, [], 11);
    const added = addTaskerAddress(list, address(0, 18.47, -69.94));
    expect(getSelectedTaskerAddress(added)?.id).toBe(14);
    expect(added.filter((a) => a.selected)).toHaveLength(1);
    expect(added[0]).toMatchObject({ id: 12, locked: true });
  });
  it("editar NO cambia la selección (aunque el borrador traiga otra cosa)", () => {
    const list = buildReportAddresses(clientA, [], 11);
    const updated = updateTaskerAddress(list, { ...list[2], title: "X", selected: true });
    expect(getSelectedTaskerAddress(updated)?.id).toBe(11);
    expect(updated.filter((a) => a.selected)).toHaveLength(1);
  });

  it("la predeterminada no se edita ni se borra (misma referencia)", () => {
    const list = buildReportAddresses(clientA, [], 11);
    expect(updateTaskerAddress(list, { ...list[0], title: "Editada" })).toBe(list);
    expect(removeTaskerAddress(list, 12)).toBe(list);
  });
  it("update no puede desbloquear la predeterminada haciéndose pasar por otra", () => {
    const list = buildReportAddresses(clientA, [], 11);
    const forged: TaskerReportAddress = { ...list[0], title: "X", locked: false };
    expect(updateTaskerAddress(list, forged)).toBe(list);
  });
  it("una no predeterminada del cliente se edita: sigue fromClient, desbloqueada y en su lugar", () => {
    const list = buildReportAddresses(clientA, [], 11);
    const updated = updateTaskerAddress(list, { ...list[2], title: "Bodega", fromClient: false });
    expect(updated[2]).toMatchObject({ id: 13, title: "Bodega", locked: false, fromClient: true });
    expect(ids(updated)).toEqual([12, 11, 13]);
  });
  it("una no predeterminada del cliente se borra y se renumera", () => {
    const list = buildReportAddresses(clientA, [], 11);
    expect(removeTaskerAddress(list, 13).map((a) => [a.id, a.order])).toEqual([
      [12, 1],
      [11, 2],
    ]);
  });
  it("una agregada se edita y se borra como siempre", () => {
    const list = addTaskerAddress(buildReportAddresses(clientA, [], 11), address(0, null, null));
    const updated = updateTaskerAddress(list, { ...list[3], title: "Mía" });
    expect(updated[3]).toMatchObject({ id: 14, title: "Mía", locked: false, fromClient: false });
    expect(ids(removeTaskerAddress(list, 14))).toEqual([12, 11, 13]);
  });

  it("borrar la seleccionada → la selección pasa a la predeterminada", () => {
    const result = removeTaskerAddress(buildReportAddresses(clientA, [], 13), 13);
    expect(getSelectedTaskerAddress(result)?.id).toBe(12);
    expect(result.filter((a) => a.selected)).toHaveLength(1);
  });
  it("borrar una agregada seleccionada → también pasa a la predeterminada", () => {
    const list = addTaskerAddress(buildReportAddresses(clientA, [], 11), address(0, null, null));
    expect(getSelectedTaskerAddress(removeTaskerAddress(list, 14))?.id).toBe(12);
  });
  it("borrar una no seleccionada → la selección no cambia", () => {
    const list = buildReportAddresses(clientA, [], 11);
    expect(getSelectedTaskerAddress(removeTaskerAddress(list, 13))?.id).toBe(11);
  });

  it("cambio de cliente: las agregadas se conservan (renumeradas, debajo) y se marca la pedida", () => {
    const withAdded = addTaskerAddress(
      buildReportAddresses(clientA, [], 11),
      address(0, null, null, "Agregada"),
    );
    const switched = buildReportAddresses(clientB, withAdded, 22);
    expect(switched.map((a) => [a.id, a.order, a.locked, a.fromClient, a.title])).toEqual([
      [21, 1, true, true, "Dirección 21"],
      [22, 2, false, true, "Dirección 22"],
      [23, 3, false, false, "Agregada"],
    ]);
    expect(getSelectedTaskerAddress(switched)?.id).toBe(22);
    expect(new Set(ids(switched)).size).toBe(switched.length);
  });
  it("volver a un cliente: sus direcciones editadas o borradas vuelven al original", () => {
    let list = buildReportAddresses(clientA, [], 11);
    list = updateTaskerAddress(list, { ...list[1], title: "Editada" });
    list = removeTaskerAddress(list, 13);
    list = addTaskerAddress(list, address(0, null, null, "Agregada"));
    const back = buildReportAddresses(clientA, buildReportAddresses(clientB, list, 21), 11);
    expect(back.map((a) => [a.id, a.title, a.fromClient])).toEqual([
      [12, "Dirección 12", true],
      [11, "Dirección 11", true],
      [13, "Dirección 13", true],
      [14, "Agregada", false],
    ]);
  });
  it("nada se guarda en el cliente", () => {
    const before = JSON.stringify(clientA);
    let list = buildReportAddresses(clientA, [], 11);
    list = updateTaskerAddress(list, { ...list[1], title: "Editada" });
    list = removeTaskerAddress(list, 13);
    addTaskerAddress(list, address(0, null, null));
    expect(JSON.stringify(clientA)).toBe(before);
  });
  it("toggle sigue funcionando", () => {
    const list = buildReportAddresses(clientA, [], 11);
    expect(getSelectedTaskerAddress(toggleTaskerAddressSelected(list, 12))?.id).toBe(12);
  });
});

describe("sortTaskerAddresses", () => {
  const report = (
    id: number,
    order: number,
    over: Partial<TaskerReportAddress> = {},
  ): TaskerReportAddress => ({
    ...address(id, null, null),
    order,
    selected: false,
    locked: false,
    fromClient: false,
    ...over,
  });

  it("predeterminada primero; las demás en el orden en que entraron; order 1..N", () => {
    const list = [
      report(5, 1),
      report(6, 2),
      report(1, 3, { locked: true, fromClient: true }),
      report(7, 4),
    ];
    expect(sortTaskerAddresses(list).map((a) => [a.id, a.order])).toEqual([
      [1, 1],
      [5, 2],
      [6, 3],
      [7, 4],
    ]);
  });
  it("agregar varias no desplaza a la predeterminada", () => {
    const c = client(1, [withDefault(address(1, 18.4, -69.9))]);
    let list = buildReportAddresses(c, [], 1);
    for (let i = 0; i < 3; i += 1) list = addTaskerAddress(list, address(0, null, null, `Nueva ${i}`));
    expect(list.map((a) => a.title)).toEqual(["Dirección 1", "Nueva 0", "Nueva 1", "Nueva 2"]);
    expect(list[0].locked).toBe(true);
  });
  it("sin predeterminada marcada en el cliente → la primera, y queda arriba", () => {
    const c = client(1, [address(1, null, null), address(2, null, null)]);
    const list = addTaskerAddress(buildReportAddresses(c, [], null), address(0, null, null));
    expect(list.map((a) => [a.id, a.locked])).toEqual([
      [1, true],
      [2, false],
      [3, false],
    ]);
  });
  it("ya ordenada → mismas referencias", () => {
    const list = [report(1, 1, { locked: true }), report(2, 2)];
    const sorted = sortTaskerAddresses(list);
    expect(sorted[0]).toBe(list[0]);
    expect(sorted[1]).toBe(list[1]);
  });
  it("sin predeterminada en la lista → solo por order", () => {
    expect(sortTaskerAddresses([report(2, 2), report(1, 1)]).map((a) => a.id)).toEqual([1, 2]);
  });
});

describe("getNearestListAddressId ('Más cercana' sobre toda la lista)", () => {
  const c = client(1, [withDefault(address(1, EL_MILLON.latitude, EL_MILLON.longitude, "Predet."))]);

  it("una agregada más cercana que la predeterminada se lleva 'Más cercana'; la predeterminada sigue locked", () => {
    const list = addTaskerAddress(
      buildReportAddresses(c, [], 1),
      address(0, PIANTINI.latitude + 0.001, PIANTINI.longitude, "Agregada"),
    );
    expect(getNearestListAddressId(list, PIANTINI)).toBe(2);
    expect(list.find((a) => a.id === 1)?.locked).toBe(true);
    // La agregada queda seleccionada (por agregarla, no por ser la más cercana).
    expect(getSelectedTaskerAddress(list)?.id).toBe(2);
  });
  it("la predeterminada más cercana → coinciden las dos etiquetas", () => {
    const list = addTaskerAddress(
      buildReportAddresses(c, [], 1),
      address(0, LOS_MINA.latitude, LOS_MINA.longitude),
    );
    expect(getNearestListAddressId(list, EL_MILLON)).toBe(1);
  });
  it("se recalcula al cambiar la lista (borrar la más cercana)", () => {
    const list = addTaskerAddress(
      buildReportAddresses(c, [], 1),
      address(0, PIANTINI.latitude, PIANTINI.longitude),
    );
    expect(getNearestListAddressId(list, PIANTINI)).toBe(2);
    expect(getNearestListAddressId(removeTaskerAddress(list, 2), PIANTINI)).toBe(1);
  });
  it("sin coordenadas en la lista o sin posición → null; empate → la primera", () => {
    const noCoords = buildReportAddresses(client(2, [address(1, null, null)]), [], 1);
    expect(getNearestListAddressId(noCoords, PIANTINI)).toBeNull();
    expect(getNearestListAddressId(buildReportAddresses(c, [], 1), null)).toBeNull();
    const tie = addTaskerAddress(
      buildReportAddresses(c, [], 1),
      address(0, EL_MILLON.latitude, EL_MILLON.longitude),
    );
    expect(getNearestListAddressId(tie, PIANTINI)).toBe(1);
  });
});

// ─── Validación ─────────────────────────────────────────────────────────────

describe("validateReport", () => {
  const withFaults = getTaskerFormRules(config({ appliesFault: true }));
  const withoutFaults = getTaskerFormRules(config({ appliesFault: false }));
  const selected = buildReportAddresses(client(1, [address(11, null, null)]), [], 11);
  const none = buildReportAddresses(client(1, [address(11, null, null)]), [], null);

  it("appliesFault: sin averías → error de averías; la descripción no hace falta", () => {
    expect(
      validateReport({ faultIds: [], description: "", addresses: selected }, withFaults),
    ).toEqual({ faults: TASKER_FAULTS_REQUIRED_ERROR });
  });
  it("appliesFault: con averías y sin descripción → sin errores", () => {
    expect(
      validateReport({ faultIds: [501], description: "  ", addresses: selected }, withFaults),
    ).toEqual({});
  });
  it("sin appliesFault: sin descripción → error de descripción; las averías no se piden", () => {
    expect(
      validateReport({ faultIds: [], description: "   ", addresses: selected }, withoutFaults),
    ).toEqual({ description: TASKER_DESCRIPTION_REQUIRED_ERROR });
  });
  it("sin appliesFault: con descripción → sin errores", () => {
    expect(
      validateReport({ faultIds: [], description: "Falla", addresses: selected }, withoutFaults),
    ).toEqual({});
  });
  it("sin dirección seleccionada → error de dirección en ambos casos", () => {
    expect(
      validateReport({ faultIds: [], description: "", addresses: none }, withFaults),
    ).toEqual({ faults: TASKER_FAULTS_REQUIRED_ERROR, address: TASKER_ADDRESS_REQUIRED_ERROR });
    expect(
      validateReport({ faultIds: [], description: "", addresses: [] }, withoutFaults),
    ).toEqual({
      description: TASKER_DESCRIPTION_REQUIRED_ERROR,
      address: TASKER_ADDRESS_REQUIRED_ERROR,
    });
  });
  it("una agregada seleccionada también cuenta", () => {
    const list = addTaskerAddress(none, address(0, null, null));
    expect(validateReport({ faultIds: [1], description: "", addresses: list }, withFaults)).toEqual(
      {},
    );
  });
  it("texto del error de averías", () => {
    expect(TASKER_FAULTS_REQUIRED_ERROR).toBe("Seleccione al menos una avería");
  });
  it("ya no valida 'Tipo'", () => {
    const errors = validateReport({ faultIds: [1], description: "x", addresses: selected }, withFaults);
    expect(errors).not.toHaveProperty("typeId");
  });
});

// ─── Lectura de lo guardado ─────────────────────────────────────────────────

describe("parseStoredTaskerConfig", () => {
  it("válido → la config", () => {
    const stored = config({ failureReportMenuLabel: "Servicio", failureReportLabel: null });
    expect(parseStoredTaskerConfig(JSON.stringify(stored))).toEqual(stored);
  });
  it("ausente → null", () => {
    expect(parseStoredTaskerConfig(null)).toBeNull();
    expect(parseStoredTaskerConfig(undefined)).toBeNull();
  });
  it("JSON corrupto → null", () => {
    expect(parseStoredTaskerConfig("{connected: tru")).toBeNull();
    expect(parseStoredTaskerConfig("")).toBeNull();
  });
  it("forma rara → null (incluido un label que no es texto ni null)", () => {
    expect(parseStoredTaskerConfig("[]")).toBeNull();
    expect(parseStoredTaskerConfig(JSON.stringify({ ...config(), connected: "true" }))).toBeNull();
    expect(parseStoredTaskerConfig(JSON.stringify({ ...config(), failureReportLabel: 3 }))).toBeNull();
  });
  it("guardado con los nombres viejos (serviceLabel / faultLabel) → null (se recarga)", () => {
    const old = {
      connected: true,
      appliesFault: true,
      serviceLabel: "S",
      faultLabel: "F",
      clientLabel: null,
    };
    expect(parseStoredTaskerConfig(JSON.stringify(old))).toBeNull();
  });
  it("sin alguna de las claves nuevas → null", () => {
    for (const key of ["failureReportMenuLabel", "failureReportLabel", "clientLabel"] as const) {
      const partial: Record<string, unknown> = { ...config() };
      delete partial[key];
      expect(parseStoredTaskerConfig(JSON.stringify(partial))).toBeNull();
    }
  });
});

describe("parseStoredTaskerClients", () => {
  it("válido → los clientes", () => {
    const clients = [client(1, [address(1, 18.47, -69.93)]), client(2, [])];
    expect(parseStoredTaskerClients(JSON.stringify(clients))).toEqual(clients);
  });
  it("[] guardado es válido (usuario sin clientes)", () => {
    expect(parseStoredTaskerClients("[]")).toEqual([]);
  });
  it("ausente → null", () => {
    expect(parseStoredTaskerClients(null)).toBeNull();
  });
  it("JSON corrupto → null", () => {
    expect(parseStoredTaskerClients('[{"id":1,')).toBeNull();
  });
  it("algún cliente con forma rara → null", () => {
    expect(parseStoredTaskerClients(JSON.stringify({ id: 1 }))).toBeNull();
    expect(
      parseStoredTaskerClients(JSON.stringify([{ id: 1, name: "X", defaultAddress: null, addresses: [{}] }])),
    ).toBeNull();
  });
  it("forma de v2 (con categoryId y sin defaultAddress) → null", () => {
    expect(
      parseStoredTaskerClients(
        JSON.stringify([{ id: 1, name: "X", categoryId: null, addresses: [address(1, 1, 1)] }]),
      ),
    ).toBeNull();
  });
  it("defaultAddress sin id → null", () => {
    expect(
      parseStoredTaskerClients(
        JSON.stringify([{ id: 1, name: "X", defaultAddress: { title: "A" }, addresses: [] }]),
      ),
    ).toBeNull();
  });
});
