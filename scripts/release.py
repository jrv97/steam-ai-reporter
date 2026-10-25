"""Release train, nightly prereleases and store promotion (ADR 0005), run by the release:* tasks.

  train [--dry-run]     open a batch PR from the newest green commit on main
  tag                   tag a merged batch commit and dispatch the nightly
  validate [--release]  check the tag is CalVer, on main and green; --release checks the assets
  publish-nightly       create the GitHub prerelease from artifacts/
  chrome                upload and publish the Chromium zip to the Chrome Web Store
  amo                   submit the Gecko zip and the source zip to AMO, listed channel
  latest                mark the release latest, which moves the userscript update URLs

The release app writes with RELEASE_APP_TOKEN and RELEASE_APP_SLUG.
GH_TOKEN reads, and github-actions[bot] uses it to approve the batch PR.
RELEASE_TAG names the tag and RELEASE_SHA the commit to tag. DRY_RUN=true makes train report only.
"""

import argparse
import json
import os
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

import cws
from calver import next_version, parse, release_tags, utc_today
from repo import (
    ARTIFACTS,
    EXTENSION_TARGETS,
    ROOT,
    SLUG,
    fail,
    git,
    json_object,
    json_string,
    package_version,
)

CHANGES = ROOT / ".changes"
CHANGELOG = ROOT / "CHANGELOG.md"
CI_RUNS = "repos/{owner}/{repo}/actions/workflows/ci.yml/runs"
RELEASE_BRANCH = "release/"
NIGHTLY_WORKFLOW = "release-nightly.yml"
PACKAGE_VERSION = re.compile(r'^(\s*"version":\s*)"[^"]*"', re.MULTILINE)
GREEN_LOOKBACK = 100


def run(*args: str, token: str | None = None) -> str:
    """Run a tool and return its stdout. A `token` replaces GH_TOKEN for this call."""
    env = os.environ | ({"GH_TOKEN": token} if token else {})
    result = subprocess.run(
        list(args), cwd=ROOT, env=env, check=False, capture_output=True, text=True, encoding="utf-8"
    )
    if result.returncode != 0:
        fail(f"{args[0]} {args[1] if len(args) > 1 else ''} failed:\n{result.stderr.strip()}")
    return result.stdout


def gh_json(*args: str, token: str | None = None) -> object:
    parsed: object = json.loads(run("gh", *args, token=token))
    return parsed


def summary(*lines: str) -> None:
    """Print lines and add them to the job summary when running in GitHub Actions."""
    print("\n".join(lines))
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with Path(path).open("a", encoding="utf-8") as file:
            file.write("\n".join(lines) + "\n")


def env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        fail(f"{name} is not set")
    return value


def app_token() -> str:
    return env("RELEASE_APP_TOKEN")


def run_list(value: object, key: str) -> list[object]:
    items = json_object(value, "response").get(key)
    if not isinstance(items, list):
        fail(f"response: expected a list under {key}")
    return list(items)


def ci_passed(sha: str) -> bool:
    runs = gh_json("api", f"{CI_RUNS}?head_sha={sha}&status=success&per_page=1")
    return bool(run_list(runs, "workflow_runs"))


def newest_green_commit() -> str | None:
    """The newest commit on origin/main with a successful CI run on a push, if any."""
    runs = gh_json("api", f"{CI_RUNS}?branch=main&event=push&status=success&per_page=100")
    green = {
        json_string(json_object(item, "run").get("head_sha"), "run head_sha")
        for item in run_list(runs, "workflow_runs")
    }
    commits = git("rev-list", f"--max-count={GREEN_LOOKBACK}", "origin/main").split()
    return next((sha for sha in commits if sha in green), None)


def release_pr_open() -> bool:
    pulls = gh_json("pr", "list", "--state", "open", "--json", "headRefName", "--limit", "100")
    if not isinstance(pulls, list):
        fail("gh pr list: expected a list")
    heads = [json_string(json_object(pull, "pull").get("headRefName"), "head") for pull in pulls]
    return any(head.startswith(RELEASE_BRANCH) for head in heads)


