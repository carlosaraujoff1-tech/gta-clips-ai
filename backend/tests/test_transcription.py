"""Phase 3: transcription pipeline.

Most tests replace the Whisper model with a fake so they run in seconds and need
no model download. ``test_real_whisper`` runs the real engine when a model is
available (set GTA_CLIPS_TEST_MODELS_DIR to a data/models folder).
"""

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.schemas.settings import AISettings
from app.services import whisper
from tests.test_imports import configure_storage, make_video, needs_ffmpeg, post, wait_job

# ----------------------------------------------------------------- fakes


def fake_transcribe(
    audio_path: Path, models_root: Path, ai: AISettings
) -> tuple[whisper.TranscriptionInfo, Iterator[whisper.SegmentData]]:
    assert audio_path.is_file() and audio_path.suffix == ".wav"  # real extracted audio
    segments = [
        whisper.SegmentData(0.0, 1.2, "Perdeu, perdeu!", -0.2, 0.01, [[0.0, 0.5, " Perdeu,", 0.9]]),
        whisper.SegmentData(1.5, 2.8, "Corre pro helicóptero!", -0.3, 0.02),
    ]
    return whisper.TranscriptionInfo("pt", 0.98, 3.0), iter(segments)


@pytest.fixture()
def fake_whisper(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(whisper, "is_installed", lambda: True)
    monkeypatch.setattr(whisper, "is_downloaded", lambda root, name: True)
    monkeypatch.setattr(whisper, "transcribe", fake_transcribe)


def import_one(client: TestClient, tmp_path: Path, **video: Any) -> tuple[dict[str, Path], int]:
    folders = configure_storage(client, tmp_path / "hd")
    make_video(folders["originals"] / "live.mp4", **video)
    wait_job(client, post(client, "/api/imports/scan").json()["id"])
    return folders, client.get("/api/recordings").json()["items"][0]["id"]


# ------------------------------------------------------------- unit tests


def test_subtitle_formats() -> None:
    rows = [(0.0, 1.5, "Olá"), (3661.25, 3662.0, "Tudo bem?")]
    assert whisper.to_srt(rows) == (
        "1\n00:00:00,000 --> 00:00:01,500\nOlá\n\n2\n01:01:01,250 --> 01:01:02,000\nTudo bem?\n"
    )
    assert whisper.to_vtt(rows).startswith("WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nOlá\n")
    assert whisper.to_txt(rows) == "[00:00:00] Olá\n[01:01:01] Tudo bem?\n"


def test_status_lists_models(client: TestClient) -> None:
    body = client.get("/api/transcription/status").json()
    names = [m["name"] for m in body["models"]]
    assert names == ["tiny", "base", "small", "medium", "large-v3"]
    assert next(m for m in body["models"] if m["name"] == "small")["selected"] is True
    assert body["cpu_threads"] >= 1


# ---------------------------------------------------------------- pipeline


def test_transcribe_requires_model(client: TestClient, tmp_path: Path) -> None:
    configure_storage(client, tmp_path / "hd")
    resp = post(client, "/api/recordings/999/transcribe", {})
    assert resp.status_code == 404


@needs_ffmpeg
def test_transcribe_without_model_is_refused(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(whisper, "is_installed", lambda: True)
    _, rec_id = import_one(client, tmp_path)
    resp = post(client, f"/api/recordings/{rec_id}/transcribe", {})
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "model_missing"


@needs_ffmpeg
def test_full_pipeline_with_fake_model(
    client: TestClient, tmp_path: Path, fake_whisper: None
) -> None:
    folders, rec_id = import_one(client, tmp_path)

    job = wait_job(client, post(client, f"/api/recordings/{rec_id}/transcribe", {}).json()["id"])
    assert job["status"] == "succeeded", job
    assert job["result"]["segments"] == 2 and job["result"]["words"] == 5

    rec = client.get(f"/api/recordings/{rec_id}").json()
    assert rec["status"] == "transcribed" and rec["has_transcript"] is True

    transcript = client.get(f"/api/recordings/{rec_id}/transcript").json()
    assert transcript["language"] == "pt"
    assert [s["text"] for s in transcript["segments"]] == [
        "Perdeu, perdeu!",
        "Corre pro helicóptero!",
    ]

    srt = client.get(f"/api/recordings/{rec_id}/transcript/export", params={"format": "srt"})
    assert srt.status_code == 200 and "Corre pro helicóptero!" in srt.text
    assert "attachment" in srt.headers["content-disposition"]

    # The temporary WAV is always removed from the processing folder.
    assert list(folders["processing"].iterdir()) == []

    # Re-transcribing replaces the previous transcript (no duplicates).
    wait_job(client, post(client, f"/api/recordings/{rec_id}/transcribe", {}).json()["id"])
    again = client.get(f"/api/recordings/{rec_id}/transcript").json()
    assert again["segment_count"] == 2 and len(again["segments"]) == 2


@needs_ffmpeg
def test_invalid_audio_track(client: TestClient, tmp_path: Path, fake_whisper: None) -> None:
    _, rec_id = import_one(client, tmp_path)
    resp = post(client, f"/api/recordings/{rec_id}/transcribe", {"audio_track": 3})
    assert resp.status_code == 422 and "1 faixa" in resp.json()["error"]["message"]


@needs_ffmpeg
def test_failure_restores_status(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fake_whisper: None
) -> None:
    def broken(*args: Any) -> Any:
        raise whisper.WhisperError("Modelo corrompido.")

    monkeypatch.setattr(whisper, "transcribe", broken)
    folders, rec_id = import_one(client, tmp_path)
    job = wait_job(client, post(client, f"/api/recordings/{rec_id}/transcribe", {}).json()["id"])
    assert job["status"] == "failed" and job["error"] == "Modelo corrompido."
    rec = client.get(f"/api/recordings/{rec_id}").json()
    assert rec["status"] == "imported" and "Modelo corrompido" in rec["error_message"]
    assert list(folders["processing"].iterdir()) == []


@needs_ffmpeg
def test_transcribe_pending_queues_only_eligible(
    client: TestClient, tmp_path: Path, fake_whisper: None
) -> None:
    folders = configure_storage(client, tmp_path / "hd")
    make_video(folders["originals"] / "a.mp4")
    make_video(folders["originals"] / "b.mp4")
    (folders["originals"] / "broken.mp4").write_bytes(b"not a video")
    wait_job(client, post(client, "/api/imports/scan").json()["id"])

    result = post(client, "/api/recordings/transcribe-pending").json()
    assert result == {"queued": 2, "skipped": 1}
    for job in client.get("/api/jobs").json()["items"]:
        wait_job(client, job["id"])
    # Already transcribed recordings are not queued again.
    assert post(client, "/api/recordings/transcribe-pending").json()["queued"] == 0


def test_transcript_404_when_missing(client: TestClient, tmp_path: Path) -> None:
    resp = client.get("/api/recordings/1/transcript")
    assert resp.status_code == 404


def test_stuck_transcribing_status_is_recovered(tmp_path: Path) -> None:
    from app.core.config import Settings
    from app.db.models import Recording, RecordingStatus
    from app.db.session import get_session_factory
    from app.main import create_app

    settings = Settings(data_dir=tmp_path / "data", allowed_hosts=["testserver"])
    with TestClient(create_app(settings)), get_session_factory()() as session:
        session.add(
            Recording(
                title="x",
                file_path=str(tmp_path / "x.mp4"),
                file_size_bytes=1,
                status=RecordingStatus.TRANSCRIBING,
            )
        )
        session.commit()
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/recordings").json()["items"][0]["status"] == "imported"


# -------------------------------------------------------- real engine (opt-in)

REAL_MODELS = os.environ.get("GTA_CLIPS_TEST_MODELS_DIR")


@pytest.mark.skipif(
    not REAL_MODELS or not whisper.is_installed() or shutil.which("ffmpeg") is None,
    reason="set GTA_CLIPS_TEST_MODELS_DIR to run the real Whisper model",
)
def test_real_whisper(tmp_path: Path) -> None:
    assert REAL_MODELS is not None
    sample = Path(os.environ.get("GTA_CLIPS_TEST_SPEECH", ""))
    if not sample.is_file():
        pytest.skip("set GTA_CLIPS_TEST_SPEECH to a short Portuguese speech WAV")
    wav = tmp_path / "speech16k.wav"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(sample), "-ac", "1", "-ar", "16000", str(wav)],
        check=True,
    )
    info, segments = whisper.transcribe(wav, Path(REAL_MODELS), AISettings(whisper_model="small"))
    text = " ".join(s.text for s in segments).lower()
    assert info.language == "pt"
    assert "polícia" in text or "policia" in text


def test_hallucination_guards() -> None:
    seg = whisper.SegmentData
    # Repetitive filler over music, when the model doubts there is speech.
    assert whisper.is_hallucination(seg(0, 1, "oi oi oi", None, 0.71))
    # The vocabulary hints leaking into the transcript.
    assert whisper.is_hallucination(seg(0, 1, "Viatura, polícia, reboque e helicóptero", None, 0.1))
    # Real speech that happens to contain hint words is kept.
    assert not whisper.is_hallucination(seg(0, 1, "Tu é polícia, eu sou reboque", None, 0.6))
    assert not whisper.is_hallucination(seg(0, 1, "Oi", None, 0.1))


def test_split_at_long_pause_and_capitalize() -> None:
    words: list[list[Any]] = [
        [0, 0.4, " falou", 1],
        [0.5, 0.9, " falou", 1],
        [2.0, 2.4, " chega", 1],  # 1.1 s pause before this word
        [2.5, 3, " rapaz", 1],
    ]
    s = whisper.SegmentData(0, 5, "falou falou chega rapaz", None, None, words)
    parts = whisper.split_sentences(s)
    assert [p.text for p in parts] == ["Falou falou", "Chega rapaz"]
