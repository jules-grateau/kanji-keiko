// Stockage de la progression : un fichier JSON par utilisateur dans data/users/.
//
// state = {
//   srs:   { kanji: [boîte, prochaineRévision, nbJustes, nbRatés] },
//   notes: { kanji: texte },
//   days:  ["AAAA-MM-JJ", …]   jours d’entraînement, pour la série (voir public/js/streak.js)
//   t:     dernière mise à jour
// }
const fs = require("fs");
const path = require("path");
const { USERS_DIR } = require("./config");

const MAX_KEY_LENGTH = 4;      // un kanji fait 1 ou 2 unités UTF-16 ; on refuse les clés plus longues
const MAX_NOTE_LENGTH = 2000;
const MAX_ENTRIES = 3000;      // un peu plus que le nombre de kanji : évite qu'un compte remplisse le disque
const MAX_DAYS = 5000;         // ~13 ans d'entraînement quotidien
const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

fs.mkdirSync(USERS_DIR, { recursive: true });

const cache = new Map();       // userId → state, pour ne pas relire le fichier à chaque requête

// L'identifiant Google est numérique ; on le vérifie quand même avant d'en faire un nom de fichier.
function fileOf(userId) {
  if (!/^[\w-]{1,64}$/.test(userId)) throw new Error("identifiant invalide");
  return path.join(USERS_DIR, userId + ".json");
}

function getState(userId) {
  if (cache.has(userId)) return cache.get(userId);
  let state = { srs: {}, notes: {}, days: [], t: 0 };
  try {
    state = Object.assign(state, JSON.parse(fs.readFileSync(fileOf(userId), "utf8")));
  } catch (e) {
    // Pas encore de fichier (première connexion) : état vide.
  }
  cache.set(userId, state);
  return state;
}

// Écriture atomique : fichier temporaire puis renommage, pour ne jamais laisser un JSON à moitié écrit.
function save(userId, state) {
  const file = fileOf(userId), tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, file);
}

const isValidEntry = e => Array.isArray(e) && e.length === 4 && e.every(Number.isFinite);

// Garde l'entrée qui a le plus de révisions (à égalité, la prochaine révision la plus tardive).
// Même règle que côté navigateur (public/js/srs.js).
function isNewer(incoming, current) {
  if (!current) return true;
  const nIn = incoming[2] + incoming[3], nCur = current[2] + current[3];
  return nIn > nCur || (nIn === nCur && incoming[1] > current[1]);
}

// Fusionne l'état envoyé par un appareil dans celui de l'utilisateur, puis sauvegarde.
function merge(userId, incoming) {
  const state = getState(userId);
  if (incoming.reset) state.srs = {};

  for (const k of Object.keys(incoming.srs || {})) {
    const entry = incoming.srs[k];
    if (k.length > MAX_KEY_LENGTH || !isValidEntry(entry)) continue;
    if (!state.srs[k] && Object.keys(state.srs).length >= MAX_ENTRIES) continue;
    if (isNewer(entry, state.srs[k])) state.srs[k] = entry;
  }

  // Une note vide côté appareil supprime la note du serveur.
  for (const k of Object.keys(incoming.notes || {})) {
    const note = incoming.notes[k];
    if (k.length > MAX_KEY_LENGTH || typeof note !== "string") continue;
    if (!note.trim()) { delete state.notes[k]; continue; }
    if (!state.notes[k] && Object.keys(state.notes).length >= MAX_ENTRIES) continue;
    state.notes[k] = note.slice(0, MAX_NOTE_LENGTH);
  }

  // Jours d'entraînement : union des deux listes (on ne perd jamais un jour), les plus récents gardés.
  if (Array.isArray(incoming.days)) {
    const valid = incoming.days.filter(d => typeof d === "string" && DAY_FORMAT.test(d));
    state.days = [...new Set([...state.days, ...valid])].sort().slice(-MAX_DAYS);
  }

  state.t = Date.now();
  save(userId, state);
  return state;
}

module.exports = { getState, merge };
