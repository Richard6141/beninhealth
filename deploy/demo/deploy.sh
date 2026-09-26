#!/usr/bin/env bash
# Déploiement de BeninHealth sur le serveur de démonstration, installé en
# /opt/beninhealth/deploy.sh. C'est la commande forcée de la clé de déploiement de la CI
# (authorized_keys) : cette clé ne peut rien lancer d'autre.
#
#   deploy <sha> <utilisateur>  jeton GHCR lu sur l'entrée standard, jamais en argument ;
#                               tire les images du commit, sauvegarde la base, migre, redémarre
#                               l'application, vérifie la santé et revient à l'image précédente
#                               si elle échoue.
#   rollback                    revient à l'image précédente (sans toucher aux migrations).
#   status                      image en service et état des conteneurs.
#   deploy-local <sha>          à la main seulement : images déjà présentes sur le serveur.
#
# À la main : ./deploy.sh status, ./deploy.sh rollback, ou
#             ./deploy.sh deploy <sha> <utilisateur> < fichier-contenant-le-jeton
set -euo pipefail
umask 077

APP_DIR=/opt/beninhealth
REGISTRY=ghcr.io/richard6141/beninhealth
HEALTH_URL=http://127.0.0.1:3200/api/sante
KEEP_IMAGES=3
REPOS="app tools"
# Identifiants GHCR propres à BeninHealth, effacés après chaque tirage : rien n'est écrit dans la
# configuration Docker de l'utilisateur, partagée avec les autres projets du serveur.
export DOCKER_CONFIG="$APP_DIR/.docker"

cd "$APP_DIR"
mkdir -p logs backups "$DOCKER_CONFIG"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a logs/deploy.log >&2; }
fail() {
  log "ÉCHEC : $*"
  exit 1
}

compose() {
  local tag="$1"
  shift
  IMAGE_TAG="$tag" docker compose --project-directory "$APP_DIR" -f "$APP_DIR/compose.yml" "$@"
}

current_tag() { cat current.tag 2>/dev/null || true; }
previous_tag() { cat previous.tag 2>/dev/null || true; }
valid_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

# Santé : 200 et {"status":"ok"} (la base répond), pendant 90 secondes au plus.
healthy() {
  local attempt
  for attempt in $(seq 1 18); do
    if curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then return 0; fi
    sleep 5
  done
  return 1
}

db_running() { [ "$(docker inspect -f '{{.State.Running}}' beninhealth-db 2>/dev/null)" = "true" ]; }

backup_db() {
  db_running || return 0
  local file
  file="backups/beninhealth-$(date -u +%Y%m%dT%H%M%SZ).dump"
  docker exec beninhealth-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$file"
  # Sept sauvegardes gardées.
  ls -1t backups/beninhealth-*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
  log "sauvegarde de la base : $file"
}

# Les KEEP_IMAGES images les plus récentes de chaque dépôt restent ; l'image en service et la
# précédente ne sont jamais retirées.
prune_images() {
  local repo tag keep
  keep=" $(current_tag) $(previous_tag) "
  for repo in $REPOS; do
    docker image ls "$REGISTRY/$repo" --format '{{.Tag}}' | tail -n +$((KEEP_IMAGES + 1)) |
      while read -r tag; do
        case "$keep" in *" $tag "*) continue ;; esac
        docker image rm "$REGISTRY/$repo:$tag" >/dev/null 2>&1 || true
      done
  done
}

switch_to() {
  local tag="$1"
  compose "$tag" up -d --remove-orphans app
}

# Sauvegarde, migrations, nouvelle image, santé ; retour à l'image précédente si elle échoue.
release() {
  local sha="$1" previous
  previous="$(current_tag)"
  compose "$sha" up -d --wait db
  backup_db
  log "migrations"
  docker run --rm --network beninhealth_default --env-file app.env \
    "$REGISTRY/tools:$sha" npx prisma migrate deploy >&2 || fail "migrations"

  switch_to "$sha"
  if healthy; then
    if [ -n "$previous" ] && [ "$previous" != "$sha" ]; then echo "$previous" >previous.tag; fi
    echo "$sha" >current.tag
    prune_images
    log "déploiement réussi : $sha en service"
  else
    log "santé en échec après 90 s"
    if valid_sha "$previous"; then
      switch_to "$previous"
      if healthy; then log "retour automatique à $previous"; else log "l'image précédente ne répond pas"; fi
    fi
    fail "déploiement de $sha annulé"
  fi
}

request="${SSH_ORIGINAL_COMMAND:-$*}"
read -r action sha user extra <<<"$request" || true
[ -z "${extra:-}" ] || fail "argument en trop"

exec 9>"$APP_DIR/deploy.lock"
flock -n 9 || fail "un déploiement est déjà en cours"

case "${action:-}" in
  status)
    running="$(current_tag)"
    echo "image en service : ${running:-aucune}"
    echo "image précédente : $(previous_tag)"
    compose "${running:-aucune}" ps
    ;;

  rollback)
    target="$(previous_tag)"
    valid_sha "$target" || fail "aucune image précédente"
    log "retour à $target"
    switch_to "$target"
    healthy || fail "l'image précédente ne répond pas non plus"
    mv current.tag previous.tag.tmp
    echo "$target" >current.tag
    mv previous.tag.tmp previous.tag
    log "retour effectué : $target en service"
    ;;

  deploy)
    valid_sha "${sha:-}" || fail "SHA invalide"
    [[ "${user:-}" =~ ^[A-Za-z0-9-]{1,39}$ ]] || fail "utilisateur GHCR invalide"
    IFS= read -r token || true
    [ -n "${token:-}" ] || fail "jeton GHCR absent de l'entrée standard"
    exec </dev/null

    log "déploiement de $sha"
    printf '%s' "$token" | docker login ghcr.io -u "$user" --password-stdin >/dev/null
    unset token
    trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
    for repo in $REPOS; do
      docker pull --quiet "$REGISTRY/$repo:$sha" >/dev/null || fail "image $repo:$sha introuvable"
    done
    docker logout ghcr.io >/dev/null 2>&1 || true

    release "$sha"
    ;;

  deploy-local)
    # Images déjà présentes sur le serveur : jamais par la clé de la CI, seulement à la main.
    [ -z "${SSH_ORIGINAL_COMMAND:-}" ] || fail "commande refusée"
    valid_sha "${sha:-}" || fail "SHA invalide"
    for repo in $REPOS; do
      docker image inspect "$REGISTRY/$repo:$sha" >/dev/null 2>&1 || fail "image $repo:$sha absente"
    done
    log "déploiement local de $sha"
    release "$sha"
    ;;

  *)
    fail "commande refusée"
    ;;
esac
