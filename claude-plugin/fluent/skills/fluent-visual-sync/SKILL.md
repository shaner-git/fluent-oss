---
name: fluent-visual-sync
description: Render Fluent state as an interactive visual with clickable local UI and a round-trip sync button that sends structured updates back through chat for the assistant to persist via MCP. Use this as the implementation reference for visual sync patterns, with groceries as the primary shipped example.
---

# Fluent Visual Sync

## Goal

Render Fluent state as an interactive widget inside the chat using the `visualize:show_widget` tool, and close the persistence loop by having the widget call `sendPrompt()` with a serialized summary of user actions. The assistant then reads that summary on the next turn and writes the corresponding changes back to Fluent through MCP.

This skill is the implementation reference for visual-sync patterns in Fluent. In the Claude package, groceries are the primary shipped example and `fluent-meals` routes grocery-list-first turns into this path in Claude-side rich hosts.

Follow the host routing matrix in [docs/fluent-host-surface-routing-matrix.md](../../../../docs/fluent-host-surface-routing-matrix.md):

- Claude-side hosts should prefer this skill when `visualize:show_widget` is available
- ChatGPT / MCP Apps-style hosts should prefer `meals_render_grocery_list_v2` instead
- plain clients should fall back to canonical data plus text

## When to use

Use this skill when:

- The user asks for the grocery checklist itself, such as "What's on my grocery list?", "What do I still need to buy?", or "Show me this week's grocery list".
- The assistant has just offered to pull up or show the grocery list and the user accepts with "yes", "pull it up", "bring it up", "show it", or similar.
- The host supports `visualize:show_widget` and the goal is an inline interactive checklist instead of plain markdown.
- The user explicitly asks for an inline, visual, or interactive grocery view.

Do **not** use this skill when:

- The user only wants a text summary.
- The host is known to support Fluent MCP widget payloads directly, such as ChatGPT app surfaces where `meals_render_grocery_list_v2` is the correct path.
- The current turn needs raw grocery-plan detail, order reconciliation, or intent debugging more than the checklist UI itself.

## Core pattern: visualizer + sendPrompt round-trip

The visualizer runs as sandboxed HTML with no direct MCP access. Persistence is achieved by:

1. Widget renders checklist with local-only check state.
2. Each clickable row toggles a CSS class on the row element.
3. A `Save checked items to Fluent ↗` button calls `sendPrompt()` with a serialized summary of what's checked, scoped by section and week.
4. `sendPrompt` injects that summary into the chat as if the user typed it.
5. On the next turn, the assistant parses that summary and calls `meals_upsert_grocery_plan_action` for each item.

This is a **pull-to-sync** model rather than optimistic-write. It loses immediacy but survives hosts that block direct MCP from widget sandboxes.

## Data fetch (assistant side, before render)

Before calling `visualize:show_widget`, fetch the current living grocery list:

```
Fluent:meals_get_current_grocery_list(view="full")
```

Week and selection rules:

- Do not compute a future week yourself for ordinary "show my grocery list" asks.
- Let `meals_get_current_grocery_list` choose the current living list and read its `selectionReason`, `weekRelation`, `trustLabel`, and `sourceProvenance`.
- Pass `week_start` only when the user explicitly names a week.
- If `selectionReason` is non-null, show it in plain language before or above the visual.

For release/parity checks, the visual step is only successful when `visualize:show_widget` is actually called and the host mounts a visible interactive visual. Do not say the visual is shown, prepared, or rendered unless that happened. If the visualizer is unavailable, the call fails, or the widget does not mount, say plainly that the visualizer did not render and then provide a compact text checklist from the same `meals_get_current_grocery_list` response.

From the response, extract for each item:

- `itemKey` — the **only** stable identifier; pass this unchanged to the widget and back to MCP.
- `name` — display name.
- `quantity` + `unit` — for the right-aligned qty column.
- `inventoryStatus` — routes item to one of three sections:
  - `missing`, `intent` → **To buy**
  - `present_without_quantity` → **Check amount**
  - `check_pantry` → **Check at home**
- `sourceRecipeNames`, `preferredBrands`, `blockedSubstituteTerms`, `note` — surface concisely in the row subtitle when present.
- Flag `intent` items with a badge.

Items whose `actionStatus` is already set should not clutter the primary working list. Render them in a separate **Done** section at the bottom of the widget:

- collapsed by default
- expandable on demand
- muted and struck through when expanded
- excluded from the top metric cards

The active working sections remain:

- `To buy`
- `Check amount`
- `Check at home`

## Widget contract

### Embedding data

Inline the fetched item list as a JS object literal in the widget's `<script>` block. Do **not** try to fetch at render time — the widget has no network access to Fluent.

```js
const ITEMS = {
  weekStart: "2026-04-13",
  buy:    [ { key, name, qty, meta?, badge?, actionStatus? }, ... ],
  verify: [ ... ],
  pantry: [ ... ],
  done: [ ... ],
};
```

