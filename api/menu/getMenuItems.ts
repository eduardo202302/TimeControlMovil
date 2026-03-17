import axios from "axios";
import { MenuItem } from "../../types/typesMenu/MenuTypes";

interface MenuResponse {
  success: boolean;
  message: string;
  data: MenuItem[];
}

export async function getMenuItems(
  urlColegio: string,
  token: string,
): Promise<MenuItem[]> {
  try {
    const response = await axios.get<MenuResponse>(`${urlColegio}/menu/all`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.data.success) {
      return Array.isArray(response.data.data) ? response.data.data : [];
    }

    return [];
  } catch (error) {
    console.error("getMenuItems error:", error);
    return [];
  }
}
