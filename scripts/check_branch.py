"""Check the branch name: `<type>/<kebab-slug>`, `release/<version>` or `hotfix/<slug>`.

No `claude/` prefix and no generated id or hash at the end (`-562077`, `-4b0097`). In CI the
name comes from GITHUB_HEAD_REF (pull requests) or GITHUB_REF_NAME (pushes); `main` passes.
A detached HEAD outside CI is skipped.
"""

import os
import re

from repo import fail, git

TYPES = ("feat", "fix", "chore", "docs", "refactor", "test", "perf", "build", "ci", "style", "ops")
SLUG = r"[a-z0-9]+(?:-[a-z0-9]+)*"
PATTERN = re.compile(
    rf"^(?:main|(?:{'|'.join(TYPES)})/{SLUG}|release/[0-9]+(?:\.[0-9]+)*|hotfix/{SLUG})$"
)
HASH_SUFFIX = re.compile(r"-(?=[0-9a-f]*[0-9])[0-9a-f]{6,}$")


def branch_name() -> str:
    if os.environ.get("GITHUB_ACTIONS") == "true":
        head = os.environ.get("GITHUB_HEAD_REF", "")
        return head or os.environ.get("GITHUB_REF_NAME", "")
    return git("branch", "--show-current").strip()


def main() -> None:
    name = branch_name()
    if not name:
        print("check_branch: detached HEAD, skipped")
        return
    if PATTERN.fullmatch(name) is None or HASH_SUFFIX.search(name) is not None:
        fail(
            f'branch "{name}" must be <type>/<kebab-slug> with a type from {", ".join(TYPES)}, '
            "release/<version> or hotfix/<slug>, without a generated id at the end"
        )


if __name__ == "__main__":
    main()
