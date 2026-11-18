#!/usr/bin/env node
// Construit KanjiKeikoWoW.exe : le compagnon de l'addon WoW (wow/companion/companion.js) en un seul exécutable,
// Node compris (« Single Executable Application » de Node), pour qu'il marche sans installer Node.
//
//   node scripts/build-companion.js   → wow/companion/dist/KanjiKeikoWoW.exe
//
// Étapes (doc Node : https://nodejs.org/api/single-executable-applications.html) :
// 1. node --experimental-sea-config : emballe le script dans un « blob » ;
// 2. copie de node.exe ;
// 3. postject injecte le blob dans la copie (outil de Node, récupéré par npx à la construction seulement).
// L'exe n'est pas signé : au premier lancement, Windows SmartScreen demande une confirmation.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DIR = path.join(__dirname, "../wow/companion");
const DIST = path.join(DIR, "dist");
const EXE = path.join(DIST, process.platform === "win32" ? "KanjiKeikoWoW.exe" : "KanjiKeikoWoW");
const BLOB = path.join(DIST, "companion.blob");
const SEA_CONFIG = path.join(DIST, "sea-config.json");
const POSTJECT = "postject@1.0.0-alpha.6";

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(SEA_CONFIG, JSON.stringify({
  main: path.join(DIR, "companion.js"),
  output: BLOB,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
}));

execFileSync(process.execPath, ["--experimental-sea-config", SEA_CONFIG], { stdio: "inherit" });
fs.copyFileSync(process.execPath, EXE);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
execFileSync(npx, ["--yes", POSTJECT, EXE, "NODE_SEA_BLOB", BLOB, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"],
  { stdio: "inherit", shell: process.platform === "win32" });
fs.rmSync(BLOB);
fs.rmSync(SEA_CONFIG);
console.log("→", path.relative(process.cwd(), EXE), Math.round(fs.statSync(EXE).size / 1e6), "Mo");
