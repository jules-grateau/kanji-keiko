// Objectif du jour : découvrir settings.goal nouveaux kanji par jour.
//
// Un kanji compte comme découvert dès sa première réponse (juste ou ratée) en session.
// Marqué « Je le maîtrise » sans y avoir répondu, il ne compte pas : on ne l'a pas appris.
// On garde pour chaque jour la liste des kanji découverts plutôt qu'un compteur : entre appareils,
// il suffit de faire l'union des listes (même principe que les jours de la série, voir streak.js).

const KEY_INTRO = "kanji-intro-v1";
const INTRO_KEEP_DAYS = 14;   // seul aujourd'hui sert ; on garde un peu d'historique
const EXTRA_STEP = 5;         // « + 5 nouveaux en plus » une fois l'objectif atteint

let introDays = load(KEY_INTRO, {});   // "AAAA-MM-JJ" → [kanji, …]

const saveIntro = () => save(KEY_INTRO, introDays);
const introducedToday = () => introDays[dayKey()] || [];
const goalRemaining = () => Math.max(0, settings.goal - introducedToday().length);

function pruneIntro() {
  Object.keys(introDays).sort().slice(0, -INTRO_KEEP_DAYS).forEach(d => delete introDays[d]);
}

function markIntroduced(k) {
  const today = dayKey(), list = introDays[today] || (introDays[today] = []);
  if (list.includes(k)) return;
  list.push(k);
  pruneIntro();
  saveIntro();
}

function mergeIntro(incoming) {
  for (const d in incoming || {}) {
    if (!Array.isArray(incoming[d])) continue;
    introDays[d] = [...new Set([...(introDays[d] || []), ...incoming[d]])];
  }
  pruneIntro();
}

// Aperçu pour l'écran Réglages : avec `goal` nouveaux kanji par jour, quand aura-t-on vu chaque niveau ?
// On suit l'ordre des sessions (niveaux actifs, de N5 vers N1, l'un après l'autre ; `skip` = exclus)
// et on part d'aujourd'hui, en tenant compte de ce qui a déjà été découvert aujourd'hui.
// Renvoie { levels: [{ n, left, selected, days, date }], mine, all } ; days = jours d'étude nécessaires.
function goalPreview(goal, skip = settings.skip) {
  const left = {};
  LEVELS.forEach(n => { left[n] = 0; });
  KANJI.forEach(r => { if (!progress[r[0]]) left[r[1]]++; });
  const todayLeft = Math.max(0, goal - introducedToday().length);

  // Pour découvrir `count` kanji : nombre de jours d'étude, et date du dernier.
  const finish = count => {
    if (!count) return { days: 0, date: null };
    const later = Math.max(0, count - todayLeft);       // ce qui ne tient pas aujourd'hui
    const offset = Math.ceil(later / goal);              // jours après aujourd'hui
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return { days: offset + (todayLeft ? 1 : 0), date };
  };

  let mine = 0, all = 0;
  const levels = LEVELS.map(n => {
    const selected = !skip.includes(n);
    all += left[n];
    if (selected) mine += left[n];
    return { n, left: left[n], selected, ...(selected ? finish(mine) : {}) };
  });
  return { levels, mine: finish(mine), all: finish(all) };
}

// Où en est l'objectif du jour (accueil et fin de session).
function goalInfo() {
  const done = introducedToday().length, goal = settings.goal;
  return { done, goal, reached: done >= goal };
}
