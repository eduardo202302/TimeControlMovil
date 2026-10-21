import {
  addTaskerAddress,
  buildReportAddresses,
  clientAddressesToReport,
  collectAddressCandidates,
  filterFaultActionsForClient,
  filterTaskerMenu,
  getDefaultClientAddressId,
  getLocationOnVisit,
  getNearestElsewhereHint,
  getRemovedFaultsNotice,
  getReportGate,
  getSelectedTaskerAddress,
  formatAddressCandidatesTable,
  formatDistanceAway,
  formatSelectedFaultsSummary,
  getClientAddressHint,
  getSelectedFaultNames,
  getTaskerAddressDisplay,
  getTaskerClientLabel,
  getTaskerFaultLabel,
  getTaskerFormRules,
  getTaskerReportTitle,
  hasSharedCoordinatesAcrossClients,
  haversineMeters,
  isTaskerEnabled,
  isTaskerPath,
  parseStoredTaskerClients,
  parseStoredTaskerConfig,
  pickNearestAddressCandidate,
  pickNearestClientAddress,
  pruneSelectedFaults,
  removeTaskerAddress,
  selectTaskerAddress,
  sortTaskerAddresses,
  TASKER_ADDRESS_REQUIRED_ERROR,
  TASKER_DESCRIPTION_REQUIRED_ERROR,
  TASKER_FAULTS_REQUIRED_ERROR,
  TASKER_FOLLOWUP_PATH,
  TASKER_REPORT_PATH,
  TASKER_UNNAMED_ADDRESS,
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

const withDefault = (a: TaskerClientAddress): TaskerClientAddress => ({ ...a, isDefault: true });

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
  const nearestOf = (list: TaskerReportAddress[]) =>
    pickNearestAddressCandidate(
      collectAddressCandidates([c], PIANTINI, { clientId: 1, addresses: list }),
      1,
    );

  it("la más cercana marcada → 'Más cercana' con su distancia", () => {
    const list = buildReportAddresses(c, [], 12);
    const hint = getClientAddressHint(list, 1, nearestOf(list), PIANTINI);
    expect(hint?.caption).toBe("Más cercana");
    expect(hint?.address.id).toBe(12);
    expect(hint?.distanceLabel).toBe("a 334 m");
  });
  it("otra marcada → 'Seleccionada' con la distancia de esa", () => {
    const list = toggleTaskerAddressSelected(buildReportAddresses(c, [], 12), 11);
    const hint = getClientAddressHint(list, 1, nearestOf(list), PIANTINI);
    expect(hint?.caption).toBe("Seleccionada");
    expect(hint?.address.id).toBe(11);
    expect(hint?.distanceLabel).toMatch(/^a \d\.\d km$/);
  });
  it("marcada sin coordenadas → sin distancia", () => {
    const list = buildReportAddresses(c, [], 13);
    expect(getClientAddressHint(list, 1, nearestOf(list), PIANTINI)).toMatchObject({
      caption: "Seleccionada",
      distanceLabel: null,
    });
  });
  it("sin más cercana (ninguna con coordenadas) → no es 'Más cercana'", () => {
    const list = buildReportAddresses(client(3, [address(31, null, null)]), [], 31);
    expect(getClientAddressHint(list, 3, null, PIANTINI)?.caption).toBe("Seleccionada");
  });
  it("una agregada marcada que no es la más cercana → 'Seleccionada'", () => {
    const list = addTaskerAddress(buildReportAddresses(c, [], 12), address(0, 18.48, -69.94));
    expect(getClientAddressHint(list, 1, nearestOf(list), PIANTINI)?.caption).toBe(
      "Seleccionada",
    );
  });
  it("misma id pero la más cercana es de otro cliente → 'Seleccionada'", () => {
    const list = buildReportAddresses(c, [], 12);
    const other = { ...nearestOf(list)!, clientId: 2 };
    expect(getClientAddressHint(list, 1, other, PIANTINI)?.caption).toBe("Seleccionada");
  });
  it("ninguna marcada → null", () => {
    const list = buildReportAddresses(c, [], null);
    expect(getClientAddressHint(list, 1, nearestOf(list), PIANTINI)).toBeNull();
  });
});

// ─── Más cercana entre TODOS los clientes ───────────────────────────────────

