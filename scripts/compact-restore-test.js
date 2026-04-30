PHASE 1A IMPLEMENTATION CORRECTION

Proceed, but keep the implementation purely inert.

Create:
- src/lib/graph-snapshot-schema.ts
- src/lib/graph-snapshot-export.ts

Do not create UI yet.
Do not write files.
Do not capture PNG.
Do not add gallery.
Do not add compare view.
Do not change graph mapper.
Do not mutate graph data.

Important implementation correction:
The export utility should generate snapshot_id and created_at internally by default, with optional overrides for tests.

Preferred function shape:

exportGraphSnapshot(input: GraphSnapshotExportInput): GraphSnapshot

Where input includes:
- created_by
- graph_data_hash?
- site_index_hash?
- repo_filter
- type_filter
- entry_point_filter
- meaning_layers_enabled
- density_mode
- zoom_mode
- visible_node_count
- visible_edge_count
- total_available_nodes
- total_available_edges
- status_counts
- selected_node_ids?
- selected_edge_ids?
- interpretation_status
- overrides?:
  - snapshot_id?
  - created_at?

Required interpretation_status enum:
- observation
- hypothesis
- verified
- rejected
- superseded

Required default:
- interpretation_status should default to observation if omitted.

Validation:
Add a lightweight pure validation helper if reasonable:
validateGraphSnapshot(snapshot): { valid: boolean; errors: string[] }

Validation should check:
- snapshot_id exists
- created_at exists
- created_by exists
- counts are non-negative
- interpretation_status is valid
- status_counts includes verified/unverified/conflicted/quarantined

Test:
Only add tests if a test structure already exists. Do not invent a whole test framework in this pass.

Commit message:
feat: add graph snapshot export schema

Expected output:
Pure JSON object only.
No runtime authority.
No persistence.
No screenshots.
No automatic verification.
No graph remapping.