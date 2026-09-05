/// <reference types="jest" />
import { getStatusColor } from "../punchRules";

const RED = "#DC2626";
const AMBER = "#D97706";
const GREEN = "#16A34A";

describe("getStatusColor — compartida por los dos ponchadores", () => {
  test("los estados de error van en rojo", () => {
    expect(getStatusColor("Tardanza")).toBe(RED);
    expect(getStatusColor("Error de Imagen")).toBe(RED);
    expect(getStatusColor("Fuera de área")).toBe(RED);
  });

  test("lo que se salió del horario esperado va en ámbar", () => {
    expect(getStatusColor("Anticipada")).toBe(AMBER);
    expect(getStatusColor("Fuera de Horario")).toBe(AMBER);
  });

  test("A Tiempo va en verde", () => {
    expect(getStatusColor("A Tiempo")).toBe(GREEN);
  });

  test("un status vacío cae al verde, no rompe", () => {
    // El historial del Ponche ADM pinta ponches que pueden venir sin evaluar.
    expect(getStatusColor(null)).toBe(GREEN);
    expect(getStatusColor(undefined)).toBe(GREEN);
    expect(getStatusColor("")).toBe(GREEN);
  });

  test("un status desconocido cae al verde", () => {
    expect(getStatusColor("Cualquier Cosa")).toBe(GREEN);
  });

  test("no se confunde 'Fuera de Horario' con 'Fuera de área'", () => {
    // Se parecen en el nombre pero no en la semántica: uno es un horario
    // atípico (ámbar), el otro un ponche fuera de la geocerca (rojo).
    expect(getStatusColor("Fuera de Horario")).toBe(AMBER);
    expect(getStatusColor("Fuera de área")).toBe(RED);
  });
});
