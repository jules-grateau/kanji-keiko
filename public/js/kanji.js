// Accès aux données kanji (data/kanji.js) et textes d'explication.

// Index kanji → ligne de KANJI.
const KANJI_BY_CHAR = {};
KANJI.forEach(row => { KANJI_BY_CHAR[row[0]] = row; });

// Transforme une ligne brute en objet lisible.
function kanjiInfo(char) {
  const r = KANJI_BY_CHAR[char];
  return {
    char: r[0], level: r[1], strokes: r[2], meanings: r[3], on: r[4], kun: r[5],
    components: r[6], wkLevel: r[7], phonetic: r[8], family: r[9], similar: r[10],
  };
}

// Nom d'un composant : premier sens si c'est un kanji de la liste, sinon le nom fourni par les données
// (COMPONENT_NAMES, data/kanji.js : nom officiel du radical dans Unicode, ou sens KANJIDIC).
// Quelques éléments de KRADFILE (ノ, ｜, ハ…) n'ont pas de nom sourcé : on n'en invente pas.
function componentName(c) {
  const r = KANJI_BY_CHAR[c];
  return r ? r[3][0].toLowerCase() : (COMPONENT_NAMES[c] || "");
}

// Kanji élémentaire = son seul composant, c'est lui-même.
const isElementary = k => k.components.length === 1 && k.components[0] === k.char;

// Famille phonétique (données Kanjium) : la partie du kanji qui donne sa lecture on, et les autres
// kanji de la liste qui la partagent. null si le kanji n'en a pas (pictogrammes, etc.).
function phoneticFamily(k) {
  if (!k.phonetic) return null;
  const [key, readings] = k.phonetic.split("|");
  return {
    key,
    reading: (readings || "").split("、")[0],
    self: key === k.char,   // le kanji est lui-même le composant phonétique (ex. 青)
    family: [...k.family].map(c => ({ char: c, on: KANJI_BY_CHAR[c] ? KANJI_BY_CHAR[c][4][0] || "" : "" })),
  };
}

// Kanji de forme proche, à ne pas confondre : "毎（every）, 梅（plum）", ou "" s'il n'y en a pas.
function similarText(k) {
  return [...k.similar].map(x => x + "（" + componentName(x) + "）").join(", ");
}

// Pages d'autres sites avec des astuces écrites par des humains (on ne peut pas les copier : droits d'auteur).
// WaniKani ne couvre pas tous les kanji : on ne propose le lien que s'il a un niveau WaniKani.
function externalLinks(k) {
  const c = encodeURIComponent(k.char);
  return [
    k.wkLevel ? { name: "WaniKani", url: "https://www.wanikani.com/kanji/" + c } : null,
    { name: "Kanshudo", url: "https://www.kanshudo.com/kanji/" + c },
    { name: "Jisho", url: "https://jisho.org/search/" + c + "%20%23kanji" },
  ].filter(Boolean);
}
