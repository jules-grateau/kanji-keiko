// Session d'entraînement : une carte par kanji, l'utilisateur l'écrit puis se corrige.

let session = null;
const REDO_GAP = 4;   // un kanji raté revient après au plus 4 autres cartes

const showScreen = id => ["login", "home", "session", "end"].forEach(x => $(x).classList.toggle("hide", x !== id));
const setHidden = (id, hidden) => $(id).classList.toggle("hide", hidden);

function startSession() {
  const q = buildQueue();
  session = {
    queue: q.due.concat(q.fresh),
    current: null,     // kanji affiché
    judged: false,     // réponse déjà jugée ?
    redo: null,        // kanji raté à réinsérer dans la file
    done: 0, ok: 0, ko: 0,
    seen: new Set(),
    missed: [],
    streakExtended: false,   // première carte de la journée faite pendant cette session ?
  };
  showScreen("session");
  nextCard();
}

// Affiche la carte suivante : sens et lectures, zone de dessin vierge.
function nextCard() {
  if (!session.queue.length) return finishSession();
  const k = kanjiInfo(session.current = session.queue.shift());
  session.judged = false;
  stopStrokeAnimation();
  clearPad();
  $("typed").value = "";
  $("typed").disabled = false;

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

  const left = session.queue.length + 1;
  $("count").textContent = left + " à faire";
  $("pbar").style.width = (session.done / (session.done + left) * 100) + "%";
}

// Montre la réponse. Si un kanji a été tapé, on juge automatiquement ; sinon l'utilisateur s'auto-évalue.
function reveal() {
  if (!session || session.judged || !$("result").classList.contains("hide")) return;
  const char = session.current, typed = $("typed").value.trim();

  setHidden("result", false);
  setHidden("checkrow", true);
  setHidden("readings", false);
  $("ans").textContent = char;
  renderStrokes(char);
  drawAnswerOverlay(char);
  renderExplanation(char);

  if (typed) {
    judge(typed === char);
  } else {
    setHidden("grade", false);
    $("verdict").textContent = "Compare avec ton tracé en rouge, puis juge-toi honnêtement.";
    $("verdict").className = "verdict";
  }
}

function judge(ok) {
  const char = session.current;
  session.judged = true;
  $("typed").disabled = true;
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
  setHidden("missWrap", !session.missed.length);
  $("miss").innerHTML = session.missed.map(k => `<span class="jp">${esc(k)}</span>`).join("");
  showScreen("end");
}

function initSession() {
  $("start").onclick = startSession;
  $("quit").onclick = finishSession;
  $("again").onclick = () => { showScreen("home"); renderHome(); };

  $("check").onclick = reveal;
  $("gy").onclick = () => judge(true);
  $("gn").onclick = () => judge(false);
  $("next").onclick = next;
  $("replay").onclick = playStrokeAnimation;

  // Entrée dans le champ texte = Vérifier (sauf pendant la saisie IME).
  $("typed").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); reveal(); }
  });

  // Entrée ailleurs dans la page = Suivant, une fois la réponse jugée.
  document.addEventListener("keydown", e => {
    const inSession = session && session.judged && !$("session").classList.contains("hide");
    const typing = ["BUTTON", "TEXTAREA", "INPUT"].includes(document.activeElement.tagName);
    if (e.key === "Enter" && inSession && !typing) { e.preventDefault(); next(); }
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