describe("Más cercana global (collectAddressCandidates + pickNearestAddressCandidate)", () => {
  // Cliente 1: lejos (Los Mina, El Millón). Cliente 2: una a ~111 m de Piantini.
  const A = client(1, [
    withDefault(address(1, LOS_MINA.latitude, LOS_MINA.longitude, "Sede Los Mina")),
    address(2, EL_MILLON.latitude, EL_MILLON.longitude, "Sucursal El Millón"),
  ]);
  const B = client(2, [
    withDefault(address(1, LOS_MINA.latitude + 0.01, LOS_MINA.longitude, "Sede B")),
    address(2, PIANTINI.latitude + 0.001, PIANTINI.longitude, "Piantini B"),
    address(3, null, null, "Sin mapa"),
  ]);
  const reportOf = (c: TaskerUserClient, list: TaskerReportAddress[]) =>
    collectAddressCandidates([A, B], PIANTINI, { clientId: c.id, addresses: list });

  it("varios clientes con varias direcciones: gana la de todas, no la del primer cliente", () => {
    const nearest = pickNearestAddressCandidate(collectAddressCandidates([A, B], PIANTINI), null);
    expect(nearest).toMatchObject({ clientId: 2, addressId: 2, title: "Piantini B", added: false });
    expect(nearest?.distanceMeters).toBeGreaterThan(100);
    expect(nearest?.distanceMeters).toBeLessThan(120);
    // Con el cliente 1 abierto sigue ganando la del cliente 2.
    const list = buildReportAddresses(A, [], 1);
    expect(pickNearestAddressCandidate(reportOf(A, list), 1)?.clientId).toBe(2);
  });
  it("una no-predeterminada (de addresses[]) también compite y puede ganar", () => {
    const nearest = pickNearestAddressCandidate(collectAddressCandidates([A, B], PIANTINI), null);
    expect(nearest?.isDefault).toBe(false);
  });
  it("dirección agregada más cercana que todas: gana, se marca y queda seleccionada", () => {
    const list = addTaskerAddress(
      buildReportAddresses(A, [], 1),
      address(0, PIANTINI.latitude, PIANTINI.longitude, "Agregada"),
    );
    const nearest = pickNearestAddressCandidate(reportOf(A, list), 1);
    expect(nearest).toMatchObject({ clientId: 1, title: "Agregada", added: true, distanceMeters: 0 });
    expect(getSelectedTaskerAddress(list)?.id).toBe(nearest?.addressId);
    expect(getClientAddressHint(list, 1, nearest, PIANTINI)?.caption).toBe("Más cercana");
    expect(getNearestElsewhereHint(nearest, 1)).toBeNull();
    // La predeterminada sigue bloqueada.
    expect(list.find((a) => a.id === 1)?.locked).toBe(true);
  });
  it("agregada que no es la más cercana: compite pero no se lleva la etiqueta", () => {
    const list = addTaskerAddress(
      buildReportAddresses(A, [], 1),
      address(0, EL_MILLON.latitude + 0.001, EL_MILLON.longitude, "Agregada"),
    );
    const candidates = reportOf(A, list);
    expect(candidates.some((c) => c.added)).toBe(true);
    expect(pickNearestAddressCandidate(candidates, 1)?.title).toBe("Piantini B");
  });
  it("del cliente abierto cuenta su lista: lo borrado no compite", () => {
    const list = removeTaskerAddress(buildReportAddresses(A, [], 1), 2);
    expect(reportOf(A, list).filter((c) => c.clientId === 1).map((c) => c.addressId)).toEqual([1]);
  });
  it("sin coordenadas (null, vacías, fuera de rango) no entra", () => {
    const C = client(3, [
      address(1, null, null),
      address(2, "", ""),
      address(3, 200, -69.9),
      address(4, "18.4706", "-69.9389", "Texto numérico"),
    ]);
    const candidates = collectAddressCandidates([B, C], PIANTINI);
    expect(candidates.map((c) => `${c.clientId}:${c.addressId}`)).toEqual(["2:1", "2:2", "3:4"]);
    expect(collectAddressCandidates([client(4, [address(1, null, null)])], PIANTINI)).toEqual([]);
    expect(pickNearestAddressCandidate([], 1)).toBeNull();
  });
  it("sin posición → sin candidatas", () => {
    expect(collectAddressCandidates([A, B], null)).toEqual([]);
  });
  it("empate: gana la predeterminada del cliente ya seleccionado", () => {
    const origin = { latitude: 0, longitude: 0 };
    const c1 = client(1, [withDefault(address(1, 0, 1, "Uno"))]);
    const c2 = client(2, [withDefault(address(1, 0, 1, "Dos"))]);
    const candidates = collectAddressCandidates([c1, c2], origin);
    expect(pickNearestAddressCandidate(candidates, 2)?.clientId).toBe(2);
    expect(pickNearestAddressCandidate(candidates, 1)?.clientId).toBe(1);
  });
  it("empate sin predeterminada del seleccionado entre las empatadas → la primera en orden", () => {
    const origin = { latitude: 0, longitude: 0 };
    const c1 = client(1, [withDefault(address(1, 0, 1))]);
    const c2 = client(2, [withDefault(address(1, 5, 5)), address(2, 0, 1)]);
    const candidates = collectAddressCandidates([c1, c2], origin);
    // La empatada del cliente 2 no es su predeterminada.
    expect(pickNearestAddressCandidate(candidates, 2)).toMatchObject({ clientId: 1, addressId: 1 });
    // Sin cliente seleccionado (al abrir) → la primera.
    expect(pickNearestAddressCandidate(candidates, null)?.clientId).toBe(1);
    // Misma distancia, distinto punto, mismo cliente → la primera.
    const equidistant = client(3, [address(1, 1, 0), address(2, 0, 1)]);
    const tie = collectAddressCandidates([equidistant], origin);
    expect(pickNearestAddressCandidate(tie, null)?.addressId).toBe(1);
  });
});

