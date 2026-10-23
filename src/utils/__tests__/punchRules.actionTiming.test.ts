/// <reference types="jest" />

import { getBreakWindowConfig } from "../../constants/breakWindow";
import {
  getActionTimingSections,
  getButtonVisibilityMinutes,
  type ActionTimingSection,
} from "../punchRules";

/** "Ver Botón" configurado en los 4 campos. */
const LBL = getButtonVisibilityMinutes({
  lblWorkTimeIn: 15,
  lblWorkTimeOut: 20,
  lblLunchTimeIn: 5,
  lblLunchTimeOut: 10,
});

/** Respaldo del Break: 60 / 0 / 60 / 60 / 30. */
const BREAK_DEFAULTS = getBreakWindowConfig(undefined);

const BREAK_ZERO = getBreakWindowConfig({
  breakShowAfterEntryMinutes: 0,
  breakHideBeforeLunchMinutes: 0,
  breakShowAfterLunchExitMinutes: 0,
  breakHideBeforeExitMinutes: 0,
  breakCooldownMinutes: 0,
});

const section = (
  sections: ActionTimingSection[],
  id: ActionTimingSection["id"],
) => sections.find((s) => s.id === id);

const row = (s: ActionTimingSection | undefined, label: string) =>
  s?.rows.find((r) => r.label === label);

