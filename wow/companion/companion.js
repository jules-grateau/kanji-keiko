#!/usr/bin/env node
// Compagnon de l'addon WoW Kanji Keiko : synchronise la sauvegarde de l'addon avec le serveur de l'appli.
// Node 18 ou plus, sans dépendance.
//
//   node companion.js setup [--token kkw.…] [--server URL] [--wow DOSSIER]
//        → enregistre la config et le lance automatiquement au démarrage de Windows
//   node companion.js run       → tourne en fond (lancé au démarrage de Windows ; commande par défaut)
//   node companion.js once      → une seule synchro, puis s'arrête (pour tester)
//   node companion.js status    → affiche la config et le journal
//   node companion.js uninstall → arrête le compagnon et le retire du démarrage
//
// En .exe (scripts/build-companion.js → KanjiKeikoWoW.exe) : un double-clic ouvre le menu — installation la
// première fois (jeton, copie dans %LOCALAPPDATA%\KanjiKeiko, démarrage de Windows), ensuite état et menu.
//
// Fonctionnement : WoW n'écrit la sauvegarde de l'addon (WTF/Account/<compte>/SavedVariables/KanjiKeiko.lua)
// qu'à la déconnexion ou sur /reload, et ne la relit qu'à la connexion. Donc :
// - dès que ce fichier change, ses réponses partent au serveur (qui fusionne : la version la plus avancée
//   de chaque kanji gagne, rien ne peut être écrasé) ;
// - juste après (et régulièrement quand WoW est fermé), la progression du serveur (appli du téléphone…) est
//   recopiée dans ce fichier : WoW la relit à la prochaine connexion d'un personnage.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const APP_DIR = process.env.KK_COMPANION_DIR   // (tests)
  || path.join(process.env.APPDATA || path.join(os.homedir(), ".config"), "kanji-keiko-wow");
const CONFIG = path.join(APP_DIR, "config.json");
const LOG = path.join(APP_DIR, "companion.log");
const STARTUP = path.join(process.env.APPDATA || "", "Microsoft/Windows/Start Menu/Programs/Startup/Kanji Keiko WoW.vbs");
const DEFAULT_SERVER = "https://kanji-keiko.julesgrateau.dev";
const DEFAULT_WOW = "C:/Program Files (x86)/World of Warcraft/_forever_";
const TICK = 15e3;          // WoW fermé : vérifie le fichier toutes les 15 s
const TICK_WOW = 3e3;       // WoW ouvert : toutes les 3 s (pour suivre une déconnexion / reconnexion rapide)
const PULL_EVERY = 60e3;    // WoW fermé : relit le serveur toutes les minutes
const VAR = "KanjiKeikoDB";

// ---------- Journal ----------

function log(...args) {
  const line = new Date().toLocaleString("fr-FR") + "  " + args.join(" ");
  console.log(line);
  try {
    fs.mkdirSync(APP_DIR, { recursive: true });
    fs.appendFileSync(LOG, line + "\n");
    if (fs.statSync(LOG).size > 512e3) fs.writeFileSync(LOG, fs.readFileSync(LOG, "utf8").slice(-256e3));   // journal court
  } catch (e) {}
}

// ---------- Lecture / écriture du format Lua de WoW ----------

