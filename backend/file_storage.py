"""Unified file storage — local disk (default) or S3, app-signed download URLs."""
import asyncio
import hashlib
import hmac
import mimetypes
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from models import _gen_id, _utc_now_iso

ROOT_DIR = Path(__file__).parent
UPLOAD_DIR = ROOT_DIR / "uploads"
MAX_BYTES = 50 * 1024 * 1024
URL_TTL = int(os.environ.get("FILE_URL_TTL", "86400"))  # 24h
ALLOWED = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"},
    "video": {".mp4", ".webm", ".mov", ".m4v"},
    "document": {".pdf", ".doc", ".docx", ".txt", ".csv", ".xlsx", ".xls", ".ppt", ".pptx"},
}


def storage_backend() -> str:
    """local (default) or s3."""
    return os.environ.get("FILE_STORAGE", "local").strip().lower()


def _secret() -> bytes:
    return os.environ.get("JWT_SECRET", "dev-secret").encode()


def _api_base() -> str:
    return os.environ.get("PUBLIC_API_URL", "http://localhost:8085").rstrip("/")


def _safe_name(name: str) -> str:
    base = Path(name or "file").name
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", base)[:180] or "file"


def _kind_for(filename: str, content_type: str) -> str:
    ext = Path(filename or "").suffix.lower()
    for kind, exts in ALLOWED.items():
        if ext in exts:
            return kind
    if content_type.startswith("image/"):
        return "image"
    if content_type.startswith("video/"):
        return "video"
    return "document"


def _validate(filename: str, content_type: str, size: int) -> str:
    if size <= 0:
        raise HTTPException(400, "Empty file")
    if size > MAX_BYTES:
        raise HTTPException(400, f"File too large (max {MAX_BYTES // (1024 * 1024)}MB)")
    ext = Path(filename or "").suffix.lower()
    kind = _kind_for(filename, content_type or "")
    if ext and ext not in ALLOWED["image"] | ALLOWED["video"] | ALLOWED["document"]:
        if not content_type.startswith(("image/", "video/")) and kind == "document":
            allowed = sorted(ALLOWED["image"] | ALLOWED["video"] | ALLOWED["document"])
            raise HTTPException(400, f"File type not allowed. Allowed: {', '.join(allowed)}")
    return kind


def sign_file_access(file_id: str, key: str, exp: int) -> str:
    msg = f"{file_id}|{key}|{exp}".encode()
    return hmac.new(_secret(), msg, hashlib.sha256).hexdigest()


def verify_file_access(file_id: str, key: str, exp: int, sig: str) -> None:
    import time

    if exp < int(time.time()):
        raise HTTPException(403, "Link expired")
    expected = sign_file_access(file_id, key, exp)
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(403, "Invalid signature")


def build_access_url(attachment: Dict[str, Any], ttl: int = URL_TTL) -> str:
    import time

    file_id = attachment["id"]
    key = attachment["key"]
    exp = int(time.time()) + ttl
    sig = sign_file_access(file_id, key, exp)
    return (
        f"{_api_base()}/api/files/download"
        f"?id={quote(file_id)}&key={quote(key)}&exp={exp}&sig={sig}"
    )


def enrich_attachment(att: Dict[str, Any]) -> Dict[str, Any]:
    if not att or not att.get("id") or not att.get("key"):
        return att
    out = dict(att)
    out["url"] = build_access_url(out)
    return out


def enrich_attachments(items: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    return [enrich_attachment(a) for a in (items or [])]


def merge_attachments(existing: list, new_items: list) -> list:
    if not new_items:
        return existing or []
    seen = {a.get("id") for a in (existing or []) if a.get("id")}
    merged = list(existing or [])
    for item in new_items:
        if item.get("id") and item["id"] not in seen:
            merged.append(item)
            seen.add(item["id"])
    return merged


def _local_path(key: str) -> Path:
    path = (UPLOAD_DIR / key).resolve()
    if not str(path).startswith(str(UPLOAD_DIR.resolve())):
        raise HTTPException(400, "Invalid file key")
    return path


def _s3_client():
    region = os.environ.get("AWS_REGION", "us-east-1")
    key = os.environ.get("AWS_ACCESS_KEY_ID", "")
    secret = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
    if not key or not secret:
        raise HTTPException(503, "S3 not configured")
    return boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=key,
        aws_secret_access_key=secret,
    )


def _save_local(data: bytes, key: str) -> None:
    path = _local_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _upload_s3_sync(data: bytes, key: str, content_type: str) -> None:
    bucket = os.environ.get("AWS_BUCKET_NAME", "")
    if not bucket:
        raise HTTPException(503, "AWS_BUCKET_NAME not configured")
    client = _s3_client()
    try:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType=content_type or "application/octet-stream",
        )
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(502, f"S3 upload failed: {e}") from e


async def save_upload(
    file: UploadFile,
    tenant_id: str,
    uploaded_by: str,
    source: str = "upload",
) -> Dict[str, Any]:
    raw = await file.read()
    size = len(raw)
    filename = _safe_name(file.filename or "file")
    content_type = file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    kind = _validate(filename, content_type, size)

    file_id = _gen_id()
    backend = storage_backend()
    if backend == "s3":
        key = f"botaai/{tenant_id}/{kind}/{file_id}_{filename}"
        await asyncio.to_thread(_upload_s3_sync, raw, key, content_type)
    else:
        key = f"local/{tenant_id}/{kind}/{file_id}_{filename}"
        await asyncio.to_thread(_save_local, raw, key)

    attachment = {
        "id": file_id,
        "name": filename,
        "key": key,
        "kind": kind,
        "content_type": content_type,
        "size": size,
        "uploaded_by": uploaded_by,
        "uploaded_at": _utc_now_iso(),
        "source": source,
        "storage": backend,
    }
    attachment["url"] = build_access_url(attachment)
    return attachment


def _stream_s3(key: str):
    bucket = os.environ["AWS_BUCKET_NAME"]
    client = _s3_client()
    try:
        obj = client.get_object(Bucket=bucket, Key=key)
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(404, f"File not found: {e}") from e
    return obj["Body"], obj.get("ContentType") or "application/octet-stream"


def _inline_media(media: str) -> bool:
    if media.startswith(("image/", "video/", "text/")):
        return True
    return media in (
        "application/pdf",
        "application/json",
    )


async def serve_download(file_id: str, key: str, exp: int, sig: str):
    verify_file_access(file_id, key, exp, sig)

    if key.startswith("local/"):
        path = _local_path(key)
        if not path.is_file():
            raise HTTPException(404, "File not found")
        media = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        inline = _inline_media(media)
        return FileResponse(
            path,
            media_type=media,
            filename=path.name if not inline else None,
            content_disposition_type="inline" if inline else "attachment",
        )

    if key.startswith("botaai/"):
        body, media = await asyncio.to_thread(_stream_s3, key)
        inline = _inline_media(media)
        filename = Path(key).name
        headers = {}
        if inline:
            headers["Content-Disposition"] = "inline"
        else:
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'

        def iter_body():
            for chunk in body.iter_chunks(chunk_size=65536):
                yield chunk

        return StreamingResponse(iter_body(), media_type=media, headers=headers)

    raise HTTPException(404, "File not found")
