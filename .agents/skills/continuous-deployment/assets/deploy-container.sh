#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${DEPLOY_DIR:?}" "${COMPOSE_FILE_PATH:?}" "${COMPOSE_ENV_FILE:?}" "${COMPOSE_SERVICE:?}" "${IMAGE_VARIABLE:?}"
: "${IMAGE_REPOSITORY:?}" "${DEPLOY_IMAGE:?}" "${EXPECTED_SHA:?}" "${DEPLOYMENT_HEALTH_URL:?}"
[[ "$EXPECTED_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 1
[[ "$COMPOSE_SERVICE" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || exit 1
[[ "$IMAGE_VARIABLE" =~ ^[A-Z_][A-Z0-9_]*_IMAGE$ ]] || exit 1
test "$IMAGE_VARIABLE" != DEPLOY_IMAGE
[[ "$DEPLOY_IMAGE" == "$IMAGE_REPOSITORY"@sha256:* ]] || exit 1
digest=${DEPLOY_IMAGE##*@sha256:}
[[ "$digest" =~ ^[a-f0-9]{64}$ ]] || exit 1
verify_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-deployment.mjs"
result_file=${DEPLOY_RESULT_FILE:-$DEPLOY_DIR/deployment-result.txt}
cd "$DEPLOY_DIR"
test -f "$COMPOSE_FILE_PATH"
test -f "$COMPOSE_ENV_FILE"
exec 9>.deployment.lock
flock -n 9
test ! -e deployment-pending.txt
active_image=$DEPLOY_IMAGE
export "$IMAGE_VARIABLE=$active_image"
compose() { docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE_PATH" "$@"; }
verify() { EXPECTED_SHA="$1" node "$verify_script"; }
verify_image() {
  local id actual_ref actual_id expected_id
  id=$(compose ps -q --all "$COMPOSE_SERVICE") || return 1
  [[ -n "$id" && "$id" != *$'\n'* ]] || return 1
  actual_ref=$(docker inspect --format '{{.Config.Image}}' "$id") || return 1
  actual_id=$(docker inspect --format '{{.Image}}' "$id") || return 1
  expected_id=$(docker image inspect --format '{{.Id}}' "$active_image") || return 1
  test "$actual_ref" = "$active_image" && test "$actual_id" = "$expected_id"
}

docker pull "$DEPLOY_IMAGE"
revision=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$DEPLOY_IMAGE")
test "$revision" = "$EXPECTED_SHA"
previous_image=''
previous_sha=''
container=$(compose ps -q --all "$COMPOSE_SERVICE")
if [ -n "$container" ]; then
  # 模板只支持一个实例；多实例需专门设计切换和恢复。
  [[ "$container" != *$'\n'* ]] || exit 1
  previous_image=$(docker inspect --format '{{.Config.Image}}' "$container")
  previous_sha=$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$container")
  [[ "$previous_image" == "$IMAGE_REPOSITORY"@sha256:* ]] || exit 1
  previous_digest=${previous_image##*@sha256:}
  [[ "$previous_digest" =~ ^[a-f0-9]{64}$ && "$previous_sha" =~ ^[a-f0-9]{40}$ ]] || exit 1
  verify "$previous_sha"
fi
printf 'source=%s\nimage=%s\nprevious=%s\n' "$EXPECTED_SHA" "$DEPLOY_IMAGE" "$previous_image" > deployment-pending.txt
printf 'status=updating\nsource=%s\nimage=%s\n' "$EXPECTED_SHA" "$DEPLOY_IMAGE" > "$result_file"

if compose up -d --no-deps --no-build --pull never --wait --wait-timeout 120 "$COMPOSE_SERVICE" && verify_image && verify "$EXPECTED_SHA"; then
  printf 'status=verified\nsource=%s\nimage=%s\n' "$EXPECTED_SHA" "$DEPLOY_IMAGE" > "$result_file"
  rm deployment-pending.txt
  exit 0
fi

if [ -n "$previous_image" ]; then
  active_image=$previous_image
  export "$IMAGE_VARIABLE=$active_image"
  if compose up -d --no-deps --no-build --pull never --wait --wait-timeout 120 "$COMPOSE_SERVICE" && verify_image && verify "$previous_sha"; then
    printf 'status=failed-restored\nsource=%s\nimage=%s\n' "$previous_sha" "$previous_image" > "$result_file"
    rm deployment-pending.txt
    exit 1
  fi
fi
printf 'status=failed-needs-inspection\nsource=%s\nimage=%s\n' "$EXPECTED_SHA" "$DEPLOY_IMAGE" > "$result_file"
echo 'Deployment incomplete; inspect the service and deployment-pending.txt before retrying' >&2
exit 1
