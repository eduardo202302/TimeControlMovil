// TEMPORAL (9-oct): datos fijos de Seguimiento hasta que exista su puente en
// face-class-api. Reportar ya lee datos reales (ver src/utils/taskerApi.ts).
//
// Seguimiento lee SOLO a través de getTaskerOpenTask, con la misma forma que
// devuelve Tasker hoy. Al conectar, pasa a llamar al puente y nada más cambia.

import type { MenuTree } from "../../utils/resolveRoute";
import type { TaskerOpenTaskResponse } from "../../types/typesTasker/TaskerTypes";
import { WARNING_ACCENT } from "./colors";

/** Estados terminales de Tasker: no se calcula tiempo en vivo. Confirmar al conectar. */
export const TASKER_STATE_COMPLETED = 5;
export const TASKER_STATE_CANCELLED = 6;

/**
 * Entradas del drawer mientras el backend no registre las rutas. El drawer
 * las muestra solo con taskerConfig.connected y las omite en cuanto el menú
 * real trae el mismo path.
 * TODO: quitar cuando el backend registre la ruta en el menú.
 */
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

// ─── Seguimiento ────────────────────────────────────────────────────────────

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
