import {
  buildMapsUrl,
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
  TASKER_STATE_CANCELLED,
  TASKER_STATE_COMPLETED,
} from "../../constants/taskerMock";
import type { CompanySettings } from "../../../types/typeStore/SchoolStoreType";
import type {
  TaskerActivity,
  TaskerAddress,
  TaskerComment,
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
