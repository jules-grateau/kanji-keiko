# Kanji Keiko dans WoW

Addon pour World of Warcraft: Forever (interface 16001) : révisions et apprentissage des kanji en jeu,
avec le même SRS que l'appli (règles copiées de `public/js/srs.js`, `goal.js`, `streak.js` et `session.js`).

## Installer / mettre à jour

```bash
node scripts/build-wow.js --install
```

Régénère `Data.lua` et `Strokes.lua` depuis `public/data/`, puis copie `wow/KanjiKeiko/` dans
`World of Warcraft/_forever_/Interface/AddOns/` (autre dossier : variable `WOW_ADDONS`).
Relancer le jeu la première fois, ensuite `/reload` suffit.

## Utiliser

- `/kanji` (ou `/kk`) ouvre ou ferme la fenêtre ; Échap la ferme ; on la déplace en la faisant glisser.
- `/kanji scale 0.8` : taille de la fenêtre (0.5 à 1.5).
- Écrire à la souris, clic gauche maintenu, dans le carré.

## Synchronisation avec l'appli : le compagnon

WoW n'écrit la sauvegarde de l'addon (`WTF/Account/<compte>/SavedVariables/KanjiKeiko.lua`) qu'à la
déconnexion ou sur `/reload` (bouton « Synchroniser » de l'addon), et ne la relit qu'à la connexion.
Le compagnon (`wow/companion/companion.js`, Node 18+, sans dépendance) tourne en fond :

- dès que ce fichier change, il envoie les réponses au serveur (fusion : la version la plus avancée de chaque kanji gagne) ;
- quand WoW est fermé, il recopie la progression du serveur dans ce fichier (jamais pendant que WoW tourne).

Installation, une fois (avec le .exe, sans installer Node) :

1. Appli → menu du compte → **🎮 Jeton pour WoW** → Créer un jeton → Copier.
2. Double-cliquer sur `KanjiKeikoWoW.exe` (construit par `node scripts/build-companion.js` dans `wow/companion/dist/`,
   environ 85 Mo car Node est dedans) et coller le jeton. Il se copie dans `%LOCALAPPDATA%\KanjiKeiko`, se lance au
   démarrage de Windows et tourne tout de suite en fond. Pas signé : au premier lancement, Windows demande
   « Informations complémentaires » → « Exécuter quand même ». Le relancer affiche l'état et un menu
   (synchroniser, changer de jeton, désinstaller).

Ou, avec Node installé :

1. Appli → menu du compte → **🎮 Jeton pour WoW** → Créer un jeton → Copier.
2. `node wow/companion/companion.js setup` et coller le jeton. Le compagnon vérifie le jeton, enregistre sa config
   (`%APPDATA%\kanji-keiko-wow\config.json`), se lance au démarrage de Windows et démarre tout de suite.

Autres commandes : `status` (config et journal), `once` (une synchro), `uninstall` (retire du démarrage).
Options de `setup` : `--token`, `--server` (défaut : https://kanji-keiko.julesgrateau.dev), `--wow` (dossier `_forever_`).

## Licences

- Code : MIT (voir `LICENSE` à la racine).
- `Strokes.lua` : tracés KanjiVG (Ulrich Apel), CC BY-SA 3.0, convertis en lignes brisées.
- `Data.lua` : KANJIDIC (EDRDG, CC BY-SA 4.0) via kanji-data (David Gouveia, MIT) ; niveaux JLPT de Jonathan Waller.
- `Fonts/KanjiKeikoJP.ttf` : Noto Sans JP allégée aux kanji JLPT, kana et ASCII, SIL Open Font License 1.1 (`Fonts/OFL.txt`).
  Elle n'a ni accents ni `（）〜` : les textes français utilisent la police du jeu.
