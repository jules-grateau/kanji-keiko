// Écran d'accueil : série, objectif du jour, progression par niveau. (Réglages : js/settings-screen.js)

function renderHome() {
  renderStreak();
  renderCatalogEntry();
  const stats = levelStats();
  renderProgress(stats);
  renderToday(stats);
}

// Panneau « Ma progression » : un simple aperçu, rien à cliquer. Trois barres par niveau : vus, appris,
// maîtrisés. Les nouveaux kanji viennent du niveau « en cours » (N5 → N1) ; les niveaux exclus sont grisés.
function renderProgress(stats) {
  const current = currentLevel();
  const seen = LEVELS.reduce((sum, n) => sum + stats[n].seen, 0);
  $("progressTotal").textContent = `${seen} / ${KANJI.length} vus`;

  $("levels").innerHTML = LEVELS.map(n => {
    const o = stats[n], skipped = settings.skip.includes(n);
    const tag = skipped ? '<em class="lv-tag">exclu</em>'
      : n === current ? '<em class="lv-tag now">← en cours</em>'
      : o.seen === o.total ? '<em class="lv-tag done">✓</em>' : "";
    return `<div class="lv${skipped ? " skip" : ""}"><b>N${n}</b><div>`
      + `<small>${o.seen} / ${o.total} vus · ${o.learned} appris · ${o.mastered} maîtrisés${o.due ? " · " + o.due + " à réviser" : ""} ${tag}</small>`
      + `<div class="bar"><i style="width:${o.seen / o.total * 100}%"></i></div>`
      + `<div class="bar"><i class="l" style="width:${o.learned / o.total * 100}%"></i></div>`
      + `<div class="bar"><i class="m" style="width:${o.mastered / o.total * 100}%"></i></div>`
      + `</div></div>`;
  }).join("");
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
