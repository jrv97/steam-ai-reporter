#!/usr/bin/env bash
# Run self-hosted Renovate (ADR 0021) from its container image, pinned by digest.
# Renovate clones the repositories in RENOVATE_REPOSITORIES itself, with RENOVATE_TOKEN.
# Renovate updates the two pins below through a custom manager in .github/renovate.json.
set -euo pipefail

renovate_version="44.206.2"
renovate_digest="sha256:d515a99f5d14d1c62b792ee61339d165dd9d20ee82ca9d5379daf639050bab51"
image="ghcr.io/renovatebot/renovate:${renovate_version}@${renovate_digest}"

: "${RENOVATE_TOKEN:?RENOVATE_TOKEN is not set}"
: "${RENOVATE_REPOSITORIES:?RENOVATE_REPOSITORIES is not set}"

# Post-upgrade tasks may run the two allowed mise commands only, in mise safe mode.
docker run --rm \
  --env RENOVATE_TOKEN \
  --env RENOVATE_REPOSITORIES \
  --env LOG_LEVEL \
  --env RENOVATE_PLATFORM=github \
  --env RENOVATE_ONBOARDING=false \
  --env RENOVATE_REQUIRE_CONFIG=required \
  --env RENOVATE_ALLOWED_COMMANDS='["^mise install uv$", "^mise lock$"]' \
  --env RENOVATE_CUSTOM_ENV_VARIABLES='{"MISE_SAFE": "1"}' \
  "$image"