// Lit `NOM = valeur` (valeur Lua : table, chaîne, nombre, booléen, nil), tel que WoW écrit ses SavedVariables.
function parseSavedVariables(src) {
  let i = 0;
  const out = {};
  const ws = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith("--", i)) { while (i < src.length && src[i] !== "\n") i++; continue; }
      break;
    }
  };
  const fail = msg => { throw new Error(msg + " (position " + i + ")"); };
  function str() {
    const q = src[i++];
    let s = "";
    while (src[i] !== q) {
      if (i >= src.length) fail("chaîne non terminée");
      let c = src[i++];
      if (c === "\\") {
        c = src[i++];
        if (c === "n") s += "\n";
        else if (c === "t") s += "\t";
        else if (c === "r") s += "\r";
        else if (/\d/.test(c)) {   // \ddd : caractère par son code (WoW écrit l'UTF-8 tel quel, sans ça)
          let d = c;
          while (d.length < 3 && /\d/.test(src[i])) d += src[i++];
          s += String.fromCharCode(+d);
        } else s += c;
      } else s += c;
    }
    i++;
    return s;
  }
  function value() {
    ws();
    const c = src[i];
    if (c === "{") return table();
    if (c === '"' || c === "'") return str();
    const m = /^(?:true|false|nil|-?(?:inf|nan)|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|0x[\da-fA-F]+)/.exec(src.slice(i, i + 40));
    if (!m) fail("valeur inattendue");
    i += m[0].length;
    if (m[0] === "true") return true;
    if (m[0] === "false") return false;
    if (m[0] === "nil") return null;
    return Number(m[0]);
  }
  function table() {
    i++;   // {
    const t = {};
    let n = 1;
    for (;;) {
      ws();
      if (src[i] === "}") { i++; return t; }
      let key;
      if (src[i] === "[") {
        i++;
        key = value();
        ws();
        if (src[i++] !== "]") fail("] attendu");
        ws();
        if (src[i++] !== "=") fail("= attendu");
        t[key] = value();
      } else {
        const m = /^([A-Za-z_]\w*)\s*=/.exec(src.slice(i, i + 80));
        if (m) { i += m[0].length; t[m[1]] = value(); } else t[n++] = value();
      }
      ws();
      if (src[i] === "," || src[i] === ";") i++;
    }
  }
  for (;;) {
    ws();
    if (i >= src.length) return out;
    const m = /^([A-Za-z_]\w*)\s*=/.exec(src.slice(i, i + 80));
    if (!m) fail("affectation attendue");
    i += m[0].length;
    out[m[1]] = value();
  }
}

// Table Lua (objet à clés 1..n) → tableau.
const arr = t => {
  if (Array.isArray(t)) return t;
  if (!t || typeof t !== "object") return [];
  const out = [];
  for (let k = 1; k in t; k++) out.push(t[k]);
  return out;
};

function luaValue(v, indent = "") {
  if (v === null || v === undefined) return "nil";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "0";
  if (typeof v === "string") return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r") + '"';
  const inner = indent + "\t";
  // Clé numérique (table Lua lue en objet {1: …, 2: …}) : réécrite [1], pas ["1"].
  const key = k => /^[1-9]\d*$/.test(k) ? k : luaValue(k);
  const items = Array.isArray(v)
    ? v.map(x => inner + luaValue(x, inner) + ",")
    : Object.keys(v).map(k => inner + "[" + key(k) + "] = " + luaValue(v[k], inner) + ",");
  return items.length ? "{\n" + items.join("\n") + "\n" + indent + "}" : "{}";
}

// ---------- Conversion sauvegarde de l'addon ↔ état du serveur ----------
// Même format des deux côtés (wow/KanjiKeiko/Srs.lua) : srs[kanji] = {boîte, date (ms), justes, ratés}.

function addonToServer(db) {
  const srs = {};
  for (const [k, e] of Object.entries(db.srs || {})) {
    const a = arr(e);
    if (a.length === 4 && a.every(Number.isFinite)) srs[k] = a;
  }
  const intro = {};
  for (const [d, list] of Object.entries(db.intro || {})) intro[d] = arr(list);
  const out = { srs, intro, days: arr(db.days) };
  const s = db.settings;
  if (s && s.t > 0) out.settings = { skip: arr(s.skip), goal: s.goal, hard: !!s.hard, t: s.t };
  return out;
}

