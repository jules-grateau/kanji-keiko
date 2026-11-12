// Connexion Google, synchronisation avec le serveur, et export/import de la progression.
//
// L’application demande d’être connecté avec Google (écran « login »). Ensuite, chaque changement
// est gardé dans le localStorage puis envoyé au serveur (cookie de session), qui renvoie la progression fusionnée.
//
// Hors ligne (transports) : si le serveur ne répond pas au démarrage mais que ce téléphone connaît déjà
// le compte, on entre quand même ; les réponses restent sur l'appareil et partent au retour du réseau.

const KEY_ACCOUNT = "kanji-account";            // email du compte à qui appartient la progression locale
const KEY_ACCOUNT_INFO = "kanji-account-info";  // { email, name } : pour entrer dans l'appli sans réseau
const NETWORK_TIMEOUT = 6000;   // au-delà, le serveur est considéré comme injoignable (réseau trop lent)
const RETRY_DELAY = 30000;      // nouvel essai d'envoi tant que le serveur est injoignable

let account = null;     // { email, name } une fois connecté
let syncTimer = null;
let syncOk = false;     // dernier envoi réussi ? (sinon des réponses attendent sur l'appareil)
let dirtyNotes = {};    // notes modifiées localement depuis le dernier envoi : le serveur ne doit pas les écraser

// fetch qui abandonne au bout de NETWORK_TIMEOUT (dans le métro, le réseau peut ne jamais répondre).
function fetchTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

const canSync = () => !!account;
// Message de synchro (menu du compte) ; `ok` = enregistré sur le serveur (point vert sur l'avatar).
function setSyncMessage(m, ok = true) {
  $("syncnote").textContent = m;
  setSyncState(ok ? "ok" : "error");
}
// Message sous le bouton de connexion : "info" (indication) ou "error" (problème). Vide = masqué.
function setLoginMessage(text, kind = "info") {
  const el = $("loginnote");
  el.textContent = text;
  el.className = "notice " + kind;
  el.classList.toggle("hide", !text);
}

const postJson = (url, body) => fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body || {}),
});

// ---------- Synchronisation ----------

// Fusionne l'état renvoyé par le serveur dans l'état local.
function mergeFromServer(remote) {
  mergeProgress(remote.srs);
  mergeDays(remote.days);
  saveDays();
  mergeIntro(remote.intro);
  saveIntro();
  // Réglages : ceux du serveur gagnent, sauf si on vient de les changer ici (date plus récente).
  if (remote.settings && remote.settings.t >= settings.t) {
    settings = normalizeSettings(remote.settings);
    saveSettings();
  }
  for (const k in remote.notes || {}) {
    if (!(k in dirtyNotes)) notes[k] = remote.notes[k];
  }
  saveProgress();
  saveNotes();
}

// Envoie l'état local (ou `body` si fourni) et récupère l'état fusionné du serveur.
async function push(body) {
  try {
    const res = await fetchTimeout("api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || { srs: progress, notes, days: activeDays, intro: introDays, settings }),
    });
    if (res.status === 401) { showSignedOut("Ta session a expiré. Reconnecte-toi pour continuer, rien n’est perdu."); return; }
    if (!res.ok) throw new Error(res.status);
    mergeFromServer(await res.json());
    dirtyNotes = {};
    syncOk = true;
    renderHome();
    const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    setSyncMessage("Synchronisé à " + time + ".");
  } catch (e) {
    syncOk = false;
    setSyncMessage(navigator.onLine === false
      ? "Hors ligne : tes réponses restent sur ce téléphone et partiront au retour du réseau."
      : "Serveur injoignable : tes réponses restent sur ce téléphone et partiront au prochain essai.", false);
    // Nouvel essai un peu plus tard (et dès que le téléphone retrouve le réseau, voir initSync).
    clearTimeout(syncTimer);
    if (canSync()) syncTimer = setTimeout(() => push(), RETRY_DELAY);
  }
}

// Sauvegarde locale immédiate, envoi au serveur regroupé après 1,5 s d'inactivité.
function persist() {
  saveProgress();
  clearTimeout(syncTimer);
  if (canSync()) syncTimer = setTimeout(() => push(), 1500);
}

// ---------- Compte ----------

// Efface la progression de ce navigateur (elle reste sur le compte côté serveur).
function clearLocalData() {
  progress = {};
  notes = {};
  activeDays = [];
  introDays = {};
  settings = normalizeSettings(null);   // les réglages du compte reviendront du serveur
  dirtyNotes = {};
  saveProgress();
  saveNotes();
  saveDays();
  saveIntro();
  saveSettings();
  renderHome();
}

