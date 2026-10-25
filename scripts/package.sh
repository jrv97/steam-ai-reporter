#!/usr/bin/env bash
# Write the release artifacts to artifacts/ from the current dist/ (run `mise run build` first).
#   steam-ai-reporter-chromium-<version>.zip   dist/chromium
#   steam-ai-reporter-gecko-<version>.zip      dist/gecko
#   steam-ai-reporter.user.js / .meta.js       dist/userscript (fixed names, stable URLs)
#   steam-ai-reporter-source-<version>.zip     git archive of HEAD (AMO): lockfile in, docs/ out
#                                              except the design tokens the build reads
# dist/dev (the dev injection bundle) is never packaged.
set -euo pipefail

if [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
  echo "error: WSL bash; on Windows put Git Bash first on PATH (mise.local.toml.example)" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
slug="steam-ai-reporter"
version="$(python -c 'import json; print(json.load(open("package.json"))["version"])')"

for path in dist/chromium dist/gecko dist/userscript; do
  [[ -d "$path" ]] || {
    echo "error: $path is missing; run \`mise run build\` first" >&2
    exit 1
  }
done
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "warning: tracked files have uncommitted changes; the source archive holds HEAD only" >&2
fi

rm -rf artifacts
mkdir -p artifacts
python scripts/zip_dir.py dist/chromium "artifacts/${slug}-chromium-${version}.zip"
python scripts/zip_dir.py dist/gecko "artifacts/${slug}-gecko-${version}.zip"
cp "dist/userscript/${slug}.user.js" "dist/userscript/${slug}.meta.js" artifacts/
# A pathspec exclude of docs would drop the tokens too, so list every other top-level entry.
paths=()
while IFS= read -r entry; do
  [[ "$entry" == docs ]] || paths+=("$entry")
done < <(git ls-tree --name-only HEAD)
git archive --format=zip --prefix="${slug}-source-${version}/" \
  -o "artifacts/${slug}-source-${version}.zip" HEAD -- "${paths[@]}" docs/design/tokens.css

ls -l artifacts
