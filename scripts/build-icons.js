#!/usr/bin/env node
// Construit les icônes de l'appli (onglet du navigateur, écran d'accueil du téléphone) dans public/icons/.
//
//   node scripts/build-icons.js
//
// Le kanji 書 (« écrire ») est dessiné avec ses tracés KanjiVG (public/data/strokes.js, CC BY-SA 3.0),
// en encre sur le fond papier de l'appli, avec la croix pointillée de la zone de dessin et le dernier trait
// en rouge (comme la dernière étape de « Trait par trait »).
//
// Les SVG sont écrits directement. Les PNG (exigés par les téléphones) sont rendus par Chrome / Edge en
// mode headless, sans aucune dépendance : indique le navigateur avec CHROME=… s'il n'est pas trouvé.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public/icons");
const KANJI = "書";
const PAPER = "#f3eee2", LINE = "#d9d1bf", INK = "#1d1a16", RED = "#c23a22";

const STROKES = (0, eval)("(" + fs.readFileSync(path.join(ROOT, "public/data/strokes.js"), "utf8")
  .replace(/^[\s\S]*?const STROKES =/, "").replace(/;\s*$/, "") + ")");

// Icône 512×512. `pad` : marge autour du kanji ; `radius` : coins arrondis (0 = carré plein, pour les
// téléphones qui découpent eux-mêmes la forme) ; maskable : kanji dans la zone sûre centrale (Android).
function iconSvg({ pad, radius }) {
  const paths = STROKES[KANJI], scale = (512 - 2 * pad) / 109;   // tracés KanjiVG : viewBox 109×109
  const strokes = paths.map((d, i) => `<path d="${d}" stroke="${i === paths.length - 1 ? RED : INK}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">`
    + `<rect width="512" height="512" rx="${radius}" fill="${PAPER}"/>`
    + `<path d="M256 ${pad - 26}V${512 - pad + 26}M${pad - 26} 256H${512 - pad + 26}" stroke="${LINE}" stroke-width="3" stroke-dasharray="14 12"/>`
    + `<g transform="translate(${pad},${pad}) scale(${scale})" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="6.5">${strokes}</g>`
    + `</svg>\n`;
}

const ICONS = {
  "icon.svg": { pad: 66, radius: 112 },             // onglet du navigateur
  "icon-any.svg": { pad: 66, radius: 0 },           // base des PNG « any »
  "icon-maskable.svg": { pad: 120, radius: 0 },     // Android : la forme est découpée par le téléphone
};
const PNGS = [
  { file: "icon-192.png", svg: "icon-any.svg", size: 192 },
  { file: "icon-512.png", svg: "icon-any.svg", size: 512 },
  { file: "icon-maskable-512.png", svg: "icon-maskable.svg", size: 512 },
  { file: "apple-touch-icon.png", svg: "icon-any.svg", size: 180 },   // iPhone : carré plein, iOS arrondit
];

function findChrome() {
  const candidates = [process.env.CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const found = candidates.find(c => c && fs.existsSync(c));
  if (!found) throw new Error("Chrome ou Edge introuvable : relance avec CHROME=/chemin/vers/chrome");
  return found;
}

// Rend chaque SVG en PNG dans un canvas de Chrome headless, puis récupère les images encodées en base64.
function renderPngs() {
  const jobs = PNGS.map(p => ({ ...p, src: "data:image/svg+xml;base64," + Buffer.from(fs.readFileSync(path.join(OUT, p.svg))).toString("base64") }));
  const page = path.join(os.tmpdir(), "kanji-keiko-icons.html");
  fs.writeFileSync(page, `<!doctype html><pre id="out"></pre><script>
    const jobs = ${JSON.stringify(jobs.map(j => ({ file: j.file, size: j.size, src: j.src })))};
    Promise.all(jobs.map(j => new Promise(done => {
      const img = new Image();
      img.onload = () => { const c = document.createElement("canvas"); c.width = c.height = j.size;
        c.getContext("2d").drawImage(img, 0, 0, j.size, j.size); done(j.file + " " + c.toDataURL("image/png")); };
      img.src = j.src;
    }))).then(lines => { document.getElementById("out").textContent = lines.join("\\n"); });
  </script>`);
  const html = execFileSync(findChrome(), ["--headless=new", "--disable-gpu", "--virtual-time-budget=5000", "--dump-dom", "file:///" + page.replace(/\\/g, "/")],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  const lines = (html.match(/<pre id="out">([\s\S]*?)<\/pre>/) || [])[1];
  if (!lines) throw new Error("Le navigateur n'a pas rendu les icônes.");
  for (const line of lines.trim().split("\n")) {
    const [file, url] = line.split(" ");
    fs.writeFileSync(path.join(OUT, file), Buffer.from(url.replace(/^data:image\/png;base64,/, ""), "base64"));
  }
}

fs.mkdirSync(OUT, { recursive: true });
for (const [file, opts] of Object.entries(ICONS)) fs.writeFileSync(path.join(OUT, file), iconSvg(opts));
renderPngs();
for (const f of fs.readdirSync(OUT)) console.log(path.relative(ROOT, path.join(OUT, f)), fs.statSync(path.join(OUT, f)).size, "octets");
