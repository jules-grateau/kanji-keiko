# 漢字稽古 · kanji-keiko

Entraînement à l'écriture des kanji (JLPT N5 → N1) avec répétition espacée,
et un petit serveur Node sans dépendance pour synchroniser la progression entre appareils.
Chaque utilisateur se connecte avec son compte Google : aucun mot de passe à gérer.

## Lancer

Copie `.env.example` en `.env` et mets-y ton `GOOGLE_CLIENT_ID`, puis :

```sh
npm start                  # http://localhost:3000 (Node 22.9+, aucune dépendance à installer)
# ou
docker compose up -d
```

L’application s’ouvre sur un écran de connexion Google : il faut être connecté pour l’utiliser.

### Créer l’ID client Google (une fois)

1. [Google Cloud Console](https://console.cloud.google.com/) → crée un projet.
2. *API et services → Écran de consentement OAuth* : type « Externe », renseigne le nom de l’app et ton email.
3. *Identifiants → Créer des identifiants → ID client OAuth* → type « Application Web ».
4. *Origines JavaScript autorisées* : `https://ton-domaine`, et pour tester en local `http://localhost` **et** `http://localhost:3000`.
5. Copie l’ID client dans `GOOGLE_CLIENT_ID`.

Pas besoin de « secret client » : le serveur vérifie seulement la signature des jetons Google.

### Variables d’environnement

| Variable | Rôle |
|---|---|
| `GOOGLE_CLIENT_ID` | obligatoire |
| `DATA_DIR` | dossier des données (défaut `./data`) : un fichier par utilisateur dans `users/` |
| `SESSION_SECRET` | clé des cookies de session ; générée et gardée dans `DATA_DIR` si absente |
| `COOKIE_SECURE=0` | à mettre seulement si tu sers la page en HTTP sur autre chose que localhost |
| `HOST`, `PORT` | défaut `127.0.0.1:3000` |

## Déploiement

Automatique à chaque push sur `main` qui touche le serveur (`server.js`, `src/`, `public/`, `Dockerfile`…) ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) :
l'image est construite et envoyée sur Docker Hub (`julesgrateau/kanji-keiko:latest` + un tag par commit),
puis le VPS est mis à jour par SSH avec [deploy/update-vps.sh](deploy/update-vps.sh)
(`docker compose pull` puis `up -d` du seul service `kanji-keiko`, le compose du VPS contenant d'autres applications, et attente du healthcheck). Le résultat ✓/❌ s'affiche à côté du commit sur GitHub ;
l'onglet *Actions* permet aussi de relancer un déploiement (*Run workflow*).

Sur le VPS, le `docker-compose.yml` doit utiliser l'image publiée (`image: julesgrateau/kanji-keiko:latest`, sans `build:`).

### Réglages (une fois)

GitHub → *Settings → Secrets and variables → Actions → New repository secret* :

| Secret | Contenu |
|---|---|
| `DOCKERHUB_USERNAME` | `julesgrateau` |
| `DOCKERHUB_TOKEN` | jeton Docker Hub (*Account settings → Personal access tokens*, droits *Read & Write*) |
| `VPS_HOST` | IP ou domaine du VPS |
| `VPS_USER` | utilisateur SSH |
| `VPS_PORT` | port SSH (facultatif, 22 par défaut) |
| `VPS_DIR` | dossier du `docker-compose.yml` sur le VPS |
| `VPS_SSH_KEY` | clé privée SSH dédiée au déploiement (`ssh-keygen -t ed25519 -N "" -f kanji_deploy_key`) |
| `VPS_KNOWN_HOSTS` | sortie de `ssh-keyscan -p <port> <hôte>` (empêche de se connecter à un faux serveur) |

Sur le VPS, ajoute la clé publique à `~/.ssh/authorized_keys` de `VPS_USER`, précédée de `restrict `
(pas de tunnel ni de terminal). Cet utilisateur doit pouvoir lancer `docker` sans mot de passe :
le plus simple est `sudo usermod -aG docker <utilisateur>` (puis se reconnecter).

Revenir à une version précédente : sur le VPS, mettre `image: julesgrateau/kanji-keiko:<id du commit>` puis `docker compose up -d`.

## Structure

```
server.js            point d'entrée : routes HTTP
src/
  config.js          variables d'environnement
  google.js          vérification des jetons « Se connecter avec Google »
  session.js         cookie de session signé
  store.js           un fichier JSON par utilisateur, fusion des données
  http.js            réponses, lecture du corps, fichiers statiques

public/
  index.html         structure de la page
  css/style.css
  data/kanji.js      liste des kanji (une ligne par kanji, format décrit en tête)
  data/strokes.js    tracés SVG de l'ordre des traits
  js/
    util.js          helpers ($, échappement, localStorage, kana)
    kanji.js         accès aux données, noms des composants, astuces
    srs.js           progression et répétition espacée
    sync.js          connexion Google, synchro, export/import
    home.js          écran d'accueil
    pad.js           zone de dessin
    stroke-order.js  animation de l'ordre des traits
    session.js       déroulé d'une session
    main.js          démarrage
```

Les scripts du navigateur sont des scripts classiques qui partagent leurs variables globales :
l'ordre des `<script>` dans `index.html` compte.
