import axios from "axios";
import * as Storage from "../utils/storage";

/**
 * Tag del catálogo de la escuela (GET /tags/all). Shape confirmado contra
 * `face-class-api/plugins/database/models/Tags.js` — incluye los typos del
 * backend (`delet`, no "delete") a propósito, para no divergir del payload
 * real.
 */
export interface Tag {
  id: number;
  schoolId: number;
  categoryId: number;
  name: string;
  color: string | null;
  fontColor: string | null;
  settings: Record<string, unknown>;
  add: boolean;
  edit: boolean;
  delet: boolean;
  readonly: boolean;
  isUnique: boolean;
  description: string | null;
  category?: { id: number; name: string } | null;
  gotoTags?: Tag[];
}

interface GetTagsResponse {
  success: boolean;
  message: string;
  data: Tag[];
}

/** GET /tags/all — todos los tags de la escuela, sin filtrar por categoría. */
export const getTags = async (): Promise<Tag[]> => {
  try {
    const url = await Storage.getItemAsync("urlColegio");
    const token = await Storage.getItemAsync("token");

    const response = await axios.get<GetTagsResponse>(`${url}/tags/all`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data.data ?? [];
  } catch (error) {
    console.log("❌ Error al obtener tags:", error);
    return [];
  }
};
