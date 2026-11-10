"""Phase 2: import, metadata and background jobs."""

from __future__ import annotations

import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.services.library import copy_with_progress
from app.services.media_probe import parse_ffprobe_output
from tests.conftest import CLIENT_HEADERS

HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
needs_ffmpeg = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg/ffprobe not installed")


# ----------------------------------------------------------------- helpers


def make_video(path: Path, seconds: int = 2, size: str = "320x240", rate: int = 30) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"testsrc=duration={seconds}:size={size}:rate={rate}",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=440:duration={seconds}",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            "-shortest",
            str(path),
        ],
        check=True,
    )
    return path


def configure_storage(client: TestClient, root: Path) -> dict[str, Path]:
    folders = {k: root / k for k in ("originals", "processing", "clips", "exports")}
    payload = {"storage": {k: str(v) for k, v in folders.items()}}
    assert client.put("/api/settings", json=payload, headers=CLIENT_HEADERS).status_code == 200
    assert client.post("/api/settings/storage/create-folders", headers=CLIENT_HEADERS).json()[
        "all_ready"
    ]
    return folders


def wait_job(client: TestClient, job_id: int, timeout: float = 30.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job: dict[str, Any] = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] not in ("queued", "running"):
            return job
        time.sleep(0.1)
    raise AssertionError(f"job {job_id} did not finish")


def post(client: TestClient, path: str, body: dict[str, Any] | None = None) -> Any:
    return client.post(path, json=body, headers=CLIENT_HEADERS)


# --------------------------------------------------------------- unit tests


def test_parse_ffprobe_output() -> None:
    info = parse_ffprobe_output(
        {
            "format": {
                "duration": "3600.5",
                "bit_rate": "6000000",
                "format_name": "matroska,webm",
                "tags": {"creation_time": "2026-11-10T20:15:33.000000Z"},
            },
            "streams": [
                {"codec_type": "video", "codec_name": "mjpeg", "disposition": {"attached_pic": 1}},
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1920,
                    "height": 1080,
                    "avg_frame_rate": "30000/1001",
                },
                {"codec_type": "audio", "codec_name": "aac"},
                {"codec_type": "audio", "codec_name": "aac"},
            ],
        }
    )
    assert info.video_codec == "h264"  # cover art ignored
    assert (info.width, info.height) == (1920, 1080)
    assert info.fps == pytest.approx(29.97, abs=0.01)
    assert info.audio_tracks == 2  # OBS often records game + mic on separate tracks
    assert info.bitrate_kbps == 6000
    assert info.duration_seconds == 3600.5
    assert info.created_at is not None and info.created_at.year == 2026


def test_copy_cancel_removes_partial_file(tmp_path: Path) -> None:
    source = tmp_path / "src.mkv"
    source.write_bytes(b"x" * (20 * 1024 * 1024))
    dest = tmp_path / "out" / "src.mkv"
    dest.parent.mkdir()

    def cancel(copied: int, total: int) -> None:
        raise RuntimeError("cancelled")

    with pytest.raises(RuntimeError):
        copy_with_progress(source, dest, cancel)
    assert not dest.exists()
    assert list(dest.parent.iterdir()) == []
    assert source.exists()


# -------------------------------------------------------------- API tests


def test_scan_requires_configured_originals(client: TestClient) -> None:
    resp = post(client, "/api/imports/scan")
    assert resp.status_code == 409
    assert "originais" in resp.json()["error"]["message"]


