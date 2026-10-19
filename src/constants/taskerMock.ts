// TEMPORAL (9-oct): datos fijos hasta que exista el puente en face-class-api.
// Único archivo a reemplazar al conectar.
//
// Las pantallas de Tasker (Reportar y Seguimiento) leen SOLO a través de las
// funciones de abajo, con la misma forma que devuelve Tasker hoy. Al conectar,
// cada función marcada TODO(puente) pasa a llamar al puente y nada más cambia.
//
// Config y clientes se leen al armar la sesión (login / cambio de empresa) y
// quedan en useSchoolStore + AsyncStorage (ver src/utils/taskerSession.ts).

import type { MenuTree } from "../../utils/resolveRoute";
import type {
  TaskerCompanyConfig,
  TaskerFaultAction,
  TaskerOpenTaskResponse,
  TaskerUserClient,
} from "../../types/typesTasker/TaskerTypes";
import { WARNING_ACCENT } from "./colors";

/** Estados terminales de Tasker: no se calcula tiempo en vivo. Confirmar al conectar. */
export const TASKER_STATE_COMPLETED = 5;
export const TASKER_STATE_CANCELLED = 6;

/**
 * Entradas del drawer mientras el backend no registre las rutas. El drawer
 * las omite en cuanto el menú real trae el mismo path, y las oculta (como las
 * del backend) si la compañía no está conectada a Tasker.
 */
export const TASKER_TEMP_MENU_ENABLED = true;

export const TASKER_TEMP_MENU: MenuTree[] = [
  {
    parent: {
      id: -9001,
      parentId: null,
      order: 9001,
      name: "Reportar Servicio",
      icon: "warning sign",
      path: "/reportfault",
      type: "menu",
    },
    children: [],
  },
  {
    parent: {
      id: -9002,
      parentId: null,
      order: 9002,
      name: "Seguimiento",
      icon: "tasks",
      path: "/followup",
      type: "menu",
    },
    children: [],
  },
];

// ─── Reportar (FASE B) ──────────────────────────────────────────────────────
// Interruptores para probar cada caso sin tocar nada más.

/** "Conectar Tasker" de la compañía. false = sin menú ni pantallas de Tasker. */
export const TASKER_MOCK_CONNECTED = true;
/** true = averías obligatorias y descripción opcional; false = al revés. */
export const TASKER_MOCK_APPLIES_FAULT = true;
/** Cuántos clientes tiene el usuario (0 = no puede reportar). */
export const TASKER_MOCK_CLIENT_COUNT: 0 | 1 | 2 = 2;
/** false = labels en null (se ven los títulos por defecto). */
export const TASKER_MOCK_LABELS_FILLED = false;

/**
 * Config de Tasker de la compañía activa.
 * Los labels usan los nombres de company.settings de Tasker:
 * failureReportMenuLabel, failureReportLabel y clientLabel.
 * TODO(puente): `connected` vendrá de face-class ("Conectar Tasker" de la
 * compañía) y `appliesFault` de Tasker; falta confirmar el nombre real de
 * ambos.
 * TODO(puente): `clientLabel` pendiente de confirmar en qué variable de Tasker
 * vive.
 */
export function getTaskerCompanyConfig(): TaskerCompanyConfig {
  return {
    connected: TASKER_MOCK_CONNECTED,
    appliesFault: TASKER_MOCK_APPLIES_FAULT,
    failureReportMenuLabel: TASKER_MOCK_LABELS_FILLED ? "Reportar Avería" : null,
    failureReportLabel: TASKER_MOCK_LABELS_FILLED ? "Tipo de avería" : null,
    clientLabel: TASKER_MOCK_LABELS_FILLED ? "Cliente atendido" : null,
  };
}

/** Categorías de cliente del ejemplo (los ids son de Tasker). */
const CATEGORY_CLINICS = 1;
const CATEGORY_RETAIL = 2;

const MOCK_CLIENTS: TaskerUserClient[] = [
  {
    id: 301,
    name: "Clínica Las Marías",
    categoryId: CATEGORY_CLINICS,
    addresses: [
      {
        id: 3011,
        title: "Sede El Millón",
        province: "D.N.",
        city: "Santo Domingo de Guzmán",
        sector: "El Millón",
        zone: "",
        street: "Calle Luis F. Thomén",
        streetNumber: "412",
        building: "",
        apartmentNumber: "",
        latitude: 18.4571092,
        longitude: -69.9524086,
        referenceToArrive: "",
        whoReceives: "",
        restrictions: "",
      },
      {
        // Predeterminada del cliente (no es la primera a propósito).
        id: 3012,
        isDefault: true,
        title: "Sede Naco",
        province: "D.N.",
        city: "Santo Domingo de Guzmán",
        sector: "Naco",
        zone: "",
        street: "Av. Tiradentes",
        streetNumber: "25",
        building: "Torre Médica Naco",
        apartmentNumber: "",
        latitude: 18.4775,
        longitude: -69.9273,
        referenceToArrive: "Frente a la plaza",
        whoReceives: "",
        restrictions: "",
      },
      {
        // Sin coordenadas: nunca puede salir como la más cercana.
        id: 3013,
        title: "Almacén Villa Juana",
        province: "D.N.",
        city: "Santo Domingo de Guzmán",
        sector: "Villa Juana",
        zone: "",
        street: "Calle Josefa Brea",
        streetNumber: "118",
        building: "",
        apartmentNumber: "",
        latitude: null,
        longitude: null,
        referenceToArrive: "",
        whoReceives: "",
        restrictions: "",
      },
    ],
  },
  {
    id: 302,
    name: "Supermercado Bravo Este",
    categoryId: null,
    addresses: [
      {
        id: 3021,
        title: "Sucursal Av. España",
        province: "Santo Domingo",
        city: "Santo Domingo Este",
        sector: "Ensanche Isabelita",
        zone: "",
        street: "Av. España",
        streetNumber: "80",
        building: "",
        apartmentNumber: "",
        latitude: 18.4752,
        longitude: -69.8608,
        referenceToArrive: "",
        whoReceives: "",
        restrictions: "",
      },
      {
        id: 3022,
        title: "Sucursal Los Mina",
        province: "Santo Domingo",
        city: "Santo Domingo Este",
        sector: "Los Mina",
        zone: "",
        street: "Av. San Vicente de Paúl",
        streetNumber: "15",
        building: "",
        apartmentNumber: "",
        latitude: 18.5005,
        longitude: -69.8597,
        referenceToArrive: "",
        whoReceives: "",
        restrictions: "",
      },
    ],
  },
];

