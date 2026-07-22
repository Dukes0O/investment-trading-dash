from datetime import date

from trendlab.registry import append_jsonl, write_manifest


def test_registry_serializes_typed_dates_as_iso(tmp_path):
    manifest = tmp_path / "manifest.json"
    registry = tmp_path / "registry.jsonl"
    payload = {"fold": {"test_start": date(2025, 1, 2)}}
    write_manifest(manifest, payload)
    append_jsonl(registry, payload)
    assert '"2025-01-02"' in manifest.read_text()
    assert '"2025-01-02"' in registry.read_text()