def fragments_at(sha: str) -> list[str]:
    names = git("ls-tree", "--name-only", f"{sha}:.changes/unreleased").split()
    return [name for name in names if name.endswith(".yaml")]


def changie_version(version: str) -> str:
    """changie takes only SemVer, so a recut `Y.M.D.N` goes in as `Y.M.D+N`."""
    parts = version.split(".")
    return version if len(parts) == 3 else f"{'.'.join(parts[:3])}+{parts[3]}"


def batch_changelog(version: str) -> None:
    """Batch the fragments and rebuild CHANGELOG.md, newest version first.

    `changie merge` drops four-segment version files, and this merge keeps them.
    """
    semver = changie_version(version)
    run("changie", "batch", semver)
    produced, target = CHANGES / f"{semver}.md", CHANGES / f"{version}.md"
    if produced != target:
        heading, _, rest = produced.read_text(encoding="utf-8").partition("\n")
        target.write_text(f"{heading.replace(semver, version, 1)}\n{rest}", encoding="utf-8")
        produced.unlink()
    sections = sorted(
        (version_key, path)
        for path in CHANGES.glob("*.md")
        if (version_key := parse(path.stem)) is not None
    )
    header = (CHANGES / "header.tpl.md").read_text(encoding="utf-8").rstrip("\n")
    body = "".join(
        f"\n{path.read_text(encoding='utf-8').rstrip()}\n" for _, path in reversed(sections)
    )
    with CHANGELOG.open("w", encoding="utf-8", newline="\n") as file:
        file.write(f"{header}\n{body}")


def set_package_version(version: str) -> None:
    path = ROOT / "package.json"
    text, count = PACKAGE_VERSION.subn(
        lambda match: f'{match[1]}"{version}"', path.read_text(encoding="utf-8"), count=1
    )
    if count != 1:
        fail("package.json: no version field")
    with path.open("w", encoding="utf-8", newline="\n") as file:
        file.write(text)


def open_batch_pr(version: str, base: str) -> None:
    token, slug = app_token(), env("RELEASE_APP_SLUG")
    app_user_id = run("gh", "api", f"users/{slug}[bot]", "--jq", ".id", token=token).strip()
    branch, title = f"{RELEASE_BRANCH}{version}", f"chore(release): {version}"
    git("switch", "--create", branch, base)
    batch_changelog(version)
    set_package_version(version)
    git("add", "--all", ".changes", "CHANGELOG.md", "package.json")
    git(
        "-c",
        f"user.name={slug}[bot]",
        "-c",
        f"user.email={app_user_id}+{slug}[bot]@users.noreply.github.com",
        "commit",
        "--message",
        title,
    )
    run("gh", "auth", "setup-git", token=token)
    run("git", "push", "origin", f"HEAD:refs/heads/{branch}", token=token)
    body = f"Batches the changelog fragments into {version} and sets the package.json version."
    create = ["pr", "create", "--base", "main", "--head", branch, "--title", title, "--body", body]
    url = run("gh", *create, token=token).strip()
    run("gh", "pr", "merge", url, "--auto", "--squash", token=token)
    decision = gh_json("pr", "view", url, "--json", "reviewDecision")
    if json_object(decision, "pr view").get("reviewDecision") == "REVIEW_REQUIRED":
        run("gh", "pr", "review", url, "--approve", "--body", "Release batch.")
    summary(f"Opened {url}; it merges once the required checks pass.")


def train(dry_run: bool) -> None:
    base = newest_green_commit()
    if base is None:
        summary("No green commit on main; nothing to release.")
        return
    if release_pr_open():
        summary("A release pull request is already open; skipped.")
        return
    tags = release_tags()
    if tags and not git("rev-list", f"{tags[-1]}..{base}").strip():
        summary(f"Nothing landed between {tags[-1]} and {base[:12]}; skipped.")
        return
    fragments = fragments_at(base)
    if not fragments:
        summary(f"No changelog fragments at {base[:12]}; no release.")
        return
    try:
        version = next_version(utc_today(), tags)
    except ValueError as error:
        fail(str(error))
    summary(
        f"Release {version} from {base[:12]} with {len(fragments)} fragment(s):",
        *(f"- {name}" for name in fragments),
    )
    if dry_run:
        summary("Dry run: no branch, pull request or tag was created.")
        return
    open_batch_pr(version, base)


