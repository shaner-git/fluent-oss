# Changelog

All notable Fluent open-source runtime release-facing changes are documented here.

## Unreleased

### One operation per closet tool (contract `2026-10-08.fluent-core-v2.3`)

- Photo arrangement is five tools: `fluent_set_closet_item_cover`, `fluent_reorder_closet_item_photos`, `fluent_hide_closet_item_photo` (the file is kept), `fluent_replace_closet_item_photo` and `fluent_undo_closet_item_photo_change`. `fluent_arrange_closet_item_photos` is removed before release.
- `fluent_restore_closet_item` restores an archived item; `fluent_update_closet_item` only edits details and rejects a status change with a pointer.
- `fluent_merge_closet_items` merges a confirmed duplicate (now requiring `merge_operation_id`); `fluent_archive_closet_item` only archives and rejects merge parameters with a pointer.
- `fluent_add_closet_item_photo` adds a photo; `fluent_set_closet_item_photo` only sets a role slot and rejects `photo_action` with a pointer.
- `fluent_undo_closet_item_merge` now requires an outstanding merge with the exact merge ID before any change; a never-merged item or a wrong ID changes nothing.
- The frozen legacy closet widget resources (v7, v8, v20-v27, v33 and the v34 alias) are no longer public: they call removed tool names. Only `ui://widget/fluent-style-closet.html` is served.
- `fluent_add_closet_item` only creates: `on_duplicate` is `warn` or `force`, and a former `"skip"` (use the existing item) is rejected with `fluent_add_closet_item_photo`, `fluent_set_closet_item_photo` and `fluent_merge_closet_items` named; nothing is saved. Its destructive hint is now false.
- A photo-less item's first photo is set as its cover with `fluent_set_closet_item_photo` (`image_type="primary"`); `fluent_add_closet_item_photo` only adds further photos.
- Public profile: 26 tools, 16 explicit writes, 1 render adapter, 1 resource. Every result matches the pre-split tools (`tests/fixtures/style-closet-writes-pre-split-expected.json`).

### Public tools renamed to closet vocabulary (contract `2026-10-08.fluent-core-v2.3`)

- Breaking: every public tool except `fluent_get_capabilities` and `fluent_get_account_status` is renamed, with no aliases. Cached clients calling an old name get "tool not found". Inputs and behavior are unchanged.
- `fluent_get_account_profile` -> `fluent_get_account`; `fluent_get_shared_profile` -> `fluent_get_profile`; `fluent_update_shared_profile_patch` -> `fluent_update_profile`; `fluent_get_context` -> `fluent_get_closet_context`; `fluent_list_items` -> `fluent_list_closet_items`; `fluent_get_item` -> `fluent_get_closet_item`; `fluent_create_style_item` -> `fluent_add_closet_item`; `fluent_update_style_item_patch` -> `fluent_update_closet_item`; `fluent_archive_item` -> `fluent_archive_closet_item`; `fluent_set_style_item_image` -> `fluent_set_closet_item_photo`; `fluent_get_media_bundle` -> `fluent_get_closet_item_photos`; `fluent_refresh_style_item_profile` -> `fluent_record_closet_item_feedback`; `fluent_list_evidence` -> `fluent_list_closet_evidence`; `fluent_render_style_closet_surface` -> `fluent_show_closet`.
- The three tools split out of the patch tool (below) ship as `fluent_arrange_closet_item_photos`, `fluent_save_closet_item_product_details` and `fluent_undo_closet_item_merge`.
- Titles use plain language matching the names. The naming rule is in `tasks/tool-naming-taxonomy.md`.

### Style item writes split into separate tools (contract `2026-10-08.fluent-core-v2.3`)

- Adds `fluent_arrange_style_item_photos` (cover, reorder, remove, replace, undo for saved photos), `fluent_set_style_item_product_reference` (host-researched product reference with attributed facts) and `fluent_undo_style_duplicate_merge` (undo one duplicate combine by its exact merge cycle). Each keeps the behavior, guards and read-after-write proof it had as a `fluent_update_style_item_patch` parameter. The public profile is now 19 tools, 9 explicit writes, 1 render adapter, and 12 resources.
- Breaking for cached clients: `fluent_update_style_item_patch` only edits item details and no longer declares `photo_library`, `product_enrichment` or `expected_duplicate_merge_id`. A call that still sends one of them is rejected with an error naming the replacement tool; nothing is saved.
- The Style Closet widget calls the new tools; its resource URI is unchanged.

### Meals retired (contract `2026-10-06.fluent-core-v2.2`)

- Breaking: removes `fluent_save_recipe`, `fluent_update_recipe_patch`, `fluent_record_recipe_feedback`, `fluent_save_meal_plan`, `fluent_apply_grocery_list_change`, `fluent_apply_grocery_shopping_result`, `fluent_render_surface`, and the `ui://widget/fluent-grocery-list.html` resource. The public profile is now 16 tools, 6 explicit writes, 1 render adapter, and 12 resources. Cached clients calling a removed tool get "tool not found".
- The shared tools keep accepting `domain="meals"`, the Meals item types (`meal_plan`, `recipe`, `grocery_list`, `inventory_item`) and the food profile-fact kinds, so cached clients still validate. Those calls return a plain `MealsRetired` result with no Meals data and write nothing.
- `fluent_get_shared_profile` no longer returns food facts (allergies, dietary pattern, meal taste); capabilities and account status list Style as the only product domain.
- No migration. Meals code, tables, account export and account purge are unchanged; saved Meals data stays stored and exportable.

