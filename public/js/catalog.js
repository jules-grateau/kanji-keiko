// Écran « Tous les kanji » : parcourir toute la liste et marquer ceux qu'on connaît déjà.
// Toucher un kanji le sélectionne (rien n'est enregistré) ; « Valider » applique la sélection :
// les kanji nouveaux ou en cours passent en « Je le maîtrise », les kanji déjà maîtrisés reviennent en révision.
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

function visibleKanji() {
  const q = catalogQuery.trim().toLowerCase();
  return q
    ? KANJI.filter(r => matchesQuery(r, q)).map(r => r[0])
    : KANJI.filter(r => r[1] === catalogLevel).map(r => r[0]);
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

// Compteurs de l'onglet, bouton « Tout sélectionner » et barre « Valider ».
function renderCatalogStatus() {
  const list = visibleKanji();
  const known = list.filter(isKnown).length;
  const what = catalogQuery ? "Recherche" : "N" + catalogLevel;
  $("catSummary").textContent = `${what} · ${list.length} kanji · ${known} ✓`;

  const selectable = list.filter(k => !isKnown(k));
  const allSelected = selectable.length > 0 && selectable.every(k => catalogPending.has(k));
  $("catAll").textContent = allSelected ? "Tout désélectionner" : "Tout sélectionner";
  $("catAll").disabled = !selectable.length;

  const pend = [...catalogPending];
  const add = pend.filter(k => !isKnown(k)).length, remove = pend.length - add;
  const parts = [];
  if (add) parts.push(`+${add} maîtrisé${add > 1 ? "s" : ""}`);
  if (remove) parts.push(`−${remove} remis en révision`);
  $("catPending").textContent = parts.length ? parts.join(" · ") : "Touche les kanji que tu connais.";
  $("catClear").disabled = $("catValidate").disabled = !pend.length;

  renderCatalogDetail();
}

// ---------- Détail du kanji (appui long) ----------

const STATE_LABEL = { new: "Nouveau", learning: "En cours d’apprentissage", known: "Maîtrisé ✓" };

function renderCatalogDetail() {
  setHidden("catDetail", !catalogSelected);
  if (!catalogSelected) return;
  const k = kanjiInfo(catalogSelected), pend = catalogPending.has(k.char);
  let state = STATE_LABEL[kanjiState(k.char)];
  if (pend) state += isKnown(k.char) ? " · sera remis en révision" : " · sélectionné";
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
  const selectable = visibleKanji().filter(k => !isKnown(k));
  const allSelected = selectable.every(k => catalogPending.has(k));
  selectable.forEach(k => allSelected ? catalogPending.delete(k) : catalogPending.add(k));
  renderCatalog();
}

function clearPending() {
  catalogPending.clear();
  renderCatalog();
}

function validatePending() {
  const changed = [...catalogPending];
  if (!changed.length) return;
  const before = {};
  let added = 0;
  changed.forEach(k => {
    before[k] = progress[k] ? [...progress[k]] : null;
    if (isKnown(k)) restoreEntry(k, null);   // remis en révision tout de suite
    else { markKnown(k); added++; }
  });
  catalogPending.clear();
  persist();
  renderCatalog();

  const removed = changed.length - added, parts = [];
  if (added) parts.push(`${added} kanji marqué${added > 1 ? "s" : ""} comme maîtrisé${added > 1 ? "s" : ""}`);
  if (removed) parts.push(`${removed} remis en révision`);
  showToast(parts.join(", ") + ".", () => {
    changed.forEach(k => restoreEntry(k, before[k]));
    persist();
    renderCatalog();
  });
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
  $("catValidate").onclick = validatePending;
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
