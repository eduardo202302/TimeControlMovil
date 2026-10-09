/// <reference types="jest" />
import { buildCompanySettings } from "../../../store/useSchoolStore";
import {
  TASKER_DESCRIPTION_REQUIRED_FALLBACK,
  TASKER_SERVICE_NAME_LABEL_FALLBACK,
} from "../taskerRules";

// SecureStore en memoria — el real necesita react-native (lo importa el store).
jest.mock("../storage", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

describe("buildCompanySettings — claves de Reportar Avería (Tasker)", () => {
  it("raw que no es objeto → null (no pisa el valor previo)", () => {
    expect(buildCompanySettings(null)).toBeNull();
    expect(buildCompanySettings("x")).toBeNull();
  });

  describe("serviceNameLabel", () => {
    it("string válido → ese valor", () => {
      expect(buildCompanySettings({ serviceNameLabel: "Área" })?.serviceNameLabel).toBe("Área");
    });
    it("ausente → respaldo", () => {
      expect(buildCompanySettings({})?.serviceNameLabel).toBe(TASKER_SERVICE_NAME_LABEL_FALLBACK);
    });
    it("tipo incorrecto → respaldo", () => {
      for (const bad of [42, true, null, {}, ["Área"]]) {
        expect(buildCompanySettings({ serviceNameLabel: bad })?.serviceNameLabel).toBe(
          TASKER_SERVICE_NAME_LABEL_FALLBACK,
        );
      }
    });
    it("string vacío o solo espacios → respaldo", () => {
      expect(buildCompanySettings({ serviceNameLabel: "" })?.serviceNameLabel).toBe("Servicio");
      expect(buildCompanySettings({ serviceNameLabel: "   " })?.serviceNameLabel).toBe("Servicio");
    });
  });

  describe("isDescriptionRequired", () => {
    it("boolean válido → ese valor (también false)", () => {
      expect(buildCompanySettings({ isDescriptionRequired: false })?.isDescriptionRequired).toBe(
        false,
      );
      expect(buildCompanySettings({ isDescriptionRequired: true })?.isDescriptionRequired).toBe(
        true,
      );
    });
    it("ausente → respaldo", () => {
      expect(buildCompanySettings({})?.isDescriptionRequired).toBe(
        TASKER_DESCRIPTION_REQUIRED_FALLBACK,
      );
    });
    it("tipo incorrecto → respaldo", () => {
      for (const bad of ["false", 0, 1, null, {}]) {
        expect(buildCompanySettings({ isDescriptionRequired: bad })?.isDescriptionRequired).toBe(
          TASKER_DESCRIPTION_REQUIRED_FALLBACK,
        );
      }
    });
    it("string vacío → respaldo", () => {
      expect(buildCompanySettings({ isDescriptionRequired: "" })?.isDescriptionRequired).toBe(true);
    });
    it("ortografía exacta: la grafía vieja 'isDescripcionRequired' (sin t) se ignora", () => {
      expect(
        buildCompanySettings({ isDescripcionRequired: false })?.isDescriptionRequired,
      ).toBe(true);
    });
  });

  it("objeto completo: las claves existentes no cambian y se suman las dos nuevas", () => {
    expect(
      buildCompanySettings({
        categoryDefaultIds: { a: 1 },
        schedulesAdd: [],
        entryTime: "08:00",
        exitTime: "17:00",
        daysLateAbsence: 4,
        tardinessMode: "Manual",
        attendanceMode: "Docente",
        serviceNameLabel: "Área",
        isDescriptionRequired: false,
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
      serviceNameLabel: "Área",
      isDescriptionRequired: false,
    });
  });
});
