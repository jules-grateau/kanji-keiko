// Série de jours d'entraînement, façon Duolingo, sans gel : un jour manqué remet la série à zéro.
//
// Un jour compte dès qu'une carte a été jugée (juste ou ratée). On garde la liste des jours
// travaillés ("AAAA-MM-JJ", heure locale) plutôt qu'un compteur : entre plusieurs appareils,
// il suffit de faire l'union des listes pour que tout le monde soit d'accord.

const KEY_DAYS = "kanji-days-v1";

let activeDays = load(KEY_DAYS, []);   // jours travaillés, triés

const saveDays = () => save(KEY_DAYS, activeDays);

// Date locale → "AAAA-MM-JJ".
function dayKey(date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Jour précédent (setDate gère les changements de mois et d'heure).
function previousDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

function mergeDays(incoming) {
  activeDays = [...new Set([...activeDays, ...(incoming || [])])].sort();
}

// Appelé à chaque carte jugée. Renvoie true si c'est la première de la journée.
function markActiveToday() {
  const today = dayKey();
  if (activeDays.includes(today)) return false;
  activeDays.push(today);
  saveDays();
  return true;
}

// Série en cours. Tant qu'on n'a rien fait aujourd'hui, la série d'hier est encore « en jeu ».
function streakInfo() {
  const days = new Set(activeDays), today = dayKey();
  const doneToday = days.has(today);
  let cursor = doneToday ? today : previousDay(today), count = 0;
  while (days.has(cursor)) { count++; cursor = previousDay(cursor); }
  return { count, doneToday, best: bestStreak() };
}

// Plus longue série jamais faite.
function bestStreak() {
  let best = 0, run = 0, prev = null;
  for (const day of activeDays) {
    run = prev && previousDay(day) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

const plural = n => n + (n > 1 ? " jours" : " jour");

// Encart de l'accueil.
function renderStreak() {
  const { count, doneToday, best } = streakInfo();
  $("streak").classList.toggle("off", !doneToday);   // flamme grisée tant que la journée n'est pas faite
  $("streakCount").textContent = count;
  $("streakUnit").textContent = count > 1 ? "jours de suite" : "jour de suite";
  $("streakBest").textContent = best ? "Record : " + plural(best) : "";

  let hint;
  if (doneToday) hint = "C’est bon pour aujourd’hui. Reviens demain pour continuer.";
  else if (count) hint = "Fais au moins une carte aujourd’hui, sinon ta série retombe à zéro.";
  else if (best) hint = "Série perdue. Une carte suffit pour en relancer une.";
  else hint = "Fais une carte par jour pour lancer une série.";
  $("streakHint").textContent = hint;
}
