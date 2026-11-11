// Écran d'accueil : série, objectif du jour, choix des niveaux. (Réglages : js/settings-screen.js)

function renderHome() {
  renderStreak();
  renderCatalogEntry();
  const stats = levelStats();

  $("levels").innerHTML = LEVELS.map(n => {
    const o = stats[n], selected = settings.lv.includes(n);
    return `<button class="lv" data-n="${n}" aria-pressed="${selected}"><b>N${n}</b><div>`
      + `<small>${o.total} kanji · ${o.seen} vus · ${o.mastered} maîtrisés · ${o.due} à réviser</small>`
      + `<div class="bar"><i style="width:${o.seen / o.total * 100}%"></i></div>`
      + `<div class="bar"><i class="m" style="width:${o.mastered / o.total * 100}%"></i></div>`
      + `</div></button>`;
  }).join("");

  // Clic sur un niveau : on l'ajoute ou on le retire de la sélection.
  document.querySelectorAll(".lv").forEach(btn => btn.onclick = () => {
    const n = +btn.dataset.n;
    changeSettings(s => {
      const i = s.lv.indexOf(n);
      if (i >= 0) s.lv.splice(i, 1); else s.lv.push(n);
    });
    renderHome();
  });

  renderToday(stats);
}

// Panneau « Objectif du jour » : progression, compteurs et bouton pour lancer la session.
function renderToday(stats) {
  const g = goalInfo(), q = buildQueue();
  $("goalText").textContent = g.reached
    ? `${g.done} / ${g.goal} ✓ atteint !`
    : `${g.done} / ${g.goal} nouveaux`;
  $("goalBar").style.width = Math.min(100, g.done / g.goal * 100) + "%";
  $("goalBar").classList.toggle("m", g.reached);   // vert une fois atteint

  $("sDue").textContent = q.due.length;
  $("sNew").textContent = q.fresh.length;
  $("sMast").textContent = Object.values(stats).reduce((sum, o) => sum + o.mastered, 0);

  // Objectif atteint : « Réviser » s'il reste des révisions, et la possibilité d'en apprendre plus.
  const start = $("start");
  if (g.reached) start.textContent = q.due.length ? `Réviser (${q.due.length})` : "Rien à réviser";
  else start.textContent = g.done ? "Continuer" : "Commencer";
  start.disabled = !(q.due.length + q.fresh.length);
  setHidden("start", g.reached && !q.due.length);
  setHidden("extra", !g.reached);
  $("extra").disabled = !newKanji().length;
}

function initHome() {
  $("reset").onclick = () => {
    if (!confirm("Effacer toute ta progression (sur le serveur aussi) ?")) return;
    progress = {};
    introDays = {};
    saveProgress();
    saveIntro();
    renderHome();
    if (draft) renderSettingsScreen();   // l'aperçu de l'objectif change
    if (canSync()) push({ reset: true, srs: {}, notes, days: activeDays, intro: {}, settings });
  };
}