describe("getNearestElsewhereHint (más cercana en otro cliente)", () => {
  const A = client(1, [withDefault(address(1, LOS_MINA.latitude, LOS_MINA.longitude, "Sede A"))]);
  const B = client(2, [
    withDefault(address(1, EL_MILLON.latitude, EL_MILLON.longitude, "Sede B")),
    address(2, PIANTINI.latitude + 0.001, PIANTINI.longitude, "Piantini B"),
  ]);

  it("se informa con su cliente, distancia y destino de 'Usar'", () => {
    const list = buildReportAddresses(A, [], 1);
    const nearest = pickNearestAddressCandidate(
      collectAddressCandidates([A, B], PIANTINI, { clientId: 1, addresses: list }),
      1,
    );
    expect(getNearestElsewhereHint(nearest, 1)).toEqual({
      clientId: 2,
      addressId: 2,
      label: "Más cercana: Cliente 2 · a 111 m",
    });
    // En el cliente abierto no hay etiqueta ni caption "Más cercana".
    expect(getClientAddressHint(list, 1, nearest, PIANTINI)?.caption).toBe("Seleccionada");
  });
  it("'Usar' (cliente + dirección) → pasa a ser la seleccionada y 'Más cercana'", () => {
    const list = buildReportAddresses(B, buildReportAddresses(A, [], 1), 2);
    const nearest = pickNearestAddressCandidate(
      collectAddressCandidates([A, B], PIANTINI, { clientId: 2, addresses: list }),
      2,
    );
    expect(getSelectedTaskerAddress(list)?.id).toBe(2);
    expect(getClientAddressHint(list, 2, nearest, PIANTINI)?.caption).toBe("Más cercana");
    expect(getNearestElsewhereHint(nearest, 2)).toBeNull();
  });
  it("sin el título de la dirección: solo cliente y distancia", () => {
    const nearest = pickNearestAddressCandidate(collectAddressCandidates([A, B], PIANTINI), 1);
    expect(getNearestElsewhereHint(nearest, 1)?.label).not.toContain("Piantini B");
  });
  it("sin más cercana → null", () => {
    expect(getNearestElsewhereHint(null, 1)).toBeNull();
  });
});

