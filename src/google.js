// Vérification des jetons « Se connecter avec Google » (ID token JWT signé RS256).
// Google publie ses clés publiques ; on les met en cache selon leur durée de validité.
const crypto = require("crypto");
const { GOOGLE_CLIENT_ID } = require("./config");

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

let keys = {};          // kid → clé publique
let keysExpireAt = 0;
let lastFetch = 0;

async function fetchKeys() {
  lastFetch = Date.now();
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error("clés Google indisponibles");
  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "");
  keysExpireAt = Date.now() + (maxAge ? +maxAge[1] : 3600) * 1000;
  const { keys: jwks } = await res.json();
  keys = Object.fromEntries(jwks.map(jwk => [jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" })]));
}

async function keyFor(kid) {
  // Clé inconnue : Google a peut-être fait une rotation. On recharge, au plus une fois par minute.
  if (Date.now() > keysExpireAt || (!keys[kid] && Date.now() - lastFetch > 60e3)) await fetchKeys();
  return keys[kid];
}

const decodePart = s => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

// Renvoie { id, email, name } si le jeton est valide et destiné à notre application, sinon lève une erreur.
async function verifyIdToken(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) throw new Error("jeton mal formé");
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodePart(headerB64), payload = decodePart(payloadB64);

  if (header.alg !== "RS256") throw new Error("algorithme inattendu");
  const key = await keyFor(header.kid);
  if (!key) throw new Error("clé inconnue");
  const signed = Buffer.from(headerB64 + "." + payloadB64);
  if (!crypto.verify("RSA-SHA256", signed, key, Buffer.from(signatureB64, "base64url"))) throw new Error("signature invalide");

  if (!ISSUERS.includes(payload.iss)) throw new Error("émetteur invalide");
  if (payload.aud !== GOOGLE_CLIENT_ID) throw new Error("jeton destiné à une autre application");
  if (payload.exp * 1000 < Date.now()) throw new Error("jeton expiré");

  return { id: payload.sub, email: payload.email, name: payload.name || payload.email };
}

module.exports = { verifyIdToken };