describe("getActionTimingSections", () => {
  it("todo configurado → jornada, almuerzo y break con los textos del webapp", () => {
    expect(
      getActionTimingSections({
        buttonVisibility: LBL,
        breakConfig: getBreakWindowConfig({
          breakShowAfterEntryMinutes: 45,
          breakHideBeforeLunchMinutes: 10,
          breakShowAfterLunchExitMinutes: 30,
          breakHideBeforeExitMinutes: 20,
          breakCooldownMinutes: 15,
        }),
        hasLunchSchedule: true,
        showBreak: true,
      }),
    ).toEqual([
      {
        id: "jornada",
        rows: [
          {
            label: "Entrada / Salida",
            chips: [
              { minutes: 15, suffix: "min" },
              { minutes: 20, suffix: "min" },
            ],
          },
        ],
      },
      {
        id: "almuerzo",
        rows: [
          {
            label: "Entrada / Salida",
            chips: [
              { minutes: 5, suffix: "min" },
              { minutes: 10, suffix: "min" },
            ],
          },
        ],
      },
      {
        id: "break",
        rows: [
          {
            label: "Entrada / Salida",
            chips: [
              { minutes: 45, suffix: "min después" },
              { minutes: 20, suffix: "min antes" },
            ],
          },
          {
            label: "Almuerzo",
            chips: [
              { minutes: 10, suffix: "min antes" },
              { minutes: 30, suffix: "min después" },
            ],
          },
          {
            label: "Entre breaks",
            chips: [null, { minutes: 15, suffix: "min de espera" }],
          },
        ],
      },
    ]);
  });

  it("respaldo del break (60/0/60/60/30): la fila Almuerzo solo muestra 60 min después", () => {
    const brk = section(
      getActionTimingSections({
        buttonVisibility: LBL,
        breakConfig: BREAK_DEFAULTS,
        hasLunchSchedule: true,
        showBreak: true,
      }),
      "break",
    );
    expect(row(brk, "Almuerzo")?.chips).toEqual([
      null,
      { minutes: 60, suffix: "min después" },
    ]);
    expect(row(brk, "Entrada / Salida")?.chips).toEqual([
      { minutes: 60, suffix: "min después" },
      { minutes: 60, suffix: "min antes" },
    ]);
    expect(row(brk, "Entre breaks")?.chips).toEqual([
      null,
      { minutes: 30, suffix: "min de espera" },
    ]);
  });

  it("break todo en 0 → sin bloque break", () => {
    const sections = getActionTimingSections({
      buttonVisibility: LBL,
      breakConfig: BREAK_ZERO,
      hasLunchSchedule: true,
      showBreak: true,
    });
    expect(section(sections, "break")).toBeUndefined();
    expect(sections.map((s) => s.id)).toEqual(["jornada", "almuerzo"]);
  });

  it("lbl* sin configurar (respaldo 0) → sin bloques jornada ni almuerzo", () => {
    const sections = getActionTimingSections({
      buttonVisibility: getButtonVisibilityMinutes(undefined),
      breakConfig: BREAK_DEFAULTS,
      hasLunchSchedule: true,
      showBreak: true,
    });
    expect(sections.map((s) => s.id)).toEqual(["break"]);
  });

  it("chip 1 en 0 y chip 2 > 0 → [null, chip]", () => {
    const sections = getActionTimingSections({
      buttonVisibility: { workIn: 0, workOut: 20, lunchIn: 0, lunchOut: 10 },
      breakConfig: BREAK_ZERO,
      hasLunchSchedule: true,
      showBreak: false,
    });
    expect(row(section(sections, "jornada"), "Entrada / Salida")?.chips).toEqual(
      [null, { minutes: 20, suffix: "min" }],
    );
    expect(
      row(section(sections, "almuerzo"), "Entrada / Salida")?.chips,
    ).toEqual([null, { minutes: 10, suffix: "min" }]);
  });

  it("chip 2 en 0 → [chip, null]", () => {
    const sections = getActionTimingSections({
      buttonVisibility: { workIn: 15, workOut: 0, lunchIn: 0, lunchOut: 0 },
      breakConfig: BREAK_ZERO,
      hasLunchSchedule: false,
      showBreak: false,
    });
    expect(sections).toEqual([
      {
        id: "jornada",
        rows: [
          {
            label: "Entrada / Salida",
            chips: [{ minutes: 15, suffix: "min" }, null],
          },
        ],
      },
    ]);
  });

  it("sin almuerzo en el horario → sin bloque almuerzo ni fila Almuerzo en break", () => {
    const sections = getActionTimingSections({
      buttonVisibility: LBL,
      breakConfig: BREAK_DEFAULTS,
      hasLunchSchedule: false,
      showBreak: true,
    });
    expect(sections.map((s) => s.id)).toEqual(["jornada", "break"]);
    expect(section(sections, "break")?.rows.map((r) => r.label)).toEqual([
      "Entrada / Salida",
      "Entre breaks",
    ]);
  });

  it("showBreak false → sin bloque break", () => {
    const sections = getActionTimingSections({
      buttonVisibility: LBL,
      breakConfig: BREAK_DEFAULTS,
      hasLunchSchedule: true,
      showBreak: false,
    });
    expect(sections.map((s) => s.id)).toEqual(["jornada", "almuerzo"]);
  });

  it("Entre breaks siempre [null, chip], o fila ausente con espera 0", () => {
    const withCooldown = section(
      getActionTimingSections({
        buttonVisibility: LBL,
        breakConfig: { ...BREAK_ZERO, cooldownAfterBreak: 25 },
        hasLunchSchedule: true,
        showBreak: true,
      }),
      "break",
    );
    expect(withCooldown?.rows).toEqual([
      {
        label: "Entre breaks",
        chips: [null, { minutes: 25, suffix: "min de espera" }],
      },
    ]);

    const noCooldown = section(
      getActionTimingSections({
        buttonVisibility: LBL,
        breakConfig: { ...BREAK_DEFAULTS, cooldownAfterBreak: 0 },
        hasLunchSchedule: true,
        showBreak: true,
      }),
      "break",
    );
    expect(row(noCooldown, "Entre breaks")).toBeUndefined();
    expect(noCooldown?.rows.map((r) => r.label)).toEqual([
      "Entrada / Salida",
      "Almuerzo",
    ]);
  });

  it("todos los bloques vacíos → []", () => {
    expect(
      getActionTimingSections({
        buttonVisibility: getButtonVisibilityMinutes(undefined),
        breakConfig: BREAK_ZERO,
        hasLunchSchedule: true,
        showBreak: true,
      }),
    ).toEqual([]);
  });
});