describe("diagnóstico de candidatas", () => {
  it("tabla: cliente · dirección · lat/lng a 4 decimales · km", () => {
    const c = client(1, [address(1, 18.470612345, -69.938987654, "Sede")]);
    const table = formatAddressCandidatesTable(collectAddressCandidates([c], PIANTINI));
    const [header, row] = table.split("\n");
    expect(header).toMatch(/^Cliente\s*· Dirección\s*· Lat\s*· Lng\s*· Km$/);
    expect(row).toContain("Cliente 1");
    expect(row).toContain("18.4706");
    expect(row).toContain("-69.9390");
    expect(row).toMatch(/0\.00\d$/);
  });
  it("coordenadas idénticas en clientes distintos → true; en el mismo cliente → false", () => {
    const same = (id: number, n = 1) =>
      client(id, Array.from({ length: n }, (_, i) => address(i + 1, 18.5, -69.9)));
    expect(hasSharedCoordinatesAcrossClients(collectAddressCandidates([same(1), same(2)], PIANTINI))).toBe(
      true,
    );
    expect(hasSharedCoordinatesAcrossClients(collectAddressCandidates([same(1, 2)], PIANTINI))).toBe(false);
    const distinct = [client(1, [address(1, 18.5, -69.9)]), client(2, [address(1, 18.5, -69.90001)])];
    expect(hasSharedCoordinatesAcrossClients(collectAddressCandidates(distinct, PIANTINI))).toBe(false);
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
  it("refrescando la posición con el formulario abierto → ready (sin coords)", () => {
    expect(
      getReportGate({ config: config(), clients, location: { status: "refreshing" } }),
    ).toBe("ready");
  });
});

describe("getLocationOnVisit (la posición no pasa de una visita a otra)", () => {
  it("con posición o refrescando → refreshing (sin coords)", () => {
    expect(getLocationOnVisit({ status: "ok", coords: PIANTINI })).toEqual({ status: "refreshing" });
    expect(getLocationOnVisit({ status: "refreshing" })).toEqual({ status: "refreshing" });
  });
  it("sin formulario (pending o failed) → pending", () => {
    expect(getLocationOnVisit({ status: "pending" })).toEqual({ status: "pending" });
    expect(getLocationOnVisit({ status: "failed", canAskAgain: false })).toEqual({ status: "pending" });
  });
});

// ─── Textos de direcciones con datos incompletos ────────────────────────────

describe("getTaskerAddressDisplay (título y calle de respaldo)", () => {
  const blank = {
    title: "",
    formattedAddress: "",
    address: "",
    street: "",
    streetNumber: "",
    sector: "",
    city: "",
    province: "",
  };
  it("title presente → ese título y la línea de calle", () => {
    expect(
      getTaskerAddressDisplay({ ...blank, title: "Sede", street: "Av. Lope", streetNumber: "5" }),
    ).toMatchObject({ title: "Sede", streetLine: "Av. Lope #5" });
  });
  it("sin title → formattedAddress → address", () => {
    const withFormatted = { ...blank, title: "  ", formattedAddress: "Av. Lope 5, Naco", address: "X" };
    expect(getTaskerAddressDisplay(withFormatted).title).toBe("Av. Lope 5, Naco");
    expect(getTaskerAddressDisplay({ ...blank, address: "Av. Lope 5, Santo Domingo" }).title).toBe(
      "Av. Lope 5, Santo Domingo",
    );
  });
  it("solo calle y número → 'Calle Número' de título, sin repetir la línea de calle", () => {
    expect(getTaskerAddressDisplay({ ...blank, street: "Av. Lope", streetNumber: "5" })).toMatchObject({
      title: "Av. Lope 5",
      streetLine: "",
    });
  });
  it("nada → 'Dirección sin nombre' y sin línea de calle", () => {
    expect(getTaskerAddressDisplay(blank)).toMatchObject({
      title: TASKER_UNNAMED_ADDRESS,
      streetLine: "",
    });
    expect(TASKER_UNNAMED_ADDRESS).toBe("Dirección sin nombre");
  });
  it("con título pero sin calle → la línea de calle vacía (se omite)", () => {
    expect(getTaskerAddressDisplay({ ...blank, title: "Sede", city: "Santiago" })).toMatchObject({
      title: "Sede",
      streetLine: "",
      areaLine: "Santiago",
    });
  });
  it("campos ausentes o null (datos de Taskr) → no rompe", () => {
    const partial = { title: null, street: undefined } as unknown as typeof blank;
    expect(getTaskerAddressDisplay(partial).title).toBe(TASKER_UNNAMED_ADDRESS);
  });
  it("es el título de la candidata (tabla de diagnóstico)", () => {
    const unnamed = {
      ...address(1, PIANTINI.latitude, PIANTINI.longitude),
      title: "",
      street: "",
      streetNumber: "",
    };
    const candidates = collectAddressCandidates([client(9, [unnamed])], PIANTINI);
    const nearest = pickNearestAddressCandidate(candidates, null);
    expect(nearest?.title).toBe(TASKER_UNNAMED_ADDRESS);
  });
});

// ─── Direcciones: predeterminada (locked), resto del cliente y agregadas ────

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

describe("selectTaskerAddress", () => {
  const list = buildReportAddresses(client(1, [address(1, null, null), address(2, null, null)]), [], 1);
  it("marca solo esa (sin alternar: si ya estaba marcada, sigue)", () => {
    expect(selectTaskerAddress(list, 2).map((a) => a.selected)).toEqual([false, true]);
    expect(selectTaskerAddress(list, 1).map((a) => a.selected)).toEqual([true, false]);
  });
  it("las que no cambian conservan la referencia", () => {
    expect(selectTaskerAddress(list, 1)[1]).toBe(list[1]);
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
