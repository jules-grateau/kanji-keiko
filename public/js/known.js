// Accueil : liste des kanji marqués « Je le maîtrise », avec la possibilité de les remettre en révision.

let selectedKnown = null;   // kanji dont on affiche le détail

// Kanji marqués, triés par niveau (N5 d'abord) puis dans l'ordre de la liste.
function knownKanji() {
  return KANJI.filter(r => progress[r[0]] && progress[r[0]][0] === KNOWN_BOX).map(r => r[0]);
}

function renderKnownList() {
  const list = knownKanji();
  setHidden("knownPanel", !list.length);
  $("knownCount").textContent = list.length;
  if (!list.includes(selectedKnown)) selectedKnown = null;

  $("knownList").innerHTML = list.map(k =>
    `<button class="kchip jp" data-k="${esc(k)}" aria-pressed="${k === selectedKnown}">${esc(k)}</button>`
  ).join("");
  document.querySelectorAll("#knownList .kchip").forEach(btn => btn.onclick = () => {
    selectedKnown = btn.dataset.k === selectedKnown ? null : btn.dataset.k;   // re-cliquer referme
    renderKnownList();
  });

  renderKnownDetail();
}

// Détail du kanji sélectionné : sens, lectures, bouton pour le remettre en révision.
function renderKnownDetail() {
  setHidden("knownDetail", !selectedKnown);
  if (!selectedKnown) return;
  const k = kanjiInfo(selectedKnown);
  $("kdChar").textContent = k.char;
  $("kdLevel").textContent = "N" + k.level + " · " + k.strokes + " traits";
  $("kdMean").textContent = k.meanings.map(m => m.toLowerCase()).join(" · ");
  $("kdReadings").textContent = k.on.map(toKatakana).concat(k.kun.map(formatKun)).join("、");
}

function putBackInReview() {
  const char = selectedKnown;
  const before = [...progress[char]];
  restoreEntry(char, null);   // revient à la prochaine session
  selectedKnown = null;
  persist();
  renderHome();

  showToast(char + " revient dans tes révisions.", () => {
    restoreEntry(char, before);   // Annuler : on le remet comme avant
    persist();
    renderHome();
  });
}

function initKnown() {
  $("kdRemove").onclick = putBackInReview;
}