function showSignedIn(user) {
  account = user;
  // La progression locale appartenait à un autre compte : on ne la mélange pas avec celui-ci.
  const owner = load(KEY_ACCOUNT, null);
  if (owner && owner !== user.email) clearLocalData();
  save(KEY_ACCOUNT, user.email);
  save(KEY_ACCOUNT_INFO, { email: user.email, name: user.name });

  renderAccount(user);
  renderHome();
  showScreen("home");
  push();
}

// Retour à l'écran de connexion : l'application n'est pas utilisable sans compte.
function showSignedOut(message, kind) {
  account = null;
  clearTimeout(syncTimer);
  setLoginMessage(message || "", kind);
  showScreen("login");
  renderGoogleButton();
}

// Google appelle cette fonction après la connexion, avec un jeton que le serveur vérifie.
async function onGoogleCredential(response) {
  try {
    const res = await postJson("api/login", { credential: response.credential });
    if (!res.ok) return setLoginMessage("La connexion a été refusée par le serveur. Réessaie.", "error");
    showSignedIn(await res.json());
  } catch (e) {
    setLoginMessage("Le serveur ne répond pas. Réessaie dans un instant.", "error");
  }
}

// Charge le script Google une seule fois, puis affiche le bouton « Se connecter avec Google ».
let googleReady = null;
function renderGoogleButton() {
  googleReady = googleReady || (async () => {
    const { googleClientId } = await (await fetch("api/config")).json();
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    google.accounts.id.initialize({ client_id: googleClientId, callback: onGoogleCredential });
  })();

  googleReady
    .then(() => google.accounts.id.renderButton($("gsi"), { theme: "outline", size: "large", text: "signin_with", locale: "fr" }))
    .catch(() => setLoginMessage("Impossible de charger la connexion Google. Vérifie ta connexion internet.", "error"));
}

async function logout() {
  clearTimeout(syncTimer);
  await push();                      // envoie les derniers changements avant de partir
  // Se déconnecter efface la progression de ce téléphone : pas question de perdre des réponses pas encore envoyées.
  if (!syncOk && !confirm("Tes dernières réponses n’ont pas encore pu être envoyées (pas de réseau). "
    + "Te déconnecter maintenant les effacerait de ce téléphone. Te déconnecter quand même ?")) return;
  try { await postJson("api/logout"); } catch (e) {}
  clearLocalData();
  localStorage.removeItem(KEY_ACCOUNT);
  localStorage.removeItem(KEY_ACCOUNT_INFO);
  showSignedOut("Tu es déconnecté. Ta progression est sauvegardée : reconnecte-toi pour la retrouver.");
}

// ---------- Initialisation ----------

async function initSync() {
  try { localStorage.removeItem("kanji-token"); } catch (e) {}   // ancien système de mot de passe

  $("export").onclick = () => {
    const blob = new Blob([JSON.stringify({ v: 1, srs: progress, notes, set: settings })], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kanji-keiko-progression.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  $("import").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      mergeProgress(data.srs);
      Object.assign(notes, data.notes || {});
      saveNotes();
      persist();
      renderHome();
      alert("Progression importée.");
    } catch (err) {
      alert("Fichier invalide.");
    }
    e.target.value = "";
  };

  $("logout").onclick = logout;

  // Page ouverte en fichier local : pas de serveur, donc pas de connexion possible.
  if (location.protocol === "file:") {
    showScreen("login");
    return setLoginMessage("Ouvre la page depuis ton serveur pour pouvoir te connecter.", "error");
  }

  // Retour du réseau : on envoie tout de suite ce qui attend.
  window.addEventListener("online", () => { if (canSync()) push(); });

  // Déjà connecté (cookie de session valide) ? Sinon, écran de connexion.
  try {
    if (navigator.onLine === false) throw new Error("hors ligne");   // inutile d'attendre le serveur
    const res = await fetchTimeout("api/me");
    if (res.ok) return showSignedIn(await res.json());
    showSignedOut();
  } catch (e) {
    // Pas de réseau : si ce téléphone connaît déjà le compte, on entre quand même (hors ligne).
    // Le serveur revérifiera la session au premier envoi (et renverra à la connexion si elle a expiré).
    const known = load(KEY_ACCOUNT_INFO, null) || (load(KEY_ACCOUNT, null) && { email: load(KEY_ACCOUNT, null) });
    if (known) return showSignedIn(known);
    showSignedOut("Pas de réseau : la première connexion en demande. Réessaie quand tu en as.", "error");
  }
}
