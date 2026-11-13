// Progression et répétition espacée (SRS). Les règles sont expliquées à l'utilisateur sur la page
// « Comment marche la révision » (js/srs-page.js), qui lit directement les constantes ci-dessous.
//
// Chaque kanji vu a une entrée : [boîte (0..10), prochaineRévision (ms), nbJustes, nbRatés].
// - Juste : +1 boîte ; la boîte fixe le délai avant la prochaine révision (INTERVAL_DAYS, ± aléa).
// - Raté : −LAPSE_DROP boîtes, puis il faut le réussir RELEARN_SUCCESSES fois dans la séance
//   (gestion dans session.js) avant qu'il reparte avec le délai de sa boîte (au moins 1 jour).
// - Les révisions se comptent en jours d'étude (un jour commence à DAY_START_HOUR heures) :
//   un kanji prévu pour un jour est à réviser dès le début de ce jour, à n'importe quelle heure.
// - Un kanji marqué « Je le maîtrise » passe en boîte KNOWN_BOX et ne revient plus.
//
// nbJustes + nbRatés sert aussi de numéro de version pour la synchro (l'entrée qui en a
// le plus gagne) : toute modification doit donc l'augmenter, sinon un autre appareil l'écraserait.

const INTERVAL_DAYS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 365];   // délai par boîte (jours)
const MAX_BOX = INTERVAL_DAYS.length - 1;   // dernière boîte : une révision par an
const LEARNED_BOX = 4;      // à partir de cette boîte (8 jours), le kanji est « appris »
const MASTERED_BOX = 6;     // à partir de cette boîte (32 jours), il est « maîtrisé »
const LAPSE_DROP = 2;       // un raté fait descendre de 2 boîtes
const RELEARN_SUCCESSES = 2;   // après un raté : 2 réussites dans la séance avant de repartir
const REDO_GAP = 4;         // un kanji raté revient après au plus 4 autres cartes
const RELEARN_GAP = 10;     // … puis, après la 1re réussite, encore une fois ~10 cartes plus loin
const DISCOVER_GAP = 2;     // nouveau kanji : écrit de tête après 2 autres cartes (≈ 3 cartes après sa découverte)
const FUZZ_FROM_DAYS = 8;   // à partir de 8 jours, le délai varie au hasard…
const FUZZ = 0.1;           // … de ±10 %, pour étaler les révisions (pas de pics)
const DAY_START_HOUR = 4;   // un jour d'étude commence à 4 h du matin
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

