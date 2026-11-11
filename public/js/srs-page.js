// Page « Comment marche la révision » : explique exactement le SRS de l'appli.
// Tous les chiffres viennent des constantes de srs.js (et de goal.js) : si une règle change,
// la page se met à jour toute seule et ne peut pas mentir.

let srsReturnTo = "home";   // écran à réafficher en quittant la page

const pluralWord = (n, word) => n + " " + word + (n > 1 ? "s" : "");
const daysLabel = d => d === 0 ? "tout de suite" : d === 365 ? "1 an" : pluralWord(d, "jour");

// Parcours d'un kanji découvert le jour 1 puis toujours réussi : à quel jour, et après combien
// d'écritures, il atteint chaque boîte. Le jour 1 : un raté (on découvre la réponse) puis les
// réussites du réapprentissage.
function perfectRun() {
  const rows = [];
  let day = 1, writes = 1 + RELEARN_SUCCESSES, box = 1;
  rows.push({ box, day, writes });
  while (box < MAX_BOX) {
    day += INTERVAL_DAYS[box];
    box++;
    writes++;
    rows.push({ box, day, writes });
  }
  return rows;
}

// "J32", "J128 (~4 mois)"
function dayText(day) {
  if (day < 100) return "J" + day;
  const months = Math.round(day / 30.4);
  return `J${day} (~${months >= 18 ? Math.round(months / 12 * 2) / 2 + " ans" : months + " mois"})`;
}

