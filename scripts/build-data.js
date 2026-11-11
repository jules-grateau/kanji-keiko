#!/usr/bin/env node
// Construit public/data/kanji.js à partir de sources publiques et documentées.
// Chaque colonne indique sa source et sa licence (en tête du fichier généré, et dans public/js/sources.js).
//
//   node scripts/build-data.js
//
// Node 22+, aucune dépendance. Les fichiers sources sont téléchargés une fois dans un dossier de cache
// (dossier temporaire du système), puis réutilisés. Supprime ce dossier pour tout retélécharger.
//
// public/data/strokes.js (tracés KanjiVG) n'est pas reconstruit ici : il sert seulement d'entrée,
// pour le nombre de traits (un tracé = un trait, ce qui garantit que le nombre affiché colle au dessin).

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public/data/kanji.js");
const STROKES = path.join(ROOT, "public/data/strokes.js");
const CACHE = path.join(os.tmpdir(), "kanji-keiko-sources");

// ---------- Sources ----------

const SRC = {
  // KANJIDIC (sens, lectures) + listes JLPT de Jonathan Waller + niveau WaniKani, assemblés par kanji-data.
  kanjiData: "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json",
  // KRADFILE (EDRDG) : composants de chaque kanji. Encodé en EUC-JP.
  kradfile: "http://ftp.edrdg.org/pub/Nihongo/kradfile.gz",
  // Kanjium : composant phonétique de chaque kanji, lectures des composants, kanji d'aspect proche.
  kanjiumDict: "https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/kanjidict.txt",
  kanjiumPhonetics: "https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/phonetics.txt",
  kanjiumLookalikes: "https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/lookalikes.txt",
  // Lars Yencken (2010) : 10 kanji les plus proches de chaque jōyō, par distance d'édition des traits.
  yencken: "https://lars.yencken.org/datasets/kanji-confusion/jyouyou__strokeEditDistance.csv",
  // Unicode : noms officiels des radicaux, et correspondance radical → idéogramme.
  unicodeData: "https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt",
  unicodeEquiv: "https://www.unicode.org/Public/UCD/latest/ucd/EquivalentUnifiedIdeograph.txt",
};

const MAX_MEANINGS = 3;        // sens gardés par kanji
const MAX_READINGS = 4;        // lectures on et kun gardées
const MAX_SIMILAR = 3;         // kanji « à ne pas confondre »
const YENCKEN_MIN_SCORE = 0.7; // en dessous, les rapprochements calculés sont trop lointains
const MAX_FAMILY = 8;          // kanji de la même famille phonétique