// Garde ce qui n'appartient qu'à l'addon (position de la fenêtre…) et remplace la progression.
function serverToAddon(state, db) {
  return {
    ...db,
    srs: state.srs || {},
    intro: state.intro || {},
    days: state.days || [],
    settings: state.settings || db.settings || { skip: [], goal: 10, hard: false, t: 0 },
    sync: { ...(db.sync || {}), at: Date.now() },
  };
}

// Même progression ? (pour ne réécrire le fichier que si quelque chose a changé)
const progressKey = s => JSON.stringify([
  Object.keys(s.srs || {}).sort().map(k => [k, s.srs[k]]),
  Object.keys(s.intro || {}).sort().map(d => [d, [...(s.intro[d] || [])].sort()]),
  [...(s.days || [])].sort(),
  s.settings ? [arr(s.settings.skip), s.settings.goal, !!s.settings.hard, s.settings.t] : null,
]);

// ---------- Fichiers et WoW ----------

function savedVariablesFiles(wowDir) {
  const accounts = path.join(wowDir, "WTF", "Account");
  let names = [];
  try { names = fs.readdirSync(accounts); } catch (e) { return []; }
  return names
    .map(a => path.join(accounts, a, "SavedVariables"))
    .filter(d => { try { return fs.statSync(d).isDirectory(); } catch (e) { return false; } })
    .map(d => path.join(d, "KanjiKeiko.lua"));
}

function readAddonDb(file) {
  let src;
  try { src = fs.readFileSync(file, "utf8"); } catch (e) { return null; }   // pas encore de sauvegarde
  return parseSavedVariables(src)[VAR] || {};
}

function writeAddonDb(file, db) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, "\n" + VAR + " = " + luaValue(db) + "\n");
  fs.renameSync(tmp, file);
}

function wowRunning() {
  return new Promise(resolve => {
    if (process.platform !== "win32" || process.env.KK_ASSUME_WOW_CLOSED) return resolve(false);   // KK_… : tests
    execFile("tasklist", ["/FI", "IMAGENAME eq Wow.exe", "/NH"], { windowsHide: true }, (err, out) =>
      resolve(!err && /wow\.exe/i.test(out)));
  });
}

// ---------- Serveur ----------

