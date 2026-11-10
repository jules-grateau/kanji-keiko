// Connexion Google, synchronisation avec le serveur, et export/import de la progression.
//
// L’application demande d’être connecté avec Google (écran « login »). Ensuite, chaque changement
// est gardé dans le localStorage puis envoyé au serveur (cookie de session), qui renvoie la progression fusionnée.

const KEY_ACCOUNT = "kanji-account";   // email du compte à qui appartient la progression locale

let account = null;     // { email, name } une fois connecté
let syncTimer = null;
let dirtyNotes = {};    // notes modifiées localement depuis le dernier envoi : le serveur ne doit pas les écraser

const canSync = () => !!account;
const setSyncMessage = m => { $("syncnote").textContent = m; };
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
  for (const k in remote.notes || {}) {
    if (!(k in dirtyNotes)) notes[k] = remote.notes[k];
  }
  saveProgress();
  saveNotes();
}

// Envoie l'état local (ou `body` si fourni) et récupère l'état fusionné du serveur.
async function push(body) {
  try {
    const res = await fetch("api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || { srs: progress, notes, days: activeDays }),
    });
    if (res.status === 401) { showSignedOut("Ta session a expiré. Reconnecte-toi pour continuer, rien n’est perdu."); return; }
    if (!res.ok) throw new Error(res.status);
    mergeFromServer(await res.json());
    dirtyNotes = {};
    renderHome();
    const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    setSyncMessage("Synchronisé à " + time + ".");
  } catch (e) {
    setSyncMessage("Serveur injoignable : tes données restent sur cet appareil et partiront au prochain essai.");
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
  dirtyNotes = {};
  saveProgress();
  saveNotes();
  saveDays();
  renderHome();
}

function showSignedIn(user) {
  account = user;
  // La progression locale appartenait à un autre compte : on ne la mélange pas avec celui-ci.
  const owner = load(KEY_ACCOUNT, null);
  if (owner && owner !== user.email) clearLocalData();
  save(KEY_ACCOUNT, user.email);

  $("who").textContent = "Connecté : " + user.email;
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
  await postJson("api/logout");
  clearLocalData();
  localStorage.removeItem(KEY_ACCOUNT);
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

  // Déjà connecté (cookie de session valide) ? Sinon, écran de connexion.
  try {
    const res = await fetch("api/me");
    if (res.ok) return showSignedIn(await res.json());
    showSignedOut();
  } catch (e) {
    showSignedOut("Le serveur ne répond pas. Réessaie dans un instant.", "error");
  }
}