`key` must be the exact Fluent `itemKey`. Also carry it onto each rendered row via `data-item-key`.

For each active item, precompute the action status the assistant should write if that row is checked:

- `buy` rows usually use `purchased`
- `verify` and `pantry` rows must use the row's supported Fluent action when available, such as the `action_status` from `syncAction.args` / `syncActions.args`
- if the plan data does not expose a supported row action, use `have_enough` only for pantry-sufficiency-eligible lines; otherwise use `confirmed`

Carry the precomputed value as `actionStatus` and onto each rendered row via `data-action-status`. Do not make the next assistant infer `have_enough` versus `confirmed` from the visible section name.

### Interaction

- Row click toggles `.checked` class. Do not try to persist immediately.
- `.checked` rows get strikethrough, muted text, and a filled checkbox.
- Top metric cards show unresolved counts per section; update on every toggle.
- Add a bottom `Done` disclosure with a toggle like `Show Done (N)` / `Hide Done`.
- The `Done` section stays collapsed by default so resolved rows remain available without distracting from the active list.

### Action buttons

At the bottom of the widget, expose at least these two buttons:

```html
<button onclick="sendPrompt('Save my grocery list changes to Fluent for week ' + ITEMS.weekStart + ': ' + getCheckedSummary())">
  Save checked items to Fluent ↗
</button>
<button onclick="sendPrompt('Show me recipes that use the items I still need to buy')">
  Show recipes for unchecked items ↗
</button>
```

The `↗` arrow signals "this sends a prompt back to chat".

### Summary serialization

Implement `window.getCheckedSummary()` on the widget global. It must:

1. Walk all checked rows.
2. Group them by section (`buy` → purchased, `verify` → have enough, `pantry` → pantry confirmed) for the human-readable labels.
3. Include the stable `itemKey` and precomputed `actionStatus` for every checked row.
4. Return a **single-line string** that a language model can parse reliably. Format:

```
purchased: Name A [key=item-key-a action_status=purchased], Name B [key=item-key-b action_status=purchased]; have enough of: Name C [key=item-key-c action_status=confirmed]; pantry confirmed: Name D [key=item-key-d action_status=have_enough]
```

Sections with no checked items are omitted. If nothing is checked, return `"nothing checked yet"` so the assistant can respond gracefully.

Keep the section labels and punctuation stable. Do not invent a variant punctuation or label scheme in the widget.

Use display names first so the chat remains readable, but include bracketed `key=` and `action_status=` fields so writeback can use stable identifiers. Older widgets may send names only; support that fallback by resolving names against the current grocery list.

## Sync parsing (assistant side, next turn)

When the assistant receives a message matching `Save my grocery list changes to Fluent for week <YYYY-MM-DD>: <summary>`:

1. Parse the callback according to the summary serialization above.
2. Reuse the in-context current list only if it is still present for the same week; otherwise re-fetch with `meals_get_current_grocery_list` and `view: "full"` before writing anything. The callback is not safe to apply against stale or missing list context.
3. Prefer bracketed `key=` and `action_status=` fields from the callback when present; verify the key exists in the current grocery plan for that week before writing.
4. For older name-only callbacks, resolve each parsed display name against the current grocery plan before choosing `action_status`.
5. Map name-only statuses with the same supported-action logic used to build the widget:
   - `purchased` → `action_status="purchased"`
   - `already have enough` / `pantry confirmed` → use the item's supported `already_have_enough` action from the full plan when available; otherwise use `have_enough` only for pantry-sufficiency-eligible lines and `confirmed` for quantity-aware or non-pantry lines
6. Call `meals_upsert_grocery_plan_action` once per item with:
   ```
   week_start=<resolved week>
   item_key=<resolved key>
   action_status=<mapped>
   source_type="artifact"
   source_agent="fluent-grocery-ui"
   source_skill="fluent-visual-sync"
   confidence=1.0
   ```
7. Report status per item. If any call fails, surface the error inline — do not silently drop it or claim the batch fully succeeded.

Name resolution guidance:

- Match case-insensitively against the grocery plan's display names for the same week.
- If a name is ambiguous, ask the user which one before writing.
- If a name cannot be resolved, report it as unmatched and continue processing the rest.

### Known backend quirk: intent-item purchase

Marking an `intent` inventoryStatus item as `purchased` can fail with a D1 `UNIQUE constraint failed: meal_inventory_items.tenant_id, meal_inventory_items.normalized_name` error when an inventory row already exists under the same normalized name.

If this happens:

1. Do not retry with the same action_status — it will fail the same way.
2. Offer the user three options in chat:
   - Try `in_cart` instead.
   - Manually reconcile the existing inventory row in Fluent, then retry.
   - Log as a backend bug — the intent → purchased handler should be an `INSERT ... ON CONFLICT UPDATE`.
3. Do not claim success for items that errored.

## Design rules

Follow visualizer design conventions loaded from `visualize:read_me` with `modules: ["interactive"]`:

