"""Run shellcheck on every tracked shell script (shellcheck does not walk directories)."""

import sys

from repo import repo_files, run_status


def main() -> None:
    scripts = [path for path in repo_files() if path.endswith(".sh")]
    if scripts:
        sys.exit(run_status("shellcheck", "--", *scripts))


if __name__ == "__main__":
    main()
