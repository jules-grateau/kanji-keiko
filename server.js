// Serveur minimal sans dépendance : sert la page et stocke la progression de chaque utilisateur.
// Connexion via « Se connecter avec Google » ; aucun mot de passe n'est géré ici.
// Usage : GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com" node server.js
//
//   GET  /             → l'application (fichiers de public/)
//   GET  /api/config   → ID client Google, pour afficher le bouton de connexion
//   POST /api/login    → { credential } fourni par Google → ouvre une session (cookie)
//   POST /api/logout   → ferme la session
//   GET  /api/me       → utilisateur connecté (401 sinon)
//   GET  /api/state    → progression de l'utilisateur connecté
//   PUT  /api/state    → fusionne la progression envoyée, renvoie le résultat
const http = require("http");
const { PORT, HOST, GOOGLE_CLIENT_ID } = require("./src/config");
const { verifyIdToken } = require("./src/google");
const session = require("./src/session");
const store = require("./src/store");
const { send, readJson, serveStatic } = require("./src/http");

// Routes qui ne demandent pas d'être connecté. Renvoie true si la requête a été prise en charge.
function handlePublicApi(req, res, url) {
  if (url === "/api/config" && req.method === "GET") {
    send(res, 200, { googleClientId: GOOGLE_CLIENT_ID });
    return true;
  }
  if (url === "/api/login" && req.method === "POST") {
    readJson(req, res, async body => {
      try {
        const user = await verifyIdToken(body && body.credential);
        session.startSession(res, user);
        send(res, 200, { email: user.email, name: user.name });
      } catch (e) {
        send(res, 401, { error: "connexion Google refusée" });
      }
    });
    return true;
  }
  if (url === "/api/logout" && req.method === "POST") {
    session.endSession(res);
    send(res, 200, { ok: true });
    return true;
  }
  return false;
}

// Routes réservées à un utilisateur connecté.
function handlePrivateApi(req, res, url, user) {
  if (url === "/api/me" && req.method === "GET") return send(res, 200, { email: user.email, name: user.name });

  if (url === "/api/state") {
    if (req.method === "GET") return send(res, 200, store.getState(user.id));
    if (req.method === "PUT") {
      return readJson(req, res, body => {
        let state;
        try { state = store.merge(user.id, body); } catch (e) { return send(res, 400, { error: "données invalides" }); }
        send(res, 200, state);
      });
    }
    return send(res, 405, { error: "méthode non permise" });
  }
  send(res, 404, { error: "introuvable" });
}

http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (url.startsWith("/api/")) {
    if (handlePublicApi(req, res, url)) return;
    const user = session.currentUser(req);
    if (!user) return send(res, 401, { error: "non connecté" });
    return handlePrivateApi(req, res, url, user);
  }

  if (req.method === "GET" && serveStatic(url, res)) return;
  send(res, 404, "introuvable", "text/plain");
}).listen(PORT, HOST, () => console.log(`kanji-keiko sur http://${HOST}:${PORT}`));
