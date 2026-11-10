// Petits outils partagés par tous les scripts.

const $ = id => document.getElementById(id);

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
