/// <reference types="jest" />
import {
  getBreakTagCategoryId,
  readCategoryDefaultId,
  tagsOfCategory,
  type Tag,
} from "../punchRules";

describe("categoría de los motivos de break (fuente dinámica)", () => {
  const settingsWith = (catBreakTypeId: unknown) => ({
    categoryDefaultIds: { catBreakTypeId },
  });

  test("se lee de categoryDefaultIds.catBreakTypeId.value", () => {
    // Forma real que persiste el backend: { label, value }
    // (Schools/handlers.js:1562-1567).
    expect(
      getBreakTagCategoryId(
        settingsWith({ label: "Tipos de Break", value: 30 }),
      ),
    ).toBe(30);
  });

  test("el value en string se normaliza a número", () => {
    expect(
      getBreakTagCategoryId(settingsWith({ label: "X", value: "30" })),
    ).toBe(30);
  });

  test("también se acepta el número suelto (forma vieja)", () => {
    expect(getBreakTagCategoryId(settingsWith(30))).toBe(30);
  });

  test("NO cae a catPermTypeId — son categorías distintas", () => {
    // Mezclarlas ofrecería tipos de permiso como si fueran motivos de break.
    const settings = { categoryDefaultIds: { catPermTypeId: { value: 25 } } };
    expect(getBreakTagCategoryId(settings)).toBeUndefined();
  });

  test("sin configurar devuelve undefined, no un id inventado", () => {
    expect(getBreakTagCategoryId(settingsWith(undefined))).toBeUndefined();
    expect(getBreakTagCategoryId(settingsWith({ label: "X" }))).toBeUndefined();
    expect(getBreakTagCategoryId({})).toBeUndefined();
    expect(getBreakTagCategoryId(null)).toBeUndefined();
  });

  test("readCategoryDefaultId rechaza lo que no es un id", () => {
    expect(readCategoryDefaultId("  ")).toBeUndefined();
    expect(readCategoryDefaultId("abc")).toBeUndefined();
    expect(readCategoryDefaultId(NaN)).toBeUndefined();
  });
});

describe("tagsOfCategory", () => {
  const tags: Tag[] = [
    { id: 1, name: "Personal", category: { id: 25, name: "Tipo" } },
    { id: 2, name: "Café", category: { id: 30, name: "Tipos de Break" } },
    { id: 3, name: "Baño", category: { id: 30, name: "Tipos de Break" } },
    { id: 4, name: "Suelto" },
  ];

  test("filtra por el categoryId dinámico", () => {
    expect(tagsOfCategory(tags, 30).map((t) => t.id)).toEqual([2, 3]);
  });

  test("un categoryId de otra categoría no trae motivos de break", () => {
    expect(tagsOfCategory(tags, 25).map((t) => t.id)).toEqual([1]);
  });

  test("también matchea el categoryId plano del tag", () => {
    const flat = [{ id: 9, name: "Almuerzo", categoryId: 30 } as unknown as Tag];
    expect(tagsOfCategory(flat, 30).map((t) => t.id)).toEqual([9]);
  });

  test("sin categoría configurada NO devuelve nada — nunca el catálogo entero", () => {
    // El picker vacío es el resultado correcto: ofrecer todos los tags dejaría
    // elegir motivos que no son de break.
    expect(tagsOfCategory(tags, undefined)).toEqual([]);
    expect(tagsOfCategory(tags, null)).toEqual([]);
  });

  test("un id que no existe devuelve lista vacía", () => {
    expect(tagsOfCategory(tags, 999)).toEqual([]);
  });

  test("REGRESIÓN: el NOMBRE de la categoría ya no decide nada", () => {
    // El bug viejo (punchinout.tsx y adminpunchinout.tsx) filtraba por
    // `category.name === "Tipos de Break"`. Ese nombre es solo el `label` con
    // el que el backend siembra catBreakTypeId (Schools/handlers.js:1002-1004),
    // así que una categoría distinta que se llamara igual se colaba, y una
    // escuela que renombrara la suya se quedaba sin motivos.
    const trampa: Tag[] = [
      // Mismo nombre, categoryId AJENO: no debe aparecer.
      { id: 7, name: "Impostor", category: { id: 99, name: "Tipos de Break" } },
      // Categoría correcta con OTRO nombre: sí debe aparecer.
      { id: 8, name: "Café", category: { id: 30, name: "Pausas Activas" } },
    ];
    expect(tagsOfCategory(trampa, 30).map((t) => t.id)).toEqual([8]);
  });

  test("los dos ponchadores comparten el mismo filtro", () => {
    // punchinout.tsx (ponchador normal) y adminpunchinout.tsx (Ponche ADM)
    // llenan el MISMO campo `tagId` del mismo POST /punches: si divergieran en
    // cómo eligen la categoría, ofrecerían motivos distintos para lo mismo.
    const categoryId = getBreakTagCategoryId({
      categoryDefaultIds: { catBreakTypeId: { label: "Tipos de Break", value: 30 } },
    });
    expect(tagsOfCategory(tags, categoryId).map((t) => t.id)).toEqual([2, 3]);
  });
});
