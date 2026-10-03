# SparkDhi Storage Configuration Guide

## Architecture Overview

SparkDhi uses a unified storage abstraction layer (`spark.storage.StorageAdapter`) that decouples application business logic from underlying file storage.

- **Development**: Local filesystem adapter (`LocalStorageAdapter`) writing to `spark/uploads/` with transparent fallback for legacy media directories.
- **Production**: S3-compatible cloud object storage adapter (`S3StorageAdapter`) targeting Cloudflare R2 or AWS S3 as the multi-worker shared source of truth.

---

## 1. Local Development Configuration

Local development works out-of-the-box with zero mandatory environment variables.

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `STORAGE_BACKEND` | No | `local` | Set to `local` (or leave empty) for filesystem storage. |
| `STORAGE_LOCAL_DIR` | No | `spark/uploads` | Optional override path for storing local upload artifacts. |

### How Uploads Work in Development
1. Files are uploaded via API routes (`/api/tasks/upload-solve`, `/api/captures/file`, etc.).
2. The server generates a deterministic, collision-resistant object key:
   `users/{user_id}/{domain}/{uuid}/{filename}` (e.g. `users/42/tasks/a1b2c3d4/problem.png`).
3. The adapter stores the bytes at `spark/uploads/{object_key}`.
4. Legacy uploads and tests that write directly to `spark/uploads/files/` or `spark/storage_media/` remain fully accessible via backward-compatible fallback resolution.
5. Files are served to authorized users through authenticated backend endpoints (`/api/uploads/{filename}` and `/api/circles/media/{filename}`).

---

## 2. Cloudflare R2 / S3 Production Configuration

Production deployments must use S3-compatible object storage (e.g., Cloudflare R2) so multiple API workers share an identical state without 404 synchronization errors.

### Environment Variables

```bash
# Storage Backend Selection
STORAGE_BACKEND=s3

# Cloudflare R2 S3-Compatible Endpoint (replace <account_id> with your Cloudflare Account ID)
S3_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com

# R2 API Token Credentials (generated in Cloudflare Dashboard)
S3_ACCESS_KEY_ID=<your_r2_access_key_id>
S3_SECRET_ACCESS_KEY=<your_r2_secret_access_key>

# Target Bucket Name
S3_BUCKET=spark-media-prod

# Region ("auto" for Cloudflare R2, or e.g. "us-east-1" for AWS S3)
S3_REGION=auto
```

*(Note: The adapter also recognizes aliases like `R2_ACCESS_KEY_ID`, `AWS_ACCESS_KEY_ID`, etc.)*

### Cloudflare R2 Bucket Setup Instructions

1. **Log in to Cloudflare Dashboard**:
   Navigate to **R2 Storage** > **Create bucket**.
2. **Name the Bucket**:
   Use a unique name, e.g. `spark-media-prod`.
3. **Private Bucket Requirement (CRITICAL)**:
   - **Do NOT enable Public Access** or connect a public Custom Domain directly to this bucket.
   - User files (exam papers, problem photos, voice notes, resumes) must remain private.
   - SparkDhi serves objects exclusively through authenticated backend endpoints after validating user identity and ownership permissions.
4. **Generate API Token**:
   - In R2, navigate to **Manage R2 API Tokens** > **Create API Token**.
   - Permissions: **Object Read & Write**.
   - Specify your bucket or allow all buckets.
   - Note down the `Access Key ID` and `Secret Access Key`.
5. **Endpoint URL**:
   Your endpoint is `https://<account_id>.r2.cloudflarestorage.com`.

---

## 3. Security & Access Control Model

1. **Path Traversal Protection**:
   All incoming keys are strictly validated and normalized by `sanitize_object_key()`. Slashes, `..` patterns, drive letters, and null bytes are rejected.
2. **Secret Redaction**:
   All S3 and storage exception handlers redact access keys and secret keys before logging or throwing errors (`[REDACTED]`).
3. **Strict Authorization**:
   - `/api/uploads/{filename}` requires an authenticated user token and verifies ownership against `StudentTask` or `Card` in the database.
   - Founders/admins have supervisory read access.
   - Unauthenticated or unauthorized requests receive `401 Unauthorized` or `403 Forbidden`.
4. **Time-Limited Presigned URLs**:
   The S3 adapter supports `generate_presigned_url(object_key, expires_in=3600)` for generating secure, time-limited private download URLs without exposing storage credentials.
