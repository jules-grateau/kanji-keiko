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

// Service worker (sw.js) : l'appli s'ouvre et marche aussi sans réseau.
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
