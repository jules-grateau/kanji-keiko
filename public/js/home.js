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

// Panneau « Objectif du jour » : progression, compteurs, et les deux boutons Réviser / Apprendre.
function renderToday(stats) {
  const g = goalInfo(), due = dueKanji(), fresh = freshKanji();
  $("goalText").textContent = g.reached
    ? `${g.done} / ${g.goal} ✓ atteint !`
    : `${g.done} / ${g.goal} nouveaux`;
  $("goalBar").style.width = Math.min(100, g.done / g.goal * 100) + "%";
  $("goalBar").classList.toggle("m", g.reached);   // vert une fois atteint

  $("sDue").textContent = due.length;
  $("sNew").textContent = fresh.length;
  $("sMast").textContent = Object.values(stats).reduce((sum, o) => sum + o.mastered, 0);

  // Deux séances séparées : réviser, ou apprendre de nouveaux kanji.
  const review = $("reviewBtn"), learn = $("learnBtn");
  review.textContent = due.length ? `↻ Réviser · ${due.length}` : "Rien à réviser ✓";
  review.disabled = !due.length;
  if (g.reached) {
    learn.textContent = `＋ ${EXTRA_STEP} en plus`;
    learn.disabled = !newKanji().length;
  } else {
    learn.textContent = fresh.length ? `＋ Apprendre · ${fresh.length}` : "Plus de nouveaux kanji";
    learn.disabled = !fresh.length;
  }
  // Bouton plein = celui à faire d'abord : les révisions s'il y en a (pour ne pas les laisser s'accumuler).
  review.className = due.length ? "primary" : "ghost";
  learn.className = !due.length && !learn.disabled ? "primary" : "ghost";
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
