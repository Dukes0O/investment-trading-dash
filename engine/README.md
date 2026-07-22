# TrendLab M1 engine

Python 3.11+ deterministic research engine for the protocol in
`../docs/PROJECT_SPEC.md`.

```powershell
cd engine
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
$env:TIINGO_API_TOKEN = "..."
.venv\Scripts\trendlab run-weekly
.venv\Scripts\trendlab backtest
.venv\Scripts\trendlab verify-node
```

`run-weekly` fetches Tiingo data unless `--offline` is supplied. Offline mode
requires an existing validated Tiingo Parquet snapshot for every configured
asset; there is no demo fallback. Research commands automatically exclude the
newest 18 months. Outputs:

- immutable provider snapshots: `engine/data/raw/` (local, ignored)
- normalized DuckDB: `engine/data/curated/market.duckdb` (local, ignored)
- weekly actions: `data/reports/engine-actions-<date>.json`
- local HTML/run manifests: `engine/output/` (local, ignored)
- experiment manifests/registry: `engine/registry/` (committed)
