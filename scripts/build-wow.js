#!/usr/bin/env node
// Génère les données de l'addon WoW (wow/KanjiKeiko/) à partir des données de l'appli :
//
//   node scripts/build-wow.js            → Data.lua et Strokes.lua
//   node scripts/build-wow.js --install  → et copie l'addon dans WoW Forever (dossier _forever_)
//
// - Data.lua    : public/data/kanji.js (KANJIDIC via kanji-data, niveaux JLPT de J. Waller) — mêmes sources que l'appli.
// - Strokes.lua : public/data/strokes.js (KanjiVG, Ulrich Apel, CC BY-SA 3.0). Les tracés SVG sont convertis en
//                 lignes brisées (WoW ne sait tracer que des segments), donc Strokes.lua est aussi sous CC BY-SA 3.0.
//
// Encodage des tracés (pour garder un fichier léger) : coordonnées KanjiVG (0 à 109) arrondies au demi-point,
// chaque point = 3 caractères ASCII (base 91, caractères 35 à 126 sauf « \ »), traits séparés par une espace.
// Le décodage est dans wow/KanjiKeiko/Pad.lua.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "wow/KanjiKeiko");
const WOW_ADDONS = process.env.WOW_ADDONS || "C:/Program Files (x86)/World of Warcraft/_forever_/Interface/AddOns";

// Charge les fichiers de données de l'appli (scripts classiques qui déclarent des constantes).
function loadData(file, names) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8") + ";" + names.map(n => `this.${n} = ${n};`).join(""), ctx);
  return ctx;
}
const { KANJI } = loadData("public/data/kanji.js", ["KANJI"]);
const { STROKES } = loadData("public/data/strokes.js", ["STROKES"]);

// ---------- Tracés SVG → lignes brisées ----------

// Découpe un chemin SVG en points, en approchant chaque courbe de Bézier par des segments.
function pathToPoints(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g);
  const pts = [];
  let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, lastCtrl = null;
  const num = () => parseFloat(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);
  const cubic = (x1, y1, x2, y2, ex, ey) => {
    const N = 10;
    for (let s = 1; s <= N; s++) {
      const t = s / N, u = 1 - t;
      pts.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex,
        u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey]);
    }
    lastCtrl = [x2, y2];
    x = ex; y = ey;
  };
  while (i < tokens.length) {
    if (!isNum()) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toLowerCase()) {
      case "m": x = ox + num(); y = oy + num(); sx = x; sy = y; pts.push([x, y]); cmd = rel ? "l" : "L"; lastCtrl = null; break;
      case "l": x = ox + num(); y = oy + num(); pts.push([x, y]); lastCtrl = null; break;
      case "h": x = ox + num(); pts.push([x, y]); lastCtrl = null; break;
      case "v": y = oy + num(); pts.push([x, y]); lastCtrl = null; break;
      case "c": { const a = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()]; cubic(...a); break; }
      case "s": {
        const [x1, y1] = lastCtrl ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const a = [ox + num(), oy + num(), ox + num(), oy + num()];
        cubic(x1, y1, ...a);
        break;
      }
      case "z": x = sx; y = sy; pts.push([x, y]); lastCtrl = null; break;
      default: throw new Error("Commande SVG inconnue : " + cmd + " dans " + d);
    }
  }
  return pts;
}

// Ramer–Douglas–Peucker : retire les points inutiles (écart < tol unités KanjiVG).
function simplify(pts, tol = 0.35) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let best = -1, dist = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    const [px, py] = pts[k], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const dd = Math.abs(dy * px - dx * py + b[0] * a[1] - b[1] * a[0]) / len;
    if (dd > dist) { dist = dd; best = k; }
  }
  if (dist <= tol) return [a, b];
  return simplify(pts.slice(0, best + 1), tol).slice(0, -1).concat(simplify(pts.slice(best), tol));
}

const ALPHABET = [];
for (let c = 35; c <= 126; c++) if (c !== 92) ALPHABET.push(String.fromCharCode(c));   // 91 caractères
const Q = 219;   // valeurs possibles d'une coordonnée (0 à 109 par demi-point)
function encodePoint([x, y]) {
  const q = v => Math.max(0, Math.min(Q - 1, Math.round(v * 2)));
  let code = q(x) * Q + q(y);
  const c3 = code % 91; code = (code - c3) / 91;
  const c2 = code % 91, c1 = (code - c2) / 91;
  return ALPHABET[c1] + ALPHABET[c2] + ALPHABET[c3];
}
const encodeKanji = paths => paths.map(d => simplify(pathToPoints(d)).map(encodePoint).join("")).join(" ");

// ---------- Écriture des fichiers Lua ----------

const lua = s => JSON.stringify(s);   // une chaîne JSON est une chaîne Lua valide (UTF-8 brut)
const toKatakana = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 96));
// Comme formatKun de l'appli, mais avec ( ) et ~ : la police de l'addon n'a pas （ ） ni 〜.
const formatKun = s => s.replace(/^-/, "~").replace(/-$/, "~").replace(/\.(.*)$/, "($1)");

const HEADER = `-- FICHIER GÉNÉRÉ par scripts/build-wow.js — ne pas modifier à la main, relancer le script.\n`;

const rows = KANJI.map(r => `{${lua(r[0])},${r[1]},${r[2]},${lua(r[3].map(m => m.toLowerCase()).join(" · "))},`
  + `${lua(r[4].map(toKatakana).join("、"))},${lua(r[5].map(formatKun).join("、"))}}`);
fs.writeFileSync(path.join(OUT, "Data.lua"), HEADER + `--
-- Kanji JLPT N5 → N1, dans l'ordre d'apprentissage de l'appli : {kanji, niveau, nbTraits, sens, on, kun}
-- Sources : KANJIDIC (EDRDG, CC BY-SA 4.0) via kanji-data (David Gouveia, MIT) ; niveaux JLPT : listes de
-- Jonathan Waller ; nombre de traits : KanjiVG (CC BY-SA 3.0). Détail : page « Sources et licences » de l'appli.
local _, ns = ...
ns.kanji = {
${rows.join(",\n")}
}
`);

let missing = 0;
const strokeRows = KANJI.map(r => {
  const paths = STROKES[r[0]];
  if (!paths) { missing++; return null; }
  return `[${lua(r[0])}]=${lua(encodeKanji(paths))}`;
}).filter(Boolean);
fs.writeFileSync(path.join(OUT, "Strokes.lua"), HEADER + `--
-- Ordre et forme des traits : KanjiVG (Ulrich Apel, https://kanjivg.tagaini.net), licence CC BY-SA 3.0.
-- Tracés convertis en lignes brisées (voir l'encodage dans scripts/build-wow.js) ; ce fichier est sous la même licence.
local _, ns = ...
ns.strokes = {
${strokeRows.join(",\n")}
}
`);

for (const f of ["Data.lua", "Strokes.lua"]) console.log("wow/KanjiKeiko/" + f, fs.statSync(path.join(OUT, f)).size, "octets");
if (missing) console.log(missing, "kanji sans tracé KanjiVG");

// --install : copie l'addon dans le dossier AddOns de WoW Forever (relancer le jeu, ou /reload si déjà installé).
if (process.argv.includes("--install")) {
  const dest = path.join(WOW_ADDONS, "KanjiKeiko");
  fs.cpSync(OUT, dest, { recursive: true });
  console.log("Installé dans", dest);
}
