// Menu du compte, en haut à droite de l'accueil : nom, e-mail, état de la synchro, et liens
// (Réglages, Sources et licences, Comment marche la révision, Se déconnecter).
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
  // Clic ailleurs ou Échap : on referme.
  document.addEventListener("click", e => { if (!e.target.closest("#account")) setAccountMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setAccountMenu(false); });
}
