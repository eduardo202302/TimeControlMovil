import { MenuItem, RoleItem } from "../types/typesMenu/MenuTypes";

const TIME_CONTROL_ROLE_IDS = [10, 2];

export type AppType = "timecontrol" | "faceclass";

export interface MenuTree {
  parent: MenuItem;
  children: MenuItem[];
}

export interface RouteResolution {
  app: AppType;
  initialPath: string;
  allowedItems: MenuItem[];
  menuTree: MenuTree[];
}

export function resolveRoute(
  roleId: number,
  role: RoleItem,
  menuItems: MenuItem[],
): RouteResolution {
  const app: AppType = TIME_CONTROL_ROLE_IDS.includes(roleId)
    ? "timecontrol"
    : "faceclass";

  // Aplanar todos los items incluyendo los que están en subMenu
  const allItems: MenuItem[] = [];
  menuItems.forEach((item) => {
    allItems.push(item);
    const subMenu = (item as any).subMenu ?? [];
    subMenu.forEach((child: any) => allItems.push(child));
  });

  // Filtrar por los IDs permitidos del rol
  const allowedIds = role.menu;
  const allowedItems = allItems
    .filter((item) => allowedIds.includes(item.id))
    .sort((a, b) => a.order - b.order);

  // Buscar padres de los items permitidos para incluirlos en el árbol
  const parentIds = new Set(
    allowedItems
      .map((i) => i.parentId)
      .filter((id): id is number => id !== null),
  );

  const allowedParents = menuItems.filter((i) => parentIds.has(i.id));

  // Primer item navegable
  const rootItem =
    allowedItems.find((i) => i.parentId === null) ?? allowedItems[0] ?? null;
  const initialPath = rootItem?.path ?? "/unauthorized";

  const menuTree = buildMenuTree(allowedItems, allowedParents);

  return { app, initialPath, allowedItems, menuTree };
}

function buildMenuTree(
  allowedItems: MenuItem[],
  allowedParents: MenuItem[],
): MenuTree[] {
  const result: MenuTree[] = [];

  // Items raíz que el rol puede ver directamente
  const rootAllowed = allowedItems.filter((i) => i.parentId === null);
  rootAllowed.forEach((parent) => {
    const subMenu = (parent as any).subMenu ?? [];
    const children = subMenu.filter((s: any) =>
      allowedItems.some((a) => a.id === s.id),
    );
    result.push({ parent, children });
  });

  // Padres que no están en el rol pero tienen hijos permitidos
  allowedParents.forEach((parent) => {
    const alreadyAdded = result.some((r) => r.parent.id === parent.id);
    if (alreadyAdded) return;

    const subMenu = (parent as any).subMenu ?? [];
    const children = subMenu.filter((s: any) =>
      allowedItems.some((a) => a.id === s.id),
    );

    if (children.length > 0) {
      result.push({ parent, children });
    }
  });

  return result.sort((a, b) => a.parent.order - b.parent.order);
}
