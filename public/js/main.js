// Point d'entrée : branche les écrans puis lance la première synchro.
initHome();
initCatalog();
initSettingsScreen();
initSrsPage();
initSources();
initAccount();
initPad();
initSession();
renderHome();
initSync();

// Icône d'onglet assortie au thème de l'appli (encre noire sur onglet clair, crème sur onglet sombre).
const darkTheme = matchMedia("(prefers-color-scheme: dark)");
const updateFavicon = () => { $("favicon").href = `icons/icon-${darkTheme.matches ? "dark" : "light"}.svg?v=3`; };
updateFavicon();
darkTheme.addEventListener("change", updateFavicon);

// Service worker (sw.js) : l'appli s'ouvre et marche aussi sans réseau.
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
