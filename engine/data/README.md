# Engine data

`raw/<provider>/<snapshot-date>/<symbol>.parquet` contains immutable provider
snapshots and sibling manifests. `curated/market.duckdb` is reproducible from
those snapshots. Both are intentionally ignored because market history is too
large for this repository; manifests and experiment records are committed.
