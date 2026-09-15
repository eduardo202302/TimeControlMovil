import {
  isAbsenceRangeOnlyCompanyWorkingDays,
  isCompanyWorkingDate,
} from "../companyWorkingDay";

// Lunes 2026-09-14 .. Domingo 2026-09-20 (fechas fijas para no depender del reloj real)
const MONDAY = new Date(2026, 8, 14);
const TUESDAY = new Date(2026, 8, 15);
const SATURDAY = new Date(2026, 8, 19);
const SUNDAY = new Date(2026, 8, 20);

const SCHEDULE_MON_TO_FRI = [
  { weekDay: "Lunes", workEntryTime: "08:00", workExitTime: "17:00" },
  { weekDay: "Martes", workEntryTime: "08:00", workExitTime: "17:00" },
  { weekDay: "Miércoles", workEntryTime: "08:00", workExitTime: "17:00" },
  { weekDay: "Jueves", workEntryTime: "08:00", workExitTime: "17:00" },
  { weekDay: "Viernes", workEntryTime: "08:00", workExitTime: "17:00" },
];

describe("isCompanyWorkingDate", () => {
  it("es hábil un día con fila configurada con horario", () => {
    expect(isCompanyWorkingDate(MONDAY, SCHEDULE_MON_TO_FRI)).toBe(true);
  });

  it("no es hábil un día sin fila en schedulesAdd (fin de semana)", () => {
    expect(isCompanyWorkingDate(SATURDAY, SCHEDULE_MON_TO_FRI)).toBe(false);
    expect(isCompanyWorkingDate(SUNDAY, SCHEDULE_MON_TO_FRI)).toBe(false);
  });

  it("no es hábil si la fila existe pero sin horario configurado", () => {
    const rows = [{ weekDay: "Lunes", workEntryTime: "", workExitTime: "" }];
    expect(isCompanyWorkingDate(MONDAY, rows)).toBe(false);
  });

  it("sin schedulesAdd, cae a entryTime/exitTime sueltos", () => {
    expect(isCompanyWorkingDate(MONDAY, [], "08:00", "17:00")).toBe(true);
    expect(isCompanyWorkingDate(MONDAY, [], "", "")).toBe(false);
    expect(isCompanyWorkingDate(MONDAY, undefined, "08:00", "17:00")).toBe(true);
  });

  it("no crashea con schedulesAdd que no es un array", () => {
    expect(isCompanyWorkingDate(MONDAY, null, "08:00", "17:00")).toBe(true);
    expect(
      isCompanyWorkingDate(MONDAY, "no-array" as any, "08:00", "17:00"),
    ).toBe(true);
  });

  it("devuelve false para una fecha inválida", () => {
    expect(isCompanyWorkingDate(new Date("no-es-fecha"), SCHEDULE_MON_TO_FRI)).toBe(
      false,
    );
  });
});

describe("isAbsenceRangeOnlyCompanyWorkingDays", () => {
  it("es true si start o end no vienen (sin rango que objetar)", () => {
    expect(isAbsenceRangeOnlyCompanyWorkingDays(null, null, SCHEDULE_MON_TO_FRI)).toBe(
      true,
    );
    expect(
      isAbsenceRangeOnlyCompanyWorkingDays(MONDAY, undefined, SCHEDULE_MON_TO_FRI),
    ).toBe(true);
  });

  it("es true si todos los días del rango son hábiles", () => {
    expect(
      isAbsenceRangeOnlyCompanyWorkingDays(MONDAY, TUESDAY, SCHEDULE_MON_TO_FRI),
    ).toBe(true);
  });

  it("es false si el rango cruza un día no laborable (fin de semana)", () => {
    expect(
      isAbsenceRangeOnlyCompanyWorkingDays(MONDAY, SUNDAY, SCHEDULE_MON_TO_FRI),
    ).toBe(false);
  });

  it("funciona sin importar el orden de start/end", () => {
    expect(
      isAbsenceRangeOnlyCompanyWorkingDays(TUESDAY, MONDAY, SCHEDULE_MON_TO_FRI),
    ).toBe(true);
    expect(
      isAbsenceRangeOnlyCompanyWorkingDays(SUNDAY, MONDAY, SCHEDULE_MON_TO_FRI),
    ).toBe(false);
  });
});