- Flat surfaces, no gradients, no shadows, no emoji.
- Sentence case everywhere.
- Two font weights only: 400 and 500.
- CSS variables for all colors so dark and light mode both work.
- `border-radius: var(--border-radius-md)` for rows, `-lg` for cards.
- No `position: fixed`.
- Metric cards use `var(--color-background-secondary)`, no border.
- Intent badges use info token colors.

## Full widget skeleton

```html
<h2 class="sr-only">Interactive grocery checklist for the week of <WEEK>, grouped by to-buy, check-amount, and check-at-home.</h2>

<style>
  /* keep under ~40 lines; see interactive module for full token set */
</style>

<div class="gl-header">
  <div class="gl-title">Grocery list</div>
  <div class="gl-sub">Week of <WEEK></div>
</div>

<div class="gl-metrics">
  <div class="gl-metric"><div class="gl-metric-label">To buy</div><div class="gl-metric-value" id="m-buy">0</div></div>
  <div class="gl-metric"><div class="gl-metric-label">Check amount</div><div class="gl-metric-value" id="m-verify">0</div></div>
  <div class="gl-metric"><div class="gl-metric-label">Check at home</div><div class="gl-metric-value" id="m-pantry">0</div></div>
</div>

<div class="gl-section" data-section="buy">
  <div class="gl-section-header">
    <div class="gl-section-title">To buy</div>
    <div class="gl-section-count" id="c-buy"></div>
  </div>
  <div id="list-buy"></div>
</div>

<!-- repeat for verify and pantry -->

<div class="gl-section gl-done">
  <button type="button" class="gl-done-toggle" onclick="toggleDone()">
    <span>Done (<span id="c-done">0</span>)</span>
    <span id="done-toggle-copy">Show</span>
  </button>
  <div id="list-done" hidden></div>
</div>

<div class="gl-actions">
  <button onclick="sendPrompt('Save my grocery list changes to Fluent for week ' + ITEMS.weekStart + ': ' + getCheckedSummary())">Save checked items to Fluent ↗</button>
  <button onclick="sendPrompt('Show me recipes that use the items I still need to buy')">Show recipes for unchecked items ↗</button>
</div>

<script>
  const ITEMS = { weekStart: "2026-04-13", buy: [...], verify: [...], pantry: [...] , done: [...] };
  let doneExpanded = false;

  function renderRow(item, section) { /* ... */ }
  function render() { /* renders all sections + binds click handlers */ }
  function updateCounts() { /* updates metric cards + section counts */ }
  function toggleDone() { doneExpanded = !doneExpanded; render(); }

  window.getCheckedSummary = function() {
    const summary = { purchased: [], verified: [], pantryConfirmed: [] };
    document.querySelectorAll('.gl-row.checked').forEach(row => {
      const section = row.dataset.section;
      if (section === 'done') return;
      const name = row.querySelector('.gl-name').childNodes[0].textContent.trim();
      const key = row.dataset.itemKey;
      const actionStatus = row.dataset.actionStatus;
      const encoded = name + ' [key=' + key + ' action_status=' + actionStatus + ']';
      if (section === 'buy') summary.purchased.push(encoded);
      else if (section === 'verify') summary.verified.push(encoded);
      else if (section === 'pantry') summary.pantryConfirmed.push(encoded);
    });
    const parts = [];
    if (summary.purchased.length) parts.push('purchased: ' + summary.purchased.join(', '));
    if (summary.verified.length) parts.push('have enough of: ' + summary.verified.join(', '));
    if (summary.pantryConfirmed.length) parts.push('pantry confirmed: ' + summary.pantryConfirmed.join(', '));
    return parts.length ? parts.join('; ') : 'nothing checked yet';
  };

  render();
</script>
```

## Extensibility

The same `sendPrompt`-with-serialized-summary pattern works for any Fluent domain widget that needs cheap round-trip persistence without direct MCP from the visual sandbox. Examples:

- Workout completion checklist → `sendPrompt('Log these completed sessions: ...')`
- Meal feedback grid → `sendPrompt('Rate these meals: ...')`
- Closet item triage → `sendPrompt('Style decisions: keep X, donate Y')`

The key insight: **the widget doesn't need MCP access if chat can act as the transport layer.** Widget is the UI, chat is the bus, assistant is the writer.

## Do not do

- Do not try to call `window.claude.callMCPTool` from inside a visualizer widget.
- Do not hardcode `week_start` in the widget template; compute it at runtime and pass it in.
- Do not use item names as the MCP identifier on sync — always resolve back to `itemKey`.
- Do not silently retry a failed intent → purchased sync.
- Do not duplicate the rendered list in chat text after the widget renders.
- Do not round-trip individual check events through `sendPrompt` — that would spam the chat. Batch via the sync button only.

## Fallback phrasing

If the visualizer is unavailable, fall back to a plain markdown list in chat and ask the user to reply with what they bought, verified, or confirmed in free text.
