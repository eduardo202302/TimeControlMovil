// Este repo no auto-incluye los @types/* (tsc solo carga los que se importan),
// así que los globals de jest se piden explícitamente para `tsc --noEmit`.
/// <reference types="jest" />

import axios from "axios";
import {
  applyCategoryTags,
  applyCreatedTag,
  applyRoleChange,
  applyScheduleBulk,
  applySelectAllCategory,
  applySettingToggle,
  buildCreateUserPayload,
  buildEmptyUserForm,
  buildPatchUserPayload,
  buildSimpleTagPayload,
  buildUserFormFromDetail,
  buildUserSettingsPayload,
  clearAllSchedules,
  computeDefTagIds,
  computeScheduleDiff,
  createDefaultScheduleRows,
  createTag,
  createUser,
  fetchRolesAll,
  fetchUserDetail,
  findCategoryIdByName,
  formatTo12Hour,
  generateUserPin,
  isAllCategorySelected,
  isValidRDPhone,
  latenessRecordDate,
  latenessTypeLabel,
  maskCedula,
  maskPhone,
  normalizeUserSchedules,
  patchUser,
  readCompanyScheduleContext,
  readCompanyUserSettings,
  recordDate,
  resolveRoleCapabilities,
  snapshotUserForm,
  validateScheduleRows,
  validateTagName,
  validateUserForm,
  type CompanyScheduleContext,
  type ScheduleRow,
  type UserFormData,
  type UserFormTag,
  type UserRole,
} from "../userFormRules";
import type { UserCategory } from "../usersRules";

jest.mock("axios");

const mockedGet = axios.get as unknown as jest.Mock;
const mockedPost = axios.post as unknown as jest.Mock;
const mockedPatch = axios.patch as unknown as jest.Mock;

const URL = "https://timecontrol.example.net:8600";
const TOKEN = "jwt.token.here";

const COMPANY = readCompanyUserSettings({
  isAccessControl: true,
  isValidLocation: true,
  isImageRequired: true,
  cedula: true,
  isWorkingLunch: true,
});

const ROLES: UserRole[] = [
  { id: 2, name: "Empleado", permissions: { applyTimeControl: true, createExcuses: true } },
  { id: 3, name: "Supervisor", permissions: { applyTimeControl: false, applySchedule: false } },
  { id: 4, name: "Sin permisos" },
];

const CATEGORIES: UserCategory[] = [
  { id: 10, name: "Sucursales", order: 1, ShowInUser: true },
  { id: 11, name: "DEPARTAMENTO", order: 2, ShowInUser: true },
];

const ALL_TAGS: UserFormTag[] = [
  { id: 100, name: "Santiago", categoryId: 10 },
  { id: 101, name: "Santo Domingo", category: { id: 10 } },
  { id: 200, name: "Ventas", CategoryId: 11 },
];

function validForm(overrides: Partial<UserFormData> = {}): UserFormData {
  return {
    ...buildEmptyUserForm(COMPANY),
    fullName: "Juan Pérez",
    email: "juan@mail.com",
    phone: "(809) 555-1234",
    password: "1234",
    role: 2,
    ...overrides,
  };
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPatch.mockReset();
});

describe("readCompanyUserSettings", () => {
  it("usa los mismos defaults que el mapStateToProps del webapp", () => {
    expect(readCompanyUserSettings(undefined)).toEqual({
      companyIsValidLocation: false,
      companyIsValidLocationDefault: true,
      companyIsImageRequired: false,
      companyIsImageRequiredDefault: true,
      companyIsTimeControlDefault: false,
      companyCedula: false,
      companyIsWorkingLunch: false,
      companyIsWorkingLunchDefault: true,
    });
    expect(readCompanyUserSettings({ isAccessControl: true }).companyIsTimeControlDefault).toBe(true);
  });
});

