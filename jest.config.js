// Zona horaria fija: las reglas del ponchador calculan la hora de RD (UTC-4)
// a partir del offset local, así que los tests deben correr igual en cualquier
// máquina y en CI.
process.env.TZ = "UTC";

/**
 * Solo cubre lógica pura (src/utils) — sin react-native, expo ni red, así que
 * no hace falta jest-expo ni emulador. Los archivos de rutas viven en src/app/
 * y NO se testean aquí: expo-router registra como ruta cualquier .ts bajo ese
 * directorio, por eso los tests están fuera de él.
 */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src/utils"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }],
  },
};
