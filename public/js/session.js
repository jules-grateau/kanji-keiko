// Session d'entraînement : une carte par kanji, l'utilisateur l'écrit puis se corrige.

let session = null;
// Écart avant qu'un kanji raté revienne : REDO_GAP puis RELEARN_GAP cartes (constantes dans srs.js).

function showScreen(id) {
  ["login", "home", "settings", "srsInfo", "sources", "catalog", "session", "end"].forEach(x => $(x).classList.toggle("hide", x !== id));
  document.body.classList.toggle("focus", ["session", "catalog", "settings", "srsInfo", "sources"].includes(id));   // on masque le titre pour gagner de la place
  document.body.classList.toggle("on-home", id === "home");    // bouton ⚙ Réglages dans l'en-tête
  document.body.classList.toggle("catalog", id === "catalog");   // écran à hauteur fixe (voir style.css)
}

// Deux sortes de séances, séparées : « review » (révisions dues) et « learn » (nouveaux kanji).
// extraNew : nouveaux kanji en plus de l'objectif (bouton « + 5 en plus »).
function startSession(mode, extraNew = 0) {
  const queue = mode === "review" ? dueKanji() : freshKanji(extraNew);
  session = {
    mode,
    queue: [...queue],
    fresh: new Set(mode === "learn" ? queue : []),   // nouveaux kanji : leur 1re réponse compte pour l'objectif
    current: null,     // kanji affiché
    judged: false,     // réponse déjà jugée ?
    redo: null,        // { k, gap } : kanji à réinsérer dans la file, après `gap` cartes
    learning: {},      // kanji ratés en réapprentissage → réussites encore nécessaires dans la séance
    done: 0, ok: 0, ko: 0,
    known: 0,                // marqués « Je le maîtrise » pendant la session
    seen: new Set(),
    missed: [],
    streakExtended: false,   // première carte de la journée faite pendant cette session ?
    history: [],             // réponses données, pour « ← Précédent » (voir goBack)
  };
  showScreen("session");
  nextCard();
}

// Affiche la carte suivante : sens et lectures, zone de dessin vierge.
function nextCard() {
  if (!session.queue.length) return finishSession();
  const k = kanjiInfo(session.current = session.queue.shift());
  session.judged = false;
  clearStrokes();
  resetPad();
  $("workspace").classList.remove("revealed");
  $("verdict").textContent = "";
  window.scrollTo(0, 0);   // si on était descendu lire l'explication

  $("lvl").textContent = "N" + k.level;
  $("strokes").textContent = k.strokes + " traits";
  $("mean").textContent = k.meanings.map(m => m.toLowerCase()).join(" · ");
  $("readings").innerHTML = k.on.map(x => `<span class="pill on"><em>音</em>${esc(toKatakana(x))}</span>`)
    .concat(k.kun.map(x => `<span class="pill kun"><em>訓</em>${esc(formatKun(x))}</span>`))
    .join("");
  setHidden("readings", settings.hard);   // mode difficile : sens seul
  renderCardSources(k.char, false);

  setHidden("result", true);
  setHidden("checkrow", false);
  setHidden("grade", true);
  setHidden("nextrow", true);
  $("explain").open = false;

  $("back").disabled = !session.history.length;

  const left = session.queue.length + 1;
  $("count").textContent = left + " à faire";
  $("pbar").style.width = (session.done / (session.done + left) * 100) + "%";
}

// Montre la réponse par-dessus le tracé ; l'utilisateur s'auto-évalue ensuite.
function reveal() {
  if (!session || session.judged || !$("result").classList.contains("hide")) return;
  const char = session.current;

  setHidden("result", false);
  setHidden("checkrow", true);
  $("workspace").classList.add("revealed");
  setHidden("readings", false);
  renderStrokes(char);
  showAnswerOverlay(char);
  renderExplanation(char);
  renderCardSources(char, true);

  setHidden("grade", false);
  $("verdict").textContent = "Compare avec ton tracé, puis juge-toi honnêtement.";
  $("verdict").className = "verdict";
}

