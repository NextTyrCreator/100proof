# Hot queries

Every query that runs on a page load, a list scroll, a pipeline step or an agent tick is listed here with its index and its `EXPLAIN ANALYZE` summary. A new hot query is added in the same PR that introduces it.

| Query | Where | Index | Plan (ms, rows) | PR |
| --- | --- | --- | --- | --- |
| Scans for an org, newest first, cursor | `/scans` list | `scans (org_id, created_at DESC, id)` | pending | |
| Items for a scan ordered by room, confidence | scan review | `items (scan_id, room, confidence DESC)` | pending | |
| Evidence for a set of items (batched) | scan review | `evidence (item_id)` | pending | |
| Unmatched items for reconciler | agent | partial: `items (org_id) WHERE value_basis IS NULL` | pending | |
| Packet by share-token hash | `/p/<token>` | unique `packet_shares (token_hash)` | pending | |
| Audit rows for an object | `/verify` | `audit_log (object_id, seq)` | pending | |
| Nearest evidence embeddings (dedupe) | merge agent | HNSW on `evidence.embedding` | pending | |
