#!/usr/bin/env bash
# Exécuté sur le VPS par le workflow de déploiement (.github/workflows/deploy.yml).
# Usage : update-vps.sh <dossier du compose> <service>
# Le compose du VPS contient d'autres applications : on ne touche QUE ce service
# (pull, redémarrage, logs). Puis on attend qu'il soit en bonne santé.
set -euo pipefail

cd "$1"
SERVICE="$2"

# docker directement si l'utilisateur est dans le groupe docker, sinon sudo sans mot de passe.
if docker info >/dev/null 2>&1; then D="docker"; else D="sudo -n docker"; fi

$D compose pull "$SERVICE"
$D compose up -d --no-deps "$SERVICE"   # ne recrée le conteneur que si l'image a changé

# Le Dockerfile déclare un HEALTHCHECK : on attend « healthy » (2 min max).
for _ in $(seq 1 60); do
  state=$($D inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$($D compose ps -q "$SERVICE")")
  case "$state" in
    healthy|running) echo "Déployé : $state"; $D image prune -f >/dev/null; exit 0 ;;
    unhealthy|exited|dead) echo "Échec : $state"; $D compose logs --tail 50 "$SERVICE"; exit 1 ;;
  esac
  sleep 2
done
echo "Le conteneur n'est pas devenu healthy à temps."
$D compose logs --tail 50 "$SERVICE"
exit 1