// ---------- Historique : « ← Précédent » ----------

// Avant chaque réponse, on note l'entrée du kanji et l'état de la session pour pouvoir tout annuler.
function remember(char) {
  session.history.push({
    char,
    entryBefore: progress[char] ? [...progress[char]] : null,
    state: {
      queue: [...session.queue], redo: session.redo, learning: { ...session.learning },
      done: session.done, ok: session.ok, ko: session.ko, known: session.known,
      seen: new Set(session.seen), missed: [...session.missed],
    },
  });
}

// Annule la dernière réponse et réaffiche ce kanji, vierge, pour le refaire.
// Un même kanji peut avoir deux réponses d'affilée (Raté puis « Je le maîtrise ») : on annule les deux.
function goBack() {
  if (!session || !session.history.length) return;
  const char = session.history[session.history.length - 1].char;
  let entry;
  while (session.history.length && session.history[session.history.length - 1].char === char) entry = session.history.pop();

  restoreEntry(char, entry.entryBefore);
  persist();
  Object.assign(session, entry.state);
  session.queue.unshift(char);
  hideToast();
  showScreen("session");
  nextCard();
}

// ---------- Réponses ----------

function judge(ok) {
  const char = session.current;
  remember(char);
  session.judged = true;
  setHidden("grade", true);

  // days = délai avant la prochaine révision, ou null si le kanji revient plus loin dans la séance.
  let days = null;
  if (!ok) {
    // Raté : −2 boîtes, revient dans 4 cartes, et devra être réussi 2 fois avant de repartir.
    answerWrong(char);
    session.learning[char] = RELEARN_SUCCESSES;
    session.redo = { k: char, gap: REDO_GAP };
    session.ko++;
    if (!session.missed.includes(char)) session.missed.push(char);
  } else if (session.learning[char]) {
    // Réapprentissage : encore une réussite à faire plus loin, ou c'est fini et il repart.
    session.ok++;
    if (--session.learning[char] > 0) {
      relearnStep(char);
      session.redo = { k: char, gap: RELEARN_GAP };
    } else {
      delete session.learning[char];
      days = relearnDone(char);
    }
  } else {
    session.ok++;
    days = answerRight(char);
  }
  if (markActiveToday()) session.streakExtended = true;
  if (session.fresh.has(char)) markIntroduced(char);
  session.seen.add(char);
  session.done++;
  persist();

  const v = $("verdict");
  v.className = "verdict " + (ok ? "ok" : "ko");
  v.textContent = !ok ? `Raté ✗ — il revient dans ${REDO_GAP} cartes`
    : days === null ? "Juste ✓ — encore une fois plus loin dans la séance"
    : "Juste ✓ — prochain passage dans " + (days > 1 ? days + " jours" : "1 jour");
  $("explain").open = !ok;   // en cas d'erreur, on déplie directement l'explication
  setHidden("nextrow", false);
  $("back").disabled = false;
  return days;
}

// « J'avais juste » : on enchaîne directement, le verdict s'affiche dans le bandeau du bas.
function judgeCorrect() {
  const char = session.current;
  const days = judge(true);
  next();
  const when = days === null ? "plus loin dans la séance" : days > 1 ? "dans " + days + " jours" : "demain";
  showToast("Juste ✓ — " + char + " revient " + when + ".", goBack, 3500);
}

// « Je le maîtrise » : le kanji sort des révisions et on passe directement à la suite.
function markCurrentKnown() {
  const char = session.current;
  remember(char);
  // Nouveau kanji pas encore répondu : il ne compte pas pour l'objectif, un autre prend sa place.
  if (session.fresh.has(char) && !introducedToday().includes(char)) {
    const replacement = newKanji().find(k => k !== char && !session.fresh.has(k));
    if (replacement) { session.queue.push(replacement); session.fresh.add(replacement); }
  }
  markKnown(char);
  if (session.redo && session.redo.k === char) session.redo = null;
  delete session.learning[char];
  session.missed = session.missed.filter(k => k !== char);
  session.known++;
  session.seen.add(char);
  if (!session.judged) session.done++;   // déjà compté si on l'avait jugé avant
  persist();
  nextCard();

  showToast(char + " ne te sera plus proposé.", goBack);
}

