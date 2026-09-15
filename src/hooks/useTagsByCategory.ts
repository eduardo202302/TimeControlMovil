import { useEffect, useState } from "react";
import { getTags, type Tag } from "../api/getTags";

interface UseTagsByCategoryResult {
  tags: Tag[];
  loading: boolean;
  error: unknown;
}

/**
 * Tags de una categoría (p. ej. "Tipo de excusa"). Sin caché compartida a
 * propósito — mismo patrón que `useTagsByCategory` del webapp: cada
 * instancia pide `/tags/all` de nuevo y filtra client-side, así siempre ve
 * catálogo fresco sin necesitar invalidación.
 */
/**
 * Categoría de un tag. /tags/all expone la columna como `categoryId`, pero
 * algún handler responde con el grafo anidado (`category.id`) — se aceptan
 * las tres formas reales vistas en el código del webapp, igual que
 * userFormRules/usersRules.
 */
function tagCategoryId(tag: Tag): number | null {
  const wide = tag as Tag & {
    CategoryId?: number | null;
    category?: { id?: number | null } | null;
  };
  const raw = wide.categoryId ?? wide.CategoryId ?? wide.category?.id;
  return raw == null ? null : Number(raw);
}

export function useTagsByCategory(
  categoryId: number | null | undefined,
): UseTagsByCategoryResult {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (categoryId == null) {
      setTags([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getTags()
      .then((allTags) => {
        if (cancelled) return;
        setTags(allTags.filter((tag) => tagCategoryId(tag) === categoryId));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setTags([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  return { tags, loading, error };
}