describe("buildUserFormFromDetail", () => {
  it("mapea el registro y cae a los defaults de la escuela para settings ausentes", () => {
    const form = buildUserFormFromDetail(
      {
        id: 7,
        isActive: false,
        photourl: "https://s3/foto.jpg",
        code: null,
        role: { id: 2, name: "Empleado", permissions: { createExcuses: true } },
        settings: { isTimeControl: false },
        user: { fullName: "Ana", cedula: 40212345678, pin: null },
        tags: [{ id: 100, name: "Santiago", categoryId: 10 }],
        branchTagId: 100,
      },
      COMPANY,
    );
    expect(form).toMatchObject({
      isActive: false,
      photourl: ["https://s3/foto.jpg"],
      code: "",
      pin: "",
      cedula: "40212345678",
      role: 2,
      isTimeControl: false,
      isValidLocation: true,
      isCreateExcuses: true,
      branchTagId: 100,
      departmentTagId: "",
    });
  });
});

describe("resolveRoleCapabilities / applyRoleChange", () => {
  it("defaults de frontend: applyTimeControl=false, applySchedule=true, createExcuses=false", () => {
    expect(resolveRoleCapabilities(ROLES, 4)).toEqual({
      canApplyTimeControl: false,
      canApplySchedule: true,
      canCreateExcuses: false,
    });
    expect(resolveRoleCapabilities(ROLES, "").canApplySchedule).toBe(false);
    expect(resolveRoleCapabilities(ROLES, 3).canApplySchedule).toBe(false);
  });

  it("cambiar a un rol sin TC resetea los 4 settings y ajusta isCreateExcuses", () => {
    const base = validForm({ isTimeControl: true, isWorkingLunch: true, isCreateExcuses: false });
    const toEmpleado = applyRoleChange(base, 2, ROLES);
    expect(toEmpleado).toMatchObject({ role: 2, isTimeControl: true, isCreateExcuses: true });

    const toSupervisor = applyRoleChange(toEmpleado, 3, ROLES);
    expect(toSupervisor).toMatchObject({
      role: 3,
      isTimeControl: false,
      isValidLocation: false,
      isImageRequired: false,
      isWorkingLunch: false,
      isCreateExcuses: false,
    });
  });

  it("sembrar desde GET /users/:id NO apaga TC aunque el rol no lo aplique (solo setRole lo hace)", () => {
    const form = buildUserFormFromDetail(
      {
        id: 9,
        role: { id: 3, name: "Supervisor", permissions: { applyTimeControl: false } },
        settings: { isTimeControl: true, isValidLocation: true, isImageRequired: true },
      },
      COMPANY,
    );
    expect(form).toMatchObject({ isTimeControl: true, isValidLocation: true, isImageRequired: true });
  });
});

describe("applySettingToggle", () => {
  it("apagar isTimeControl apaga Ubicación e Imagen en cascada (no Almuerzo)", () => {
    const form = validForm({ isTimeControl: true, isValidLocation: true, isImageRequired: true, isWorkingLunch: true });
    expect(applySettingToggle(form, "isTimeControl", false)).toMatchObject({
      isTimeControl: false,
      isValidLocation: false,
      isImageRequired: false,
      isWorkingLunch: true,
    });
    expect(applySettingToggle(form, "isWorkingLunch", false).isWorkingLunch).toBe(false);
  });
});

describe("máscaras y teléfono RD", () => {
  it("maskCedula / maskPhone", () => {
    expect(maskCedula("40212345678")).toBe("402-1234567-8");
    expect(maskCedula("4021")).toBe("402-1");
    expect(maskPhone("8095551234")).toBe("(809) 555-1234");
    expect(maskPhone("18095551234")).toBe("1 (809) 555-1234");
  });

  it("isValidRDPhone acepta 809/829/849, con o sin prefijo 1", () => {
    expect(isValidRDPhone("(809) 555-1234")).toBe(true);
    expect(isValidRDPhone("8295551234")).toBe(true);
    expect(isValidRDPhone("+1 849 555 1234")).toBe(true);
    expect(isValidRDPhone("3055551234")).toBe(false);
    expect(isValidRDPhone("8090551234")).toBe(false);
    expect(isValidRDPhone("809555123")).toBe(false);
  });
});

