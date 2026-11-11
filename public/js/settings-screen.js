// Écran « Réglages » : objectif quotidien (avec aperçu), niveaux exclus, mode difficile, compte et données.
// Les changements restent un brouillon jusqu'à « Sauvegarder ».
// (Le compte, l'export/import et la réinitialisation sont branchés dans sync.js et home.js.)

let draft = null;   // { goal, hard, skip } en cours de modification

const sameLevels = (a, b) => [...a].sort().join() === [...b].sort().join();
const isDraftDirty = () => !!draft
  && (draft.goal !== settings.goal || draft.hard !== settings.hard || !sameLevels(draft.skip, settings.skip));

// "8 jours", "~5 sem.", "~6 mois", "~2 ans"
function durationText(days) {
  if (days < 14) return days + (days > 1 ? " jours" : " jour");
  if (days < 60) return "~" + Math.round(days / 7) + " sem.";
  if (days < 730) return "~" + Math.round(days / 30.4) + " mois";
  return "~" + Math.round(days / 365) + " ans";
}

const dateText = d => d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

// « en 8 jours · jeu. 19 nov. », ou « aujourd'hui »
function finishText(f) {
  if (!f.days) return "✓ déjà tout vu";
  return f.days === 1 && f.date.toDateString() === new Date().toDateString()
    ? "aujourd’hui"
    : `en ${durationText(f.days)} · ${dateText(f.date)}`;
}

function renderSettingsScreen() {
  $("goalValue").textContent = draft.goal;
  $("goalMinus").disabled = draft.goal <= GOAL_MIN;
  $("goalPlus").disabled = draft.goal >= GOAL_MAX;
  document.querySelectorAll("#goalPresets button").forEach(b =>
    b.setAttribute("aria-pressed", +b.dataset.g === draft.goal));
  $("setHard").checked = draft.hard;
  document.querySelectorAll("#setLevels input").forEach(c => { c.checked = !draft.skip.includes(+c.value); });
  $("saveSettings").disabled = !isDraftDirty();

  // Aperçu : quand aura-t-on vu chaque niveau à ce rythme ?
  const p = goalPreview(draft.goal, draft.skip);
  $("goalPreview").innerHTML = p.levels.map(l => {
    const when = !l.left ? "✓ déjà tout vu" : l.selected ? finishText(l) : "exclu";
    return `<div class="pv-row${l.selected ? "" : " off"}"><b>N${l.n}</b><span>${l.left} à découvrir</span><span>${esc(when)}</span></div>`;
  }).join("");
  const active = activeLevels(draft.skip);
  const mine = active.length === LEVELS.length ? "N5 → N1" : active.map(n => "N" + n).join(" + ");
  $("goalTotals").innerHTML =
    (mine ? `<div>Tes niveaux (${esc(mine)}) : <b>${esc(p.mine.days ? durationText(p.mine.days) : "tout vu")}</b></div>` : "")
    + `<div>Tout le JLPT : <b>${esc(p.all.days ? durationText(p.all.days) : "tout vu")}</b></div>`;
}

function setDraftGoal(g) {
  draft.goal = Math.min(GOAL_MAX, Math.max(GOAL_MIN, g));
  renderSettingsScreen();
}

function openSettings() {
  draft = { goal: settings.goal, hard: settings.hard, skip: [...settings.skip] };
  showScreen("settings");
  renderSettingsScreen();
  window.scrollTo(0, 0);
}

// « ← Retour » : s'il y a des changements, on propose de les sauvegarder avant de partir.
function closeSettings() {
  if (isDraftDirty()) return $("leaveDialog").showModal();
  leaveSettings();
}

function leaveSettings() {
  $("leaveDialog").close();
  draft = null;
  showScreen("home");
  renderHome();
}

function saveSettingsScreen() {
  changeSettings(s => { s.goal = draft.goal; s.hard = draft.hard; s.skip = [...draft.skip]; });
  renderSettingsScreen();
  showToast("Réglages enregistrés.", null, 2500);
}

function initSettingsScreen() {
  $("openSettings").onclick = openSettings;
  $("settingsBack").onclick = closeSettings;
  $("saveSettings").onclick = saveSettingsScreen;
  $("leaveSave").onclick = () => { saveSettingsScreen(); leaveSettings(); };
  $("leaveDiscard").onclick = leaveSettings;
  $("leaveStay").onclick = () => $("leaveDialog").close();
  $("goalMinus").onclick = () => setDraftGoal(draft.goal - 1);
  $("goalPlus").onclick = () => setDraftGoal(draft.goal + 1);
  $("goalPresets").innerHTML = GOAL_PRESETS.map(g => `<button data-g="${g}">${g}</button>`).join("");
  $("goalPresets").onclick = e => { const b = e.target.closest("button"); if (b) setDraftGoal(+b.dataset.g); };
  $("setHard").onchange = e => { draft.hard = e.target.checked; renderSettingsScreen(); };
  $("setLevels").innerHTML = LEVELS.map(n => `<label class="chk"><input type="checkbox" value="${n}"> N${n}</label>`).join("");
  $("setLevels").onchange = e => {
    const n = +e.target.value;
    draft.skip = e.target.checked ? draft.skip.filter(x => x !== n) : [...draft.skip, n];
    renderSettingsScreen();
  };
}
