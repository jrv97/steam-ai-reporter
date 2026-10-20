#!/usr/bin/env bash
# Format the staged files we own and re-stage them (AGENTS.md rule 15). A file that is only partly
# staged stops the commit, so unstaged hunks are never committed by the re-stage. The staged list
# comes from Git itself, NUL-separated, because the hook's STAGED variable splits paths on spaces.
set -euo pipefail

if [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
  echo "error: WSL bash; on Windows put Git Bash first on PATH (mise.local.toml.example)" >&2
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"
mapfile -d '' staged < <(git diff --cached --name-only -z --diff-filter=ACMR)
((${#staged[@]})) || exit 0

declare -A unstaged=()
while IFS= read -r -d '' path; do
  unstaged["$path"]=1
done < <(git diff --name-only -z)

partial=()
python_files=()
shell_files=()
other_files=()
for path in "${staged[@]}"; do
  [[ -n "${unstaged[$path]:-}" ]] && partial+=("$path")
  case "$path" in
    *.py) python_files+=("$path") ;;
    *.sh) shell_files+=("$path") ;;
    *) other_files+=("$path") ;;
  esac
done

if ((${#partial[@]})); then
  echo "error: these files are only partly staged; stage them whole (git add) and commit again:" >&2
  printf '  %s\n' "${partial[@]}" >&2
  exit 1
fi

if ((${#other_files[@]})); then
  dprint fmt --allow-no-files -- "${other_files[@]}"
fi
if ((${#python_files[@]})); then
  ruff format --force-exclude -- "${python_files[@]}"
fi
if ((${#shell_files[@]})); then
  shfmt --indent 2 --case-indent --write -- "${shell_files[@]}"
fi
git add -- "${staged[@]}"