@needs_ffmpeg
def test_scan_registers_videos_with_metadata(client: TestClient, tmp_path: Path) -> None:
    folders = configure_storage(client, tmp_path / "hd")
    make_video(folders["originals"] / "live 1.mp4", size="640x360", rate=60)
    make_video(folders["originals"] / "2026-11" / "live 2.mkv")
    (folders["originals"] / "notes.txt").write_text("not a video")
    (folders["originals"] / "partial.mkv.part").write_bytes(b"in progress")
    (folders["originals"] / "broken.mp4").write_bytes(b"not really a video")

    job = wait_job(client, post(client, "/api/imports/scan").json()["id"])
    assert job["status"] == "succeeded", job
    assert job["result"] == {
        "found": 3,
        "added": 3,
        "already_in_library": 0,
        "without_metadata": 1,
    }

    items = {r["title"]: r for r in client.get("/api/recordings").json()["items"]}
    assert set(items) == {"live 1", "live 2", "broken"}
    live = items["live 1"]
    assert (live["width"], live["height"], live["fps"]) == (640, 360, 60.0)
    assert live["duration_seconds"] == pytest.approx(2.0, abs=0.2)
    assert live["video_codec"] == "h264" and live["audio_codec"] == "aac"
    assert live["audio_tracks"] == 1 and live["file_exists"] is True
    assert items["broken"]["probed_at"] is None
    assert items["broken"]["error_message"]

    # A second scan does not duplicate anything.
    again = wait_job(client, post(client, "/api/imports/scan").json()["id"])
    assert again["result"]["added"] == 0 and again["result"]["already_in_library"] == 3

    stats = client.get("/api/recordings/stats").json()
    assert stats["total"] == 3 and stats["missing_metadata"] == 1


@needs_ffmpeg
def test_import_copies_file_into_originals(client: TestClient, tmp_path: Path) -> None:
    folders = configure_storage(client, tmp_path / "hd")
    source = make_video(tmp_path / "obs" / "gravacao.mkv")

    # Quoted path, as produced by Windows Explorer's "Copy as path".
    resp = post(client, "/api/imports/file", {"source_path": f'"{source}"'})
    assert resp.status_code == 202, resp.text
    job = wait_job(client, resp.json()["id"])
    assert job["status"] == "succeeded", job
    assert job["result"]["copied"] is True and job["result"]["metadata_ok"] is True

    copied = folders["originals"] / "gravacao.mkv"
    assert copied.is_file() and source.is_file()  # original is never moved or deleted
    assert copied.stat().st_size == source.stat().st_size

    recording = client.get(f"/api/recordings/{job['result']['recording_id']}").json()
    assert Path(recording["file_path"]) == copied

    # Importing the same source again: copy is detected, nothing duplicated.
    job2 = wait_job(
        client, post(client, "/api/imports/file", {"source_path": str(source)}).json()["id"]
    )
    assert job2["result"]["created"] is False
    assert client.get("/api/recordings").json()["total"] == 1


@needs_ffmpeg
def test_import_name_conflict_gets_unique_name(client: TestClient, tmp_path: Path) -> None:
    folders = configure_storage(client, tmp_path / "hd")
    (folders["originals"] / "live.mp4").write_bytes(b"different content")
    source = make_video(tmp_path / "obs" / "live.mp4")
    job = wait_job(
        client, post(client, "/api/imports/file", {"source_path": str(source)}).json()["id"]
    )
    assert job["status"] == "succeeded"
    assert Path(job["result"]["destination"]).name == "live (1).mp4"


@needs_ffmpeg
def test_import_file_already_in_originals_is_not_copied(client: TestClient, tmp_path: Path) -> None:
    folders = configure_storage(client, tmp_path / "hd")
    inside = make_video(folders["originals"] / "ja-aqui.mp4")
    job = wait_job(
        client, post(client, "/api/imports/file", {"source_path": str(inside)}).json()["id"]
    )
    assert job["status"] == "succeeded" and job["result"]["copied"] is False
    resp = post(client, "/api/imports/file", {"source_path": str(inside)})
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "already_imported"


@pytest.mark.parametrize(
    ("name", "content", "expected"),
    [
        ("relative.mp4", None, "caminho completo"),
        ("video.exe", b"MZ", "Formato não suportado"),
        ("missing.mp4", None, "não encontrado"),
        ("empty.mp4", b"", "vazio"),
    ],
)
def test_import_validation(
    client: TestClient, tmp_path: Path, name: str, content: bytes | None, expected: str
) -> None:
    configure_storage(client, tmp_path / "hd")
    path = tmp_path / name
    if content is not None:
        path.write_bytes(content)
    source = name if name.startswith("relative") else str(path)
    resp = post(client, "/api/imports/file", {"source_path": source})
    assert resp.status_code == 422
    assert expected in resp.json()["error"]["message"]


