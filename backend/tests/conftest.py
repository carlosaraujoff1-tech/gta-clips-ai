from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

CLIENT_HEADERS = {"X-GTA-Clips-Client": "web"}


@pytest.fixture()
def client(tmp_path: Path) -> Iterator[TestClient]:
    settings = Settings(
        data_dir=tmp_path / "data",
        allowed_hosts=["localhost", "127.0.0.1", "testserver"],
        log_json=True,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client
