/// <reference types="jest" />
import { buildCompanySettings } from "../../../store/useSchoolStore";

// SecureStore en memoria — el real necesita react-native (lo importa el store).
jest.mock("../storage", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

describe("buildCompanySettings — forma del resultado", () => {
  it("raw que no es objeto → null (no pisa el valor previo)", () => {
    expect(buildCompanySettings(null)).toBeNull();
    expect(buildCompanySettings("x")).toBeNull();
  });

  it("objeto completo: solo las claves de CompanySettings", () => {
    expect(
      buildCompanySettings({
        categoryDefaultIds: { a: 1 },
        schedulesAdd: [],
        entryTime: "08:00",
        exitTime: "17:00",
        daysLateAbsence: 4,
        tardinessMode: "Manual",
        attendanceMode: "Docente",
        otraClave: "se ignora",
      }),
    ).toEqual({
      categoryDefaultIds: { a: 1 },
      schedulesAdd: [],
      entryTime: "08:00",
      exitTime: "17:00",
      daysLateAbsence: 4,
      tardinessMode: "Manual",
      attendanceMode: "Docente",
      showListNumber: false,
    });
  });

  it("Tasker ya no sale de school.settings: serviceNameLabel / isDescriptionRequired se ignoran", () => {
    const result = buildCompanySettings({ serviceNameLabel: "Área", isDescriptionRequired: false });
    expect(result).not.toHaveProperty("serviceNameLabel");
    expect(result).not.toHaveProperty("isDescriptionRequired");
  });
});

describe("buildCompanySettings — showListNumber (Nº de lista en Asistencia)", () => {
  it("solo un true real lo activa; default false como el webapp", () => {
    expect(buildCompanySettings({ showListNumber: true })?.showListNumber).toBe(true);
    expect(buildCompanySettings({ showListNumber: false })?.showListNumber).toBe(false);
    expect(buildCompanySettings({})?.showListNumber).toBe(false);
    expect(buildCompanySettings({ showListNumber: "true" })?.showListNumber).toBe(false);
  });
});