def version_at(revision: str) -> str:
    package = json_object(json.loads(git("show", f"{revision}:package.json")), "package.json")
    return json_string(package.get("version"), "package.json version")


def tag() -> None:
    sha = env("RELEASE_SHA")
    version = version_at(sha)
    parsed = parse(version)
    if parsed is None or version == version_at(f"{sha}^1"):
        summary(f"{sha[:12]} is not a release batch commit; nothing to tag.")
        return
    tags = release_tags()
    if version in tags:
        summary(f"{version} is already tagged; nothing to do.")
        return
    newer = [old for old in tags if (other := parse(old)) is not None and other > parsed]
    if newer:
        fail(f"{version} does not come after the newest tag {newer[-1]}")
    if not ci_passed(sha):
        fail(f"CI has not passed for {sha}")
    token = app_token()
    ref_api = "repos/{owner}/{repo}/git/refs"
    run("gh", "api", ref_api, "-f", f"ref=refs/tags/{version}", "-f", f"sha={sha}", token=token)
    dispatch = ["workflow", "run", NIGHTLY_WORKFLOW, "--ref", version, "-f", f"tag={version}"]
    run("gh", *dispatch, token=token)
    summary(f"Tagged {sha[:12]} as {version} and dispatched {NIGHTLY_WORKFLOW}.")


def release_tag() -> str:
    version = env("RELEASE_TAG")
    if parse(version) is None:
        fail(f"{version!r} is not an unpadded CalVer version")
    return version


def asset_names(version: str) -> list[str]:
    return [
        *(f"{SLUG}-{target}-{version}.zip" for target in EXTENSION_TARGETS),
        f"{SLUG}.user.js",
        f"{SLUG}.meta.js",
        f"{SLUG}-source-{version}.zip",
    ]


def validate(release: bool) -> None:
    version = release_tag()
    ref = os.environ.get("GITHUB_REF")
    if ref is not None and ref != f"refs/tags/{version}":
        fail(f"run this workflow from the tag {version}, not {ref}")
    sha = git("rev-parse", f"refs/tags/{version}^{{commit}}").strip()
    if git("rev-parse", "HEAD").strip() != sha:
        fail(f"the checkout is not at the tag {version}")
    if package_version() != version:
        fail(f"package.json at {version} holds version {package_version()}")
    try:
        git("merge-base", "--is-ancestor", sha, "origin/main")
    except subprocess.CalledProcessError:
        fail(f"{version} ({sha[:12]}) is not on origin/main")
    if not ci_passed(sha):
        fail(f"CI has not passed for {version} ({sha[:12]})")
    if release:
        view = json_object(gh_json("release", "view", version, "--json", "assets"), "release")
        names = {
            json_string(json_object(asset, "asset").get("name"), "asset name")
            for asset in run_list(view, "assets")
        }
        missing = sorted(set(asset_names(version)) - names)
        if missing:
            fail(f"release {version} lacks {', '.join(missing)}")
    summary(f"{version} ({sha[:12]}) is CalVer, on main, and green.")


def release_notes(version: str) -> str:
    path = CHANGES / f"{version}.md"
    if not path.is_file():
        fail(f"{path.relative_to(ROOT)} is missing; the release batch writes it")
    return path.read_text(encoding="utf-8").partition("\n")[2].strip()


def publish_nightly() -> None:
    version = release_tag()
    files = [ARTIFACTS / name for name in asset_names(version)]
    present = sorted(path.name for path in ARTIFACTS.iterdir())
    if present != sorted(path.name for path in files):
        fail(f"artifacts/ holds {present}, expected {asset_names(version)}")
    with tempfile.TemporaryDirectory() as folder:
        notes = Path(folder) / "notes.md"
        notes.write_text(release_notes(version) + "\n", encoding="utf-8")
        options = ["--prerelease", "--verify-tag", "--title", version, "--notes-file", str(notes)]
        run("gh", "release", "create", version, *map(str, files), *options)
    summary(f"Created the prerelease {version} with {len(files)} assets. No store was touched.")


