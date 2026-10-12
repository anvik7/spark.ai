"""Unified Storage Abstraction for SparkDhi.

Supports:
- Local filesystem storage for development and local testing.
- S3-compatible cloud object storage / Cloudflare R2 for production.
- Deterministic, collision-resistant object key generation.
- Strict path traversal prevention.
- Safe secret sanitization (no credential leaks in logs/errors).
"""

from __future__ import annotations

import io
import mimetypes
import os
import re
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Generator, Optional, Union

from .config import get_settings


# --- Exceptions -------------------------------------------------------------

class StorageError(Exception):
    """Base exception for all storage operations."""
    pass


class StorageNotFoundError(StorageError):
    """Raised when the requested object is not found in storage."""
    pass


class StorageAuthError(StorageError):
    """Raised when authentication/authorization fails against storage backend."""
    pass


class StorageConfigError(StorageError):
    """Raised when storage configuration is invalid or missing required keys."""
    pass


class StoragePathTraversalError(StorageError):
    """Raised when an object key or path contains illegal traversal components."""
    pass


# --- Security & Key Sanitization -------------------------------------------

_TRAVERSAL_PATTERN = re.compile(r"(\.\./|\.\.\\|/\.\.|\\\.\.|^\.\.$|^\.\./|^\.\.\\)")


def sanitize_object_key(key: str) -> str:
    """Validate and normalize an object key, preventing path traversal.

    Rejects:
    - Empty keys
    - Keys containing '..' components
    - Keys starting with '/' or '\\'
    - Null bytes or control characters
    """
    if not key or not isinstance(key, str):
        raise StoragePathTraversalError("Object key cannot be empty.")

    clean = key.strip()
    if not clean:
        raise StoragePathTraversalError("Object key cannot be empty whitespace.")

    if "\x00" in clean or "\r" in clean or "\n" in clean:
        raise StoragePathTraversalError("Object key contains illegal control characters.")

    # Disallow absolute filesystem paths (Unix or Windows drive letters)
    if clean.startswith("/") or clean.startswith("\\"):
        raise StoragePathTraversalError("Object key cannot start with leading slash.")
    if len(clean) >= 2 and clean[1] == ":" and clean[0].isalpha():
        raise StoragePathTraversalError("Object key cannot be a Windows drive path.")

    # Normalize forward slashes
    normalized = clean.replace("\\", "/")

    # Check for path traversal elements
    parts = normalized.split("/")
    if any(p in ("..", ".") for p in parts):
        raise StoragePathTraversalError("Object key contains path traversal elements.")

    if _TRAVERSAL_PATTERN.search(normalized):
        raise StoragePathTraversalError("Object key contains path traversal patterns.")

    return normalized


def build_object_key(domain: str, user_id: Union[int, str], filename: str, identifier: Optional[str] = None) -> str:
    """Generate a deterministic, collision-resistant object key.

    Format: users/{user_id}/{domain}/{identifier}/{safe_filename}
    Example: users/42/tasks/a1b2c3d4e5f6/photo.png
    """
    clean_domain = re.sub(r"[^a-zA-Z0-9_\-]", "", str(domain).lower()) or "media"
    clean_uid = re.sub(r"[^a-zA-Z0-9_\-]", "", str(user_id)) or "public"
    unique_id = identifier or uuid.uuid4().hex[:12]

    # Extract base filename and extension safely
    raw_name = Path(filename or "file.bin").name
    stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", Path(raw_name).stem)[:40] or "file"
    ext = Path(raw_name).suffix.lower()
    safe_name = f"{stem}{ext}"

    key = f"users/{clean_uid}/{clean_domain}/{unique_id}/{safe_name}"
    return sanitize_object_key(key)


def guess_content_type(key_or_name: str, default: str = "application/octet-stream") -> str:
    """Guess MIME content type from filename/key extension with reliable fallbacks."""
    low = key_or_name.lower()
    if low.endswith(".png"):
        return "image/png"
    if low.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if low.endswith(".webp"):
        return "image/webp"
    if low.endswith(".gif"):
        return "image/gif"
    if low.endswith(".pdf"):
        return "application/pdf"
    if low.endswith(".docx"):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if low.endswith(".doc"):
        return "application/msword"
    if low.endswith(".webm"):
        return "audio/webm"
    if low.endswith(".wav"):
        return "audio/wav"
    if low.endswith(".mp3"):
        return "audio/mpeg"
    if low.endswith(".txt"):
        return "text/plain"
    if low.endswith(".json"):
        return "application/json"

    guessed, _ = mimetypes.guess_type(key_or_name)
    return guessed or default


