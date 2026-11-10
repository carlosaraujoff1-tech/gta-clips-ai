"""Phase 4 (highlight detection) and the Phase 5 preview render."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.services import highlights as h
from app.services import ollama, whisper
from app.services.subtitles import CaptionStyle, Word, build_ass, chunk_words, words_for_range
from tests.conftest import CLIENT_HEADERS
from tests.test_imports import (
    configure_storage,
    make_video,
    needs_ffmpeg,
    post,
    wait_job,
)

# ---------------------------------------------------------------- fixtures

LINES = [
    (0.0, 4.0, "Fala galera, bem-vindos a mais uma live."),
    (5.0, 9.0, "Hoje eu vou passar no banco."),
    (10.0, 13.0, "Beleza, vai com calma."),
    (16.0, 19.0, "É a polícia! Corre, corre, acelera!"),
    (19.5, 22.0, "Vira na esquerda, meu Deus, quase bateu!"),
    (22.5, 25.0, "Perdeu, perdeu! Mãos para cima!"),
    (25.5, 28.0, "Não acredito, mano!"),
    (31.0, 34.0, "Bom, pelo menos a fiança é barata."),
    (37.0, 40.0, "E aí, mecânico, quanto fica?"),
    (40.5, 43.0, "Cinquenta mil."),
    (43.5, 46.0, "Cinquenta mil? Mano do céu, kkkkk!"),
    (49.0, 52.0, "Valeu pela live, até amanhã."),
]


def segs() -> list[h.Seg]:
    return [h.Seg(i, a, b, t) for i, (a, b, t) in enumerate(LINES)]


# ------------------------------------------------------------- unit: signals


def test_text_excitement_ranks_action_over_logistics() -> None:
    assert h.text_excitement("Perdeu, perdeu! Mãos para cima!") > 2
    assert h.text_excitement("kkkkkk que isso") > 1.5
    assert h.text_excitement("Vou passar no banco depois.") == 0


def test_loudness_ignores_silence(tmp_path: Path) -> None:
    import wave

    import numpy as np

    rate = 16000
    quiet = 0.02 * np.sin(np.linspace(0, 2000, rate * 4))
    loud = 0.6 * np.sin(np.linspace(0, 2000, rate))
    silence = np.zeros(rate * 5)
    audio = np.concatenate([quiet, silence, loud, silence, quiet])
    path = tmp_path / "a.wav"
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((audio * 32767).astype(np.int16).tobytes())
    levels = h.loudness_per_second(path)
    data = [h.Seg(0, 0, 4, "a"), h.Seg(1, 9, 10, "b"), h.Seg(2, 15, 19, "c")]
    sig = h.segment_signals(data, levels)
    # The loud second stands out even though long silences surround it.
    assert sig[1] == 1.0 and sig[0] < 0.2


# -------------------------------------------------------- unit: boundaries


def test_extend_context_pulls_trigger_and_reaction() -> None:
    s = segs()
    sig = h.segment_signals(s, None)
    # AI picked only the middle of the chase: the trigger and the reaction are added.
    start, end = h.extend_context(s, sig, 4, 5, 60)
    assert s[start].text.startswith("É a polícia") and s[end].text.startswith("Não acredito")
    # Calm talk is not extended.
    assert h.extend_context(s, sig, 1, 1, 60) == (1, 1)


def test_extend_context_finds_setup_question() -> None:
    s = segs()
    sig = h.segment_signals(s, None)
    start, end = h.extend_context(s, sig, 10, 10, 60)
    assert s[start].text.endswith("quanto fica?") and end == 10


def test_fit_duration_respects_bounds() -> None:
    s = segs()
    sig = h.segment_signals(s, None)
    a, b = h.fit_duration(s, sig, 5, 5, 8, 60)
    assert s[b].end - s[a].start >= 8
    a, b = h.fit_duration(s, sig, 0, 11, 5, 20)
    assert s[b].end - s[a].start <= 20


def test_finalize_never_cuts_into_neighbour_line() -> None:
    s = segs()
    sig = h.segment_signals(s, None)
    c = h.Candidate(3, 6, s[3].start, s[6].end, "t", "perseguição", "", "", 90)
    [out] = h.finalize([c], sig, 60, 0, 5, segs=s)
    assert out.end <= s[7].start  # padding stops before the next line
    assert out.start >= s[2].end


def test_finalize_dedupes_and_filters() -> None:
    s = segs()
    sig = h.segment_signals(s, None)
    a = h.Candidate(3, 6, 16, 28, "a", "ação", "", "", 90)
    b = h.Candidate(4, 6, 19.5, 28, "b", "ação", "", "", 80)  # overlaps a
    c = h.Candidate(0, 1, 0, 9, "c", "outro", "", "", 10)  # too weak
    out = h.finalize([a, b, c], sig, 60, 40, 5, segs=s)
    assert [x.title for x in out] == ["a"]


def test_chunking_overlaps_and_covers_everything() -> None:
    many = [h.Seg(i, i * 3.0, i * 3.0 + 2, "palavra " * 60) for i in range(200)]
    chunks = h.chunk_segments(many)
    assert len(chunks) > 1
    assert chunks[0][-1].index >= chunks[1][0].index  # overlap
    assert chunks[-1][-1].index == 199
    assert all(sum(len(x.text) + 16 for x in c) <= h.CHUNK_CHARS for c in chunks)


def test_ai_candidates_ignore_hallucinated_lines() -> None:
    s = segs()
    sig = h.segment_signals(s, None)

    def ask(system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        assert "[3]" in user and "GTA RP" in system
        return {
            "moments": [
                {
                    "start_line": 3,
                    "end_line": 6,
                    "title": "Fuga da polícia",
                    "category": "perseguição",
                    "hook": "É a polícia!",
                    "reason": "Ação",
                    "score": 92,
                },
                {
                    "start_line": 500,
                    "end_line": 510,
                    "title": "x",
                    "category": "outro",
                    "hook": "",
                    "reason": "",
                    "score": 99,
                },
            ]
        }

    out = h.ai_candidates(s, sig, ask, 10, 60, lambda *_: None)
    assert len(out) == 1 and out[0].title == "Fuga da polícia"


def test_ollama_strips_reasoning(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body["think"] is False and body["options"]["seed"] == 42
        content = 'pensando...\n</think>\n{"moments": []}'
        return httpx.Response(200, json={"message": {"content": content}})

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        ollama, "_client", lambda base, timeout: httpx.Client(base_url=base, transport=transport)
    )
    assert ollama.chat_json("http://127.0.0.1:11434", "m", "s", "u", {}) == {"moments": []}


# ------------------------------------------------------------ subtitles


def test_whisper_sentence_split() -> None:
    seg = whisper.SegmentData(
        0, 6, "Cinquenta mil? Mano do céu, que absurdo.", None, None,
        [[0, 0.5, " Cinquenta", 1], [0.5, 1, " mil?", 1], [1.5, 2, " Mano", 1],
         [2, 2.5, " do", 1], [2.5, 3, " céu,", 1], [3, 3.5, " que", 1], [3.5, 4, " absurdo.", 1]],
    )  # fmt: skip
    parts = whisper.split_sentences(seg)
    assert [p.text for p in parts] == ["Cinquenta mil?", "Mano do céu, que absurdo."]
    assert parts[1].start == 1.5


def test_ass_karaoke_and_injection_safety() -> None:
    words = words_for_range(
        [(10.0, 12.0, "x", [[10.0, 10.5, " é", 1], [10.5, 11.0, " a", 1],
                             [11.0, 11.6, " polícia{\\b1}", 1]])],
        10.0, 12.0,
    )  # fmt: skip
    assert words[0].start == 0.0
    ass = build_ass(words, 2.0, title="Fuga {\\pos}", caption=CaptionStyle(font="Arial Black"))
    assert "Style: Sub,Arial Black" in ass
    assert "POLÍCIA" in ass and "{\\b1}" not in ass  # speech can't inject ASS tags
    assert "Fuga pos" in ass  # title braces/backslashes removed
    assert ass.count("Dialogue: 0,") == 3  # one event per highlighted word


def test_chunking_breaks_on_pause_and_punctuation() -> None:
    w = [Word(0, 0.3, "Corre,"), Word(0.3, 0.6, "corre"), Word(2.0, 2.3, "acelera")]
    assert [len(c) for c in chunk_words(w)] == [1, 1, 1]


# ------------------------------------------------------------- API + render


def seed_transcript(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> int:
    folders = configure_storage(client, tmp_path / "hd")
    make_video(folders["originals"] / "live.mp4", seconds=55, size="640x360")
    wait_job(client, post(client, "/api/imports/scan").json()["id"])
    rec_id: int = client.get("/api/recordings").json()["items"][0]["id"]

    def timed_words(a: float, b: float, text: str) -> list[list[Any]]:
        tokens = text.split()
        step = (b - a) / len(tokens)
        return [[a + i * step, a + (i + 1) * step, " " + w, 1] for i, w in enumerate(tokens)]

    def fake(audio: Path, root: Path, ai: Any) -> Any:
        rows = [whisper.SegmentData(a, b, t, None, None, timed_words(a, b, t)) for a, b, t in LINES]
        return whisper.TranscriptionInfo("pt", 1.0, 55.0), iter(rows)

    monkeypatch.setattr(whisper, "is_installed", lambda: True)
    monkeypatch.setattr(whisper, "is_downloaded", lambda root, name: True)
    monkeypatch.setattr(whisper, "transcribe", fake)
    job = wait_job(client, post(client, f"/api/recordings/{rec_id}/transcribe", {}).json()["id"])
    assert job["status"] == "succeeded", job
    return rec_id


@needs_ffmpeg
def test_analyze_requires_transcript(client: TestClient, tmp_path: Path) -> None:
    folders = configure_storage(client, tmp_path / "hd")
    make_video(folders["originals"] / "a.mp4")
    wait_job(client, post(client, "/api/imports/scan").json()["id"])
    rec = client.get("/api/recordings").json()["items"][0]
    resp = post(client, f"/api/recordings/{rec['id']}/analyze", {"mode": "heuristic"})
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "transcript_missing"


@needs_ffmpeg
def test_ai_mode_refused_when_ollama_offline(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ollama, "get_version", lambda base: None)
    rec_id = seed_transcript(client, tmp_path, monkeypatch)
    resp = post(client, f"/api/recordings/{rec_id}/analyze", {"mode": "ai"})
    assert resp.status_code == 409 and "análise rápida" in resp.json()["error"]["message"]
    assert client.get("/api/analysis/status").json()["ollama_running"] is False


@needs_ffmpeg
def test_heuristic_analysis_render_and_video(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    rec_id = seed_transcript(client, tmp_path, monkeypatch)
    settings = client.get("/api/settings").json()
    settings["ai"].update(clip_min_seconds=8, min_clip_score=20)
    settings["render"].update(subtitle_font="DejaVu Sans")
    assert client.put("/api/settings", json=settings, headers=CLIENT_HEADERS).status_code == 200

    job = wait_job(
        client,
        post(client, f"/api/recordings/{rec_id}/analyze", {"mode": "heuristic"}).json()["id"],
    )
    assert job["status"] == "succeeded", job
    clips = client.get("/api/clips").json()["items"]
    assert clips and all(c["source"] == "heuristic" and c["status"] == "draft" for c in clips)
    assert client.get(f"/api/recordings/{rec_id}").json()["status"] == "analyzed"
    best = clips[0]
    assert best["start_seconds"] <= 16.0 <= best["end_seconds"]  # the chase was found

    job = wait_job(
        client, post(client, f"/api/clips/{best['id']}/render").json()["id"], timeout=120
    )
    assert job["status"] == "succeeded", job
    clip = client.get(f"/api/clips/{best['id']}").json()
    assert clip["status"] == "pending_review" and clip["has_video"] is True

    out = Path(job["result"]["output"])
    probe = json.loads(
        subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height",
             "-of", "json", str(out)],
            capture_output=True, text=True, check=True,
        ).stdout
    )  # fmt: skip
    video = next(s for s in probe["streams"] if s["codec_type"] == "video")
    assert (video["width"], video["height"]) == (1080, 1920)
    assert any(s["codec_type"] == "audio" for s in probe["streams"])

    video_resp = client.get(f"/api/clips/{best['id']}/video", headers={"Range": "bytes=0-99"})
    assert video_resp.status_code == 206 and len(video_resp.content) == 100

    # Rendered clips can't be discarded as suggestions; drafts can.
    assert client.delete(f"/api/clips/{best['id']}", headers=CLIENT_HEADERS).status_code == 409
    if len(clips) > 1:
        assert (
            client.delete(f"/api/clips/{clips[1]['id']}", headers=CLIENT_HEADERS).status_code == 204
        )

    # Re-analysing keeps reviewed clips and does not suggest the same moment again.
    wait_job(
        client,
        post(client, f"/api/recordings/{rec_id}/analyze", {"mode": "heuristic"}).json()["id"],
    )
    again = client.get("/api/clips").json()["items"]
    assert sum(1 for c in again if c["id"] == best["id"]) == 1
    assert all(
        c["id"] == best["id"]
        or c["end_seconds"] <= best["start_seconds"]
        or c["start_seconds"] >= best["end_seconds"]
        for c in again
    )
    assert list((tmp_path / "hd" / "processing").iterdir()) == []


def test_video_endpoint_refuses_files_outside_clips_folder(
    client: TestClient, tmp_path: Path
) -> None:
    from app.db.models import Clip, ClipStatus, Recording
    from app.db.session import get_session_factory

    configure_storage(client, tmp_path / "hd")
    secret = tmp_path / "secret.mp4"
    secret.write_bytes(b"not for you")
    with get_session_factory()() as session:
        rec = Recording(title="r", file_path=str(tmp_path / "r.mp4"), file_size_bytes=1)
        session.add(rec)
        session.flush()
        session.add(
            Clip(recording_id=rec.id, title="c", start_seconds=0, end_seconds=1,
                 status=ClipStatus.PENDING_REVIEW, output_path=str(secret))
        )  # fmt: skip
        session.commit()
    assert client.get("/api/clips/1/video").status_code == 404
