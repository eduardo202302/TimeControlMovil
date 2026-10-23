#!/usr/bin/env node
/**
 * Sube la versión de version.json (la que lee app.config.ts).
 *
 *   node scripts/bump-version.js major   → 3.0.0 → 4.0.0 (build nativo: cambia el runtime)
 *   node scripts/bump-version.js minor   → 3.0.0 → 3.1.0
 *   node scripts/bump-version.js patch   → 3.0.0 → 3.0.1 (OTA)
 *
 * Escribe version.json e imprime la versión nueva. Sin dependencias.
 */
/* global __dirname -- script de Node (CommonJS): version.json se ubica junto a este archivo, no según el cwd. */
const fs = require("fs");
const path = require("path");

const VERSION_FILE = path.join(__dirname, "..", "version.json");
const PARTS = ["major", "minor", "patch"];

const part = process.argv[2];
if (!PARTS.includes(part)) {
  console.error(`Uso: node scripts/bump-version.js <${PARTS.join(" | ")}>`);
  process.exit(1);
}

let current;
try {
  current = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));
} catch (error) {
  console.error(`No se pudo leer ${VERSION_FILE}: ${error.message}`);
  process.exit(1);
}

for (const key of PARTS) {
  if (!Number.isInteger(current[key]) || current[key] < 0) {
    console.error(`version.json: "${key}" debe ser un entero >= 0 (vale ${JSON.stringify(current[key])}).`);
    process.exit(1);
  }
}

const next = { ...current };
if (part === "major") {
  next.major += 1;
  next.minor = 0;
  next.patch = 0;
} else if (part === "minor") {
  next.minor += 1;
  next.patch = 0;
} else {
  next.patch += 1;
}

fs.writeFileSync(VERSION_FILE, `${JSON.stringify(next, null, 2)}\n`);
console.log(`${next.major}.${next.minor}.${next.patch}`);
