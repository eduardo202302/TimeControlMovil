// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const noRawNumbersInStylesheet = require("./eslint-rules/no-raw-numbers-in-stylesheet");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // FASE B.4 — protege el patrón createStyles(scale, verticalScale, font)
    // ya aplicado en los archivos migrados (ver src/constants/responsive.ts).
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      // Usan el patrón contentTablet (cap de ancho) sin tokenizar
      // fontSize/padding — decisión deliberada de B.3.1.A, no deuda.
      // Retrofit solo si aparece un bug real de legibilidad, no por
      // consistencia de código sola.
      "src/app/(app)/punchinout.tsx",
      "src/components/timeoff/SolicitarPermisoForm.tsx",
    ],
    plugins: {
      local: {
        rules: {
          "no-raw-numbers-in-stylesheet": noRawNumbersInStylesheet,
        },
      },
    },
    rules: {
      "local/no-raw-numbers-in-stylesheet": "error",
    },
  },
]);
