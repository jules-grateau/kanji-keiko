// Ordre des traits : animation du kanji complet + vignettes trait par trait.

// Enveloppe SVG commune (les tracés KanjiVG sont en 109×109).
const svgBox = (inner, size) =>
  `<svg viewBox="0 0 109 109" width="${size}" height="${size}" fill="none" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

// Croix de repère en pointillé.
const GRID = '<path d="M54.5 0v109M0 54.5h109" stroke="var(--line)" stroke-width=".6" stroke-dasharray="2 2"/>';

// Point de départ d'un trait (premier "M x,y" du chemin), pour le marquer d'un point rouge.
function strokeStart(d) {
  const m = /^M\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)/.exec(d);
  return m ? [+m[1], +m[2]] : [0, 0];
}

// Chaque animation reçoit un numéro ; en lancer une nouvelle (ou appeler stopStrokeAnimation) arrête la précédente.
let animationId = 0;
const stopStrokeAnimation = () => { animationId++; };

function renderStrokes(char) {
  const paths = STROKES[char] || [];

  // Grande animation : les traits en gris clair dessous, ceux qui seront animés par-dessus.
  const ghost = paths.map(d => `<path d="${d}" stroke="var(--line)" stroke-width="4.5"/>`).join("");
  const animated = paths.map(d => `<path class="sp" d="${d}" stroke="var(--ink)" stroke-width="4.5"/>`).join("");
  $("anim").innerHTML = svgBox(GRID + ghost + animated, 160);

  // Vignettes : traits précédents estompés, trait courant en rouge avec son point de départ.
  $("steps").innerHTML = paths.map((d, i) => {
    const [x, y] = strokeStart(d);
    const previous = paths.slice(0, i).map(p => `<path d="${p}" stroke="var(--muted)" stroke-width="4" opacity=".55"/>`).join("");
    const current = `<path d="${d}" stroke="var(--red)" stroke-width="5"/><circle cx="${x}" cy="${y}" r="3.6" fill="var(--red)" stroke="none"/>`;
    return `<div class="step">${svgBox(GRID + previous + current, 56)}${i + 1}</div>`;
  }).join("");

  playStrokeAnimation();
}

// Dessine les traits un par un en animant stroke-dashoffset.
function playStrokeAnimation() {
  const id = ++animationId;
  const paths = [...document.querySelectorAll("#anim .sp")];

  // On masque tous les traits avant de commencer.
  paths.forEach(p => {
    p.getAnimations().forEach(a => a.cancel());
    const len = p.getTotalLength();
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len;
  });

  (async () => {
    for (const p of paths) {
      if (id !== animationId) return;
      const len = p.getTotalLength();
      await new Promise(done => {
        const a = p.animate(
          [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
          { duration: Math.max(260, len * 16), fill: "forwards", easing: "ease-in-out" },
        );
        a.onfinish = done;
        a.oncancel = done;
      });
      await new Promise(r => setTimeout(r, 110));   // courte pause entre deux traits
    }
  })();
}
