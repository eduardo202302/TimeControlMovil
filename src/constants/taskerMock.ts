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
    attachments: [
      { id: 1, name: "tablero_falla.jpg", kind: "image" },
      { id: 2, name: "bomba_fuga.png", kind: "image" },
    ],
  };
}

export function getTaskerOpenTask(): TaskerOpenTaskResponse {
  return {
    task: {
      id: 4045,
      createdDate: "2026-10-06T09:58:11",
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
          createdDate: "2026-10-07T11:15:42",
          comment:
            "Contacto establecido con el supervisor en planta. Se coordinó inspección de rutina en el tablero secundario.",
          images: ["comentarios/4045/adjunto-1.jpg"],
        },
      ],
      activities: [
        {
          id: 4,
          type: "assignedUser",
          action: "Responsable",
          message: "Jeremy Móvil",
          beginDate: "2026-10-06T09:58:11",
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
          beginDate: "2026-10-07T11:06:15",
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
          beginDate: "2026-10-06T09:58:11",
          endDate: "2026-10-07T11:06:15",
          user: { name: "Jeremy Domínguez" },
          time: "1d 1h 8m 4s",
          coordinates: null,
        },
        {
          id: 1,
          type: "state",
          action: "Pendiente",
          message: "",
          beginDate: "2026-10-06T09:58:11",
          endDate: "2026-10-06T09:58:11",
          user: { name: "Jeremy Domínguez" },
          time: "0s",
          coordinates: null,
        },
      ],
    },
    settings: { companyName: "Empresa de ejemplo" },
  };
}