describe("validateUserForm", () => {
  it("formulario válido no tiene errores", () => {
    expect(validateUserForm({ form: validForm(), mode: "add", isUserImageRequired: false })).toEqual({});
  });

  it("reporta cada regla del schema del webapp", () => {
    const errors = validateUserForm({
      form: validForm({
        fullName: "Ana",
        email: "no-es-correo",
        phone: "",
        password: "12",
        role: "",
        cedula: "123-45",
      }),
      mode: "add",
      isUserImageRequired: true,
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["cedula", "email", "fullName", "image", "password", "phone", "role"].sort(),
    );
    expect(errors.fullName).toBe("Nombre debe tener mínimo 6 caracteres");
  });

  it("password solo se valida en add; cédula vacía o de 9 dígitos es válida", () => {
    const edit = validateUserForm({
      form: validForm({ password: "", cedula: "123456789" }),
      mode: "edit",
      isUserImageRequired: false,
    });
    expect(edit).toEqual({});
  });

  it("isActive === false salta TODAS las validaciones", () => {
    const errors = validateUserForm({
      form: validForm({ isActive: false, fullName: "", email: "x", phone: "1", role: "", password: "" }),
      mode: "add",
      isUserImageRequired: true,
    });
    expect(errors).toEqual({});
  });
});

describe("snapshotUserForm", () => {
  it("ignora diferencias de formato (trim, máscara) pero detecta cambios reales", () => {
    const a = validForm({ phone: "8095551234", nickName: "" });
    const b = validForm({ phone: "(809) 555-1234", nickName: "   " });
    expect(snapshotUserForm(a, "edit")).toBe(snapshotUserForm(b, "edit"));
    expect(snapshotUserForm(a, "edit")).not.toBe(snapshotUserForm({ ...a, isActive: false }, "edit"));
    // En edit la contraseña no cuenta.
    expect(snapshotUserForm(a, "edit")).toBe(snapshotUserForm({ ...a, password: "zzz" }, "edit"));
  });
});

describe("tags de Sucursal y Departamento", () => {
  it("findCategoryIdByName por substring case-insensitive", () => {
    expect(findCategoryIdByName(CATEGORIES, "sucursal")).toBe(10);
    expect(findCategoryIdByName(CATEGORIES, "departamento")).toBe(11);
    expect(findCategoryIdByName([], "sucursal")).toBeNull();
  });

  it("seleccionar tags autoselecciona el Def. y quitarlo lo limpia", () => {
    const empty = validForm();
    const withTags = applyCategoryTags(empty, 10, [101, 100], ALL_TAGS, CATEGORIES);
    expect(withTags.tags.map((t) => t.id)).toEqual([101, 100]);
    expect(withTags.branchTagId).toBe(101);
    expect(withTags.departmentTagId).toBe("");

    const kept = applyCategoryTags({ ...withTags, branchTagId: 100 }, 10, [101, 100], ALL_TAGS, CATEGORIES);
    expect(kept.branchTagId).toBe(100);

    const removed = applyCategoryTags(kept, 10, [101], ALL_TAGS, CATEGORIES);
    expect(removed.branchTagId).toBe(101);

    const none = applyCategoryTags(removed, 10, [], ALL_TAGS, CATEGORIES);
    expect(none.branchTagId).toBe("");
  });

  it("Todos selecciona/deselecciona solo la categoría indicada", () => {
    const form = applyCategoryTags(validForm(), 11, [200], ALL_TAGS, CATEGORIES);
    const all = applySelectAllCategory(form, 10, true, ALL_TAGS, CATEGORIES);
    expect(isAllCategorySelected(all, 10, ALL_TAGS)).toBe(true);
    expect(all.tags.map((t) => t.id).sort()).toEqual([100, 101, 200]);
    expect(all.departmentTagId).toBe(200);

    const cleared = applySelectAllCategory(all, 10, false, ALL_TAGS, CATEGORIES);
    expect(cleared.tags.map((t) => t.id)).toEqual([200]);
    expect(isAllCategorySelected(cleared, 10, ALL_TAGS)).toBe(false);
  });

  it("computeDefTagIds sin categorías de sucursal/departamento no toca los valores", () => {
    expect(computeDefTagIds([], [], { branchTagId: 5, departmentTagId: "" })).toEqual({
      branchTagId: 5,
      departmentTagId: "",
    });
  });
});

describe("Ult. Registros", () => {
  it("recordDate usa createdDate || lastDate y devuelve null sin registro", () => {
    expect(recordDate({ createdDate: "2026-09-10T16:00:00.000Z" })).toBe("10/09/2026");
    expect(recordDate({ lastDate: "2026-01-02T12:00:00.000Z" })).toBe("02/01/2026");
    // El backend manda { overtime: "0min" } aunque no haya tardanza.
    expect(recordDate({ overtime: "0min" } as never)).toBeNull();
    expect(recordDate(null)).toBeNull();
  });

  it("latenessTypeLabel", () => {
    expect(latenessTypeLabel("InicioJornada")).toBe("Inicio Jornada");
    expect(latenessTypeLabel("Otro")).toBe("Otro");
  });
});

describe("red", () => {
  it("fetchUserDetail pega a /users/:id", async () => {
    mockedGet.mockResolvedValue({ data: { success: true, data: { id: 7 } } });
    expect(await fetchUserDetail({ token: TOKEN, urlColegio: URL, id: 7 })).toEqual({ id: 7 });
    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/users/7`);
  });

  it("fetchRolesAll ordena por nombre sin filtrar", async () => {
    mockedGet.mockResolvedValue({
      data: { success: true, data: [{ id: 3, name: "Zeta" }, { id: 1, name: "Master" }, { id: 2, name: "admin" }] },
    });
    const roles = await fetchRolesAll({ token: TOKEN, urlColegio: URL });
    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/roles/all`);
    expect(roles.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it("generateUserPin devuelve el pin como string", async () => {
    mockedGet.mockResolvedValue({ data: { success: true, data: 482913 } });
    expect(await generateUserPin({ token: TOKEN, urlColegio: URL })).toBe("482913");
    expect(mockedGet.mock.calls[0][0]).toBe(`${URL}/user/generatePin`);
  });
});

describe("latenessRecordDate (overtime en cero)", () => {
  it('oculta la tardanza con overtime 0 / "0min" / "0 min" / "0", igual que el webapp', () => {
    const date = "2026-09-10T16:00:00.000Z";
    for (const overtime of ["0min", "0 min", "0", 0]) {
      expect(latenessRecordDate({ createdDate: date, overtime })).toBeNull();
    }
    expect(latenessRecordDate({ createdDate: date, overtime: "15min" })).toBe("10/09/2026");
    expect(latenessRecordDate({ overtime: "15min" })).toBeNull();
    expect(latenessRecordDate(null)).toBeNull();
  });
});

// ─── Horarios ────────────────────────────────────────────────────────────────

const NO_COMPANY: CompanyScheduleContext = { companyEntryTime: "", companyExitTime: "", companySchedules: [] };

function rowsWith(patch: Record<string, Partial<ScheduleRow>>): ScheduleRow[] {
  return createDefaultScheduleRows().map((row) => ({ ...row, ...(patch[row.weekDay] ?? {}) }));
}

describe("normalizeUserSchedules / bulk", () => {
  it("siempre 7 filas, recorta HH:mm:ss y conserva el id del backend", () => {
    const rows = normalizeUserSchedules([
      { id: 55, weekDay: "martes", workEntryTime: "08:00:00", workExitTime: "17:00:00", lunchEntryTime: null },
    ]);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ id: "day-0", weekDay: "Lunes", workEntryTime: "" });
    expect(rows[1]).toMatchObject({ id: 55, workEntryTime: "08:00", workExitTime: "17:00", lunchEntryTime: "" });
  });

  it("Laborables aplica Lun–Vie; limpiar vacía todo conservando ids", () => {
    const rows = applyScheduleBulk(createDefaultScheduleRows(), "laborables", {
      workEntryTime: "08:00",
      workExitTime: "17:00",
    });
    expect(rows.filter((r) => r.workEntryTime === "08:00").map((r) => r.weekDay)).toEqual([
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
    ]);
    const withId = rows.map((r, i) => (i === 0 ? { ...r, id: 9 } : r));
    const cleared = clearAllSchedules(withId);
    expect(cleared.every((r) => r.workEntryTime === "" && r.workExitTime === "")).toBe(true);
    expect(cleared[0].id).toBe(9);
  });

  it("formatTo12Hour", () => {
    expect(formatTo12Hour("00:15")).toBe("12:15 AM");
    expect(formatTo12Hour("12:00")).toBe("12:00 PM");
    expect(formatTo12Hour("17:30")).toBe("5:30 PM");
  });
});

describe("validateScheduleRows (orden de helpers.js)", () => {
  const check = (rows: ScheduleRow[], required = false, company = NO_COMPANY) =>
    validateScheduleRows(rows, company, { isScheduleRequired: required });

  it("a) entrada y salida ambas o ninguna", () => {
    expect(check(rowsWith({ Lunes: { workEntryTime: "08:00" } }))).toEqual({
      isValid: false,
      message: "Completa la Entrada y Salida en Lunes.",
    });
  });

  it("b) ídem almuerzo (antes que la comparación de jornada)", () => {
    const r = check(rowsWith({ Lunes: { workEntryTime: "18:00", workExitTime: "08:00", lunchEntryTime: "12:00" } }));
    expect(r).toEqual({ isValid: false, message: "Completa la Entrada y Salida de almuerzo en Lunes." });
  });

  it("c) entrada >= salida, con mensaje en 12h", () => {
    expect(check(rowsWith({ Martes: { workEntryTime: "17:00", workExitTime: "08:00" } }))).toEqual({
      isValid: false,
      message:
        "La hora de entrada el Martes (5:00 PM) no puede ser mayor o igual a la hora de salida (8:00 AM).",
    });
  });

  it("d) almuerzo entrada >= salida y e) almuerzo antes de la jornada", () => {
    const d = check(
      rowsWith({ Lunes: { workEntryTime: "08:00", workExitTime: "17:00", lunchEntryTime: "13:00", lunchExitTime: "12:00" } }),
    );
    expect(d.isValid).toBe(false);
    expect((d as { message: string }).message).toContain("no puede ser mayor o igual a su salida");

    const e = check(
      rowsWith({ Lunes: { workEntryTime: "08:00", workExitTime: "17:00", lunchEntryTime: "07:00", lunchExitTime: "12:00" } }),
    );
    expect((e as { message: string }).message).toBe(
      "La entrada al almuerzo el Lunes (7:00 AM) no puede ser menor a la entrada al trabajo (8:00 AM).",
    );
  });

  it("f) contra el horario de la escuela por día (settings.schedulesAdd)", () => {
    const company = readCompanyScheduleContext({
      schedulesAdd: [{ weekDay: "Lunes", workEntryTime: "08:00:00", workExitTime: "17:00:00" }],
    });
    expect(company.companySchedules).toHaveLength(1);
    const early = check(rowsWith({ Lunes: { workEntryTime: "07:30", workExitTime: "16:00" } }), false, company);
    expect((early as { message: string }).message).toContain("no puede ser menor al horario de entrada de la compañía");
    const noDay = check(rowsWith({ Martes: { workEntryTime: "08:00", workExitTime: "16:00" } }), false, company);
    expect((noDay as { message: string }).message).toBe(
      "La compañía no tiene horario el Martes. No puedes asignar horario ese día.",
    );
  });

  it("isScheduleRequired exige al menos un día completo", () => {
    expect(check(createDefaultScheduleRows(), true)).toEqual({
      isValid: false,
      message: "Debes configurar la Entrada y Salida en al menos un día.",
    });
    expect(check(createDefaultScheduleRows(), false)).toEqual({ isValid: true });
    expect(check(rowsWith({ Lunes: { workEntryTime: "08:00", workExitTime: "17:00" } }), true)).toEqual({
      isValid: true,
    });
  });
});

describe("computeScheduleDiff", () => {
  it("separa add (días nuevos), patch ({id, solo cambiados}) y del (ids quitados)", () => {
    const initial = normalizeUserSchedules([
      { id: 1, weekDay: "Lunes", workEntryTime: "08:00:00", workExitTime: "17:00:00" },
      { id: 2, weekDay: "Martes", workEntryTime: "08:00:00", workExitTime: "17:00:00" },
      { id: 3, weekDay: "Miércoles", workEntryTime: "08:00:00", workExitTime: "17:00:00" },
    ]);
    const current = initial.map((row) => {
      if (row.weekDay === "Lunes") return { ...row, workExitTime: "16:00" };
      if (row.weekDay === "Martes") return { ...row, workEntryTime: "", workExitTime: "" };
      if (row.weekDay === "Jueves") return { ...row, workEntryTime: "09:00", workExitTime: "18:00" };
      return row;
    });
    expect(computeScheduleDiff(initial, current)).toEqual({
      schedulesAdd: [
        { weekDay: "Jueves", workEntryTime: "09:00", workExitTime: "18:00", lunchEntryTime: null, lunchExitTime: null },
      ],
      schedulesPatch: [{ id: 1, workExitTime: "16:00" }],
      schedulesDel: [2],
    });
  });
});

// ─── Payloads ────────────────────────────────────────────────────────────────

describe("buildCreateUserPayload", () => {
  it("payload completo normalizado, con password y schedulesAdd", () => {
    const form = validForm({
      nickName: "  ",
      waId: "",
      code: " 77 ",
      pin: "",
      cedula: "402-1234567-8",
      tags: [{ id: 100, name: "Santiago", categoryId: 10 }],
      branchTagId: 100,
      isTimeControl: true,
    });
    const schedules = rowsWith({ Lunes: { workEntryTime: "08:00", workExitTime: "17:00" } });
    const payload = buildCreateUserPayload({
      form,
      roles: ROLES,
      canApplySchedule: true,
      initialSchedules: createDefaultScheduleRows(),
      schedules,
    });
    expect(payload).toEqual({
      user: {
        fullName: "Juan Pérez",
        nickName: null,
        pin: null,
        email: "juan@mail.com",
        phone: "8095551234",
        waId: null,
        cedula: 40212345678,
        photourl: [],
        password: "1234",
      },
      schoolUser: {
        roleId: 2,
        isActive: true,
        code: "77",
        address: null,
        settings: buildUserSettingsPayload(form, ROLES),
      },
      tagIds: [100],
      branchTagId: 100,
      departmentTagId: null,
      schedulesAdd: [
        { weekDay: "Lunes", workEntryTime: "08:00", workExitTime: "17:00", lunchEntryTime: null, lunchExitTime: null },
      ],
    });
  });

  it("settings de TC en false si el rol no aplica TC; sin horario si el rol no aplica horario", () => {
    const form = validForm({ role: 3, isTimeControl: true, isWorkingLunch: true });
    expect(buildUserSettingsPayload(form, ROLES)).toEqual({
      isValidLocation: false,
      isImageRequired: false,
      isTimeControl: false,
      isWorkingLunch: false,
      isCreateExcuses: false,
    });
    const payload = buildCreateUserPayload({
      form,
      roles: ROLES,
      canApplySchedule: false,
      initialSchedules: createDefaultScheduleRows(),
      schedules: rowsWith({ Lunes: { workEntryTime: "08:00", workExitTime: "17:00" } }),
    });
    expect(payload).not.toHaveProperty("schedulesAdd");
  });
});

describe("buildPatchUserPayload", () => {
  const base = () => ({
    roles: ROLES,
    canApplySchedule: true,
    initialSchedules: createDefaultScheduleRows(),
    schedules: createDefaultScheduleRows(),
  });

  it("sin cambios: solo schoolUser.settings (siempre completo)", () => {
    const form = validForm({ password: "" });
    expect(buildPatchUserPayload({ ...base(), initialForm: form, form })).toEqual({
      schoolUser: { settings: buildUserSettingsPayload(form, ROLES) },
    });
  });

  it("diff campo a campo, cédula como string, tagIds/tagIdsD, foto borrada como [\"\"]", () => {
    const initialForm = validForm({
      password: "",
      cedula: "40212345678",
      photourl: ["school_1/users/a.jpg"],
      tags: [{ id: 100, name: "Santiago", categoryId: 10 }],
      branchTagId: 100,
    });
    const form: UserFormData = {
      ...initialForm,
      fullName: "Juan Pérez Gómez",
      phone: "8095551234", // mismo número, otro formato → sin cambio
      cedula: "001-1234567-8",
      photourl: [],
      isActive: false,
      tags: [{ id: 101, name: "Santo Domingo", categoryId: 10 }],
      branchTagId: 101,
      password: "no-se-manda",
    };
    expect(buildPatchUserPayload({ ...base(), initialForm, form })).toEqual({
      user: { fullName: "Juan Pérez Gómez", cedula: "00112345678", photourl: [""] },
      schoolUser: { isActive: false, settings: buildUserSettingsPayload(form, ROLES) },
      tagIds: [101],
      tagIdsD: [100],
      branchTagId: 101,
    });
  });
});

// ─── Tag inline ──────────────────────────────────────────────────────────────

describe("tag inline", () => {
  it("defaults de TagsCrud; flags de estado solo en categorías isStateType", () => {
    expect(buildSimpleTagPayload("  Norte ", { id: 10 })).toEqual({
      name: "Norte",
      color: "#cccccc",
      fontColor: "#000000",
      description: "",
      categoryId: 10,
      defaultTag: false,
      settings: { is_autorized: false, isTimeDeduction: false },
    });
    expect(buildSimpleTagPayload("X1", { id: 5, isStateType: true })).toMatchObject({
      add: false,
      edit: false,
      delet: false,
      readonly: false,
      isUnique: false,
    });
    expect(validateTagName(" ")).toBe("Nombre es un campo requerido");
    expect(validateTagName("A")).toBe("Nombre debe tener mínimo 2 caracteres");
  });

  it("applyCreatedTag agrega sin duplicar y autoselecciona (y el Def.)", () => {
    const created = { id: 300, name: "Norte", categoryId: 10 };
    const first = applyCreatedTag(validForm(), ALL_TAGS, created, 10, CATEGORIES);
    expect(first.allTags).toHaveLength(ALL_TAGS.length + 1);
    expect(first.form.tags.map((t) => t.id)).toEqual([300]);
    expect(first.form.branchTagId).toBe(300);
    const again = applyCreatedTag(first.form, first.allTags, created, 10, CATEGORIES);
    expect(again.allTags).toHaveLength(ALL_TAGS.length + 1);
    expect(again.form.tags.map((t) => t.id)).toEqual([300]);
  });
});

describe("red: guardar", () => {
  it("createUser devuelve message/messageAlert del backend", async () => {
    mockedPost.mockResolvedValue({
      data: { success: true, message: "ok", messageAlert: "ya existe", data: { id: 1 } },
    });
    const result = await createUser({ token: TOKEN, urlColegio: URL, payload: { a: 1 } });
    expect(mockedPost.mock.calls[0][0]).toBe(`${URL}/users`);
    expect(result).toEqual({ ok: true, message: "ok", messageAlert: "ya existe", data: { id: 1 } });
  });

  it("patchUser con success false conserva el mensaje del backend", async () => {
    mockedPatch.mockResolvedValue({ data: { success: false, message: "La cédula ya está registrada.", data: {} } });
    const result = await patchUser({ token: TOKEN, urlColegio: URL, id: 7, payload: {} });
    expect(mockedPatch.mock.calls[0][0]).toBe(`${URL}/users/7`);
    expect(result).toMatchObject({ ok: false, message: "La cédula ya está registrada." });
  });

  it("errores de red caen al mensaje del response o genérico", async () => {
    mockedPost.mockRejectedValue({ response: { data: { message: "Boom" } } });
    expect((await createUser({ token: TOKEN, urlColegio: URL, payload: {} })).message).toBe("Boom");
  });

  it("createTag exige un tag con id en data", async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: true, data: { id: 9, name: "X", categoryId: 10 } } });
    expect((await createTag({ token: TOKEN, urlColegio: URL, payload: {} })).ok).toBe(true);
    mockedPost.mockResolvedValueOnce({ data: { success: false, message: "Entrada duplicada con valor X", data: {} } });
    expect(await createTag({ token: TOKEN, urlColegio: URL, payload: {} })).toEqual({
      ok: false,
      message: "Entrada duplicada con valor X",
      data: null,
    });
  });
});
