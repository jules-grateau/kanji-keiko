// Accès aux données kanji (data/kanji.js) et textes d'explication.

// Index kanji → ligne de KANJI.
const KANJI_BY_CHAR = {};
KANJI.forEach(row => { KANJI_BY_CHAR[row[0]] = row; });

// Transforme une ligne brute en objet lisible.
function kanjiInfo(char) {
  const r = KANJI_BY_CHAR[char];
  return {
    char: r[0], level: r[1], strokes: r[2], meanings: r[3], on: r[4], kun: r[5],
    components: r[6], wkRadicals: r[7], wkLevel: r[8], phonetic: r[9], family: r[10], similar: r[11],
  };
}

// Noms des composants qui ne sont pas eux-mêmes des kanji de la liste (formes réduites, radicaux…).
const RADICAL_NAMES = {
  "氵": "water", "⺅": "person", "⺾": "grass", "扌": "hand", "刂": "knife", "忄": "heart", "⻖": "hill",
  "⻏": "village", "⺌": "small", "灬": "fire", "辶": "road", "亠": "lid", "ノ": "slash", "｜": "stick",
  "ハ": "split", "丶": "dot", "𠆢": "roof", "冂": "frame", "冖": "cover", "宀": "roof", "厂": "cliff",
  "广": "shelter", "尸": "flag", "夂": "slow walk", "攵": "strike", "隹": "bird", "匕": "spoon", "勹": "wrap",
  "冫": "ice", "卩": "seal", "几": "table", "卜": "divination", "巾": "cloth", "彳": "step", "廾": "two hands",
  "ヨ": "comb", "厶": "private", "幺": "thread", "亅": "hook", "并": "together", "罒": "net", "⺹": "old",
  "𦥑": "hands", "⺼": "flesh", "龴": "claw", "乚": "hook", "マ": "fold", "ユ": "hook", "癶": "footsteps",
  "耂": "old", "⺊": "divination", "⺈": "knife", "艹": "grass", "牜": "cow", "犭": "dog", "礻": "altar",
  "衤": "clothes", "禸": "track", "疒": "sickness", "王": "king", "缶": "jar",
};

// Nom d'un composant : premier sens si c'est un kanji connu, sinon nom du radical.
function componentName(c) {
  const r = KANJI_BY_CHAR[c];
  return r ? r[3][0].toLowerCase() : (RADICAL_NAMES[c] || "");
}

// Kanji élémentaire = son seul composant, c'est lui-même.
const isElementary = k => k.components.length === 1 && k.components[0] === k.char;

// Astuce générée automatiquement à partir des composants et des kanji similaires.
function mnemonicText(k) {
  const meaning = k.meanings[0].toLowerCase();
  const parts = [];

  if (isElementary(k)) {
    parts.push(`Forme : kanji de base. Dessine-le comme un pictogramme de « ${meaning} » et retiens ses ${k.strokes} traits.`);
  } else {
    const story = k.components.map(c => c + " (" + (componentName(c) || "?") + ")").join(" + ");
    parts.push(`Histoire : ${story}. Invente une scène qui réunit ces éléments et aboutit à « ${meaning} » ; plus elle est absurde, mieux elle reste.`);
  }

  const how = k.components.length > 1
    ? "composant par composant, de gauche à droite et de haut en bas"
    : "d’un seul bloc, de haut en bas";
  parts.push(`Écriture : ${k.strokes} traits au total ; trace ${how}.`);

  if (k.similar) {
    const list = [...k.similar].map(x => x + "（" + componentName(x) + "）").join(", ");
    parts.push(`Piège de forme : ne le confonds pas avec ${list}.`);
  }
  return parts.join("\n");
}
