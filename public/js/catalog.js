// Écran « Tous les kanji » : parcourir toute la liste, marquer ceux qu'on connaît déjà, ou en ajouter
// à ses révisions (ex. les kanji vus en cours : on colle la liste dans la recherche).
// Toucher un kanji le sélectionne (rien n'est enregistré) ; puis un des deux boutons du bas :
// « À réviser » (ils arrivent dans la prochaine session) ou « Je les maîtrise ».
// Appui long ou clic droit : affiche seulement le détail du kanji.

const KEY_WELCOME = "kanji-welcome-v1";   // carte de bienvenue écartée (« Plus tard »)
const LONG_PRESS_MS = 450;

let catalogLevel = 5;            // onglet affiché
let catalogQuery = "";           // recherche en cours (vide = on affiche l'onglet)
let catalogSelected = null;      // kanji dont on affiche le détail
let catalogPending = new Set();  // kanji sélectionnés, pas encore validés (gardés d'un onglet à l'autre)

const isKnown = k => !!progress[k] && progress[k][0] === KNOWN_BOX;

function kanjiState(k) {
  if (!progress[k]) return "new";
  return isKnown(k) ? "known" : "learning";
}

// ---------- Accueil : accès à l'écran et carte de bienvenue ----------

function renderCatalogEntry() {
  $("knownCount").textContent = KANJI.filter(r => isKnown(r[0])).length;
  const isNewcomer = !Object.keys(progress).length && !load(KEY_WELCOME, false);
  setHidden("welcome", !isNewcomer);
}

// ---------- Liste ----------

// Recherche : le kanji lui-même, un sens (en anglais) ou une lecture (hiragana ou katakana).
function matchesQuery(r, q) {
  const kana = q.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 96));
  const clean = s => s.replace(/[.\-]/g, "");
  return r[0] === q
    || r[3].some(m => m.toLowerCase().includes(q))
    || r[4].concat(r[5]).some(x => clean(x).startsWith(kana));
}

// Kanji présents dans un texte collé (au moins deux) : la liste du cours, par exemple.
const pastedKanji = q => [...new Set(q.match(/\p{Script=Han}/gu) || [])].filter(c => c !== "々");   // 々 = signe de répétition

function visibleKanji() {
  const q = catalogQuery.trim().toLowerCase();
  if (!q) return KANJI.filter(r => r[1] === catalogLevel).map(r => r[0]);
  const pasted = pastedKanji(q);
  if (pasted.length > 1) return pasted.filter(k => KANJI_BY_CHAR[k]);   // dans l'ordre du texte
  return KANJI.filter(r => matchesQuery(r, q)).map(r => r[0]);
}

function chipHtml(k) {
  const pend = catalogPending.has(k), sel = k === catalogSelected;
  return `<button class="kchip jp ${kanjiState(k)}${pend ? " pend" : ""}${sel ? " sel" : ""}" data-k="${esc(k)}" aria-pressed="${pend}">${esc(k)}</button>`;
}

// Redessine toute la grille ; `toTop` remet le défilement en haut (changement d'onglet ou de recherche).
function renderCatalog(toTop) {
  document.querySelectorAll("#catTabs button").forEach(b =>
    b.setAttribute("aria-pressed", !catalogQuery && +b.dataset.n === catalogLevel));

  const list = visibleKanji();
  $("catGrid").innerHTML = list.map(chipHtml).join("");
  $("catEmpty").classList.toggle("hide", list.length > 0);
  if (toTop) $("catScroll").scrollTop = 0;
  renderCatalogStatus();
}

// Met à jour un seul kanji sans tout redessiner (garde la position de défilement).
function refreshChip(k) {
  const btn = document.querySelector(`#catGrid .kchip[data-k="${CSS.escape(k)}"]`);
  if (btn) btn.outerHTML = chipHtml(k);
}

// Compteurs de l'onglet, bouton « Tout sélectionner » et barre d'actions du bas.
function renderCatalogStatus() {
  const list = visibleKanji();
  const known = list.filter(isKnown).length;
  const what = catalogQuery ? "Recherche" : "N" + catalogLevel;
  $("catSummary").textContent = `${what} · ${list.length} kanji · ${known} ✓`;

  // Kanji collés qui ne sont pas dans la liste de l'appli (hors JLPT) : on le signale.
  const missing = pastedKanji(catalogQuery).filter(k => !KANJI_BY_CHAR[k]);
  $("catMissing").textContent = missing.length > 0 && pastedKanji(catalogQuery).length > 1
    ? "Pas dans la liste de l’appli : " + missing.join(" ") : "";

  const allSelected = list.length > 0 && list.every(k => catalogPending.has(k));
  $("catAll").textContent = allSelected ? "Tout désélectionner" : "Tout sélectionner";
  $("catAll").disabled = !list.length;

  const n = catalogPending.size;
  $("catPending").textContent = n
    ? `${n} sélectionné${n > 1 ? "s" : ""}`
    : "Touche des kanji, ou colle une liste dans la recherche.";
  setHidden("catClear", !n);
  $("catReview").disabled = $("catKnown").disabled = !n;

  renderCatalogDetail();
}

// ---------- Détail du kanji (appui long) ----------

const STATE_LABEL = { new: "Nouveau", learning: "En cours d’apprentissage", known: "Maîtrisé ✓" };

