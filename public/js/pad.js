// Zone de dessin : l'utilisateur trace le kanji au doigt, à la souris ou au stylet.
//
// On garde chaque trait en mémoire (liste de points) pour pouvoir retirer le dernier
// et tout redessiner. La réponse en rouge est un calque dessiné sous les traits.
//
// Les coordonnées sont celles d'un carré de SIZE × SIZE, quelle que soit la taille affichée :
// le canvas a autant de pixels que l'écran en affiche (net même en plein écran), et une
// transformation ramène tout à ce carré.
//
// Stylet (tablette graphique) : l'épaisseur suit la pression ; le bouton latéral (ou le clic
// droit) retire le dernier trait ; la gomme efface les traits qu'elle touche.

const canvas = $("cv");
const ctx = canvas.getContext("2d");
const SIZE = 680;    // taille logique du carré de dessin
const BRUSH = 14;    // épaisseur du trait (pression moyenne), dans ce carré
const ERASER = 24;   // rayon de la gomme du stylet

let strokes = [];          // traits de l'utilisateur : chacun est une liste de points [x, y, épaisseur]
let currentStroke = null;  // trait en cours de tracé
let erasing = false;       // gomme du stylet posée ?
let overlayChar = null;    // kanji affiché sous le tracé (rouge après Vérifier, gris à repasser en découverte)
let overlayColor = "--red";

// Position du pointeur dans le carré logique (sa taille affichée varie).
function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * SIZE / r.width, (e.clientY - r.top) * SIZE / r.height];
}

// Épaisseur du trait : la pression pour un stylet (0,5 = BRUSH), fixe pour la souris et le doigt.
function brushWidth(e) {
  if (e.pointerType !== "pen") return BRUSH;
  return BRUSH * (0.35 + 1.3 * Math.min(1, Math.max(0.05, e.pressure || 0.5)));
}

// Un point seul (simple tap), pour qu'il laisse une trace.
function drawDot([x, y, w]) {
  ctx.fillStyle = cssVar("--ink");
  ctx.beginPath();
  ctx.arc(x, y, w / 2, 0, 7);
  ctx.fill();
}

function drawSegment(from, to) {
  ctx.strokeStyle = cssVar("--ink");
  ctx.lineWidth = (from[2] + to[2]) / 2;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
}

function drawStroke(points) {
  drawDot(points[0]);
  for (let i = 1; i < points.length; i++) drawSegment(points[i - 1], points[i]);
}

// Kanji attendu en rouge transparent, pour comparer ou repasser dessus.
function drawOverlay(char) {
  ctx.save();
  ctx.globalAlpha = .3;
  ctx.fillStyle = cssVar(overlayColor);
  ctx.font = '500 520px "Shippori Mincho","Hiragino Mincho ProN","Yu Mincho",serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(char, 340, 350);
  ctx.restore();
}

function redraw() {
  ctx.clearRect(0, 0, SIZE, SIZE);
  if (overlayChar) drawOverlay(overlayChar);
  strokes.forEach(drawStroke);
}

// Le canvas prend la résolution réelle de l'écran à chaque changement de taille (plein écran…).
function fitCanvas() {
  const px = Math.round(canvas.getBoundingClientRect().width * (window.devicePixelRatio || 1));
  if (!px || px === canvas.width) return;
  canvas.width = canvas.height = px;
  ctx.setTransform(px / SIZE, 0, 0, px / SIZE, 0, 0);
  redraw();
}

// Retire le dernier trait.
function undoStroke() {
  strokes.pop();
  redraw();
}

// Gomme du stylet : retire les traits dont un point est sous la gomme.
function eraseAt([x, y]) {
  const before = strokes.length;
  strokes = strokes.filter(s => !s.some(p => (p[0] - x) ** 2 + (p[1] - y) ** 2 < ERASER ** 2));
  if (strokes.length !== before) redraw();
}

// Efface les traits de l'utilisateur ; la réponse en rouge reste affichée si elle l'était.
function clearDrawing() {
  strokes = [];
  redraw();
}

// Nouvelle carte : tout est remis à zéro.
function resetPad() {
  overlayChar = null;
  clearDrawing();
}

function showAnswerOverlay(char, color = "--red") {
  overlayChar = char;
  overlayColor = color;
  redraw();
}

// Cercle de la taille du pinceau qui suit le stylet (ou la souris) au survol, sans toucher.
const brushCursor = $("brushCursor");
function moveBrushCursor(e) {
  const r = canvas.getBoundingClientRect();
  const d = (e.pointerType === "pen" && erasing ? ERASER * 2 : BRUSH) * r.width / SIZE;
  brushCursor.style.width = brushCursor.style.height = d + "px";
  brushCursor.style.transform = `translate(${e.clientX - r.left - d / 2}px, ${e.clientY - r.top - d / 2}px)`;
  brushCursor.classList.add("on");
}

function initPad() {
  // Bouton latéral du stylet (ou clic droit) : retirer un trait, sans menu contextuel.
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    if (e.button === 2) return undoStroke();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}   // le trait continue même si on sort du carré
    erasing = e.button === 5 || (e.buttons & 32) !== 0;   // bout gomme du stylet
    if (erasing) return eraseAt(pointerPos(e));
    currentStroke = [[...pointerPos(e), brushWidth(e)]];
    strokes.push(currentStroke);
    drawDot(currentStroke[0]);
  });

  // On ne dessine que les nouveaux segments, pas tout le canvas, pour rester fluide.
  // getCoalescedEvents : tous les points envoyés par la tablette, pas seulement un par image.
  canvas.addEventListener("pointermove", e => {
    if (e.pointerType !== "touch") moveBrushCursor(e);
    if (erasing) return eraseAt(pointerPos(e));
    if (!currentStroke) return;
    for (const ev of (e.getCoalescedEvents && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e])) {
      const p = [...pointerPos(ev), brushWidth(ev)];
      drawSegment(currentStroke[currentStroke.length - 1], p);
      currentStroke.push(p);
    }
  });

  ["pointerup", "pointercancel"].forEach(t => canvas.addEventListener(t, () => { currentStroke = null; erasing = false; }));
  canvas.addEventListener("pointerleave", () => brushCursor.classList.remove("on"));

  new ResizeObserver(fitCanvas).observe(canvas);

  $("undo").onclick = undoStroke;
  $("clear").onclick = clearDrawing;
}
