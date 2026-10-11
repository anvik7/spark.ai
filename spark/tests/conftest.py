"""Pytest configuration and test isolation fixtures for SparkDhi backend test suite.

Ensures that automated tests run in isolated, deterministic local environments
without mutating or requiring live cloud object storage (Backblaze B2 / Cloudflare R2).
"""

import os
import sys
from pathlib import Path
import pytest

# Ensure spark package is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Ensure automated test suite runs with isolated local test storage by default.
# Genuine live cloud storage integration tests require explicit opt-in via RUN_LIVE_CLOUD_STORAGE_TESTS=1.
if os.environ.get("RUN_LIVE_CLOUD_STORAGE_TESTS") != "1":
    os.environ["STORAGE_BACKEND"] = "local"

from spark.config import get_settings
from spark.storage import reset_storage

# Ensure deterministic local SQLite database for test session
_test_db_file = Path(__file__).resolve().parent / "test_suite_tmp.db"
if _test_db_file.exists():
    try:
        _test_db_file.unlink()
    except Exception:
        pass

os.environ["DATABASE_URL"] = f"sqlite:///{_test_db_file}"

# Clear settings cache so STORAGE_BACKEND=local and DATABASE_URL are active
get_settings.cache_clear()
reset_storage()

from spark.models import init_db
init_db()


@pytest.fixture(autouse=True)
def isolate_test_storage_environment(monkeypatch):
    """Enforce local storage backend isolation across all test executions."""
    if os.environ.get("RUN_LIVE_CLOUD_STORAGE_TESTS") != "1":
        monkeypatch.setenv("STORAGE_BACKEND", "local")
    get_settings.cache_clear()
    yield
    reset_storage()
