// Cookie de session signé (HMAC) : le serveur n'a rien à stocker pour savoir qui est connecté.
// Contenu : base64url({ id, email, name, exp }) + "." + signature
const crypto = require("crypto");
const { SESSION_SECRET, SESSION_DAYS, COOKIE_SECURE } = require("./config");

const COOKIE = "kk_session";

const sign = data => crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");

function cookieHeader(value, maxAgeSeconds) {
  return [
    `${COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",          // inaccessible au JavaScript de la page
    "SameSite=Lax",      // pas envoyé par les requêtes venant d'autres sites
    COOKIE_SECURE ? "Secure" : "",
    `Max-Age=${maxAgeSeconds}`,
  ].filter(Boolean).join("; ");
}

// Ouvre une session pour `user` en ajoutant le cookie à la réponse.
function startSession(res, user) {
  const maxAge = SESSION_DAYS * 86400;
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + maxAge * 1000 })).toString("base64url");
  res.setHeader("Set-Cookie", cookieHeader(payload + "." + sign(payload), maxAge));
}

function endSession(res) {
  res.setHeader("Set-Cookie", cookieHeader("", 0));
}

// Renvoie l'utilisateur de la session, ou null si absente, falsifiée ou expirée.
function currentUser(req) {
  const match = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return null;
  const [payload, signature] = match[1].split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload)), given = Buffer.from(signature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return user.exp > Date.now() ? user : null;
}

module.exports = { startSession, endSession, currentUser };
