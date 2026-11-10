"""Phase 5: vertical edit (layouts, jump cuts, captions) and the clip editor API."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.schemas.settings import Region, RenderSettings, ToolSettings
from app.services import jumpcuts, whisper
from app.services.render import RenderJob, build_graph, render
from app.services.subtitles import Word
from tests.conftest import CLIENT_HEADERS
from tests.test_imports import configure_storage, needs_ffmpeg, post, wait_job

# ------------------------------------------------------------------- helpers


def probe(path: Path) -> dict[str, Any]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "stream=codec_type,width,height:format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout  # fmt: skip
    data: dict[str, Any] = json.loads(out)
    return data


def make_gapped_video(path: Path, size: str = "640x360") -> Path:
    """6 s video: tone 0-2 s, silence 2-4 s, tone 4-6 s."""
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y",
         "-f", "lavfi", "-i", f"testsrc2=duration=6:size={size}:rate=30",
         "-f", "lavfi", "-i", "sine=frequency=300:duration=6",
         "-af", "volume='if(between(t,2,4),0,1)':eval=frame",
         "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", str(path)],
        check=True,
    )  # fmt: skip
    return path


WORDS = [Word(0.2, 0.8, "corre"), Word(0.9, 1.7, "polícia"), Word(4.2, 5.0, "perdeu"),
         Word(5.1, 5.8, "mano")]  # fmt: skip


# ------------------------------------------------------------- jump cuts


def test_quiet_pause_is_cut() -> None:
    loud = [-20.0] * 20 + [-90.0] * 20 + [-20.0] * 20  # 6 s, silent 2-4 s
    keeps = jumpcuts.keep_intervals(WORDS, loud, 6.0)
    assert len(keeps) == 2
    removed = 6.0 - jumpcuts.kept_duration(keeps)
    assert 1.4 < removed < 2.4
    words = jumpcuts.remap_words(WORDS, keeps)
    assert words[2].start < 3.0  # "perdeu" moved earlier


def test_pause_with_game_sound_is_kept() -> None:
    loud = [-20.0] * 60  # siren / gunshots during the pause: no words but loud
    assert jumpcuts.keep_intervals(WORDS, loud, 6.0) == [(0.0, 6.0)]


def test_short_breath_is_kept() -> None:
    words = [Word(0.2, 1.0, "a"), Word(1.3, 2.0, "b")]
    loud = [-20.0] * 10 + [-90.0] * 3 + [-20.0] * 7
    assert jumpcuts.keep_intervals(words, loud, 2.0) == [(0.0, 2.0)]


def test_remap_time() -> None:
    keeps = [(0.0, 2.0), (4.0, 6.0)]
    assert jumpcuts.remap_time(1.0, keeps) == 1.0
    assert jumpcuts.remap_time(3.0, keeps) is None
    assert jumpcuts.remap_time(5.0, keeps) == 3.0


# ---------------------------------------------------------- filter graph


def test_graph_variants(tmp_path: Path) -> None:
    base = dict(source=tmp_path / "s.mp4", start=0, end=6, source_fps=30, has_audio=True,
                subtitles_file=tmp_path / "s.ass", output=tmp_path / "o.mp4",
                source_width=1920, source_height=1080)  # fmt: skip
    graph, _ = build_graph(RenderJob(**base, layout="crop", focus_x=0.0), RenderSettings())
    assert "'(iw-ow)*0.000'" in graph and "force_original_aspect_ratio=increase" in graph
    graph, _ = build_graph(
        RenderJob(**base, layout="facecam", facecam=Region(x=0.7, y=0.05, w=0.25, h=0.3)),
        RenderSettings(),
    )
    assert "vstack" in graph and "iw*0.7000" in graph
    graph, _ = build_graph(
        RenderJob(**base, keeps=[(0, 2), (4, 6)], zoom=True), RenderSettings(voice_boost=True)
    )
    assert "concat=n=2:v=1:a=1" in graph and "acompressor" in graph
    assert graph.count("crop=trunc(iw/1.08") == 1  # punch-in on every other piece


def test_facecam_without_region_is_explained(tmp_path: Path) -> None:
    from app.services.render import RenderError

    job = RenderJob(tmp_path / "s.mp4", 0, 5, 30, True, tmp_path / "s.ass", tmp_path / "o.mp4",
                    layout="facecam")  # fmt: skip
    with pytest.raises(RenderError, match="câmera"):
        build_graph(job, RenderSettings())


@needs_ffmpeg
@pytest.mark.parametrize(
    ("layout", "size", "keeps"),
    [
        ("blur", "640x360", ()),
        ("crop", "640x360", ((0.0, 2.0), (4.0, 6.0))),
        ("facecam", "640x360", ()),
        ("blur", "360x640", ((0.0, 2.0), (4.0, 6.0))),  # already-vertical source
    ],
)
def test_render_outputs_vertical_video(
    tmp_path: Path, layout: str, size: str, keeps: tuple[tuple[float, float], ...]
) -> None:
    source = make_gapped_video(tmp_path / "src.mp4", size)
    w, h = (int(x) for x in size.split("x"))
    ass = tmp_path / "s.ass"
    ass.write_text("[Script Info]\nScriptType: v4.00+\n", encoding="utf-8")
    job = RenderJob(
        source=source, start=0, end=6, source_fps=30, has_audio=True, subtitles_file=ass,
        output=tmp_path / "out.mp4", layout=layout,  # type: ignore[arg-type]
        facecam=Region(x=0.6, y=0.0, w=0.4, h=0.4), source_width=w, source_height=h,
        keeps=keeps,
    )  # fmt: skip
    render(job, RenderSettings(), ToolSettings(), lambda _f: None)
    info = probe(job.output)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert (video["width"], video["height"]) == (1080, 1920)
    expected = 4.0 if keeps else 6.0
    assert abs(float(info["format"]["duration"]) - expected) < 0.35


# ------------------------------------------------------------------ API


def seed_clip(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> int:
    folders = configure_storage(client, tmp_path / "hd")
    make_gapped_video(folders["originals"] / "live.mp4")
    wait_job(client, post(client, "/api/imports/scan").json()["id"])
    rec_id: int = client.get("/api/recordings").json()["items"][0]["id"]

    def fake(audio: Path, root: Path, ai: Any) -> Any:
        rows = [
            whisper.SegmentData(0.2, 1.7, "Corre polícia!", None, None,
                                [[0.2, 0.8, " Corre", 1], [0.9, 1.7, " polícia!", 1]]),
            whisper.SegmentData(4.2, 5.8, "Perdeu mano!", None, None,
                                [[4.2, 5.0, " Perdeu", 1], [5.1, 5.8, " mano!", 1]]),
        ]  # fmt: skip
        return whisper.TranscriptionInfo("pt", 1.0, 6.0), iter(rows)

    monkeypatch.setattr(whisper, "is_installed", lambda: True)
    monkeypatch.setattr(whisper, "is_downloaded", lambda root, name: True)
    monkeypatch.setattr(whisper, "transcribe", fake)
    wait_job(client, post(client, f"/api/recordings/{rec_id}/transcribe", {}).json()["id"])

    from app.db.models import Clip, ClipStatus
    from app.db.session import get_session_factory

    with get_session_factory()() as session:
        clip = Clip(recording_id=rec_id, title="Fuga da polícia", start_seconds=0,
                    end_seconds=6, status=ClipStatus.DRAFT)  # fmt: skip
        session.add(clip)
        session.commit()
        return clip.id


@needs_ffmpeg
def test_clip_editor_flow(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    clip_id = seed_clip(client, tmp_path, monkeypatch)

    # Validation
    bad = client.patch(f"/api/clips/{clip_id}", json={"end_seconds": 60}, headers=CLIENT_HEADERS)
    assert bad.status_code == 422 and "duração da gravação" in bad.json()["error"]["message"]
    short = client.patch(
        f"/api/clips/{clip_id}", json={"start_seconds": 2, "end_seconds": 3}, headers=CLIENT_HEADERS
    )
    assert short.status_code == 422
    assert (
        client.patch(
            f"/api/clips/{clip_id}", json={"edit": {"focus_x": 2}}, headers=CLIENT_HEADERS
        ).status_code
        == 422
    )

    ok = client.patch(
        f"/api/clips/{clip_id}",
        json={"title": "Fugiu da polícia e se deu mal",
              "edit": {"layout": "crop", "focus_x": 0.3, "jump_cuts": True}},
        headers=CLIENT_HEADERS,
    )  # fmt: skip
    assert ok.status_code == 200 and ok.json()["edit"]["layout"] == "crop"

    # Frame preview for the editor
    frame = client.get("/api/recordings/1/frame", params={"t": 1.5, "width": 320})
    assert frame.status_code == 200 and frame.content[:2] == b"\xff\xd8"  # JPEG

    # Render: jump cuts remove the 2 s quiet pause; a thumbnail is created
    job = wait_job(client, post(client, f"/api/clips/{clip_id}/render").json()["id"], timeout=120)
    assert job["status"] == "succeeded", job
    assert job["result"]["cuts"] == 1 and job["result"]["removed_seconds"] > 1.2
    clip = client.get(f"/api/clips/{clip_id}").json()
    assert clip["has_thumbnail"] and clip["render_outdated"] is False
    thumb = client.get(f"/api/clips/{clip_id}/thumbnail")
    assert thumb.status_code == 200 and thumb.headers["content-type"] == "image/jpeg"

    # Editing after rendering flags the video as outdated
    client.patch(f"/api/clips/{clip_id}", json={"edit": {"layout": "blur"}}, headers=CLIENT_HEADERS)
    assert client.get(f"/api/clips/{clip_id}").json()["render_outdated"] is True

    assert list((tmp_path / "hd" / "processing").iterdir()) == []


def test_settings_reject_region_outside_frame(client: TestClient) -> None:
    body = client.get("/api/settings").json()
    body["render"]["facecam"] = {"x": 0.8, "y": 0.0, "w": 0.5, "h": 0.3}
    resp = client.put("/api/settings", json=body, headers=CLIENT_HEADERS)
    assert resp.status_code == 422
