from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

import yaml


ENGINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ENGINE_ROOT.parent
CONFIG_ROOT = ENGINE_ROOT / "config"


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"required configuration is missing: {path}") from exc
    if not isinstance(value, dict):
        raise RuntimeError(f"configuration must be a mapping: {path}")
    return value


def load_configs(config_root: Path = CONFIG_ROOT) -> dict[str, dict[str, Any]]:
    return {
        "assets": load_yaml(config_root / "assets.yaml"),
        "research": load_yaml(config_root / "research.yaml"),
        "risk": load_yaml(config_root / "risk.yaml"),
    }


def config_hash(configs: dict[str, Any]) -> str:
    encoded = json.dumps(
        configs, sort_keys=True, separators=(",", ":"), default=_json_default,
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def _json_default(value: Any) -> str:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")
