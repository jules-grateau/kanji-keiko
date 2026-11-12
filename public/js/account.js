// Menu du compte, en haut à droite de l'accueil : nom, e-mail, état de la synchro, et liens
// (Réglages, Sources et licences, Comment marche la révision, Installer l'appli, Se déconnecter).
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
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; refreshInstall(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; refreshInstall(); });
  refreshInstall();
  // Clic ailleurs ou Échap : on referme.
  document.addEventListener("click", e => { if (!e.target.closest("#account")) setAccountMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setAccountMenu(false); });
}
