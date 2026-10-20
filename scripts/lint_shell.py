"""Run shellcheck on every tracked shell script (shellcheck does not walk directories)."""

import subprocess
import sys

from repo import ROOT, repo_files


def main() -> None:
    scripts = [path for path in repo_files() if path.endswith(".sh")]
    if scripts:
        sys.exit(subprocess.run(["shellcheck", "--", *scripts], cwd=ROOT, check=False).returncode)


if __name__ == "__main__":
    main()