function next() {
  if (session.redo) {
    session.queue.splice(Math.min(session.redo.gap, session.queue.length), 0, session.redo.k);
    session.redo = null;
  }
  nextCard();
}

// Section « Décortiquer ce kanji » : composants, kanji à ne pas confondre,
// liens vers des astuces écrites par des humains, et note perso.
function renderExplanation(char) {
  const k = kanjiInfo(char);
  $("comps").innerHTML = isElementary(k)
    ? '<span class="note">Kanji élémentaire : il ne se décompose pas, c’est lui-même un composant.</span>'
    : k.components.map(c => `<div class="comp"><b>${esc(c)}</b><span>${esc(componentName(c) || "—")}</span></div>`).join("");
  const similar = similarText(k);
  $("similar").textContent = similar ? "Ne pas confondre avec " + similar + "." : "";
  setHidden("similar", !similar);
  $("links").innerHTML = externalLinks(k).map(l =>
    `<a class="ghost" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.name)} ↗</a>`).join("");
  $("note").value = notes[char] || "";
}

function finishSession() {
  if (!session) return;
  $("eOk").textContent = session.ok;
  $("eKo").textContent = session.ko;
  $("eAll").textContent = session.seen.size;
  const g = goalInfo();
  $("eTitle").textContent = session.mode === "review" ? "Révisions terminées" : "Apprentissage terminé";
  $("eGoal").textContent = session.mode === "review" ? "" : g.reached
    ? `🎯 Objectif du jour atteint : ${g.done} / ${g.goal} ✓`
    : `🎯 ${g.done} / ${g.goal} nouveaux aujourd’hui`;
  const { count } = streakInfo();
  $("eStreak").textContent = count
    ? "🔥 " + (session.streakExtended ? "Série prolongée : " : "Série : ") + plural(count)
    : "";
  $("eKnown").textContent = session.known
    ? session.known + (session.known > 1 ? " kanji marqués comme maîtrisés." : " kanji marqué comme maîtrisé.")
    : "";
  setHidden("missWrap", !session.missed.length);
  $("miss").innerHTML = session.missed.map(k => `<span class="jp">${esc(k)}</span>`).join("");
  showScreen("end");
}

function initSession() {
  $("reviewBtn").onclick = () => startSession("review");
  $("learnBtn").onclick = () => startSession("learn", goalInfo().reached ? EXTRA_STEP : 0);
  $("quit").onclick = finishSession;
  $("again").onclick = () => { showScreen("home"); renderHome(); };

  $("check").onclick = reveal;
  $("gy").onclick = judgeCorrect;
  $("back").onclick = goBack;
  $("gn").onclick = () => judge(false);
  $("next").onclick = next;
  $("known").onclick = markCurrentKnown;
  $("animBox").onclick = () => { if ($("anim").innerHTML) playStrokeAnimation(); };

  // Ctrl+Z (ou Cmd+Z) : retirer le dernier trait, sauf quand on écrit sa note.
  document.addEventListener("keydown", e => {
    const inSession = session && !$("session").classList.contains("hide");
    if (inSession && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      undoStroke();
    }
  });

  // Touche Entrée : Vérifier tant que la réponse est cachée, Suivant une fois qu'elle est jugée.
  document.addEventListener("keydown", e => {
    const inSession = session && !$("session").classList.contains("hide");
    const typing = ["BUTTON", "TEXTAREA", "INPUT"].includes(document.activeElement.tagName);
    if (e.key !== "Enter" || !inSession || typing) return;
    e.preventDefault();
    if (session.judged) next(); else reveal();
  });

  // Note perso : sauvegardée à chaque frappe et marquée pour la synchro.
  $("note").addEventListener("input", e => {
    if (!session) return;
    notes[session.current] = e.target.value;
    dirtyNotes[session.current] = 1;
    saveNotes();
    persist();
  });
}
