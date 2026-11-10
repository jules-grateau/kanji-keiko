// Configuration lue depuis les variables d'environnement.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
if (!GOOGLE_CLIENT_ID) {
  console.error("Définis GOOGLE_CLIENT_ID (ID client OAuth « Application Web » créé dans la Google Cloud Console).");
  process.exit(1);
}

// Clé qui signe les cookies de session. Sans SESSION_SECRET, on en génère une et on la garde
// dans le dossier de données, pour que les sessions survivent aux redémarrages.
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, "session-secret");
  try { return fs.readFileSync(file, "utf8"); } catch (e) {}
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

module.exports = {
  GOOGLE_CLIENT_ID,
  SESSION_SECRET: sessionSecret(),
  SESSION_DAYS: 30,
  COOKIE_SECURE: process.env.COOKIE_SECURE !== "0",   // cookie HTTPS uniquement (localhost est accepté par les navigateurs)
  PORT: +process.env.PORT || 3000,
  HOST: process.env.HOST || "127.0.0.1",
  USERS_DIR: path.join(DATA_DIR, "users"),
  PUBLIC_DIR: path.join(ROOT, "public"),
  MAX_BODY: 2e6,                                       // taille max d'une requête, en octets
};
