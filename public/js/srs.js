// Progression et répétition espacée (SRS).
//
// Chaque kanji vu a une entrée : [boîte (0..7), prochaineRévision (ms), nbJustes, nbRatés].
// Une bonne réponse fait monter d'une boîte, une erreur renvoie en boîte 0.
// La boîte fixe le délai avant la prochaine révision (INTERVAL_DAYS).

const INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32, 64];
const DAY_MS = 864e5;
const MASTERED_BOX = 4;   // à partir de cette boîte, le kanji compte comme « maîtrisé »
const MAX_DUE = 40;       // nombre max de révisions par session
const LEVELS = [5, 4, 3, 2, 1];

// Clés localStorage (ne pas renommer : elles contiennent la progression existante).
const KEY_PROGRESS = "kanji-srs-v1";
const KEY_SETTINGS = "kanji-set-v1";
const KEY_NOTES = "kanji-notes-v1";

let progress = load(KEY_PROGRESS, {});                                     // kanji → entrée SRS
let settings = load(KEY_SETTINGS, { lv: [3, 2], n: 10, hard: false });     // niveaux choisis, nouveaux/session, mode difficile
let notes = load(KEY_NOTES, {});                                           // kanji → note perso

const saveProgress = () => save(KEY_PROGRESS, progress);
const saveSettings = () => save(KEY_SETTINGS, settings);
const saveNotes = () => save(KEY_NOTES, notes);

// Entre deux entrées pour un même kanji, garde celle qui a le plus de révisions
// (à égalité, celle dont la prochaine révision est la plus tardive). Même règle côté serveur.
function isNewer(incoming, current) {
  if (!current) return true;
  const nIn = incoming[2] + incoming[3], nCur = current[2] + current[3];
  return nIn > nCur || (nIn === nCur && incoming[1] > current[1]);
}

function mergeProgress(incoming) {
  for (const k in incoming || {}) {
    if (isNewer(incoming[k], progress[k])) progress[k] = incoming[k];
  }
}

// Compteurs par niveau JLPT : total, vus, maîtrisés, à réviser.
function levelStats() {
  const now = Date.now(), out = {};
  for (const n of LEVELS) out[n] = { total: 0, seen: 0, mastered: 0, due: 0 };
  KANJI.forEach(r => {
    const o = out[r[1]], e = progress[r[0]];
    o.total++;
    if (!e) return;
    o.seen++;
    if (e[0] >= MASTERED_BOX) o.mastered++;
    if (e[1] <= now) o.due++;
  });
  return out;
}

// Kanji à travailler : révisions échues (les plus anciennes d'abord) + nouveaux jamais vus.
function buildQueue() {
  const now = Date.now(), levels = new Set(settings.lv);
  const pool = KANJI.filter(r => levels.has(r[1])).map(r => r[0]);
  const due = pool
    .filter(k => progress[k] && progress[k][1] <= now)
    .sort((a, b) => progress[a][1] - progress[b][1])
    .slice(0, MAX_DUE);
  const fresh = pool.filter(k => !progress[k]).slice(0, settings.n);
  return { due, fresh };
}

// Enregistre une réponse et renvoie le délai (en jours) avant la prochaine révision.
function recordAnswer(k, ok) {
  const e = progress[k] || [0, 0, 0, 0];
  if (ok) { e[0] = Math.min(e[0] + 1, INTERVAL_DAYS.length - 1); e[2]++; }
  else { e[0] = 0; e[3]++; }
  const days = INTERVAL_DAYS[e[0]];
  e[1] = Date.now() + days * DAY_MS;
  progress[k] = e;
  return days;
}
