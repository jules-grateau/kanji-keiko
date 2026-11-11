// Session d'entraînement : une carte par kanji, l'utilisateur l'écrit puis se corrige.

let session = null;
const REDO_GAP = 4;   // un kanji raté revient après au plus 4 autres cartes

function showScreen(id) {
  ["login", "home", "catalog", "session", "end"].forEach(x => $(x).classList.toggle("hide", x !== id));
  document.body.classList.toggle("focus", id === "session" || id === "catalog");   // on masque le titre pour gagner de la place
  document.body.classList.toggle("catalog", id === "catalog");   // écran à hauteur fixe (voir style.css)
}

function startSession() {
  const q = buildQueue();
  session = {
    queue: q.due.concat(q.fresh),
    current: null,     // kanji affiché
    judged: false,     // réponse déjà jugée ?
    redo: null,        // kanji raté à réinsérer dans la file
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
      queue: [...session.queue], redo: session.redo,
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

  const days = recordAnswer(char, ok);
  if (markActiveToday()) session.streakExtended = true;
  if (ok) {
    session.ok++;
  } else {
    session.ko++;
    session.redo = char;
    if (!session.missed.includes(char)) session.missed.push(char);
  }
  session.seen.add(char);
  session.done++;
  persist();

  const v = $("verdict");
  v.className = "verdict " + (ok ? "ok" : "ko");
  v.textContent = ok
    ? "Juste ✓ — prochain passage dans " + (days > 1 ? days + " jours" : days === 1 ? "1 jour" : "quelques instants")
    : "Raté ✗ — il reviendra dans cette session";
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
  const when = days > 1 ? "dans " + days + " jours" : days === 1 ? "demain" : "bientôt";
  showToast("Juste ✓ — " + char + " revient " + when + ".", goBack, 3500);
}

// « Je le maîtrise » : le kanji sort des révisions et on passe directement à la suite.
function markCurrentKnown() {
  const char = session.current;
  remember(char);
  markKnown(char);
  if (session.redo === char) session.redo = null;
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
    session.queue.splice(Math.min(REDO_GAP, session.queue.length), 0, session.redo);
    session.redo = null;
  }
  nextCard();
}

// Section « Décortiquer ce kanji » : composants, radicaux WaniKani, astuce et note perso.
function renderExplanation(char) {
  const k = kanjiInfo(char);
  $("comps").innerHTML = isElementary(k)
    ? '<span class="note">Kanji élémentaire : il ne se décompose pas, c’est lui-même un composant.</span>'
    : k.components.map(c => `<div class="comp"><b>${esc(c)}</b><span>${esc(componentName(c) || "—")}</span></div>`).join("");
  $("wk").textContent = k.wkRadicals.length
    ? "Radicaux WaniKani : " + k.wkRadicals.join(", ") + (k.wkLevel ? " · niveau WK " + k.wkLevel : "")
    : "";
  $("mn").textContent = mnemonicText(k);
  $("note").value = notes[char] || "";
}

function finishSession() {
  if (!session) return;
  $("eOk").textContent = session.ok;
  $("eKo").textContent = session.ko;
  $("eAll").textContent = session.seen.size;
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
  $("start").onclick = startSession;
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
