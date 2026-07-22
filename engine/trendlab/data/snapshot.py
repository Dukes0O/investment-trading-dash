from __future__ import annotations

import hashlib
import json
import os
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_snapshot(
    frame: pd.DataFrame,
    *,
    root: Path,
    provider: str,
    symbol: str,
    snapshot_date: date,
) -> Path:
    folder = root / provider / snapshot_date.isoformat()
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{symbol.upper()}.parquet"
    temp = path.with_suffix(".parquet.tmp")
    frame.to_parquet(temp, index=False)
    if path.exists():
        if _sha256(path) != _sha256(temp):
            temp.unlink(missing_ok=True)
            raise RuntimeError(f"immutable snapshot already exists with different content: {path}")
        temp.unlink(missing_ok=True)
    else:
        os.replace(temp, path)
    manifest_path = path.with_suffix(".manifest.json")
    manifest = {
        "schemaVersion": 1,
        "provider": provider,
        "symbol": symbol.upper(),
        "snapshotDate": snapshot_date.isoformat(),
        "rows": int(len(frame)),
        "from": str(frame["date"].min()),
        "to": str(frame["date"].max()),
        "sha256": _sha256(path),
        "recordedAt": datetime.now(timezone.utc).isoformat(),
    }
    if not manifest_path.exists():
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return path


def latest_snapshot(root: Path, provider: str, symbol: str) -> Path:
    matches = sorted((root / provider).glob(f"*/{symbol.upper()}.parquet"))
    if not matches:
        raise RuntimeError(f"no validated offline snapshot for {provider}/{symbol}")
    return matches[-1]
