#!/usr/bin/env bash
# Build twice from the same inputs and fail if any byte of dist/ differs between the two builds.
set -euo pipefail

if [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
  echo "error: WSL bash; on Windows put Git Bash first on PATH (mise.local.toml.example)" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
first="$(mktemp -d)"
trap 'rm -rf "$first"' EXIT

python scripts/build.py
cp -R dist "$first/dist"
python scripts/build.py
if ! diff -r "$first/dist" dist; then
  echo "error: two builds from the same inputs differ" >&2
  exit 1
fi
echo "check-reproducible: two builds are identical"