/**
 * Clientes asignados al usuario en sesión, con sus direcciones. La
 * predeterminada va con `isDefault: true`; el segundo cliente no marca
 * ninguna (cae en su primera).
 * TODO(puente): vendrá de Tasker (clientes del usuario en la compañía activa).
 * TODO(puente): confirmar con Tasker cómo viene la predeterminada
 * (defaultAddress del cliente) y mapearla a `isDefault`.
 */
export function getTaskerUserClients(): TaskerUserClient[] {
  return MOCK_CLIENTS.slice(0, TASKER_MOCK_CLIENT_COUNT);
}

/**
 * Catálogo de averías (acciones de la tarea en Tasker). categoryId null =
 * aplica a cualquier cliente.
 * TODO(puente): vendrá de Tasker.
 */
export function getTaskerFaultActions(): TaskerFaultAction[] {
  return [
    { id: 501, name: "Equipo médico no enciende", categoryId: CATEGORY_CLINICS },
    { id: 502, name: "Fuga de gases medicinales", categoryId: CATEGORY_CLINICS },
    { id: 503, name: "Refrigerador de góndola sin frío", categoryId: CATEGORY_RETAIL },
    { id: 504, name: "Puerta automática atascada", categoryId: CATEGORY_RETAIL },
    { id: 505, name: "Falla eléctrica", categoryId: null },
    { id: 506, name: "Fuga de agua", categoryId: null },
    { id: 507, name: "Aire acondicionado no enfría", categoryId: null },
  ];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Antes de esta hora el ejemplo usa el día anterior: ninguna fecha queda en el futuro. */
const SAMPLE_DAY_START = { hour: 11, minute: 30 };

/**
 * Ticket abierto de ejemplo. Todas las fechas caen en un mismo día (el de
 * `now`, en hora local) y en horario de oficina:
 * Reportado 08:15:00 → Asignada 09:50:20 → Iniciada 10:48:35 (sigue abierta).
 * Iniciada lleva `time` fijo a propósito: así los tiempos van de mayor a
 * menor (Reportado > Asignada > Iniciada).
 */
export function getTaskerOpenTask(now: number = Date.now()): TaskerOpenTaskResponse {
  const today = new Date(now);
  const beforeStart =
    today.getHours() * 60 + today.getMinutes() <
    SAMPLE_DAY_START.hour * 60 + SAMPLE_DAY_START.minute;
  const day = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - (beforeStart ? 1 : 0),
  );
  /** "YYYY-MM-DDTHH:mm:ss" del día base, el mismo formato sin zona de Tasker. */
  const at = (time: string) =>
    `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}T${time}`;

  return {
    task: {
      id: 4045,
      createdDate: at("08:15:00"),
      action:
        "Falla en termostato central del ala este. No enfría adecuadamente la sala de recuperación.",
      stateId: 3,
      addUser: { id: 21, name: "Jeremy Domínguez" },
      assignedUser: { id: 22, name: "Jeremy Móvil" },
      client: { id: 301, name: "Clínica Las Marías", phone: "8095550100" },
      state: { id: 3, name: "Iniciada", color: WARNING_ACCENT },
      tags: [{ id: 41, name: "Clínica", category: { name: "Tipo de cliente" } }],
      address: {
        title: "Clínica Las Marías",
        province: "Distrito Nacional",
        city: "Santo Domingo",
        sector: "Sector Norte",
        zone: "",
        street: "Av. Las Marías",
        streetNumber: "104",
        building: "Edificio Médico",
        apartmentNumber: "",
        latitude: 18.4571092,
        longitude: -69.9524086,
        referenceToArrive: "Frente al Parque Central",
        whoReceives: "Recepción",
        restrictions: "",
      },
      comments: [],
      activities: [
        {
          id: 4,
          type: "assignedUser",
          action: "Responsable",
          message: "Jeremy Móvil",
          beginDate: at("09:50:20"),
          endDate: null,
          user: { name: "Jeremy Domínguez" },
          time: null,
          coordinates: null,
        },
        {
          id: 3,
          type: "state",
          action: "Iniciada",
          message: "",
          beginDate: at("10:48:35"),
          endDate: null,
          user: { name: "Jeremy Domínguez" },
          time: "22m 10s",
          coordinates: { latitude: 18.4571092, longitude: -69.9524086 },
        },
        {
          id: 2,
          type: "state",
          action: "Asignada",
          message: "a Jeremy Móvil",
          beginDate: at("09:50:20"),
          endDate: at("10:48:35"),
          user: { name: "Jeremy Domínguez" },
          time: "58m 15s",
          coordinates: null,
        },
        {
          id: 1,
          type: "state",
          action: "Reportado",
          message: "",
          beginDate: at("08:15:00"),
          endDate: at("09:50:20"),
          user: { name: "Jeremy Domínguez" },
          time: "1h 35m 20s",
          coordinates: null,
        },
      ],
    },
    settings: { companyName: "Empresa de ejemplo" },
  };
}