async function api(config, method, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15e3);
  try {
    const res = await fetch(config.server.replace(/\/$/, "") + "/api/state", {
      method,
      headers: { authorization: "Bearer " + config.token, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (res.status === 401) throw new Error("jeton refusé : crée-en un nouveau dans l'appli (menu du compte → 🎮 Jeton pour WoW), puis « node companion.js setup »");
    if (!res.ok) throw new Error("le serveur a répondu " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Synchronisation ----------

const seen = new Map();   // fichier → date de modification déjà envoyée
let lastPull = 0;

async function syncOnce(config, { force = false } = {}) {
  const files = savedVariablesFiles(config.wow);
  if (!files.length) { log("Aucun compte trouvé dans", path.join(config.wow, "WTF/Account"), ": lance WoW une fois avec l'addon."); return; }
  const running = await wowRunning();
  let server = null;

  for (const file of files) {
    const mtime = (() => { try { return fs.statSync(file).mtimeMs; } catch (e) { return 0; } })();
    const db = readAddonDb(file);
    let sent = false;

    // 1. Le fichier a changé (déconnexion, /reload) : ses réponses partent au serveur.
    if (db && mtime !== seen.get(file)) {
      server = await api(config, "PUT", addonToServer(db));
      seen.set(file, mtime);
      sent = true;
      log("Envoyé :", path.basename(path.dirname(path.dirname(file))), "—", Object.keys(db.srs || {}).length, "kanji");
    }

    // 2. La progression du serveur (appli…) est recopiée dans le fichier, s'il y a du nouveau :
    //    - WoW fermé : régulièrement ;
    //    - WoW ouvert : juste après qu'il a écrit le fichier (déconnexion vers l'écran des personnages) : WoW le
    //      relit à la connexion suivante. Sans risque : s'il réécrit par-dessus, la fusion du serveur garde quand
    //      même la version la plus avancée de chaque kanji.
    if (sent || (!running && (force || Date.now() - lastPull > PULL_EVERY))) {
      server = server || await api(config, "GET");
      const current = db || {};
      if (progressKey(addonToServer(current)) !== progressKey(server)) {
        writeAddonDb(file, serverToAddon(server, current));
        seen.set(file, fs.statSync(file).mtimeMs);
        log("Reçu dans WoW :", path.basename(path.dirname(path.dirname(file))), "—", Object.keys(server.srs || {}).length, "kanji");
      }
    }
  }
  if (!running) lastPull = Date.now();
  return running;
}

// ---------- Commandes ----------

// Lancé en .exe (scripts/build-companion.js) ? Alors un double-clic ouvre l'installation ou le menu.
const IS_EXE = (() => { try { return require("node:sea").isSea(); } catch (e) { return false; } })();
const INSTALLED_EXE = path.join(process.env.LOCALAPPDATA || APP_DIR, "KanjiKeiko", "KanjiKeikoWoW.exe");
const PID = path.join(APP_DIR, "companion.pid");

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch (e) { return null; }
}

function argValue(name) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : null;
}

async function ask(question) {
  const rl = require("readline").createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(r => rl.question(question, r));
  rl.close();
  return answer.trim();
}

// Compagnon déjà en fond ? (son numéro de processus est noté dans companion.pid)
function runningPid() {
  try {
    const pid = +fs.readFileSync(PID, "utf8");
    if (pid && pid !== process.pid) { process.kill(pid, 0); return pid; }
  } catch (e) {}
  return null;
}
function stopBackground() {
  const pid = runningPid();
  if (pid) { try { process.kill(pid); } catch (e) {} }
  return !!pid;
}

// Commande lancée au démarrage de Windows : le .exe installé, ou node + ce script.
const startCommand = () => IS_EXE ? `"${INSTALLED_EXE}" run` : `"${process.execPath}" "${path.resolve(__filename)}" run`;

async function setup() {
  const old = loadConfig() || {};
  let token = argValue("token");
  while (!token) {
    token = await ask("Colle ton jeton (appli → menu du compte → 🎮 Jeton pour WoW → Créer un jeton → Copier) :\n> ");
    if (!/^kkw\.[\w-]+\.[\w-]+$/.test(token)) { console.log("Ce n'est pas un jeton Kanji Keiko (il commence par « kkw. »). Réessaie."); token = ""; }
  }
  const config = {
    server: argValue("server") || old.server || DEFAULT_SERVER,
    wow: argValue("wow") || old.wow || DEFAULT_WOW,
    token,
  };
  while (!fs.existsSync(path.join(config.wow, "Wow.exe"))) {
    config.wow = (await ask("Dossier de WoW Forever introuvable (" + config.wow + ").\nColle le chemin du dossier _forever_ :\n> ")).replace(/^"|"$/g, "");
  }
  await api(config, "GET");   // vérifie le jeton tout de suite (erreur claire sinon)
  fs.mkdirSync(APP_DIR, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2), { mode: 0o600 });
  console.log("\n✓ Jeton accepté par " + config.server);

  if (process.platform !== "win32") return;
  stopBackground();   // l'ancien compagnon (ancien jeton, ancienne version) laisse la place
  if (IS_EXE && path.resolve(process.execPath) !== path.resolve(INSTALLED_EXE)) {
    fs.mkdirSync(path.dirname(INSTALLED_EXE), { recursive: true });
    await new Promise(r => setTimeout(r, 500));   // le temps que l'ancien libère le fichier
    fs.copyFileSync(process.execPath, INSTALLED_EXE);
    console.log("✓ Installé dans " + INSTALLED_EXE);
  }
  // Script de démarrage : lance le compagnon sans fenêtre à chaque ouverture de session Windows.
  fs.writeFileSync(STARTUP, "' Kanji Keiko : compagnon de l'addon WoW (supprimer ce fichier pour l'arrêter)\r\n"
    + 'CreateObject("WScript.Shell").Run "' + startCommand().replace(/"/g, '""') + '", 0, False\r\n');
  execFile("wscript", [STARTUP], { windowsHide: true });   // et tout de suite, sans attendre le redémarrage
  console.log("✓ Il tourne maintenant en fond, et se lancera tout seul au démarrage de Windows.");
  console.log("\nTu peux jouer : tes réponses dans WoW partent vers l'appli à la déconnexion (ou avec « Synchroniser » dans l'addon).");
}

function uninstall() {
  const stopped = stopBackground();
  fs.rmSync(STARTUP, { force: true });
  console.log((stopped ? "Compagnon arrêté. " : "") + "Retiré du démarrage de Windows.");
  if (IS_EXE) console.log("Tu peux supprimer " + path.dirname(INSTALLED_EXE) + " et " + APP_DIR + ".");
}

function status(config) {
  console.log("Kanji Keiko — compagnon de l'addon WoW\n");
  if (!config) return console.log("Pas encore configuré.");
  console.log("Serveur : " + config.server + "\nWoW     : " + config.wow + "\nJeton   : " + config.token.slice(0, 12) + "…");
  console.log("En fond : " + (runningPid() ? "oui ✓" : "non (il démarrera à la prochaine ouverture de session)"));
  try { console.log("\nDernières lignes du journal :\n" + fs.readFileSync(LOG, "utf8").trim().split("\n").slice(-8).join("\n")); } catch (e) {}
}

// Double-clic sur le .exe : installation la première fois, ensuite l'état et un petit menu.
async function menu() {
  const config = loadConfig();
  if (!config) {
    console.log("Kanji Keiko — compagnon de l'addon WoW\n\nIl envoie tes réponses faites dans WoW à l'appli, et y recopie ta progression.\n");
    await setup();
  } else {
    status(config);
    const choice = await ask("\n[1] Synchroniser maintenant   [2] Changer de jeton   [3] Désinstaller   [Entrée] Fermer\n> ");
    if (!choice) return;
    if (choice === "1") { await syncOnce(config, { force: true }); console.log("✓ Synchro faite."); }
    if (choice === "2") await setup();
    if (choice === "3") uninstall();
  }
  await ask("\nAppuie sur Entrée pour fermer.");
}

// Boucle de fond (démarrage de Windows). Relit la config à chaque tour : un nouveau jeton est pris tout de suite.
async function run() {
  if (runningPid()) return;   // déjà lancé
  fs.mkdirSync(APP_DIR, { recursive: true });
  fs.writeFileSync(PID, String(process.pid));
  log("Compagnon démarré");
  for (;;) {
    const config = loadConfig();
    let running = false;
    if (config) { try { running = await syncOnce(config); } catch (e) { log("Erreur :", e.message); } }
    await new Promise(r => setTimeout(r, running ? TICK_WOW : TICK));
  }
}

async function main() {
  const cmd = process.argv[2] || (IS_EXE ? "menu" : "run");
  if (cmd === "menu") return menu();
  if (cmd === "setup") return setup();
  if (cmd === "uninstall") return uninstall();
  if (cmd === "run") return run();
  const config = loadConfig();
  if (cmd === "status") return status(config);
  if (!config) { console.error("Pas configuré : lance d'abord « setup »."); process.exit(1); }
  if (cmd === "once") return syncOnce(config, { force: true });
  console.error("Commande inconnue : " + cmd);
}

if (require.main === module) {
  main().catch(async e => {
    log("Erreur :", e.message);
    if (IS_EXE && process.argv[2] !== "run") await ask("\nAppuie sur Entrée pour fermer.");   // laisser lire l'erreur
    process.exit(1);
  });
}
module.exports = { parseSavedVariables, luaValue, addonToServer, serverToAddon, progressKey };
