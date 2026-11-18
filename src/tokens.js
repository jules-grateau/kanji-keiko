// Jetons d'appareil : le compagnon de l'addon WoW (wow/companion) lit et envoie la progression sans cookie Google.
//
// Jeton = "kkw." + identifiant du compte (base64url) + "." + 32 octets aléatoires.
// Le serveur n'en garde que l'empreinte SHA-256, dans DATA_DIR/tokens/<id>.json : { hash, created, used }.
// Un seul jeton par compte : en créer un nouveau révoque l'ancien. Il ne donne accès qu'à la progression
// (GET/PUT /api/state, GET /api/me), jamais à la gestion des jetons.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./config");

const DIR = path.join(DATA_DIR, "tokens");
const USED_EVERY = 3600e3;   // date de dernière utilisation : réécrite au plus une fois par heure
fs.mkdirSync(DIR, { recursive: true });

const cache = new Map();   // id → { hash, created, used } ou null
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");

function fileOf(id) {
  if (!/^[\w-]{1,64}$/.test(id)) throw new Error("identifiant invalide");
  return path.join(DIR, id + ".json");
}

function read(id) {
  if (cache.has(id)) return cache.get(id);
  let info = null;
  try { info = JSON.parse(fs.readFileSync(fileOf(id), "utf8")); } catch (e) {}
  cache.set(id, info);
  return info;
}

function write(id, info) {
  cache.set(id, info);
  if (!info) return fs.rmSync(fileOf(id), { force: true });
  const file = fileOf(id), tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(info), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// Crée un jeton pour l'utilisateur (l'ancien ne marche plus). Le jeton n'est renvoyé qu'ici, une seule fois.
function create(user) {
  const token = "kkw." + Buffer.from(user.id).toString("base64url") + "." + crypto.randomBytes(32).toString("base64url");
  write(user.id, { hash: sha256(token), created: Date.now(), used: 0, email: user.email, name: user.name });
  return token;
}

function revoke(user) { write(user.id, null); }

// Ce que le menu du compte affiche (jamais le jeton ni son empreinte).
function status(user) {
  const info = read(user.id);
  return info ? { exists: true, created: info.created, used: info.used } : { exists: false };
}

// Utilisateur du jeton « Authorization: Bearer kkw.… », ou null.
function userFromRequest(req) {
  const m = /^Bearer (kkw\.([\w-]+)\.[\w-]+)$/.exec(req.headers.authorization || "");
  if (!m) return null;
  let id;
  try { id = Buffer.from(m[2], "base64url").toString("utf8"); fileOf(id); } catch (e) { return null; }
  const info = read(id);
  if (!info) return null;
  const expected = Buffer.from(info.hash), given = Buffer.from(sha256(m[1]));
  if (!crypto.timingSafeEqual(given, expected)) return null;
  if (Date.now() - info.used > USED_EVERY) write(id, { ...info, used: Date.now() });
  return { id, email: info.email, name: info.name, viaToken: true };
}

module.exports = { create, revoke, status, userFromRequest };
