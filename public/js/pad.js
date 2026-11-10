// Zone de dessin : l'utilisateur trace le kanji au doigt ou à la souris.

const canvas = $("cv");
const ctx = canvas.getContext("2d");
const BRUSH = 14;   // épaisseur du trait, en pixels du canvas (680×680)

let drawing = false, lastPoint = null;

// Position du pointeur convertie en coordonnées du canvas (sa taille affichée varie).
function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
}

const clearPad = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

// Superpose le kanji attendu en rouge transparent pour comparer avec le tracé.
function drawAnswerOverlay(char) {
  ctx.save();
  ctx.globalAlpha = .3;
  ctx.fillStyle = cssVar("--red");
  ctx.font = '500 520px "Shippori Mincho","Hiragino Mincho ProN","Yu Mincho",serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(char, 340, 350);
  ctx.restore();
}

function initPad() {
  canvas.addEventListener("pointerdown", e => {
    if (session && session.judged) return;   // plus de dessin une fois la réponse jugée
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    lastPoint = pointerPos(e);
    // Un point, pour qu'un simple tap laisse une trace.
    ctx.fillStyle = cssVar("--ink");
    ctx.beginPath();
    ctx.arc(lastPoint[0], lastPoint[1], BRUSH / 2, 0, 7);
    ctx.fill();
  });

  canvas.addEventListener("pointermove", e => {
    if (!drawing) return;
    const p = pointerPos(e);
    ctx.strokeStyle = cssVar("--ink");
    ctx.lineWidth = BRUSH;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint[0], lastPoint[1]);
    ctx.lineTo(p[0], p[1]);
    ctx.stroke();
    lastPoint = p;
  });

  ["pointerup", "pointercancel"].forEach(t => canvas.addEventListener(t, () => { drawing = false; }));
  $("clear").onclick = clearPad;
}