# --- Storage Adapter Base Class --------------------------------------------

class StorageAdapter(ABC):
    """Abstract storage interface decoupled from underlying persistence mechanism."""

    @abstractmethod
    def put(self, object_key: str, data: bytes, content_type: Optional[str] = None) -> str:
        """Store bytes at the specified object key and return the object key."""
        pass

    @abstractmethod
    def get(self, object_key: str) -> Optional[bytes]:
        """Retrieve bytes for the specified object key. Return None if not found."""
        pass

    @abstractmethod
    def delete(self, object_key: str) -> bool:
        """Delete object at the specified object key. Return True if deleted or did not exist."""
        pass

    @abstractmethod
    def exists(self, object_key: str) -> bool:
        """Return True if object exists in storage, False otherwise."""
        pass

    @abstractmethod
    def get_content_type(self, object_key: str) -> Optional[str]:
        """Return MIME content type for the stored object, or None if not found."""
        pass

    @abstractmethod
    def get_size(self, object_key: str) -> Optional[int]:
        """Return byte size of the stored object, or None if not found."""
        pass

    @abstractmethod
    def generate_presigned_url(self, object_key: str, expires_in: int = 3600) -> Optional[str]:
        """Generate a secure, time-limited presigned URL for private access, or None if unsupported."""
        pass


def is_production_env() -> bool:
    """Return True if running in production or on Render."""
    env = (os.environ.get("ENVIRONMENT") or os.environ.get("ENV") or os.environ.get("SPARK_ENV") or "").strip().lower()
    return env in ("production", "prod") or bool(os.environ.get("RENDER"))


# --- Local Filesystem Storage Adapter ---------------------------------------

class LocalStorageAdapter(StorageAdapter):
    """Local filesystem adapter preserving development workflow and legacy directory access."""

    def __init__(self, base_dir: Optional[Path] = None, fallback_dirs: Optional[list[Path]] = None):
        is_prod = is_production_env()
        if base_dir:
            self.base_dir = Path(base_dir).resolve()
        else:
            settings = get_settings()
            if settings.storage_local_dir and settings.storage_local_dir.strip():
                self.base_dir = Path(settings.storage_local_dir.strip()).resolve()
            elif is_prod:
                raise StorageConfigError(
                    "FATAL: In production, STORAGE_LOCAL_DIR must be explicitly configured with a persistent storage mount path (e.g. /data/uploads). Ephemeral fallback to container storage is disallowed."
                )
            else:
                # Default to spark/uploads for local development
                self.base_dir = Path(__file__).resolve().parent.parent / "uploads"

        try:
            self.base_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            raise StorageConfigError(
                f"FATAL: Failed to access or create storage directory '{self.base_dir}': {e}"
            ) from None

        # Confirm the configured directory is writable before accepting operations
        test_file = self.base_dir / f".write_test_{uuid.uuid4().hex}"
        try:
            test_file.write_bytes(b"test")
            if test_file.exists():
                test_file.unlink()
        except Exception as e:
            raise StorageConfigError(
                f"FATAL: Production storage directory '{self.base_dir}' is not writable. Ensure the persistent volume is properly mounted with write permissions."
            ) from None

        if is_prod:
            # In production, do not silently search or fall back to ephemeral container directories
            self.fallback_dirs: list[Path] = fallback_dirs or [
                self.base_dir / "files",
                self.base_dir,
            ]
        else:
            # Fallback directories for backward-compatibility with legacy uploads in local dev
            app_root = Path(__file__).resolve().parent.parent
            self.fallback_dirs: list[Path] = fallback_dirs or [
                self.base_dir / "files",
                self.base_dir,
                app_root / "spark" / "storage_media",
                app_root / "storage_media",
            ]
        for fb in self.fallback_dirs:
            fb.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, object_key: str, must_exist: bool = False) -> Path:
        """Resolve an object key to a physical local Path, verifying containment."""
        safe_key = sanitize_object_key(object_key)
        target = (self.base_dir / safe_key).resolve()

        # Check directory traversal containment
        if not target.is_relative_to(self.base_dir):
            raise StoragePathTraversalError(f"Path traversal detected for key '{object_key}'")

        if must_exist and not target.is_file():
            # Check fallback legacy directories for legacy filenames (e.g. task_1_xyz.png)
            bare_name = Path(safe_key).name
            for fb in self.fallback_dirs:
                candidate = (fb / bare_name).resolve()
                if candidate.is_relative_to(fb.resolve()) and candidate.is_file():
                    return candidate

        return target

    def put(self, object_key: str, data: bytes, content_type: Optional[str] = None) -> str:
        safe_key = sanitize_object_key(object_key)
        target = self._resolve_path(safe_key, must_exist=False)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return safe_key

    def get(self, object_key: str) -> Optional[bytes]:
        try:
            target = self._resolve_path(object_key, must_exist=True)
            if target.is_file():
                return target.read_bytes()
            return None
        except StoragePathTraversalError:
            raise
        except Exception:
            return None

    def delete(self, object_key: str) -> bool:
        try:
            target = self._resolve_path(object_key, must_exist=True)
            if target.is_file():
                target.unlink(missing_ok=True)
                return True
            return True
        except StoragePathTraversalError:
            raise
        except Exception:
            return False

    def exists(self, object_key: str) -> bool:
        try:
            target = self._resolve_path(object_key, must_exist=True)
            return target.is_file()
        except StoragePathTraversalError:
            raise
        except Exception:
            return False

    def get_content_type(self, object_key: str) -> Optional[str]:
        if not self.exists(object_key):
            return None
        return guess_content_type(object_key)

    def get_size(self, object_key: str) -> Optional[int]:
        try:
            target = self._resolve_path(object_key, must_exist=True)
            if target.is_file():
                return target.stat().st_size
            return None
        except Exception:
            return None

    def generate_presigned_url(self, object_key: str, expires_in: int = 3600) -> Optional[str]:
        # Local storage does not use presigned S3 URLs; files are served through authenticated backend endpoints
        return None

    def get_local_path(self, object_key: str) -> Optional[Path]:
        """Return the physical Path if the file exists on the local filesystem."""
        try:
            target = self._resolve_path(object_key, must_exist=True)
            if target.is_file():
                return target
            return None
        except Exception:
            return None


