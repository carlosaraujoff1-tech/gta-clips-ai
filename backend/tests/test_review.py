"""Phase 6: approval workflow. Nothing can be approved unless it is a finished, current video."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.conftest import CLIENT_HEADERS
from tests.test_imports import needs_ffmpeg, post, wait_job
from tests.test_render import seed_clip


def render(client: TestClient, clip_id: int) -> None:
    job = wait_job(client, post(client, f"/api/clips/{clip_id}/render").json()["id"], timeout=120)
    assert job["status"] == "succeeded", job


def action(client: TestClient, clip_id: int, name: str, body: dict[str, object] | None = None):  # type: ignore[no-untyped-def]
    return client.post(f"/api/clips/{clip_id}/{name}", json=body, headers=CLIENT_HEADERS)


@needs_ffmpeg
def test_review_flow(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    clip_id = seed_clip(client, tmp_path, monkeypatch)

    # A suggestion without a video can't be approved.
    resp = action(client, clip_id, "approve")
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "invalid_clip_state"

    render(client, clip_id)
    assert client.get("/api/clips/counts").json()["pending_review"] == 1

    # Title and description are editable during review.
    patched = client.patch(
        f"/api/clips/{clip_id}",
        json={"title": "Fuga insana", "description": "Descrição para a postagem #gtarp"},
        headers=CLIENT_HEADERS,
    )
    assert patched.status_code == 200 and patched.json()["description"].endswith("#gtarp")
    # The description doesn't change the video, so the render is still current.
    assert patched.json()["render_outdated"] is True  # but the title is on the video!
    render(client, clip_id)

    approved = action(client, clip_id, "approve")
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["status"] == "approved" and body["reviewed_at"] is not None

    # Approved clips are locked until the approval is undone.
    assert (
        client.patch(
            f"/api/clips/{clip_id}", json={"title": "x"}, headers=CLIENT_HEADERS
        ).status_code
        == 409
    )
    assert post(client, f"/api/clips/{clip_id}/render").status_code == 409
    assert action(client, clip_id, "reject").status_code == 409

    reopened = action(client, clip_id, "reopen").json()
    assert reopened["status"] == "pending_review" and reopened["reviewed_at"] is None

    rejected = action(client, clip_id, "reject", {"reason": "Áudio baixo demais"})
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["reject_reason"] == "Áudio baixo demais"
    assert action(client, clip_id, "reject").status_code == 409  # already rejected
    assert action(client, clip_id, "approve").status_code == 409  # must reopen first

    again = action(client, clip_id, "reopen").json()
    assert again["status"] == "pending_review" and again["reject_reason"] is None
    counts = client.get("/api/clips/counts").json()
    assert counts["pending_review"] == 1 and counts["approved"] == 0 and counts["rejected"] == 0


@needs_ffmpeg
def test_cannot_approve_outdated_or_missing_video(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    clip_id = seed_clip(client, tmp_path, monkeypatch)
    render(client, clip_id)

    client.patch(f"/api/clips/{clip_id}", json={"title": "Novo título"}, headers=CLIENT_HEADERS)
    resp = action(client, clip_id, "approve")
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "render_outdated"

    render(client, clip_id)
    video = next((tmp_path / "hd" / "clips").glob("*.mp4"))
    video.unlink()
    resp = action(client, clip_id, "approve")
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "video_missing"
    assert client.get(f"/api/clips/{clip_id}").json()["status"] == "pending_review"


@needs_ffmpeg
def test_manual_clip_and_draft_rejection(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    seed_clip(client, tmp_path, monkeypatch)
    url = "/api/recordings/1/clips"
    bad_end = client.post(
        url, json={"title": "x", "start_seconds": 0, "end_seconds": 999}, headers=CLIENT_HEADERS
    )
    assert bad_end.status_code == 422
    too_short = client.post(
        url, json={"title": "x", "start_seconds": 1, "end_seconds": 2}, headers=CLIENT_HEADERS
    )
    assert too_short.status_code == 422
    assert (
        client.post(
            url, json={"title": "", "start_seconds": 0, "end_seconds": 5}, headers=CLIENT_HEADERS
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/recordings/999/clips",
            json={"title": "x", "start_seconds": 0, "end_seconds": 5},
            headers=CLIENT_HEADERS,
        ).status_code
        == 404
    )

    created = client.post(
        url,
        json={"title": "Meu corte", "start_seconds": 1, "end_seconds": 5},
        headers=CLIENT_HEADERS,
    )
    assert created.status_code == 201
    clip = created.json()
    assert clip["source"] == "manual" and clip["status"] == "draft"

    rejected = action(client, clip["id"], "reject", {"reason": "  "})
    assert rejected.json()["status"] == "rejected" and rejected.json()["reject_reason"] is None
    # A rejected draft without a video reopens as a draft, not as 'pending review'.
    assert action(client, clip["id"], "reopen").json()["status"] == "draft"


def test_counts_route_is_not_shadowed(client: TestClient) -> None:
    assert client.get("/api/clips/counts").status_code == 200
    assert client.get("/api/clips/999").status_code == 404
