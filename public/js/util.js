// Petits outils partagés par tous les scripts.

const $ = id => document.getElementById(id);

const setHidden = (id, hidden) => $(id).classList.toggle("hide", hidden);

// Échappe le HTML avant de l'injecter via innerHTML.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Lit la valeur d'une variable CSS du thème (ex. "--ink").
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// localStorage en JSON, sans planter si le stockage est indisponible.
function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

// Lectures : on → katakana ; kun "ひと.つ" → "ひと（つ）", "-うえ" → "〜うえ".
const toKatakana = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 96));
const formatKun = s => s.replace(/^-/, "〜").replace(/-$/, "〜").replace(/\.(.*)$/, "（$1）");

// Bandeau en bas d'écran avec un bouton Annuler, qui disparaît après quelques secondes.
let toastTimer = null;
function showToast(text, onUndo, duration = 6000) {
  $("toastText").textContent = text;
  $("toastUndo").onclick = () => { hideToast(); onUndo(); };
  setHidden("toast", false);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, duration);
}
const hideToast = () => setHidden("toast", true);
