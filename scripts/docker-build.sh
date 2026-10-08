#!/usr/bin/env bash
# Builds the Budget image (API + web, see Dockerfile).
#
#   ./scripts/docker-build.sh [version] [--push]
#
# Without --push: builds for this machine's platform and loads it into the
# local Docker (multi-platform images can't be loaded), tagged <version>.
# With --push: builds linux/amd64 + linux/arm64 and pushes <version> and
# latest to Docker Hub (run `docker login` first).
#
# IMAGE (default zeegfreet/budget) and PLATFORMS override the defaults.
set -euo pipefail

IMAGE="${IMAGE:-zeegfreet/budget}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
BUILDER=budget-builder

push=false
version=""
for arg in "$@"; do
  case "$arg" in
    --push) push=true ;;
    -h | --help)
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
    *) version="$arg" ;;
  esac
done

cd "$(dirname "$0")/.."
version="${version:-$(git describe --tags --always --dirty)}"
revision="$(git rev-parse HEAD)"
labels=(
  --label "org.opencontainers.image.version=$version"
  --label "org.opencontainers.image.revision=$revision"
  --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
)

if [ "$push" = true ]; then
  # The default docker driver can't build several platforms at once
  docker buildx inspect "$BUILDER" >/dev/null 2>&1 ||
    docker buildx create --name "$BUILDER" --driver docker-container >/dev/null
  echo "Building and pushing $IMAGE:$version and $IMAGE:latest ($PLATFORMS)"
  docker buildx build --builder "$BUILDER" \
    --platform "$PLATFORMS" \
    "${labels[@]}" \
    -t "$IMAGE:$version" -t "$IMAGE:latest" \
    --push .
else
  echo "Building $IMAGE:$version for the local platform"
  docker buildx build "${labels[@]}" -t "$IMAGE:$version" --load .
  echo "Run it with: docker run --env-file .env.prod -p 3000:3000 $IMAGE:$version"
fi
