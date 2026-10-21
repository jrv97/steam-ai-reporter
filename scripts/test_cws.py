"""Unit tests for cws.py with a fake API (run by `mise run release:test`)."""

import tempfile
import unittest
from collections.abc import Iterator
from pathlib import Path

from cws import POLL_ATTEMPTS, publish

ITEM = "publishers/pub/items/ext"


class FakeApi:
    def __init__(self, upload: str, statuses: list[str], publish_state: str = "PENDING_REVIEW"):
        self.upload = upload
        self.statuses: Iterator[str] = iter(statuses)
        self.publish_state = publish_state
        self.calls: list[tuple[str, str, int]] = []
        self.sleeps = 0

    def __call__(self, method: str, path: str, body: bytes) -> dict[str, object]:
        self.calls.append((method, path, len(body)))
        if path.endswith(":upload"):
            return {"uploadState": self.upload}
        if path.endswith(":fetchStatus"):
            return {"lastAsyncUploadState": next(self.statuses)}
        return {"state": self.publish_state}

    def sleep(self, _seconds: float) -> None:
        self.sleeps += 1


class PublishTest(unittest.TestCase):
    def setUp(self) -> None:
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.archive = Path(folder.name) / "chrome.zip"
        self.archive.write_bytes(b"zip-bytes")

    def run_publish(self, api: FakeApi) -> str:
        return publish(api, "pub", "ext", self.archive, api.sleep)

    def test_uploads_then_submits_when_the_upload_succeeds_at_once(self) -> None:
        api = FakeApi("SUCCEEDED", [])
        self.assertEqual(self.run_publish(api), "PENDING_REVIEW")
        self.assertEqual(
            api.calls,
            [("POST", f"/upload/v2/{ITEM}:upload", 9), ("POST", f"/v2/{ITEM}:publish", 0)],
        )
        self.assertEqual(api.sleeps, 0)

    def test_polls_an_upload_in_progress_until_it_succeeds(self) -> None:
        api = FakeApi("IN_PROGRESS", ["IN_PROGRESS", "SUCCEEDED"])
        self.run_publish(api)
        paths = [path for _, path, _ in api.calls]
        self.assertEqual(paths.count(f"/v2/{ITEM}:fetchStatus"), 2)
        self.assertEqual(paths[-1], f"/v2/{ITEM}:publish")
        self.assertEqual(api.sleeps, 2)

    def test_a_failed_upload_stops_before_publishing(self) -> None:
        for api in (FakeApi("FAILED", []), FakeApi("IN_PROGRESS", ["FAILED"])):
            with self.subTest(upload=api.upload), self.assertRaises(SystemExit):
                self.run_publish(api)
            self.assertNotIn(":publish", " ".join(path for _, path, _ in api.calls))

    def test_an_upload_that_never_finishes_fails_after_the_poll_budget(self) -> None:
        api = FakeApi("IN_PROGRESS", ["IN_PROGRESS"] * POLL_ATTEMPTS)
        with self.assertRaises(SystemExit):
            self.run_publish(api)
        self.assertEqual(api.sleeps, POLL_ATTEMPTS)


if __name__ == "__main__":
    unittest.main()
