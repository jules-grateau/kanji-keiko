// Progression et répétition espacée (SRS).
//
// Chaque kanji vu a une entrée : [boîte (0..7), prochaineRévision (ms), nbJustes, nbRatés].
// Une bonne réponse fait monter d'une boîte, une erreur renvoie en boîte 0.
// La boîte fixe le délai avant la prochaine révision (INTERVAL_DAYS).
// Un kanji marqué « Je le maîtrise » passe en boîte KNOWN_BOX et ne revient plus.
//
// nbJustes + nbRatés sert aussi de numéro de version pour la synchro (l'entrée qui en a
// le plus gagne) : toute modification doit donc l'augmenter, sinon un autre appareil l'écraserait.

const INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32, 64];
const DAY_MS = 864e5;
const MASTERED_BOX = 4;   // à partir de cette boîte, le kanji compte comme « maîtrisé »
const LEVELS = [5, 4, 3, 2, 1];
const GOAL_MIN = 1, GOAL_MAX = 100;         // objectif : nouveaux kanji par jour
const GOAL_PRESETS = [5, 10, 15, 20, 30];   // raccourcis de l'écran Réglages
const isValidGoal = g => Number.isInteger(g) && g >= GOAL_MIN && g <= GOAL_MAX;
const KNOWN_BOX = 99;                // « Je le maîtrise » : sorti des révisions
const KNOWN_DUE = Date.UTC(2100, 0, 1);  // date de révision qui n'arrive jamais

// Clés localStorage (ne pas renommer : elles contiennent la progression existante).
const KEY_PROGRESS = "kanji-srs-v1";
const KEY_SETTINGS = "kanji-set-v1";
const KEY_NOTES = "kanji-notes-v1";

// Réglages : niveaux choisis, objectif de nouveaux kanji par jour, mode difficile.
// Ils suivent le compte (synchro) : `t` = date du dernier changement, le plus récent gagne.
function normalizeSettings(s) {
  if (!s) return { lv: [3, 2], goal: 10, hard: false, t: 0 };   // valeurs par défaut : le serveur l'emporte
  return {
    lv: Array.isArray(s.lv) ? s.lv.filter(n => LEVELS.includes(n)) : [3, 2],
    goal: isValidGoal(s.goal) ? s.goal : isValidGoal(s.n) ? s.n : 10,   // n : ancien « par session »
    hard: !!s.hard,
    t: Number.isFinite(s.t) ? s.t : 1,   // ancien réglage local sans date : préféré aux valeurs par défaut
  };
}

let progress = load(KEY_PROGRESS, {});                       // kanji → entrée SRS
let settings = normalizeSettings(load(KEY_SETTINGS, null));
let notes = load(KEY_NOTES, {});                             // kanji → note perso

const saveProgress = () => save(KEY_PROGRESS, progress);
const saveSettings = () => save(KEY_SETTINGS, settings);
const saveNotes = () => save(KEY_NOTES, notes);

// Modifie les réglages, les date, les enregistre et les envoie au serveur.
function changeSettings(update) {
  update(settings);
  settings.t = Date.now();
  saveSettings();
  persist();
}

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

// Kanji des niveaux choisis, dans l'ordre de la liste.
const levelPool = () => {
  const levels = new Set(settings.lv);
  return KANJI.filter(r => levels.has(r[1])).map(r => r[0]);
};

// Kanji jamais vus des niveaux choisis : les prochains à découvrir.
const newKanji = () => levelPool().filter(k => !progress[k]);

// Kanji à travailler : TOUTES les révisions échues (les plus anciennes d'abord), sans plafond pour
// respecter le SRS, + les nouveaux qui restent pour l'objectif du jour (ou `extraNew` au-delà).
function buildQueue(extraNew = 0) {
  const now = Date.now();
  const due = levelPool()
    .filter(k => progress[k] && progress[k][1] <= now)
    .sort((a, b) => progress[a][1] - progress[b][1]);
  const fresh = newKanji().slice(0, extraNew || goalRemaining());
  return { due, fresh };
}

// Marque un kanji comme maîtrisé. Renvoie l'entrée d'avant, pour pouvoir annuler.
function markKnown(k) {
  const before = progress[k] ? [...progress[k]] : null;
  const e = before ? [...before] : [0, 0, 0, 0];
  e[0] = KNOWN_BOX;
  e[1] = KNOWN_DUE;
  e[2]++;   // compte comme une bonne réponse (et fait gagner cette version à la synchro)
  progress[k] = e;
  return before;
}

// Remet l'entrée d'un kanji dans l'état `before` (annulation d'une réponse ou d'un « Je le maîtrise »).
// Sans `before` (kanji nouveau), il devient à revoir tout de suite.
// La version augmente quand même, sinon la synchro ramènerait l'état annulé.
function restoreEntry(k, before) {
  const current = progress[k];
  progress[k] = before
    ? [before[0], before[1], current[2] + 1, current[3]]
    : [0, Date.now(), current[2] + 1, current[3]];
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