# --- S3 / Cloudflare R2 Storage Adapter ------------------------------------

class S3StorageAdapter(StorageAdapter):
    """S3-compatible adapter for production Cloudflare R2 / AWS S3 storage."""

    def __init__(
        self,
        bucket_name: str,
        endpoint_url: Optional[str] = None,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        region_name: str = "auto",
        s3_client: Optional[Any] = None,
    ):
        if not bucket_name:
            raise StorageConfigError("S3/R2 storage requires a non-empty bucket name.")

        self.bucket_name = bucket_name
        self.endpoint_url = endpoint_url or None
        self.access_key_id = access_key_id or None
        self.secret_access_key = secret_access_key or None
        self.region_name = region_name or "auto"
        self._client = s3_client

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client

        try:
            import boto3
            from botocore.config import Config
        except ImportError:
            raise StorageConfigError("boto3 is required for S3/R2 storage backend.")

        if not self.access_key_id or not self.secret_access_key:
            raise StorageConfigError("S3/R2 credentials (access_key_id, secret_access_key) must be configured.")

        boto_config = Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
            connect_timeout=10,
            read_timeout=30,
        )

        client_kwargs: dict[str, Any] = {
            "service_name": "s3",
            "aws_access_key_id": self.access_key_id,
            "aws_secret_access_key": self.secret_access_key,
            "region_name": self.region_name,
            "config": boto_config,
        }
        if self.endpoint_url:
            client_kwargs["endpoint_url"] = self.endpoint_url

        self._client = boto3.client(**client_kwargs)
        return self._client

    def put(self, object_key: str, data: bytes, content_type: Optional[str] = None) -> str:
        safe_key = sanitize_object_key(object_key)
        client = self._get_client()
        ct = content_type or guess_content_type(safe_key)

        try:
            client.put_object(
                Bucket=self.bucket_name,
                Key=safe_key,
                Body=data,
                ContentType=ct,
            )
            return safe_key
        except Exception as e:
            # Sanitize log/exception to prevent credential leakage
            err_msg = str(e).replace(self.secret_access_key or "", "[REDACTED]")
            if self.access_key_id:
                err_msg = err_msg.replace(self.access_key_id, "[REDACTED]")
            raise StorageError(f"Failed to put object to S3/R2: {err_msg}") from None

    def get(self, object_key: str) -> Optional[bytes]:
        safe_key = sanitize_object_key(object_key)
        client = self._get_client()

        try:
            res = client.get_object(Bucket=self.bucket_name, Key=safe_key)
            return res["Body"].read()
        except Exception as e:
            err_type = type(e).__name__
            err_str = str(e)
            if "NoSuchKey" in err_str or "404" in err_str or "NotFound" in err_type:
                return None
            err_msg = err_str.replace(self.secret_access_key or "", "[REDACTED]")
            if self.access_key_id:
                err_msg = err_msg.replace(self.access_key_id, "[REDACTED]")
            raise StorageError(f"Failed to get object from S3/R2: {err_msg}") from None

    def delete(self, object_key: str) -> bool:
        safe_key = sanitize_object_key(object_key)
        client = self._get_client()

        try:
            client.delete_object(Bucket=self.bucket_name, Key=safe_key)
            return True
        except Exception as e:
            err_str = str(e)
            if "NoSuchKey" in err_str or "404" in err_str:
                return True
            err_msg = err_str.replace(self.secret_access_key or "", "[REDACTED]")
            if self.access_key_id:
                err_msg = err_msg.replace(self.access_key_id, "[REDACTED]")
            raise StorageError(f"Failed to delete object from S3/R2: {err_msg}") from None

    def exists(self, object_key: str) -> bool:
        safe_key = sanitize_object_key(object_key)
        client = self._get_client()

        try:
            client.head_object(Bucket=self.bucket_name, Key=safe_key)
            return True
        except Exception as e:
            err_str = str(e)
            err_type = type(e).__name__
            if "NoSuchKey" in err_str or "404" in err_str or "NotFound" in err_type or "ClientError" in err_type:
                return False
            return False

    def get_content_type(self, object_key: str) -> Optional[str]:
        safe_key = sanitize_object_key(object_key)
        client = self._get_client()

        try:
            head = client.head_object(Bucket=self.bucket_name, Key=safe_key)
            return head.get("ContentType") or guess_content_type(safe_key)
        except Exception:
            return None

    def get_size(self, object_key: str) -> Optional[int]:
        safe_key = sanitize_object_key(object_key)
        client = self._get_client()

        try:
            head = client.head_object(Bucket=self.bucket_name, Key=safe_key)
            return head.get("ContentLength")
        except Exception:
            return None

    def generate_presigned_url(self, object_key: str, expires_in: int = 3600) -> Optional[str]:
        safe_key = sanitize_object_key(object_key)
        client = self._get_client()

        try:
            url = client.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": self.bucket_name, "Key": safe_key},
                ExpiresIn=expires_in,
            )
            return url
        except Exception as e:
            err_msg = str(e).replace(self.secret_access_key or "", "[REDACTED]")
            if self.access_key_id:
                err_msg = err_msg.replace(self.access_key_id, "[REDACTED]")
            raise StorageError(f"Failed to generate presigned URL: {err_msg}") from None


