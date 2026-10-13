/// <reference types="jest" />
import {
  BREAK_COOLDOWN_KEY,
  BREAK_COOLDOWN_MIN,
  BREAK_END_BEFORE_EXIT_MIN,
  BREAK_END_BEFORE_LUNCH_MIN,
  BREAK_HIDE_BEFORE_EXIT_KEY,
  BREAK_HIDE_BEFORE_LUNCH_KEY,
  BREAK_SHOW_AFTER_ENTRY_KEY,
  BREAK_SHOW_AFTER_LUNCH_EXIT_KEY,
  BREAK_START_AFTER_ENTRY_MIN,
  BREAK_START_AFTER_LUNCH_MIN,
  getBreakWindowConfig,
} from "../../constants/breakWindow";

describe("getBreakWindowConfig — ventanas del Break desde school.settings", () => {
  const DEFAULTS = {
    startAfterEntry: BREAK_START_AFTER_ENTRY_MIN,
    endBeforeLunch: BREAK_END_BEFORE_LUNCH_MIN,
    startAfterLunch: BREAK_START_AFTER_LUNCH_MIN,
    endBeforeExit: BREAK_END_BEFORE_EXIT_MIN,
    cooldownAfterBreak: BREAK_COOLDOWN_MIN,
  };

  test("los respaldos son 60 / 0 / 60 / 60 / 30", () => {
    expect(DEFAULTS).toEqual({
      startAfterEntry: 60,
      endBeforeLunch: 0,
      startAfterLunch: 60,
      endBeforeExit: 60,
      cooldownAfterBreak: 30,
    });
  });

  test.each([
    ["sin argumento", undefined],
    ["null", null],
    ["settings vacío (compañía que nunca guardó la config)", {}],
    ["settings con otras claves", { isImageRequired: true }],
  ])("%s → los 5 defaults", (_, settings) => {
    expect(getBreakWindowConfig(settings)).toEqual(DEFAULTS);
  });

  test("todas presentes → se usan", () => {
    expect(
      getBreakWindowConfig({
        [BREAK_SHOW_AFTER_ENTRY_KEY]: 15,
        [BREAK_HIDE_BEFORE_LUNCH_KEY]: 20,
        [BREAK_SHOW_AFTER_LUNCH_EXIT_KEY]: 25,
        [BREAK_HIDE_BEFORE_EXIT_KEY]: 35,
        [BREAK_COOLDOWN_KEY]: 45,
      }),
    ).toEqual({
      startAfterEntry: 15,
      endBeforeLunch: 20,
      startAfterLunch: 25,
      endBeforeExit: 35,
      cooldownAfterBreak: 45,
    });
  });

  test("las claves son las que guarda el webapp", () => {
    expect([
      BREAK_SHOW_AFTER_ENTRY_KEY,
      BREAK_HIDE_BEFORE_LUNCH_KEY,
      BREAK_SHOW_AFTER_LUNCH_EXIT_KEY,
      BREAK_HIDE_BEFORE_EXIT_KEY,
      BREAK_COOLDOWN_KEY,
    ]).toEqual([
      "breakShowAfterEntryMinutes",
      "breakHideBeforeLunchMinutes",
      "breakShowAfterLunchExitMinutes",
      "breakHideBeforeExitMinutes",
      "breakCooldownMinutes",
    ]);
  });

  test.each([
    [BREAK_SHOW_AFTER_ENTRY_KEY, "startAfterEntry"],
    [BREAK_HIDE_BEFORE_LUNCH_KEY, "endBeforeLunch"],
    [BREAK_SHOW_AFTER_LUNCH_EXIT_KEY, "startAfterLunch"],
    [BREAK_HIDE_BEFORE_EXIT_KEY, "endBeforeExit"],
    [BREAK_COOLDOWN_KEY, "cooldownAfterBreak"],
  ] as const)("solo %s → esa se usa y el resto default", (key, field) => {
    expect(getBreakWindowConfig({ [key]: 7 })).toEqual({
      ...DEFAULTS,
      [field]: 7,
    });
  });

  test.each([
    ["45", 45],
    [" 45 ", 45],
    ["0", 0],
  ])("string numérico %j → %i", (raw, esperado) => {
    expect(
      getBreakWindowConfig({ [BREAK_COOLDOWN_KEY]: raw }).cooldownAfterBreak,
    ).toBe(esperado);
  });

  test.each([
    ['""', ""],
    ["null", null],
    ["-5", -5],
    ['"-5"', "-5"],
    ['"abc"', "abc"],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["decimal 12.5", 12.5],
    ['"12.5"', "12.5"],
    ["booleano", true],
    ["objeto", { value: 10 }],
  ])("%s → default de esa clave (las demás se siguen leyendo)", (_, raw) => {
    expect(
      getBreakWindowConfig({
        [BREAK_SHOW_AFTER_ENTRY_KEY]: raw,
        [BREAK_COOLDOWN_KEY]: 10,
      }),
    ).toEqual({ ...DEFAULTS, cooldownAfterBreak: 10 });
  });

  test("0 explícito → 0 (no default)", () => {
    const cfg = getBreakWindowConfig({
      [BREAK_SHOW_AFTER_ENTRY_KEY]: 0,
      [BREAK_SHOW_AFTER_LUNCH_EXIT_KEY]: 0,
      [BREAK_HIDE_BEFORE_EXIT_KEY]: 0,
      [BREAK_COOLDOWN_KEY]: 0,
    });
    expect(cfg.startAfterEntry).toBe(0);
    expect(cfg.startAfterLunch).toBe(0);
    expect(cfg.endBeforeExit).toBe(0);
    expect(cfg.cooldownAfterBreak).toBe(0);
  });
});
