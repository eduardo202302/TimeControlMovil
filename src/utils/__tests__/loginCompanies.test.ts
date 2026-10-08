// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import { filterActiveSchoolUsers } from "../loginCompanies";

type Row = { id: number; schoolId: number; isActive?: boolean };

const ikompras: Row = { id: 10, schoolId: 1, isActive: false };
const bancaReal: Row = { id: 20, schoolId: 2, isActive: true };
const otra: Row = { id: 30, schoolId: 3, isActive: true };

describe("filterActiveSchoolUsers", () => {
  it("con activos e inactivos mezclados deja solo los activos, en el mismo orden", () => {
    expect(filterActiveSchoolUsers([ikompras, bancaReal])).toEqual([bancaReal]);
    expect(
      filterActiveSchoolUsers([bancaReal, ikompras, otra]),
    ).toEqual([bancaReal, otra]);
  });

  it("si todos están inactivos devuelve una lista vacía", () => {
    expect(
      filterActiveSchoolUsers([ikompras, { ...otra, isActive: false }]),
    ).toEqual([]);
  });

  it("isActive ausente cuenta como activo", () => {
    const sinFlag: Row = { id: 40, schoolId: 4 };
    expect(filterActiveSchoolUsers([sinFlag, ikompras])).toEqual([sinFlag]);
  });

  it("todos activos: la lista queda igual", () => {
    expect(filterActiveSchoolUsers([bancaReal, otra])).toEqual([bancaReal, otra]);
  });

  it("sin lista (null, undefined, no-array) devuelve []", () => {
    expect(filterActiveSchoolUsers(null)).toEqual([]);
    expect(filterActiveSchoolUsers(undefined)).toEqual([]);
    expect(filterActiveSchoolUsers({} as unknown as Row[])).toEqual([]);
  });

  it("no muta la lista original", () => {
    const list = [ikompras, bancaReal];
    filterActiveSchoolUsers(list);
    expect(list).toEqual([ikompras, bancaReal]);
  });
});