@needs_ffmpeg
def test_edit_search_sort_and_remove(client: TestClient, tmp_path: Path) -> None:
    folders = configure_storage(client, tmp_path / "hd")
    make_video(folders["originals"] / "a.mp4", seconds=1)
    make_video(folders["originals"] / "b.mp4", seconds=3)
    wait_job(client, post(client, "/api/imports/scan").json()["id"])
    rec = next(r for r in client.get("/api/recordings").json()["items"] if r["title"] == "a")

    resp = client.patch(
        f"/api/recordings/{rec['id']}",
        json={"title": "Perseguição na ponte", "notes": "Live com a gangue 100%_off"},
        headers=CLIENT_HEADERS,
    )
    assert resp.status_code == 200 and resp.json()["title"] == "Perseguição na ponte"
    assert (
        client.patch(
            f"/api/recordings/{rec['id']}", json={"title": ""}, headers=CLIENT_HEADERS
        ).status_code
        == 422
    )

    found = client.get("/api/recordings", params={"search": "ponte"}).json()
    assert [r["id"] for r in found["items"]] == [rec["id"]]
    # LIKE wildcards in the search term are treated literally.
    assert client.get("/api/recordings", params={"search": "100%_"}).json()["total"] == 1
    # As a wildcard "P%te" would match "Perseguição na ponte"; literally it matches nothing.
    assert client.get("/api/recordings", params={"search": "P%te"}).json()["total"] == 0

    by_duration = client.get("/api/recordings", params={"sort": "duration"}).json()["items"]
    assert by_duration[0]["title"] == "b"

    assert client.delete(f"/api/recordings/{rec['id']}", headers=CLIENT_HEADERS).status_code == 204
    assert client.get(f"/api/recordings/{rec['id']}").status_code == 404
    assert (folders["originals"] / "a.mp4").is_file()  # the video file is kept


@needs_ffmpeg
def test_reprobe_reports_missing_file(client: TestClient, tmp_path: Path) -> None:
    folders = configure_storage(client, tmp_path / "hd")
    video = make_video(folders["originals"] / "x.mp4")
    wait_job(client, post(client, "/api/imports/scan").json()["id"])
    rec = client.get("/api/recordings").json()["items"][0]

    ok = wait_job(client, post(client, f"/api/recordings/{rec['id']}/probe").json()["id"])
    assert ok["status"] == "succeeded"

    video.unlink()
    assert client.get(f"/api/recordings/{rec['id']}").json()["file_exists"] is False
    failed = wait_job(client, post(client, f"/api/recordings/{rec['id']}/probe").json()["id"])
    assert failed["status"] == "failed" and "não encontrado" in failed["error"]


def test_cancel_finished_job_is_rejected(client: TestClient, tmp_path: Path) -> None:
    configure_storage(client, tmp_path / "hd")
    job = wait_job(client, post(client, "/api/imports/scan").json()["id"])
    assert job["status"] == "succeeded"
    resp = post(client, f"/api/jobs/{job['id']}/cancel")
    assert resp.status_code == 409
    assert client.get("/api/jobs", params={"active": True}).json()["total"] == 0


def test_interrupted_jobs_are_marked_failed_on_restart(tmp_path: Path) -> None:
    from app.core.config import Settings
    from app.db.models import Job, JobStatus, JobType
    from app.db.session import get_session_factory
    from app.main import create_app

    settings = Settings(data_dir=tmp_path / "data", allowed_hosts=["testserver"])
    with TestClient(create_app(settings)), get_session_factory()() as session:
        session.add(Job(type=JobType.SCAN_ORIGINALS, status=JobStatus.RUNNING, payload={}))
        session.commit()
    # Simulates the app being closed mid-task and started again.
    with TestClient(create_app(settings)) as client:
        job = client.get("/api/jobs").json()["items"][0]
        assert job["status"] == "failed" and "interrompida" in job["error"]
