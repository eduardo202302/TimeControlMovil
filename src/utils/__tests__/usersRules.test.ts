// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import axios from "axios";
import {
  buildUserFields,
  displayCedula,
  displayPhone,
  fetchUsers,
  getUserCategories,
  selectUserCategories,
  userTagNamesForCategory,
  USERS_ROWS,
  type UserCategory,
} from "../usersRules";

jest.mock("axios");

const mockedGet = axios.get as unknown as jest.Mock;

const URL = "https://timecontrol.example.net:8600";
const TOKEN = "jwt.token.here";

const category = (id: number, order: number | null, ShowInUser = true): UserCategory => ({
  id,
  name: `Cat ${id}`,
  order,
  ShowInUser,
});

beforeEach(() => {
  mockedGet.mockReset();
});

describe("selectUserCategories", () => {
  it("filtra ShowInUser === true y ordena por order con null al final", () => {
    const result = selectUserCategories([
      category(1, null),
      category(2, 3),
      category(3, 1, false),
      category(4, 1),
      { id: 5, name: "x", order: 0, ShowInUser: null },
    ]);
    expect(result.map((c) => c.id)).toEqual([4, 2, 1]);
  });

  it("acepta el envelope { items } y basura sin romper", () => {
    expect(selectUserCategories({ items: [category(7, 2)] }).map((c) => c.id)).toEqual([7]);
    expect(selectUserCategories(null)).toEqual([]);
  });
});

describe("buildUserFields", () => {
  it("un tags.name por categoría, en notación de punto", () => {
    expect(buildUserFields([category(1, 1), category(2, 2)])).toBe(
      "id,tags.name,tags.name,role.name,user.fullName,isActive,user.nickName,user.cedula,user.phone,user.waId,user.email,code",
    );
  });

  it("sin categorías no manda tags.name", () => {
    expect(buildUserFields([])).not.toContain("tags");
    expect(buildUserFields([])).not.toContain(":");
  });
});

describe("userTagNamesForCategory", () => {
  it("agrupa por categoryId / CategoryId / category.id", () => {
    const tags = [
      { name: "Sucursal A", categoryId: 1 },
      { name: "Sucursal B", CategoryId: 1 },
      { name: "Ventas", category: { id: 2 } },
      { name: "", categoryId: 1 },
    ];
    expect(userTagNamesForCategory(tags, 1)).toEqual(["Sucursal A", "Sucursal B"]);
    expect(userTagNamesForCategory(tags, 2)).toEqual(["Ventas"]);
    expect(userTagNamesForCategory(null, 1)).toEqual([]);
  });
});

describe("displayPhone / displayCedula", () => {
  it("mismos formatos que Utils/formats.js del webapp", () => {
    expect(displayPhone("8095551234")).toBe("(809) 555-1234");
    expect(displayPhone("18095551234")).toBe("1 (809) 555-1234");
    expect(displayPhone("555")).toBe("555");
    expect(displayPhone(null)).toBe("");
    expect(displayCedula("00112345678")).toBe("001-1234567-8");
    expect(displayCedula("123456789")).toBe("123-45678-9");
    expect(displayCedula(undefined)).toBe("");
  });
});

describe("getUserCategories", () => {
  it("pega a GET /categories/all y devuelve solo las visibles", async () => {
    mockedGet.mockResolvedValue({
      data: { success: true, data: [category(1, 2), category(2, 1, false)] },
    });
    const result = await getUserCategories({ token: TOKEN, urlColegio: URL });
    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/categories/all`);
    expect(mockedGet.mock.calls[0][1].headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(result.map((c) => c.id)).toEqual([1]);
  });
});

describe("fetchUsers", () => {
  const body = (items: unknown[], count?: number) => ({
    data: { success: true, data: { items, count: count ?? items.length } },
  });

  it("params por defecto, con fields armado de las categorías recibidas", async () => {
    mockedGet.mockResolvedValue(body([]));

    await fetchUsers({ token: TOKEN, urlColegio: URL, categories: [category(1, 1)] });

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/users`);
    expect(mockedGet.mock.calls[0][1].params).toEqual({
      page: 1,
      rows: USERS_ROWS,
      orderKey: "id",
      orderDir: "desc",
      fields: buildUserFields([category(1, 1)]),
      isActive: "1",
    });
  });

  it("sin categorías las pide a /categories/all antes de /users", async () => {
    mockedGet
      .mockResolvedValueOnce({ data: { success: true, data: [category(3, 1), category(4, 2)] } })
      .mockResolvedValueOnce(body([]));

    await fetchUsers({ token: TOKEN, urlColegio: URL });

    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/categories/all`);
    expect(mockedGet.mock.calls[1][1].params.fields).toBe(
      buildUserFields([category(3, 1), category(4, 2)]),
    );
  });

  it('isActive "0" viaja tal cual, "all" no se manda; search va en `all` recortado', async () => {
    mockedGet.mockResolvedValue(body([]));

    await fetchUsers({ token: TOKEN, urlColegio: URL, categories: [], isActive: "0" });
    expect(mockedGet.mock.calls[0][1].params.isActive).toBe("0");
    expect(mockedGet.mock.calls[0][1].params).not.toHaveProperty("all");

    await fetchUsers({
      token: TOKEN,
      urlColegio: URL,
      categories: [],
      isActive: "all",
      search: "  juan ",
    });
    expect(mockedGet.mock.calls[1][1].params).not.toHaveProperty("isActive");
    expect(mockedGet.mock.calls[1][1].params.all).toBe("juan");
  });

  it("hasMore: página llena y count mayor a lo leído", async () => {
    const full = Array.from({ length: USERS_ROWS }, (_, i) => ({ id: i + 1, isActive: true }));

    mockedGet.mockResolvedValueOnce(body(full, USERS_ROWS * 2));
    const first = await fetchUsers({ token: TOKEN, urlColegio: URL, categories: [] });
    expect(first).toMatchObject({ count: USERS_ROWS * 2, hasMore: true });

    mockedGet.mockResolvedValueOnce(body(full, USERS_ROWS * 2));
    const second = await fetchUsers({ token: TOKEN, urlColegio: URL, categories: [], page: 2 });
    expect(second.hasMore).toBe(false);
  });

  it("success false devuelve vacío", async () => {
    mockedGet.mockResolvedValue({ data: { success: false } });
    expect(await fetchUsers({ token: TOKEN, urlColegio: URL, categories: [] })).toEqual({
      items: [],
      count: null,
      hasMore: false,
    });
  });
});
