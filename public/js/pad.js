// Zone de dessin : l'utilisateur trace le kanji au doigt ou à la souris.
//
// On garde chaque trait en mémoire (liste de points) pour pouvoir retirer le dernier
// et tout redessiner. La réponse en rouge est un calque dessiné sous les traits.

const canvas = $("cv");
const ctx = canvas.getContext("2d");
const BRUSH = 14;   // épaisseur du trait, en pixels du canvas (680×680)

let strokes = [];          // traits de l'utilisateur : chacun est une liste de points [x, y]
let currentStroke = null;  // trait en cours de tracé
let overlayChar = null;    // kanji affiché sous le tracé (rouge après Vérifier, gris à repasser en découverte)
let overlayColor = "--red";

// Position du pointeur convertie en coordonnées du canvas (sa taille affichée varie).
function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
}

// Un point seul (simple tap), pour qu'il laisse une trace.
function drawDot([x, y]) {
  ctx.fillStyle = cssVar("--ink");
  ctx.beginPath();
  ctx.arc(x, y, BRUSH / 2, 0, 7);
  ctx.fill();
}

function drawSegment(from, to) {
  ctx.strokeStyle = cssVar("--ink");
  ctx.lineWidth = BRUSH;
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (overlayChar) drawOverlay(overlayChar);
  strokes.forEach(drawStroke);
}

// Retire le dernier trait.
function undoStroke() {
  strokes.pop();
  redraw();
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

function initPad() {
  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    currentStroke = [pointerPos(e)];
    strokes.push(currentStroke);
    drawDot(currentStroke[0]);
  });

  // On ne dessine que le nouveau segment, pas tout le canvas, pour rester fluide.
  canvas.addEventListener("pointermove", e => {
    if (!currentStroke) return;
    const p = pointerPos(e);
    drawSegment(currentStroke[currentStroke.length - 1], p);
    currentStroke.push(p);
  });

  ["pointerup", "pointercancel"].forEach(t => canvas.addEventListener(t, () => { currentStroke = null; }));

  $("undo").onclick = undoStroke;
  $("clear").onclick = clearDrawing;
}
