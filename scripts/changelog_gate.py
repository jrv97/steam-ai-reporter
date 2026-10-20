"""Fail a pull request that changes src/ without adding a changie fragment.

A fragment is a new `.changes/unreleased/*.yaml` file (`mise run change-new`). The gate is skipped
when the pull request carries the `no-changelog-fragment` label, for changes users do not see.
Every added fragment must name a kind from .changie.yaml and have a body.

In CI the diff base, head and labels come from the pull_request event (GITHUB_EVENT_PATH).
Locally the diff runs from the merge base with origin/main to HEAD, with no labels.
"""

import os
import re
from pathlib import Path

from repo import ROOT, fail, git, git_paths, json_object, json_string, read_json

LABEL = "no-changelog-fragment"
FRAGMENTS = re.compile(r"^\.changes/unreleased/[^/]+\.yaml$")
KIND_LABEL = re.compile(r"^\s*-\s*label:\s*(\S.*?)\s*$", re.MULTILINE)
FIELD = re.compile(r"^(kind|body):[ \t]*(.*)$", re.MULTILINE)


def event_range() -> tuple[str, str, set[str]]:
    event_path = os.environ.get("GITHUB_EVENT_PATH", "")
    if not event_path:
        base = git("merge-base", "origin/main", "HEAD").strip()
        return base, "HEAD", set()
    event = json_object(read_json(Path(event_path)), "event")
    pull = json_object(event.get("pull_request"), "event pull_request")
    base = json_string(json_object(pull.get("base"), "base").get("sha"), "base sha")
    head = json_string(json_object(pull.get("head"), "head").get("sha"), "head sha")
    labels_value = pull.get("labels")
    labels = labels_value if isinstance(labels_value, list) else []
    names = {json_string(json_object(label, "label").get("name"), "label name") for label in labels}
    return base, head, names


def fragment_problems(path: str, head: str, kinds: set[str]) -> list[str]:
    fields = dict(FIELD.findall(git("show", f"{head}:{path}")))
    problems: list[str] = []
    if fields.get("kind", "").strip("'\"") not in kinds:
        problems.append(f"{path}: kind must be one of {', '.join(sorted(kinds))}")
    if not fields.get("body", "").strip("'\" "):
        problems.append(f"{path}: body is empty")
    return problems


def main() -> None:
    base, head, labels = event_range()
    changed = git_paths("diff", "--name-only", "-z", f"{base}...{head}")
    added = git_paths("diff", "--name-only", "-z", "--diff-filter=A", f"{base}...{head}")
    fragments = [path for path in added if FRAGMENTS.match(path)]
    kinds = set(KIND_LABEL.findall((ROOT / ".changie.yaml").read_text(encoding="utf-8")))

    problems = [problem for path in fragments for problem in fragment_problems(path, head, kinds)]
    if problems:
        print("\n".join(problems))
        fail(f"{len(problems)} fragment problem(s)")
    touches_src = any(path.startswith("src/") for path in changed)
    if not touches_src:
        print("changelog gate: no change under src/")
    elif fragments:
        print(f"changelog gate: {len(fragments)} new fragment(s)")
    elif LABEL in labels:
        print(f"changelog gate: skipped by the {LABEL} label")
    else:
        fail(
            "this change touches src/ but adds no .changes/unreleased/*.yaml fragment; run "
            f"`mise run change-new`, or label the pull request {LABEL} if users see no change"
        )


if __name__ == "__main__":
    main()