# --- Factory & Singleton ---------------------------------------------------

_storage_instance: Optional[StorageAdapter] = None


def get_storage() -> StorageAdapter:
    """Retrieve or initialize the active storage adapter singleton."""
    global _storage_instance
    if _storage_instance is not None:
        return _storage_instance

    settings = get_settings()
    backend = getattr(settings, "storage_backend", "local").lower().strip()

    if backend in ("s3", "r2", "cloudflare_r2"):
        bucket = getattr(settings, "s3_bucket", "")
        if not bucket:
            if is_production_env():
                raise StorageConfigError(
                    "FATAL: In production, S3_BUCKET must be configured when STORAGE_BACKEND is set to S3/R2."
                )
            # Fallback gracefully to local storage if bucket name is missing in local dev
            _storage_instance = LocalStorageAdapter()
            return _storage_instance

        _storage_instance = S3StorageAdapter(
            bucket_name=bucket,
            endpoint_url=getattr(settings, "s3_endpoint_url", "") or None,
            access_key_id=getattr(settings, "s3_access_key_id", "") or None,
            secret_access_key=getattr(settings, "s3_secret_access_key", "") or None,
            region_name=getattr(settings, "s3_region", "auto") or "auto",
        )
        return _storage_instance

    _storage_instance = LocalStorageAdapter()
    return _storage_instance


def set_storage(adapter: Optional[StorageAdapter]) -> None:
    """Explicitly override storage adapter (used in tests)."""
    global _storage_instance
    _storage_instance = adapter


def reset_storage() -> None:
    """Reset storage singleton instance."""
    global _storage_instance
    _storage_instance = None
