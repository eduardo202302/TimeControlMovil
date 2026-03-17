export interface MenuItem {
  id: number;
  parentId: number | null;
  order: number;
  name: string;
  icon: string;
  path: string;
  type: string;
  parent?: MenuItem | null;
}

export interface RoleItem {
  id: number;
  name: string;
  permissions: Record<string, unknown>;
  menu: number[];
}
