"""Check that the pnpm pinned in mise.toml is the one package.json declares in packageManager.

pnpm-workspace.yaml sets `pmOnFail: error`, so a drift already fails `pnpm install`; this check
names the two pins and fails earlier, in `check`.
"""

import tomllib

from repo import ROOT, fail, json_object, json_string, read_json


def main() -> None:
    with (ROOT / "mise.toml").open("rb") as file:
        tools = tomllib.load(file).get("tools", {})
    mise_pnpm = tools.get("pnpm") if isinstance(tools, dict) else None
    if not isinstance(mise_pnpm, str):
        fail("mise.toml: [tools] pnpm must be pinned to an exact version string")
    package = json_object(read_json(ROOT / "package.json"), "package.json")
    manager = json_string(package.get("packageManager"), "package.json packageManager")
    if manager != f"pnpm@{mise_pnpm}":
        fail(f'package.json packageManager is "{manager}", mise.toml pins pnpm {mise_pnpm}')


if __name__ == "__main__":
    main()
