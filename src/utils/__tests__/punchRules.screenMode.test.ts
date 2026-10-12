/// <reference types="jest" />

import type { UserSchedule } from "../../../types/typeStore/SchoolStoreType";
import {
  getPunchScreenMode,
  type PunchEvent,
  type UserDayPermission,
} from "../punchRules";

/** Date cuya hora de pared en RD (UTC-4) es h:m. jest.config.js fija TZ=UTC. */
const rd = (h: number, m = 0): Date =>
  new Date(Date.UTC(2026, 7, 19, h + 4, m));

/** Miércoles 8:00–17:00 */
const schedule: UserSchedule = {
  id: 1,
  weekDay: "Miércoles",
  workEntryTime: "08:00:00",
  workExitTime: "17:00:00",
  lunchEntryTime: "12:00:00",
  lunchExitTime: "13:00:00",
};

let nextId = 1;
/** Ponche registrado hoy a las h:m (RD). */
const punch = (
  type: string,
  h: number,
  m = 0,
  extra: Partial<PunchEvent> = {},
): PunchEvent => ({
  id: nextId++,
  type,
  status: "A Tiempo",
  createdDate: rd(h, m).toISOString(),
  ...extra,
});

const permiso = (
  action: string,
  fromTime: string,
  toTime: string,
  id = 690,
): UserDayPermission => ({
  id,
  schoolId: 21,
  schoolUserId: 224,
  permissionDate: "2026-08-19T04:00:00.000Z",
  fromTime,
  toTime,
  stateTagId: 64,
  typeTagId: 105,
  actionTagId: 109,
  typeTag: { id: 105, name: "Personal" },
  stateTag: { id: 64, name: "Aprobado" },
  actionTag: { id: 109, name: action },
});

const FH = [permiso("Fuera de Horario", "09:00:00", "11:00:00")];

describe("getPunchScreenMode", () => {
  it("sin horario y sin nada → noSchedule", () => {
    expect(
      getPunchScreenMode({
        schedule: null,
        punches: [],
        permissions: [],
        now: rd(10),
        hasVisibleActions: false,
      }),
    ).toBe("noSchedule");
  });

  it("sin horario con jornada abierta → normal", () => {
    expect(
      getPunchScreenMode({
        schedule: null,
        punches: [punch("InicioJornada", 8)],
        permissions: [],
        now: rd(10),
        hasVisibleActions: true,
      }),
    ).toBe("normal");
  });

  it("sin horario con FH usable → normal", () => {
    expect(
      getPunchScreenMode({
        schedule: null,
        punches: [],
        permissions: FH,
        now: rd(10),
        hasVisibleActions: true,
      }),
    ).toBe("normal");
  });

  it("sin horario, FH fuera de su ventana → noSchedule", () => {
    expect(
      getPunchScreenMode({
        schedule: null,
        punches: [],
        permissions: FH,
        now: rd(12),
        hasVisibleActions: false,
      }),
    ).toBe("noSchedule");
  });

  it("sin horario y jornada FH ya cerrada → noSchedule antes que dayFinished", () => {
    expect(
      getPunchScreenMode({
        schedule: null,
        punches: [
          punch("InicioJornadaFH", 9, 0, { permissionId: 690 }),
          punch("FinJornadaFH", 10, 0, { permissionId: 690 }),
        ],
        permissions: FH,
        now: rd(10, 30),
        hasVisibleActions: false,
      }),
    ).toBe("noSchedule");
  });

  it("FinJornada y sin acciones → dayFinished", () => {
    expect(
      getPunchScreenMode({
        schedule,
        punches: [punch("InicioJornada", 8), punch("FinJornada", 17)],
        permissions: [],
        now: rd(18),
        hasVisibleActions: false,
      }),
    ).toBe("dayFinished");
  });

  it("FinJornada pero con acciones (ventana de adicional o FH) → normal", () => {
    expect(
      getPunchScreenMode({
        schedule,
        punches: [punch("InicioJornada", 8), punch("FinJornada", 10)],
        permissions: FH,
        now: rd(10, 30),
        hasVisibleActions: true,
      }),
    ).toBe("normal");
  });

  it("FinJornadaAdicional sin acciones → dayFinished", () => {
    expect(
      getPunchScreenMode({
        schedule,
        punches: [
          punch("InicioJornada", 8),
          punch("FinJornada", 10),
          punch("InicioJornadaAdicional", 11),
          punch("FinJornadaAdicional", 17),
        ],
        permissions: [],
        now: rd(18),
        hasVisibleActions: false,
      }),
    ).toBe("dayFinished");
  });

  it("FinJornadaFH sin acciones → dayFinished", () => {
    expect(
      getPunchScreenMode({
        schedule,
        punches: [
          punch("InicioJornadaFH", 9, 0, { permissionId: 690 }),
          punch("FinJornadaFH", 11, 0, { permissionId: 690 }),
        ],
        permissions: FH,
        now: rd(11, 30),
        hasVisibleActions: false,
      }),
    ).toBe("dayFinished");
  });

  it("FinJornada rechazado no cuenta: la jornada sigue abierta → normal", () => {
    expect(
      getPunchScreenMode({
        schedule,
        punches: [
          punch("InicioJornada", 8),
          punch("FinJornada", 17, 0, { status: "Fuera de área" }),
        ],
        permissions: [],
        now: rd(18),
        hasVisibleActions: false,
      }),
    ).toBe("normal");
  });

  it("jornada abierta → normal", () => {
    expect(
      getPunchScreenMode({
        schedule,
        punches: [punch("InicioJornada", 8)],
        permissions: [],
        now: rd(10),
        hasVisibleActions: false,
      }),
    ).toBe("normal");
  });

  it("con horario y sin ponches → normal", () => {
    expect(
      getPunchScreenMode({
        schedule,
        punches: [],
        permissions: [],
        now: rd(6),
        hasVisibleActions: false,
      }),
    ).toBe("normal");
  });
});
