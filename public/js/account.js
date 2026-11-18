// Menu du compte, en haut à droite de l'accueil : nom, e-mail, état de la synchro, et liens
// (Réglages, Sources et licences, Comment marche la révision, Installer l'appli, Jeton pour WoW, Se déconnecter).
// Le point sur l'avatar montre l'état de la synchro : vert = enregistré sur le serveur, orange = en attente.

function renderAccount(user) {
  const initial = ((user.name || user.email || "?").trim()[0] || "?").toUpperCase();
  $("accountAvatar").textContent = $("accountAvatar2").textContent = initial;
  $("accountName").textContent = $("accountName2").textContent = user.name || user.email;
  $("who").textContent = user.email;
}

// "ok" : dernière synchro réussie ; "error" : serveur injoignable, les données attendent sur l'appareil.
function setSyncState(state) {
  $("accountAvatar").classList.toggle("sync-ok", state === "ok");
  $("accountAvatar").classList.toggle("sync-error", state === "error");
}

// ---------- Installer l'appli sur l'écran d'accueil ----------
// Si le navigateur propose l'installation directe (événement beforeinstallprompt), le bouton l'ouvre.
// Sinon (iPhone, ou Android sans proposition automatique), il affiche la marche à suivre.

let installPrompt = null;
const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const INSTALL_STEPS = {
  ios: ["Ouvre cette page dans <b>Safari</b>.", "Touche le bouton <b>Partager</b> (le carré avec une flèche ⬆).", "Choisis <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>."],
  other: ["Ouvre le <b>menu ⋮</b> du navigateur (en haut à droite).", "Choisis <b>Installer l'application</b> (ou <b>Ajouter à l'écran d'accueil</b>).", "Confirme avec <b>Installer</b>."],
};

const refreshInstall = () => setHidden("installApp", isInstalled());

async function installApp() {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    return refreshInstall();
  }
  $("installSteps").innerHTML = INSTALL_STEPS[isIos() ? "ios" : "other"].map(s => `<li>${s}</li>`).join("");
  $("installHelp").showModal();
}

// ---------- Jeton pour le compagnon de l'addon WoW ----------
// Le jeton n'est affiché qu'une fois, à sa création (le serveur n'en garde que l'empreinte).

const frDate = t => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function renderWowStatus(st) {
  $("wowStatus").textContent = !st.exists ? "Aucun jeton pour l'instant."
    : "Jeton créé le " + frDate(st.created) + (st.used ? ", utilisé pour la dernière fois le " + frDate(st.used) + "." : ", pas encore utilisé.");
  $("wowCreate").textContent = st.exists ? "Nouveau jeton" : "Créer un jeton";
  setHidden("wowRevoke", !st.exists);
}

async function wowRequest(method) {
  try {
    const res = await fetchTimeout("api/token", { method });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    $("wowStatus").textContent = "Pas de réseau ou serveur injoignable : réessaie plus tard.";
    return null;
  }
}

async function openWowDialog() {
  setHidden("wowNew", true);
  $("wowCopy").textContent = "Copier";
  $("wowStatus").textContent = "…";
  $("wowDialog").showModal();
  const st = await wowRequest("GET");
  if (st) renderWowStatus(st);
}

async function createWowToken() {
  if (!$("wowRevoke").classList.contains("hide")
    && !confirm("L'ancien jeton ne marchera plus : il faudra coller le nouveau dans le compagnon. Continuer ?")) return;
  const st = await wowRequest("POST");
  if (!st) return;
  renderWowStatus(st);
  $("wowToken").value = st.token;
  setHidden("wowNew", false);
  $("wowToken").select();
}

async function revokeWowToken() {
  if (!confirm("Révoquer le jeton ? Le compagnon WoW ne pourra plus synchroniser tant que tu n'en crées pas un nouveau.")) return;
  const st = await wowRequest("DELETE");
  if (!st) return;
  setHidden("wowNew", true);
  renderWowStatus(st);
}

function setAccountMenu(open) {
  setHidden("accountMenu", !open);
  $("accountBtn").setAttribute("aria-expanded", open);
}

function initAccount() {
  $("accountBtn").onclick = e => {
    e.stopPropagation();
    setAccountMenu($("accountMenu").classList.contains("hide"));
  };
  // Un choix dans le menu le referme (son action est branchée ailleurs : settings-screen.js, sync.js…).
  $("accountMenu").addEventListener("click", e => { if (e.target.closest("button")) setAccountMenu(false); });
  $("menuSources").onclick = openSourcesPage;
  $("installApp").onclick = installApp;
  $("installHelpClose").onclick = () => $("installHelp").close();
  $("openWow").onclick = openWowDialog;
  $("wowCreate").onclick = createWowToken;
  $("wowRevoke").onclick = revokeWowToken;
  $("wowClose").onclick = () => { $("wowToken").value = ""; $("wowDialog").close(); };
  $("wowCopy").onclick = () => { $("wowToken").select(); navigator.clipboard && navigator.clipboard.writeText($("wowToken").value); $("wowCopy").textContent = "Copié ✓"; };
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; refreshInstall(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; refreshInstall(); });
  refreshInstall();
  // Clic ailleurs ou Échap : on referme.
  document.addEventListener("click", e => { if (!e.target.closest("#account")) setAccountMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setAccountMenu(false); });
}