function renderSrsPage() {
  const tier = box => box === LEARNED_BOX ? '<span class="tier l">appris</span>'
    : box === MASTERED_BOX ? '<span class="tier m">maîtrisé</span>'
    : box === MAX_BOX ? '<span class="tier">plafond</span>' : "";

  const boxes = INTERVAL_DAYS.map((d, box) =>
    `<tr><td>${box}</td><td>${daysLabel(d)}${d >= FUZZ_FROM_DAYS ? " <small>±" + Math.round(d * FUZZ) + " j</small>" : ""}</td><td>${tier(box)}</td></tr>`).join("");

  const run = perfectRun();
  const runRows = run.map(r =>
    `<tr${r.box === LEARNED_BOX || r.box === MASTERED_BOX ? ' class="hl"' : ""}><td>${r.box}</td><td>${dayText(r.day)}</td><td><b>${r.writes}</b></td><td>${tier(r.box)}</td></tr>`).join("");
  const at = box => run.find(r => r.box === box);
  const learned = at(LEARNED_BOX), mastered = at(MASTERED_BOX), top = at(MAX_BOX);

  $("srsBody").innerHTML = `
  <div class="panel">
    <h3>Le principe</h3>
    <p>L'appli utilise la <b>répétition espacée</b> (SRS en anglais) : on revoit un kanji juste avant de l'oublier.
    Chaque kanji est rangé dans une <b>boîte</b>. Réussi, il monte d'une boîte et revient plus tard.
    Raté, il descend de ${LAPSE_DROP} boîtes et revient plus tôt. Plus tu le connais, moins tu le vois.</p>
    <p class="note">Inspiré de WaniKani et d'Anki, adapté à l'écriture : une séance par jour suffit.</p>
  </div>

  <div class="panel">
    <h3>Les boîtes</h3>
    <table class="srs-table"><thead><tr><th>Boîte</th><th>Revient dans</th><th></th></tr></thead><tbody>${boxes}</tbody></table>
    <ul class="srs-list">
      <li><b>Appris</b> à partir de la boîte ${LEARNED_BOX} (${daysLabel(INTERVAL_DAYS[LEARNED_BOX])}) : tu l'as réussi sur plus d'une semaine.</li>
      <li><b>Maîtrisé</b> à partir de la boîte ${MASTERED_BOX} (${daysLabel(INTERVAL_DAYS[MASTERED_BOX])}) : tu le retiens au moins un mois.</li>
      <li><b>Plafond</b> : la boîte ${MAX_BOX}, une révision par an, pour toujours. L'écriture s'oublie vite : on ne lâche jamais complètement un kanji.</li>
      <li><b>Un peu de hasard</b> à partir de ${daysLabel(FUZZ_FROM_DAYS)} (±${Math.round(FUZZ * 100)} %) : des kanji appris le même jour
        ne reviennent pas tous le même jour, ce qui évite les journées surchargées.</li>
    </ul>
  </div>

  <div class="panel">
    <h3>Pendant une séance</h3>
    <ul class="srs-list">
      <li><b>J'avais juste</b> : le kanji monte d'une boîte et revient dans le délai de sa nouvelle boîte.</li>
      <li><b>Raté</b> : il descend de ${LAPSE_DROP} boîtes et revient <b>${REDO_GAP} cartes plus tard</b>.
        Tant que tu ne l'as pas réussi <b>${RELEARN_SUCCESSES} fois</b>, il reste dans la séance
        (la 2<sup>e</sup> fois environ ${RELEARN_GAP} cartes plus loin) : on vérifie qu'il est vraiment retenu, pas juste encore en tête.
        Ensuite, il repart avec le délai de sa boîte (au moins demain).</li>
      <li>Deux séances séparées : <b>Réviser</b> (les kanji prévus aujourd'hui) et <b>Apprendre</b> (les nouveaux kanji).
        Mieux vaut réviser d'abord, pour ne pas laisser les révisions s'accumuler.</li>
      <li><b>Toutes</b> les révisions prévues sont dans la séance de révision, sans plafond, quel que soit leur niveau.
        Tu peux t'arrêter quand tu veux : le reste t'attend.</li>
    </ul>
  </div>

  <div class="panel">
    <h3>Combien de fois on écrit un kanji</h3>
    <p class="note">Un kanji découvert le jour 1 puis <b>toujours réussi</b>. Le jour 1, il est écrit ${1 + RELEARN_SUCCESSES} fois :
      un raté (tu découvres la réponse), puis ${RELEARN_SUCCESSES} réussites.</p>
    <table class="srs-table"><thead><tr><th>Boîte</th><th>Jour ≈</th><th>Écrit au total</th><th></th></tr></thead><tbody>${runRows}</tbody></table>
    <p>En résumé : <b>appris</b> vers ${dayText(learned.day)} en <b>${learned.writes} écritures</b>,
      <b>maîtrisé</b> vers ${dayText(mastered.day)} en <b>${mastered.writes} écritures</b>,
      au plafond vers ${dayText(top.day)} en <b>${top.writes} écritures</b>.</p>
    <p class="note">Déjà connu (juste du premier coup) : écrit une seule fois le jour 1, donc ${RELEARN_SUCCESSES} écritures de moins.
      Chaque erreur le fait descendre de ${LAPSE_DROP} boîtes et ajoute au moins ${RELEARN_SUCCESSES} écritures ce jour-là.</p>
  </div>

  <div class="panel">
    <h3>Une journée</h3>
    <p>Une journée commence à <b>${DAY_START_HOUR} h du matin</b> (une séance à 1 h compte encore pour la veille).
      Un kanji prévu pour un jour est à réviser <b>dès le début de ce jour, à n'importe quelle heure</b> :
      rien ne t'échappe si tu viens plus tôt que la veille.</p>
  </div>

  <div class="panel">
    <h3>Nouveaux kanji et objectif du jour</h3>
    <ul class="srs-list">
      <li>Les nouveaux kanji viennent du N5, puis du N4… jusqu'au N1. Tu peux sauter des niveaux dans les Réglages.</li>
      <li>L'<b>objectif du jour</b> compte les nouveaux kanji découverts aujourd'hui (dès ta première réponse).
        Les révisions ne comptent pas dedans. Une fois atteint, « + ${EXTRA_STEP} en plus » permet d'aller plus loin.</li>
      <li><b>Je le maîtrise</b> : le kanji sort des révisions pour toujours (il compte comme maîtrisé).</li>
      <li><b>À réviser</b> (écran « Tous les kanji ») : le kanji repart en boîte 0, dans ta prochaine séance,
        et compte dans l'objectif du jour.</li>
    </ul>
  </div>

  <div class="panel">
    <h3>Tes données</h3>
    <p class="note">Ta progression est enregistrée sur ton compte et synchronisée entre tes appareils.
      Tu peux l'exporter à tout moment (Réglages → Données).</p>
  </div>`;
}

function openSrsPage() {
  srsReturnTo = ["home", "settings", "session"].find(id => !$(id).classList.contains("hide")) || "home";
  renderSrsPage();
  showScreen("srsInfo");
  window.scrollTo(0, 0);
}

function closeSrsPage() {
  showScreen(srsReturnTo);
  if (srsReturnTo === "home") renderHome();
}

function initSrsPage() {
  $("srsBack").onclick = closeSrsPage;
  document.querySelectorAll("[data-srs-help]").forEach(b => { b.onclick = openSrsPage; });
  $("verdict").onclick = () => { if ($("verdict").textContent) openSrsPage(); };
}
