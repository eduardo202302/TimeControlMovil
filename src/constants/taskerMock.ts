// TEMPORAL (9-oct): datos fijos hasta que exista el puente en face-class-api.
// Único archivo a reemplazar al conectar.
//
// Las pantallas de Tasker (Reportar Avería y Seguimiento) leen SOLO a través
// de las funciones de abajo, con la misma forma que devuelve Tasker hoy. Al
// conectar, cada función pasa a llamar al puente y nada más cambia.
//
// La config de Reportar Avería (serviceNameLabel / isDescriptionRequired) ya
// NO es dato fijo: sale de school.settings vía companySettings
// (resolveTaskerReportConfig en src/utils/taskerRules.ts).

import type { MenuTree } from "../../utils/resolveRoute";
import type {
  TaskerOpenTaskResponse,
  TaskerReportContext,
  TaskerTypeTag,
} from "../../types/typesTasker/TaskerTypes";
import {
  ACCENT_SKY,
  ACCENT_TEAL,
  ACCENT_VIOLET,
  WARNING_ACCENT,
} from "./colors";

/** Estados terminales de Tasker: no se calcula tiempo en vivo. Confirmar al conectar. */
export const TASKER_STATE_COMPLETED = 5;
export const TASKER_STATE_CANCELLED = 6;

/**
 * Entradas del drawer mientras el backend no registre las rutas. El drawer
 * las omite en cuanto el menú real trae el mismo path.
 */
export const TASKER_TEMP_MENU_ENABLED = true;

export const TASKER_TEMP_MENU: MenuTree[] = [
  {
    parent: {
      id: -9001,
      parentId: null,
      order: 9001,
      name: "Reportar Avería",
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

// Los colores de tipos y estados llegan del backend como hex; acá se toman de
// los tokens que tienen ese mismo valor.
export function getTaskerTypeTags(): TaskerTypeTag[] {
  return [
    { id: 11, name: "Climatización", color: ACCENT_SKY },
    { id: 12, name: "Electricidad", color: WARNING_ACCENT },
    { id: 13, name: "Plomería", color: ACCENT_TEAL },
    { id: 14, name: "Equipos médicos", color: ACCENT_VIOLET },
  ];
}

export function getTaskerReportContext(): TaskerReportContext {
  return {
    client: {
      id: 301,
      name: "Clínica Las Marías",
      phone: "8095550100",
      typeName: "Clínica",
    },
    reporter: { id: 21, name: "Jeremy Domínguez" },
    addresses: [
      {
        id: 1,
        order: 1,
        // Única dirección de ejemplo: va marcada como principal.
        selected: true,
        title: "El Millón",
        province: "D.N.",
        city: "Santo Domingo de Guzmán",
        sector: "Sector El Millón",
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
    ],
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DDTHH:mm:ss" en hora local, el mismo formato sin zona de Tasker. */
function toTaskerLocalIso(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

const duration = (d: number, h: number, m: number, s: number) =>
  (((d * 24 + h) * 60 + m) * 60 + s) * 1000;

/**
 * Ticket abierto de ejemplo. Las fechas se arman hacia atrás desde `now`, así
 * los tiempos que se calculan (Transcurrido, Iniciada) no crecen con los días:
 * Pendiente 5m 49s → Asignada 1d 1h 2m 15s → Iniciada 7h 5m 33s (sigue abierta).
 */
export function getTaskerOpenTask(now: number = Date.now()): TaskerOpenTaskResponse {
  const nowSec = Math.floor(now / 1000) * 1000;
  const startedBegin = nowSec - duration(0, 7, 5, 33);
  const assignedBegin = startedBegin - duration(1, 1, 2, 15);
  const pendingBegin = assignedBegin - duration(0, 0, 5, 49);

  return {
    task: {
      id: 4045,
      createdDate: toTaskerLocalIso(pendingBegin),
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
      comments: [
        {
          id: 1,
          addUser: { name: "Jeremy Domínguez" },
          createdDate: toTaskerLocalIso(startedBegin + duration(0, 0, 9, 27)),
          comment:
            "Contacto establecido con el supervisor en planta. Se coordinó inspección de rutina en el tablero secundario.",
          images: ["comentarios/4045/adjunto-1.jpg"],
        },
        {
          id: 2,
          addUser: { name: "Jeremy Móvil" },
          createdDate: toTaskerLocalIso(pendingBegin + duration(0, 0, 20, 0)),
          comment: "Se recibió el reporte. Técnico asignado para la visita.",
          images: [],
        },
      ],
      activities: [
        {
          id: 4,
          type: "assignedUser",
          action: "Responsable",
          message: "Jeremy Móvil",
          beginDate: toTaskerLocalIso(assignedBegin),
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
          beginDate: toTaskerLocalIso(startedBegin),
          endDate: null,
          user: { name: "Jeremy Domínguez" },
          time: null,
          coordinates: { latitude: 18.4571092, longitude: -69.9524086 },
        },
        {
          id: 2,
          type: "state",
          action: "Asignada",
          message: "a Jeremy Móvil",
          beginDate: toTaskerLocalIso(assignedBegin),
          endDate: toTaskerLocalIso(startedBegin),
          user: { name: "Jeremy Domínguez" },
          time: "1d 1h 2m 15s",
          coordinates: null,
        },
        {
          id: 1,
          type: "state",
          action: "Pendiente",
          message: "",
          beginDate: toTaskerLocalIso(pendingBegin),
          endDate: toTaskerLocalIso(assignedBegin),
          user: { name: "Jeremy Domínguez" },
          time: "5m 49s",
          coordinates: null,
        },
      ],
    },
    settings: { companyName: "Empresa de ejemplo" },
  };
}
