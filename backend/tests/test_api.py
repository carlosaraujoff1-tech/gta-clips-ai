from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import CLIENT_HEADERS


def _settings_payload(root: Path) -> dict[str, Any]:
    return {
        "storage": {
            "originals": str(root / "originals"),
            "processing": str(root / "processing"),
            "clips": str(root / "clips"),
            "exports": str(root / "exports"),
        },
        "tools": {"ffmpeg_path": None, "ffprobe_path": None},
        "ai": {
            "ollama_base_url": "http://127.0.0.1:11434",
            "ollama_model": "qwen3:4b",
            "whisper_model": "small",
        },
    }


def test_health(client: TestClient) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert "X-Request-ID" in resp.headers


def test_dashboard_starts_empty(client: TestClient) -> None:
    body = client.get("/api/dashboard/summary").json()
    assert body["counts"] == {
        "recordings": 0,
        "clips": 0,
        "pending_review": 0,
        "approved": 0,
        "publications": 0,
    }
    assert body["storage"]["configured_folders"] == 0
    assert body["recent_recordings"] == []


def test_default_settings_have_no_storage(client: TestClient) -> None:
    body = client.get("/api/settings").json()
    assert all(v is None for v in body["storage"].values())
    assert body["ai"]["ollama_model"] == "qwen3:4b"


def test_save_settings_and_create_folders(client: TestClient, tmp_path: Path) -> None:
    root = tmp_path / "external"
    resp = client.put("/api/settings", json=_settings_payload(root), headers=CLIENT_HEADERS)
    assert resp.status_code == 200, resp.text

    status = client.get("/api/settings/storage/status").json()
    assert status["all_ready"] is False
    assert all(not f["exists"] for f in status["folders"])

    created = client.post("/api/settings/storage/create-folders", headers=CLIENT_HEADERS).json()
    assert created["all_ready"] is True
    assert (root / "clips").is_dir()

    summary = client.get("/api/dashboard/summary").json()
    assert summary["storage"]["ready_folders"] == 4
    assert summary["storage"]["clips_free_bytes"] > 0


def test_mutation_without_client_header_is_rejected(client: TestClient, tmp_path: Path) -> None:
    resp = client.put("/api/settings", json=_settings_payload(tmp_path))
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "client_not_allowed"


def test_non_json_body_is_rejected(client: TestClient) -> None:
    resp = client.put(
        "/api/settings",
        content="storage=x",
        headers={**CLIENT_HEADERS, "Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 415


def test_unknown_host_header_is_rejected(client: TestClient) -> None:
    resp = client.get("/api/health", headers={"Host": "evil.example.com"})
    assert resp.status_code == 400


def test_relative_path_is_rejected(client: TestClient, tmp_path: Path) -> None:
    payload = _settings_payload(tmp_path)
    payload["storage"]["clips"] = "clips"
    resp = client.put("/api/settings", json=payload, headers=CLIENT_HEADERS)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


def test_nested_folders_are_rejected(client: TestClient, tmp_path: Path) -> None:
    payload = _settings_payload(tmp_path)
    payload["storage"]["clips"] = str(tmp_path / "originals" / "clips")
    assert client.put("/api/settings", json=payload, headers=CLIENT_HEADERS).status_code == 422


def test_arbitrary_executable_is_rejected(client: TestClient, tmp_path: Path) -> None:
    payload = _settings_payload(tmp_path)
    payload["tools"]["ffmpeg_path"] = str(tmp_path / "malware.exe")
    assert client.put("/api/settings", json=payload, headers=CLIENT_HEADERS).status_code == 422


def test_remote_ollama_is_rejected(client: TestClient, tmp_path: Path) -> None:
    payload = _settings_payload(tmp_path)
    payload["ai"]["ollama_base_url"] = "http://192.168.0.10:11434"
    assert client.put("/api/settings", json=payload, headers=CLIENT_HEADERS).status_code == 422


def test_unknown_fields_are_rejected(client: TestClient, tmp_path: Path) -> None:
    payload = _settings_payload(tmp_path)
    payload["command"] = "rm -rf /"
    assert client.put("/api/settings", json=payload, headers=CLIENT_HEADERS).status_code == 422


def test_missing_drive_is_reported(client: TestClient) -> None:
    from app.services.storage import folder_status

    status = folder_status("clips", "/nonexistent-drive-xyz/clips")
    assert status.configured is True
    assert status.exists is False


def test_system_status_lists_services(client: TestClient) -> None:
    body = client.get("/api/system/status?refresh=true").json()
    keys = {s["key"] for s in body["services"]}
    assert {"backend", "database", "ffmpeg", "ollama", "faster_whisper"} <= keys
    assert body["host"]["python_version"].startswith("3.11")


def test_library_lists_are_paginated(client: TestClient) -> None:
    for path in ("/api/recordings", "/api/clips", "/api/publications"):
        body = client.get(path, params={"limit": 10}).json()
        assert body == {"items": [], "total": 0, "limit": 10, "offset": 0}
    assert client.get("/api/clips", params={"limit": 999}).status_code == 422
    assert client.get("/api/clips", params={"status": "pending_review"}).status_code == 200