function renderCatalogDetail() {
  setHidden("catDetail", !catalogSelected);
  if (!catalogSelected) return;
  const k = kanjiInfo(catalogSelected), pend = catalogPending.has(k.char);
  let state = STATE_LABEL[kanjiState(k.char)];
  if (pend) state += " · sélectionné";
  $("cdChar").textContent = k.char;
  $("cdLevel").textContent = `N${k.level} · ${k.strokes} traits · ${state}`;
  $("cdMean").textContent = k.meanings.map(m => m.toLowerCase()).join(" · ");
  $("cdReadings").textContent = k.on.map(toKatakana).concat(k.kun.map(formatKun)).join("、");
  $("cdToggle").textContent = pend ? "Désélectionner" : "Sélectionner";
}

function showDetail(k) {
  const old = catalogSelected;
  catalogSelected = k;
  if (old) refreshChip(old);
  if (k) refreshChip(k);
  renderCatalogDetail();
}

// ---------- Sélection et validation ----------

function togglePending(k) {
  if (catalogPending.has(k)) catalogPending.delete(k); else catalogPending.add(k);
  refreshChip(k);
  renderCatalogStatus();
}

function toggleAllVisible() {
  const list = visibleKanji();
  const allSelected = list.every(k => catalogPending.has(k));
  list.forEach(k => allSelected ? catalogPending.delete(k) : catalogPending.add(k));
  renderCatalog();
}

function clearPending() {
  catalogPending.clear();
  renderCatalog();
}

const kanjiCount = n => n + " kanji";

// « Je les maîtrise » : sortis des révisions. Annulable (ils reviennent comme avant).
function markPendingKnown() {
  const changed = [...catalogPending].filter(k => !isKnown(k));
  catalogPending.clear();
  if (!changed.length) return renderCatalog();
  const before = {};
  changed.forEach(k => { before[k] = markKnown(k); });
  persist();
  renderCatalog();
  showToast(kanjiCount(changed.length) + " marqués comme maîtrisés.", () => {
    changed.forEach(k => restoreEntry(k, before[k]));
    persist();
    renderCatalog();
  });
}

// « À réviser » : ils arrivent dans la prochaine session, au début du cycle SRS, et comptent dans
// l'objectif du jour. Pas d'« Annuler » : un kanji jamais vu ne peut pas redevenir « jamais vu »
// (la synchro garde toujours une entrée).
function addPendingToReview() {
  const changed = [...catalogPending];
  catalogPending.clear();
  changed.forEach(k => { queueForReview(k); markIntroduced(k); });
  persist();
  renderCatalog();
  showToast(kanjiCount(changed.length) + " ajoutés à tes révisions.", null, 3500);
}

// ---------- Ouverture / fermeture ----------

function openCatalog() {
  catalogPending.clear();
  catalogSelected = null;
  catalogQuery = "";
  $("catSearch").value = "";
  // On ouvre sur le niveau le plus facile parmi ceux choisis à l'accueil.
  catalogLevel = settings.lv.length ? Math.max(...settings.lv) : 5;
  showScreen("catalog");
  renderCatalog(true);
}

function closeCatalog() {
  const n = catalogPending.size;
  if (n && !confirm(`Abandonner ta sélection de ${n} kanji ?`)) return;
  catalogPending.clear();
  hideToast();
  showScreen("home");
  renderHome();
  window.scrollTo(0, 0);
}

function initCatalog() {
  $("openCatalog").onclick = openCatalog;
  $("welcomeGo").onclick = openCatalog;
  $("welcomeLater").onclick = () => { save(KEY_WELCOME, true); renderCatalogEntry(); };
  $("catBack").onclick = closeCatalog;
  $("catAll").onclick = toggleAllVisible;
  $("catClear").onclick = clearPending;
  $("catReview").onclick = addPendingToReview;
  $("catKnown").onclick = markPendingKnown;
  $("cdToggle").onclick = () => catalogSelected && togglePending(catalogSelected);
  $("cdClose").onclick = () => showDetail(null);

  $("catTabs").innerHTML = LEVELS.map(n => `<button data-n="${n}">N${n}</button>`).join("");
  $("catTabs").onclick = e => {
    const b = e.target.closest("button");
    if (!b) return;
    catalogLevel = +b.dataset.n;
    catalogQuery = "";
    $("catSearch").value = "";
    renderCatalog(true);
  };
  $("catSearch").oninput = e => { catalogQuery = e.target.value; renderCatalog(true); };

  // Toucher = sélectionner ; appui long ou clic droit = détail seulement.
  const grid = $("catGrid");
  let pressTimer = null, longPressed = false;
  const chipAt = e => e.target.closest(".kchip");

  grid.addEventListener("pointerdown", e => {
    const chip = chipAt(e);
    longPressed = false;
    if (!chip) return;
    pressTimer = setTimeout(() => { longPressed = true; showDetail(chip.dataset.k); }, LONG_PRESS_MS);
  });
  ["pointerup", "pointerleave", "pointercancel", "pointermove"].forEach(type =>
    grid.addEventListener(type, e => {
      if (type === "pointermove" && Math.hypot(e.movementX, e.movementY) < 4) return;   // petit tremblement du doigt
      clearTimeout(pressTimer);
    }));
  grid.addEventListener("contextmenu", e => {
    const chip = chipAt(e);
    if (!chip) return;
    e.preventDefault();
    clearTimeout(pressTimer);
    showDetail(chip.dataset.k);
  });
  grid.addEventListener("click", e => {
    const chip = chipAt(e);
    if (!chip || longPressed) return;
    togglePending(chip.dataset.k);
  });
}
