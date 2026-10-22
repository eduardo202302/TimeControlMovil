// TEMPORAL: lo único de Tasker que todavía no viene del backend. Reportar y
// Seguimiento ya leen datos reales (ver src/utils/taskerApi.ts).

import type { MenuTree } from "../../utils/resolveRoute";

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
