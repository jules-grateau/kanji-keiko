// Mode « tablette graphique » : la séance en plein écran, avec un grand carré de dessin
// (toute la hauteur de l'écran) entre la consigne à gauche et la réponse + boutons à droite.
// Avec une tablette sans écran, toute sa surface correspond à l'écran : plus le carré est grand,
// plus on a de place sur la tablette pour écrire.
//
// Le choix est gardé sur cet appareil (localStorage) : la séance suivante repart en plein écran.
// Sortir avec Échap (ou le bouton) le désactive ; finir la séance quitte le plein écran sans l'oublier.

const TABLET_KEY = "kanji-keiko-tablet";
const isTablet = () => document.body.classList.contains("tablet");

function enterTablet() {
  document.body.classList.add("tablet");
  save(TABLET_KEY, true);
  $("tabletBtn").textContent = "✕ Quitter le plein écran";
  $("tabletBtn").title = "Quitter le plein écran (Échap)";
  // Le navigateur peut refuser (pas de geste de l'utilisateur, iPhone…) : la mise en page reste.
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
}

// keepChoice : on sort parce que la séance est finie, pas parce que l'utilisateur ne veut plus du mode.
function leaveTablet(keepChoice = false) {
  if (!isTablet()) return;
  document.body.classList.remove("tablet");
  if (!keepChoice) save(TABLET_KEY, false);
  $("tabletBtn").textContent = "⛶ Plein écran";
  $("tabletBtn").title = "Plein écran pour tablette graphique (F)";
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

// Au début d'une séance (toujours après un clic ou une touche : le plein écran est permis).
function restoreTablet() {
  if (load(TABLET_KEY, false)) enterTablet();
}

function toggleTablet() {
  if (isTablet()) leaveTablet(); else enterTablet();
}

function initTablet() {
  $("tabletBtn").onclick = e => { e.currentTarget.blur(); toggleTablet(); };

  // Échap pendant le plein écran : le navigateur en sort tout seul, on suit.
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) leaveTablet();
  });

  document.addEventListener("keydown", e => {
    const inSession = session && !$("session").classList.contains("hide");
    const typing = ["TEXTAREA", "INPUT"].includes(document.activeElement.tagName);
    if (!inSession || typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === "f") { e.preventDefault(); toggleTablet(); }
    // Sans plein écran (refusé par le navigateur), Échap sort quand même du mode.
    else if (e.key === "Escape" && isTablet() && !document.fullscreenElement) leaveTablet();
  });
}
