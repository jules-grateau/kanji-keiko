// Écran d'accueil : choix des niveaux, réglages et compteurs du jour.

function renderHome() {
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
    const n = +btn.dataset.n, i = settings.lv.indexOf(n);
    if (i >= 0) settings.lv.splice(i, 1); else settings.lv.push(n);
    saveSettings();
    renderHome();
  });

  $("newn").value = String(settings.n);
  $("hard").checked = settings.hard;

  const q = buildQueue();
  $("sDue").textContent = q.due.length;
  $("sNew").textContent = q.fresh.length;
  $("sMast").textContent = Object.values(stats).reduce((sum, o) => sum + o.mastered, 0);
  $("start").disabled = !(q.due.length + q.fresh.length);
}

function initHome() {
  $("newn").onchange = e => { settings.n = +e.target.value; saveSettings(); renderHome(); };
  $("hard").onchange = e => { settings.hard = e.target.checked; saveSettings(); };

  $("reset").onclick = () => {
    if (!confirm("Effacer toute ta progression (sur le serveur aussi) ?")) return;
    progress = {};
    saveProgress();
    renderHome();
    if (canSync()) push({ reset: true, srs: {}, notes });
  };
}
