# Hot queries

Every query that runs on a page load, a list scroll, a pipeline step or an agent tick is listed here with its index and its `EXPLAIN ANALYZE` summary. A new hot query is added in the same PR that introduces it.

| Query | Where | Index | Plan (ms, rows) | PR |
| --- | --- | --- | --- | --- |
| Saved inventories for an org, newest first, keyset `(created_at, id)`, 50 a page | `GET /api/inventories`, My inventory | `inventories_org_created_idx (org_id, created_at DESC, id DESC)` | Bitmap index scan on that index, 0.157 ms, 0 rows (2026-10-29, table empty; re-run with data) | evidence loop |
| One inventory by id, under RLS | `GET /api/inventories/[id]`, open a saved inventory | primary key `inventories (id)` | pending | evidence loop |
| Change history for one line | export, item record | `item_events_item_idx (inventory_id, item_id, created_at)` | pending; written on save, read only by export today | evidence loop |
| Model calls for one inventory, oldest first, capped at 2,000 | `GET /api/inventories/[id]/measures`, Measures panel | `cost_ledger_inventory_idx (inventory_id, created_at)` | Bitmap index scan on that index, 0.088 ms, 0 rows (2026-10-29, near-empty table, run with `enable_seqscan = off`; re-run with data) | measures |
| Model cost for an org, newest first | cost report, eval | `cost_ledger_org_created_idx (org_id, created_at DESC)` | pending; insert-only in the app today | evidence loop |
| Scans for an org, newest first, cursor | `/scans` list | `scans (org_id, created_at DESC, id)` | pending | |
| Items for a scan ordered by room, confidence | scan review | `items (scan_id, room, confidence DESC)` | pending | |
| Evidence for a set of items (batched) | scan review | `evidence (item_id)` | pending | |
| Unmatched items for reconciler | agent | partial: `items (org_id) WHERE value_basis IS NULL` | pending | |
| Packet by share-token hash | `/p/<token>` | unique `packet_shares (token_hash)` | pending | |
| Audit rows for an object | `/verify` | `audit_log (object_id, seq)` | pending | |
| Nearest evidence embeddings (dedupe) | merge agent | HNSW on `evidence.embedding` | pending | |
