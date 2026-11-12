// Sources des données et licences : la ligne « Sources » sous chaque carte et la page « Sources et licences ».
// Tout est décrit ici, une seule fois.
//
// data/kanji.js est généré par scripts/build-data.js, qui télécharge chaque source ci-dessous ;
// data/strokes.js vient de KanjiVG. L'en-tête de chaque fichier de données détaille colonne par colonne.

const SOURCES = {
  kanjidic: {
    name: "KANJIDIC", short: "KANJIDIC",
    author: "Electronic Dictionary Research and Development Group (EDRDG)",
    license: "CC BY-SA 4.0", licenseUrl: "https://www.edrdg.org/edrdg/licence.html",
    url: "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project",
    used: "sens, lectures on / kun ; nom des composants qui sont des kanji",
  },
  kanjivg: {
    name: "KanjiVG", short: "KanjiVG",
    author: "Ulrich Apel et les contributeurs de KanjiVG",
    license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/deed.fr",
    url: "https://kanjivg.tagaini.net/",
    used: "tracés et ordre des traits (animation, trait par trait, kanji affiché sur ton dessin), nombre de traits",
  },
  jlpt: {
    name: "Listes JLPT de Jonathan Waller", short: "J. Waller",
    author: "Jonathan Waller (tanos.co.uk)",
    license: "non précisée",
    url: "http://www.tanos.co.uk/jlpt/",
    used: "niveau JLPT (N5 à N1) de chaque kanji",
  },
  kradfile: {
    name: "KRADFILE", short: "KRADFILE",
    author: "Michael Raine, Jim Breen et l'EDRDG",
    license: "CC BY-SA 4.0", licenseUrl: "https://www.edrdg.org/edrdg/licence.html",
    url: "https://www.edrdg.org/krad/kradinf.html",
    used: "composants d'un kanji (« Décortiquer ce kanji »). Les caractères de substitution de KRADFILE "
      + "(ex. 汁 pour 氵) sont remplacés par l'élément réel, d'après la table de son propre en-tête",
  },
  unicode: {
    name: "Unicode — noms des radicaux", short: "Unicode",
    author: "Unicode Consortium (UnicodeData.txt, EquivalentUnifiedIdeograph.txt)",
    license: "Licence Unicode (libre)", licenseUrl: "https://www.unicode.org/license.txt",
    url: "https://www.unicode.org/charts/PDF/U2F00.pdf",
    used: "nom des composants qui sont des radicaux (氵 « water », 辶 « walk »…). "
      + "Quelques éléments de KRADFILE (ノ, ｜, ハ…) n'ont pas de nom officiel : aucun nom n'est inventé",
  },
  kanjium: {
    name: "Kanjium", short: "Kanjium",
    author: "mifunetoshiro",
    license: "CC BY-SA 4.0", licenseUrl: "https://github.com/mifunetoshiro/kanjium#license",
    url: "https://github.com/mifunetoshiro/kanjium",
    used: "composant phonétique et sa lecture (famille phonétique calculée à partir de lui) ; "
      + "kanji à ne pas confondre, liste faite à la main (lookalikes)",
  },
  yencken: {
    name: "Kanji confusion datasets — Lars Yencken", short: "Yencken",
    author: "Lars Yencken (2010), « Orthographic support for passing the reading hurdle in Japanese », thèse, Univ. de Melbourne",
    license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/deed.fr",
    url: "https://lars.yencken.org/datasets/kanji-confusion",
    used: "kanji à ne pas confondre quand Kanjium n'en donne pas : les plus proches par le tracé "
      + "(distance d'édition des traits), à partir d'un score de 0,7, 3 au plus",
  },
  wanikani: {
    name: "WaniKani", short: "WaniKani",
    author: "Tofugu LLC",
    license: "aucun contenu repris : seulement l'information « ce kanji existe sur WaniKani »",
    url: "https://www.wanikani.com/",
    used: "savoir si le kanji a une page WaniKani, pour le lien « WaniKani ↗ » de « Décortiquer ce kanji »",
  },
  kanjiData: {
    name: "kanji-data", short: "kanji-data",
    author: "David Gouveia",
    license: "MIT (l'assemblage ; chaque donnée garde la licence de sa source)",
    licenseUrl: "https://github.com/davidluzgouveia/kanji-data/blob/master/LICENSE",
    url: "https://github.com/davidluzgouveia/kanji-data",
    used: "assemble KANJIDIC, les listes JLPT et le niveau WaniKani en un seul fichier",
  },
};

const sourceLink = (key, label) => {
  const s = SOURCES[key];
  return s.url
    ? `${label} <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.short)} ↗</a>`
    : `${label} ${esc(s.short)}`;
};

// Ligne « Sources » d'une carte : seulement ce que la carte montre. `revealed` : réponse affichée.
function renderCardSources(char, revealed) {
  const k = kanjiInfo(char);
  const parts = [sourceLink("kanjidic", "sens et lectures"), sourceLink("jlpt", "niveau")];
  if (revealed) {
    parts.push(sourceLink("kanjivg", "ordre des traits"));
    if (!isElementary(k)) parts.push(sourceLink("kradfile", "composants") + " / " + sourceLink("unicode", "").trim());
    if (phoneticFamily(k) && k.family) parts.push(sourceLink("kanjium", "famille phonétique"));
    if (k.similar) parts.push(sourceLink("kanjium", "« ne pas confondre »") + " / " + sourceLink("yencken", "").trim());
  }
  $("cardSources").innerHTML = "Sources : " + parts.join(" · ")
    + ` · <button class="link" data-sources>licences</button>`;
  $("cardSources").querySelector("[data-sources]").onclick = openSourcesPage;
}

// ---------- Page « Sources et licences » ----------

let sourcesReturnTo = "home";

function renderSourcesPage() {
  $("sourcesBody").innerHTML = Object.values(SOURCES).map(s => `
    <div class="panel source">
      <h3>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a>` : esc(s.name)}</h3>
      <dl>
        <dt>Utilisé pour</dt><dd>${esc(s.used)}</dd>
        ${s.author ? `<dt>Auteur</dt><dd>${esc(s.author)}</dd>` : ""}
        ${s.license ? `<dt>Licence</dt><dd>${s.licenseUrl ? `<a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(s.license)} ↗</a>` : esc(s.license)}</dd>` : ""}
        ${s.doubt ? `<dt>À noter</dt><dd>${esc(s.doubt)}</dd>` : ""}
      </dl>
    </div>`).join("")
    + `<p class="note sources-foot">Le code de l'appli est sous licence MIT. Les données gardent la licence de leur source :
       les données sous CC BY-SA restent sous CC BY-SA, avec mention de leurs auteurs.</p>`;
}

function openSourcesPage() {
  sourcesReturnTo = ["home", "settings", "session"].find(id => !$(id).classList.contains("hide")) || "home";
  renderSourcesPage();
  showScreen("sources");
  window.scrollTo(0, 0);
}

function closeSourcesPage() {
  showScreen(sourcesReturnTo);
  if (sourcesReturnTo === "home") renderHome();
}

function initSources() {
  $("sourcesBack").onclick = closeSourcesPage;
  $("openSources").onclick = openSourcesPage;
}