### Budgets retired (contract `2026-09-29.fluent-core-v2.1`)

- Breaking: removes `fluent_get_purchase_context`, `fluent_set_budget_envelope`, `fluent_log_budget_spend`, `fluent_render_budgets_surface`, and the budget envelope-setup widget resource. The public profile is now 23 tools, 12 explicit writes, 2 render adapters, and 13 resources.
- Style purchase context (`fluent_get_context` with `intent="purchase"`) returns the owned-closet comparison only. `amount` and `candidate.price_text` are still accepted but no longer drive budget arithmetic. Assistants bring finance context from the user's own tools, or ask.
- Migration `0036` drops `budget_envelopes` and `budget_spend_events`, which deletes all saved budget data. Deploy the code first, then apply `0036`, because earlier builds query those tables.
- Stated budget preferences (Style budget tiers, Meals budget sensitivity and per-meal price cap) are unchanged.

### Tenant isolation hardening

- `domain_events` gains a `tenant_id` column (migration `0031`, expand-only with backfill); every writer sets it and every reader, including `fluent_list_evidence`, filters on it. Rows that cannot be attributed stay `NULL` and are never returned.
- Upserts for meal plans, grocery items, and Style artifacts no longer reassign `tenant_id` on conflict. A caller-supplied id that belongs to another tenant is a no-op that surfaces as a save error instead of taking the row over.
- Recipe reads and writes always scope by tenant; the runtime probe that fell back to unscoped legacy queries when the column check failed is removed.
- Grocery shopping receipt row writes are fenced by the execution token, so a worker whose lease was taken over cannot overwrite the newer execution's evidence.
- Account purge deletes `domain_events` by `tenant_id` and explicitly deletes shopping receipt tables instead of relying on foreign-key cascade.
- Apply migration `0031` before deploying this code: the new writers require the column.

## v0.2.0 - 2026-07-09

Fluent 2.0 removes the pre-launch compatibility surface and makes one small, explicit contract the Cloud and OSS baseline.

### Highlights

- freezes the public contract at `2026-07-09.fluent-core-v2.0`
- exposes 26 tools, 14 explicit writes, three render adapters, and three MCP Apps resources
- removes the public full, candidate, compatibility, Home, Health, and earlier domain-tool lanes
- keeps Meals, Style, and two manual budget envelopes aligned across Codex, Claude, and OpenClaw packages
- requires fresh real-host product-quality proof before any current app surface is marked deployment-ready

### Supported Contract Version

- minimum supported contract version: `2026-07-09.fluent-core-v2.0`
- frozen contract artifact: [contracts/fluent-contract.v2.json](./contracts/fluent-contract.v2.json)
- machine-readable public profile: [contracts/fluent-public-profile.json](./contracts/fluent-public-profile.json)

## v0.1.0 - 2026-04-19

First public Fluent open-source runtime release.

### Highlights

- publishes the supported single-user Fluent open-source runtime
- ships Docker-first and direct Node.js 22.x setup paths
- supports the shared Fluent MCP contract used by Fluent's hosted service
- includes Codex, Claude, and OpenClaw scaffold generation for OSS
- includes snapshot export and import support for OSS operators

### Supported Contract Version

- minimum supported contract version: `2026-06-01.fluent-core-v1.85`
- frozen contract artifact: [contracts/fluent-contract.v2.json](./contracts/fluent-contract.v2.json)
- contract notes: [docs/fluent-contract-v2.md](./docs/fluent-contract-v2.md)
- contract change: current product-wide vNext contract is v1.85. The public assistant/app profile uses one canonical `/mcp` surface with nine tools, zero resources, and one explicit shared/Meals write primitive. Legacy rich render, action/apply, Home, lifecycle, Style-write, Health/Wellbeing, and Finance surfaces remain outside the public vNext profile unless a future survival packet proves they improve the product.

### Supported Setup Matrix

- setup matrix: [docs/oss/fluent-oss-setup-matrix.md](./docs/oss/fluent-oss-setup-matrix.md)

### Known Limitations

- known limitations: [docs/oss/fluent-oss-known-limitations.md](./docs/oss/fluent-oss-known-limitations.md)

### Upgrade Notes

- upgrade guide: [docs/oss/fluent-oss-upgrade-notes.md](./docs/oss/fluent-oss-upgrade-notes.md)

### Docker Notes

- Docker operator notes: [docs/oss/fluent-oss-docker-notes.md](./docs/oss/fluent-oss-docker-notes.md)

### Release Operations

- GitHub release checklist: [docs/oss/fluent-oss-github-release-checklist.md](./docs/oss/fluent-oss-github-release-checklist.md)
- public release page: [Fluent open-source runtime v0.1.0](https://github.com/shaner-git/fluent-oss/releases/tag/v0.1.0)