def download(version: str, *names: str) -> list[Path]:
    ARTIFACTS.mkdir(exist_ok=True)
    patterns = [arg for name in names for arg in ("--pattern", name)]
    run("gh", "release", "download", version, "--dir", str(ARTIFACTS), "--clobber", *patterns)
    return [ARTIFACTS / name for name in names]


def manifest_version(archive: Path) -> str:
    with zipfile.ZipFile(archive) as files:
        manifest = json_object(json.loads(files.read("manifest.json")), "manifest.json")
    return json_string(manifest.get("version"), "manifest version")


def promoted_zip(version: str, target: str) -> Path:
    (path,) = download(version, f"{SLUG}-{target}-{version}.zip")
    if manifest_version(path) != version:
        fail(f"{path.name}: manifest version is {manifest_version(path)}, not {version}")
    return path


def require_env(*names: str) -> None:
    missing = [name for name in names if not os.environ.get(name)]
    if missing:
        fail(f"missing environment secrets: {', '.join(missing)}")


def chrome() -> None:
    """Submit the Chromium zip with a short-lived Workload Identity Federation token (ADR 0007).

    It reads CWS_ACCESS_TOKEN, CWS_PUBLISHER_ID and CWS_EXTENSION_ID.
    """
    require_env("CWS_ACCESS_TOKEN", "CWS_PUBLISHER_ID", "CWS_EXTENSION_ID")
    version = release_tag()
    archive = promoted_zip(version, "chromium")
    call = cws.http_call(env("CWS_ACCESS_TOKEN"))
    state = cws.publish(call, env("CWS_PUBLISHER_ID"), env("CWS_EXTENSION_ID"), archive)
    summary(f"Submitted {archive.name} to the Chrome Web Store for review (state {state}).")


def amo() -> None:
    """Submit to the AMO listed channel through web-ext sign, which reads WEB_EXT_API_*."""
    require_env("WEB_EXT_API_KEY", "WEB_EXT_API_SECRET")
    version = release_tag()
    archive = promoted_zip(version, "gecko")
    (source,) = download(version, f"{SLUG}-source-{version}.zip")
    with tempfile.TemporaryDirectory() as folder:
        unpacked, metadata = Path(folder) / "gecko", Path(folder) / "amo-metadata.json"
        with zipfile.ZipFile(archive) as files:
            files.extractall(unpacked)
        notes = {"version": {"release_notes": {"en-US": release_notes(version)}}}
        metadata.write_text(json.dumps(notes, indent=2), encoding="utf-8")
        sign = {
            "--channel": "listed",
            "--source-dir": str(unpacked),
            "--upload-source-code": str(source),
            "--amo-metadata": str(metadata),
            "--approval-timeout": "0",
            "--artifacts-dir": str(Path(folder) / "signed"),
        }
        print(run("web-ext", "sign", *(part for pair in sign.items() for part in pair)))
    summary(f"Submitted {archive.name} and its source to AMO (listed); review follows.")


def latest() -> None:
    version = release_tag()
    run("gh", "release", "edit", version, "--prerelease=false", "--latest")
    summary(f"{version} is now the latest release; userscript installs will update.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Release train and promotion.")
    commands = parser.add_subparsers(dest="command", required=True)
    train_parser = commands.add_parser("train")
    train_parser.add_argument("--dry-run", action="store_true")
    validate_parser = commands.add_parser("validate")
    validate_parser.add_argument("--release", action="store_true")
    for name in ("tag", "publish-nightly", "chrome", "amo", "latest"):
        commands.add_parser(name)
    args = parser.parse_args()
    match args.command:
        case "train":
            train(args.dry_run or os.environ.get("DRY_RUN") == "true")
        case "validate":
            validate(args.release)
        case "tag":
            tag()
        case "publish-nightly":
            publish_nightly()
        case "chrome":
            chrome()
        case "amo":
            amo()
        case "latest":
            latest()
        case _:
            fail(f"unknown command {args.command}")


if __name__ == "__main__":
    main()
