// Petits helpers HTTP : réponses, lecture du corps, fichiers statiques.
const fs = require("fs");
const path = require("path");
const { PUBLIC_DIR, MAX_BODY } = require("./config");

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",   // application installable (PWA)
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// Types texte : on y précise l'encodage (pas pour les images PNG).
const isText = type => /^(text\/|application\/(json|manifest\+json)|image\/svg\+xml)/.test(type);

// Envoie une réponse ; un objet est sérialisé en JSON.
function send(res, code, body, type = "application/json") {
  res.writeHead(code, {
    "Content-Type": isText(type) ? type + "; charset=utf-8" : type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// Lit le corps de la requête en JSON. Répond 413 si trop gros, 400 si JSON invalide.
function readJson(req, res, onJson) {
  let size = 0;
  const chunks = [];
  req.on("data", chunk => {
    size += chunk.length;
    if (size > MAX_BODY) { send(res, 413, { error: "trop gros" }); req.destroy(); }
    else chunks.push(chunk);
  });
  req.on("end", () => {
    if (res.writableEnded) return;
    let json;
    try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch (e) { return send(res, 400, { error: "JSON invalide" }); }
    onJson(json);
  });
}

// Sert un fichier de public/ (types connus seulement). Renvoie false si rien ne correspond.
function serveStatic(urlPath, res) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch (e) { return false; }
  if (rel === "/") rel = "/index.html";

  const file = path.join(PUBLIC_DIR, rel);
  const type = MIME[path.extname(file)];
  // Refuse tout ce qui sortirait de public/ (ex. "/../server.js").
  if (!type || !file.startsWith(PUBLIC_DIR + path.sep)) return false;

  fs.readFile(file, (err, content) => {
    if (err) return send(res, 404, "introuvable", "text/plain");
    send(res, 200, content, type);
  });
  return true;
}

module.exports = { send, readJson, serveStatic };