// Réglages : niveaux exclus, objectif de nouveaux kanji par jour, mode difficile.
// Par défaut, tous les niveaux, de N5 vers N1 ; `skip` liste ceux qu'on saute pour les nouveaux kanji.
// (L'ancien réglage `lv`, niveaux choisis, est volontairement oublié : tout le monde repart sur N5 → N1.)
// Ils suivent le compte (synchro) : `t` = date du dernier changement, le plus récent gagne.
function normalizeSettings(s) {
  if (!s) return { skip: [], goal: 10, hard: false, t: 0 };   // valeurs par défaut : le serveur l'emporte
  return {
    skip: Array.isArray(s.skip) ? s.skip.filter(n => LEVELS.includes(n)) : [],
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

// ---------- Jours d'étude ----------

// Début (DAY_START_HOUR heures) du jour d'étude d'aujourd'hui, décalé de `offset` jours.
// Avant 4 h du matin, on est encore « la veille ».
function studyDayStart(offset = 0) {
  const d = new Date(Date.now() - DAY_START_HOUR * 36e5);
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  d.setDate(d.getDate() + offset);   // setDate gère les changements de mois et d'heure
  return d.getTime();
}

// À réviser : prévu pour aujourd'hui (ou avant), quelle que soit l'heure.
const isDue = e => e[1] < studyDayStart(1);

// Compteurs par niveau JLPT : total, vus, appris, maîtrisés, à réviser.
function levelStats() {
  const out = {};
  for (const n of LEVELS) out[n] = { total: 0, seen: 0, learned: 0, mastered: 0, due: 0 };
  KANJI.forEach(r => {
    const o = out[r[1]], e = progress[r[0]];
    o.total++;
    if (!e) return;
    o.seen++;
    if (e[0] >= LEARNED_BOX) o.learned++;     // « Je le maîtrise » (boîte 99) compte aussi
    if (e[0] >= MASTERED_BOX) o.mastered++;
    if (isDue(e)) o.due++;
  });
  return out;
}

// Niveaux d'où viennent les nouveaux kanji, de N5 vers N1 (tous, sauf ceux exclus dans les Réglages).
const activeLevels = (skip = settings.skip) => LEVELS.filter(n => !skip.includes(n));

// Kanji des niveaux actifs, dans l'ordre de la liste (N5 d'abord).
const levelPool = () => {
  const levels = new Set(activeLevels());
  return KANJI.filter(r => levels.has(r[1])).map(r => r[0]);
};

// Niveau « en cours » : le premier niveau actif qui a encore des kanji jamais vus.
const currentLevel = () => activeLevels().find(n => KANJI.some(r => r[1] === n && !progress[r[0]]));

// Kanji jamais vus des niveaux actifs : les prochains à découvrir.
const newKanji = () => levelPool().filter(k => !progress[k]);

// Révisions : TOUTES les révisions échues, de tous les niveaux (un kanji appris se révise, même hors
// des niveaux choisis), les plus anciennes d'abord et sans plafond pour respecter le SRS.
const dueKanji = () => Object.keys(progress)
  .filter(k => KANJI_BY_CHAR[k] && isDue(progress[k]))
  .sort((a, b) => progress[a][1] - progress[b][1]);

// Apprentissage : les nouveaux des niveaux actifs (N5 d'abord) qui restent pour l'objectif du jour,
// ou `extraNew` de plus une fois l'objectif atteint.
const freshKanji = (extraNew = 0) => newKanji().slice(0, extraNew || goalRemaining());

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

// Ajouté à la main aux révisions (« À réviser ») : il repart du début du cycle, à revoir tout de suite.
function queueForReview(k) {
  const e = progress[k];
  progress[k] = e ? [0, Date.now(), e[2] + 1, e[3]] : [0, Date.now(), 0, 0];
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

// ---------- Réponses ----------

// Délai d'une boîte, avec l'aléa de ±10 % à partir de 8 jours (8 j → 7 à 9 j, 32 j → 29 à 35 j).
function fuzzDays(days) {
  if (days < FUZZ_FROM_DAYS) return days;
  const spread = Math.round(days * FUZZ);
  return days + Math.round((Math.random() * 2 - 1) * spread);
}

// Programme la prochaine révision d'après la boîte : au début du jour d'étude concerné.
function schedule(e) {
  const days = fuzzDays(INTERVAL_DAYS[e[0]]);
  e[1] = studyDayStart(days);
  return days;
}

// Juste : +1 boîte. Renvoie le délai en jours.
function answerRight(k) {
  const e = progress[k] || [0, 0, 0, 0];
  e[0] = Math.min(e[0] + 1, MAX_BOX);
  e[2]++;
  progress[k] = e;
  return schedule(e);
}

// Raté : −2 boîtes, à revoir tout de suite (réapprentissage dans la séance, voir session.js).
function answerWrong(k) {
  const e = progress[k] || [0, 0, 0, 0];
  e[0] = Math.max(0, e[0] - LAPSE_DROP);
  e[1] = Date.now();
  e[3]++;
  progress[k] = e;
}

// Réapprentissage : réussite qui n'est pas encore la dernière → toujours à revoir tout de suite.
function relearnStep(k) {
  const e = progress[k];
  e[1] = Date.now();
  e[2]++;
}

// Réapprentissage terminé : il repart avec le délai de sa boîte (au moins la boîte 1 : demain).
function relearnDone(k) {
  const e = progress[k];
  e[0] = Math.max(1, e[0]);
  e[2]++;
  return schedule(e);
}