async function fetchCached(name, url) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, name);
  if (!fs.existsSync(file)) {
    process.stdout.write(`Téléchargement de ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return fs.readFileSync(file);
}

const text = buf => buf.toString("utf8");
const toHiragana = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 96));
const readJsConst = (file, name) => (0, eval)("(" + fs.readFileSync(file, "utf8").replace(new RegExp(`^[\\s\\S]*?const ${name} =`), "").replace(/;\s*$/, "") + ")");

async function main() {
  const kanjiData = JSON.parse(text(await fetchCached("kanji.json", SRC.kanjiData)));
  const strokes = readJsConst(STROKES, "STROKES");

  // ---------- Liste des kanji : tous ceux qui ont un niveau JLPT, N5 d'abord, puis par nombre de traits ----------
  const chars = Object.keys(kanjiData)
    .filter(k => kanjiData[k].jlpt_new)
    .sort((a, b) => kanjiData[b].jlpt_new - kanjiData[a].jlpt_new || kanjiData[a].strokes - kanjiData[b].strokes);
  const missingStrokes = chars.filter(k => !strokes[k]);
  if (missingStrokes.length) throw new Error("Pas de tracé KanjiVG pour : " + missingStrokes.join(" "));
  const inList = new Set(chars);

  // ---------- KRADFILE : composants ----------
  const kradText = new TextDecoder("euc-jp").decode(zlib.gunzipSync(await fetchCached("kradfile.gz", SRC.kradfile)));
  const krad = {};
  for (const line of kradText.split("\n")) {
    if (line.startsWith("#") || !line.includes(" : ")) continue;
    const [k, rest] = line.split(" : ");
    krad[k.trim()] = rest.trim().split(/\s+/);
  }
  // L'en-tête de KRADFILE donne les caractères de substitution et le vrai élément Unicode (ex. « 汁 U+2EA1 »).
  const substitute = {};
  for (const m of kradText.matchAll(/^#\s+(\S)\s+U\+([0-9A-F]{4,5})\s*$/gmu)) substitute[m[1]] = parseInt(m[2], 16);

  // ---------- Unicode : noms des radicaux, et forme « idéogramme » équivalente ----------
  const uniName = {};
  for (const line of text(await fetchCached("UnicodeData.txt", SRC.unicodeData)).split("\n")) {
    const [cp, name] = line.split(";");
    if (/RADICAL/.test(name || "")) uniName[parseInt(cp, 16)] = name;
  }
  const equivalent = {};   // radical (U+2Exx / U+2Fxx) → idéogramme unifié
  const radicalOf = {};    // idéogramme unifié → radical
  for (const line of text(await fetchCached("EquivalentUnifiedIdeograph.txt", SRC.unicodeEquiv)).split("\n")) {
    const m = line.match(/^([0-9A-F]{4,5})(?:\.\.([0-9A-F]{4,5}))?\s*;\s*([0-9A-F]{4,5})/);
    if (!m) continue;
    const to = parseInt(m[3], 16);
    for (let cp = parseInt(m[1], 16); cp <= parseInt(m[2] || m[1], 16); cp++) {
      equivalent[cp] = to;
      if (!(to in radicalOf) || /KANGXI/.test(uniName[cp] || "")) radicalOf[to] = cp;
    }
  }
  // "CJK RADICAL WATER ONE" → "water", "KANGXI RADICAL PERSON" → "person"
  const radicalName = cp => (uniName[cp] || "")
    .replace(/^(CJK|KANGXI) RADICAL /, "").replace(/ (ONE|TWO|THREE|FOUR)$/, "").replace(/^(C-|J-)?SIMPLIFIED /, "").toLowerCase();

  // Composant tel qu'affiché : le vrai élément si KRADFILE utilise un substitut, sinon le caractère lui-même.
  const componentNames = {};
  function component(c) {
    let cp = substitute[c], shown = c;
    if (cp !== undefined) shown = String.fromCodePoint(equivalent[cp] || cp);
    else cp = radicalOf[c.codePointAt(0)];
    // Nom : le nom officiel du radical dans Unicode si c'en est un (« step » pour 彳),
    // sinon le premier sens KANJIDIC.
    if (!inList.has(shown) && !componentNames[shown]) {
      const kd = kanjiData[shown];
      const meaning = kd && kd.meanings && kd.meanings.find(m => !/radical/i.test(m));
      if (cp !== undefined && radicalName(cp)) componentNames[shown] = radicalName(cp);
      else if (meaning) componentNames[shown] = meaning.toLowerCase();
    }
    return shown;
  }

  // ---------- Kanjium : phonétique et kanji d'aspect proche ----------
  const phoneticOf = {};
  for (const line of text(await fetchCached("kanjidict.txt", SRC.kanjiumDict)).split("\n")) {
    const c = line.split("\t");
    if (c[0] && c[3] && c[3].trim()) phoneticOf[c[0]] = c[3].trim();
  }
  const phoneticReading = {};
  for (const line of text(await fetchCached("phonetics.txt", SRC.kanjiumPhonetics)).split("\n")) {
    const c = line.split("\t");
    if (c[0] && c[1]) phoneticReading[c[0]] = toHiragana(c[1].trim());
  }
  const lookalikes = {};
  for (const line of text(await fetchCached("lookalikes.txt", SRC.kanjiumLookalikes)).split("\n")) {
    const [k, list] = line.split("\t");
    if (k && list) lookalikes[k.trim()] = list.trim().split(",").map(s => s.trim());
  }

  // ---------- Yencken : kanji proches par le tracé ----------
  const yencken = {};
  for (const line of text(await fetchCached("yencken.csv", SRC.yencken)).trim().split("\n")) {
    const c = line.trim().split(/\s+/);
    yencken[c[0]] = [];
    for (let i = 1; i < c.length; i += 2) yencken[c[0]].push({ k: c[i], score: +c[i + 1] });
  }

  // Kanji à ne pas confondre : la liste faite à la main de Kanjium si elle existe,
  // sinon les plus proches selon Yencken (score ≥ seuil). Seulement des kanji de la liste.
  function similar(k) {
    const human = (lookalikes[k] || []).filter(x => x !== k && inList.has(x));
    if (human.length) return { list: human.slice(0, MAX_SIMILAR), src: "kanjium" };
    const computed = (yencken[k] || []).filter(x => x.score >= YENCKEN_MIN_SCORE && x.k !== k && inList.has(x.k)).map(x => x.k);
    return { list: computed.slice(0, MAX_SIMILAR), src: computed.length ? "yencken" : "" };
  }

  // Familles phonétiques : kanji de la liste qui partagent le même composant phonétique.
  const byPhonetic = {};
  for (const k of chars) if (phoneticOf[k]) (byPhonetic[phoneticOf[k]] = byPhonetic[phoneticOf[k]] || []).push(k);

  // ---------- Assemblage ----------
  const stats = { similarKanjium: 0, similarYencken: 0, phonetic: 0, family: 0 };
  const rows = chars.map(k => {
    const d = kanjiData[k];
    const comps = (krad[k] || [k]).map(component);
    const p = phoneticOf[k];
    const phonetic = p ? p + "|" + (phoneticReading[p] || "") : "";
    const family = p ? (byPhonetic[p] || []).filter(x => x !== k).slice(0, MAX_FAMILY).join("") : "";
    const sim = similar(k);
    if (sim.src === "kanjium") stats.similarKanjium++;
    if (sim.src === "yencken") stats.similarYencken++;
    if (phonetic) stats.phonetic++;
    if (family) stats.family++;
    return [
      k,
      d.jlpt_new,
      strokes[k].length,
      d.meanings.filter(m => !/radical/i.test(m)).slice(0, MAX_MEANINGS),
      (d.readings_on || []).slice(0, MAX_READINGS),
      (d.readings_kun || []).slice(0, MAX_READINGS),
      comps,
      d.wk_level || 0,
      phonetic,
      family,
      sim.list.join(""),
    ];
  });

  const header = `// FICHIER GÉNÉRÉ par scripts/build-data.js — ne pas modifier à la main, relancer le script.
//
// Liste des kanji (JLPT N5 → N1, puis par nombre de traits). Une ligne par kanji :
// [kanji, niveauJLPT (5..1), nbTraits, sens[], lecturesOn[], lecturesKun[],
//  composants[], niveauWaniKani, phonétique, famille, similaires]
//
// Sources et licences, colonne par colonne (détail dans public/js/sources.js) :
// - niveauJLPT    : listes JLPT de Jonathan Waller (tanos.co.uk), via kanji-data (David Gouveia, MIT).
// - nbTraits      : nombre de tracés KanjiVG (Ulrich Apel, CC BY-SA 3.0) dans public/data/strokes.js.
// - sens, lectures: KANJIDIC (EDRDG, CC BY-SA 4.0), via kanji-data. ${MAX_MEANINGS} sens et ${MAX_READINGS} lectures au plus.
// - composants    : KRADFILE (EDRDG, CC BY-SA 4.0). Les caractères de substitution de KRADFILE sont remplacés
//                   par l'élément réel, d'après la table de correspondance de l'en-tête de KRADFILE.
// - niveauWaniKani: WaniKani via kanji-data ; 0 = absent. Sert seulement à savoir si le lien WaniKani existe.
// - phonétique    : « composant|lecture », Kanjium (CC BY-SA 4.0), fichiers kanjidict.txt et phonetics.txt.
// - famille       : kanji de la liste qui partagent le même composant phonétique (calculé depuis Kanjium).
// - similaires    : kanji à ne pas confondre. Kanjium lookalikes.txt (liste faite à la main, CC BY-SA 4.0) ;
//                   à défaut, Lars Yencken (2010), « Orthographic support for passing the reading hurdle
//                   in Japanese », thèse, Univ. de Melbourne — distance d'édition des traits (CC BY 3.0),
//                   score ≥ ${YENCKEN_MIN_SCORE}, ${MAX_SIMILAR} au plus.
// COMPONENT_NAMES : noms des composants qui ne sont pas dans la liste : nom officiel du radical dans Unicode
//                   (UnicodeData.txt), sinon premier sens KANJIDIC (via kanji-data).
`;
  const out = header + "const KANJI = [\n" + rows.map(r => "  " + JSON.stringify(r)).join(",\n") + "\n];\n\n"
    + "const COMPONENT_NAMES = " + JSON.stringify(componentNames, null, 0).replace(/,"/g, ',\n  "').replace(/^\{/, "{\n  ").replace(/\}$/, "\n}") + ";\n";
  fs.writeFileSync(OUT, out);

  const noName = new Set();
  rows.forEach(r => r[6].forEach(c => { if (!inList.has(c) && !componentNames[c]) noName.add(c); }));
  console.log(`${rows.length} kanji écrits dans ${path.relative(ROOT, OUT)}`);
  console.log(`similaires : ${stats.similarKanjium} (Kanjium) + ${stats.similarYencken} (Yencken) | phonétique : ${stats.phonetic} | famille : ${stats.family}`);
  console.log(`noms de composants : ${Object.keys(componentNames).length} | composants sans nom : ${noName.size} ${[...noName].join(" ")}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
