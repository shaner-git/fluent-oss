---
name: fluent-visual-sync
description: Render Fluent state as an interactive visual with clickable local UI and a round-trip sync button that sends structured updates back through chat for the assistant to persist via MCP. Use this as the implementation reference for visual sync patterns, with groceries as the primary shipped example.
---

# Fluent Visual Sync

## Goal

Render Fluent state as an interactive widget inside the chat using the `visualize:show_widget` tool, and close the persistence loop by having the widget call `sendPrompt()` with a serialized summary of user actions. The assistant then reads that summary on the next turn and writes the corresponding changes back to Fluent through MCP.

This skill is the implementation reference for visual-sync patterns in Fluent. Today, groceries are the primary shipped example, and `fluent-meals` routes grocery-list-first turns into it in rich hosts.

## When to use

Use this skill when:

- The user asks for the grocery checklist itself, such as "What's on my grocery list?", "What do I still need to buy?", or "Show me this week's grocery list".
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
3. A `Sync checked items to Fluent ↗` button calls `sendPrompt()` with a serialized summary of what's checked, scoped by section and week.
4. `sendPrompt` injects that summary into the chat as if the user typed it.
5. On the next turn, the assistant parses that summary and calls `meals_upsert_grocery_plan_action` for each item.

This is a **pull-to-sync** model rather than optimistic-write. It loses immediacy but survives hosts that block direct MCP from widget sandboxes.

## Data fetch (assistant side, before render)

Before calling `visualize:show_widget`, fetch the grocery plan:

```
Fluent:meals_get_grocery_plan(week_start=<runtime-computed>, view="full")
```

Week computation rules:

- Compute the week at call time from the user's timezone.
- Week starts Monday.
- Sunday still belongs to the current week.
- Do not hardcode the date in the skill or widget template.

From the response, extract for each item:

- `itemKey` — the **only** stable identifier; pass this unchanged to the widget and back to MCP.
- `name` — display name.
- `quantity` + `unit` — for the right-aligned qty column.
- `inventoryStatus` — routes item to one of three sections:
  - `missing`, `intent` → **To buy**
  - `present_without_quantity` → **Verify quantity**
  - `check_pantry` → **Check pantry**
- `sourceRecipeNames`, `preferredBrands`, `blockedSubstituteTerms`, `note` — surface concisely in the row subtitle when present.
- Flag `intent` items with a badge.

Items whose `actionStatus` is already set should not clutter the primary working list. Render them in a separate **Covered** section at the bottom of the widget:

- collapsed by default
- expandable on demand
- muted and struck through when expanded
- excluded from the top metric cards

The active working sections remain:

- `To buy`
- `Verify quantity`
- `Check pantry`

## Widget contract

### Embedding data

Inline the fetched item list as a JS object literal in the widget's `<script>` block. Do **not** try to fetch at render time — the widget has no network access to Fluent.

```js
const ITEMS = {
  weekStart: "2026-04-13",
  buy:    [ { key, name, qty, meta?, badge? }, ... ],
  verify: [ ... ],
  pantry: [ ... ],
  covered: [ ... ],
};
```

`key` must be the exact Fluent `itemKey`. Also carry it onto each rendered row via `data-item-key`.

### Interaction

- Row click toggles `.checked` class. Do not try to persist immediately.
- `.checked` rows get strikethrough, muted text, and a filled checkbox.
- Top metric cards show unresolved counts per section; update on every toggle.
- Add a bottom `Covered` disclosure with a toggle like `Show covered (N)` / `Hide covered`.
- The `Covered` section stays collapsed by default so resolved rows remain available without distracting from the active list.

### Action buttons

At the bottom of the widget, expose at least these two buttons:

```html
<button onclick="sendPrompt('Sync my grocery checkboxes to Fluent for week ' + ITEMS.weekStart + ': ' + getCheckedSummary())">
  Sync checked items to Fluent ↗
</button>
<button onclick="sendPrompt('Show me recipes that use the items I still need to buy')">
  Show recipes for unchecked items ↗
</button>
```

The `↗` arrow signals "this sends a prompt back to chat".

### Summary serialization

Implement `window.getCheckedSummary()` on the widget global. It must:

1. Walk all checked rows.
2. Group them by section (`buy` → purchased, `verify` → have enough, `pantry` → pantry confirmed).
3. Return a **single-line string** that a language model can parse reliably. Format:

```
purchased: Name A, Name B; have enough of: Name C; pantry confirmed: Name D, Name E
```

Sections with no checked items are omitted. If nothing is checked, return `"nothing checked yet"` so the assistant can respond gracefully.

This grammar is pinned in `src/domains/meals/grocery-sync.ts`. Do not invent a variant punctuation or label scheme in the widget.

Use display names, not item keys, in the serialized string — it reads naturally in chat and the assistant can map names back to keys using the current grocery plan.

## Sync parsing (assistant side, next turn)

When the assistant receives a message matching `Sync my grocery checkboxes to Fluent for week <YYYY-MM-DD>: <summary>`:

1. Parse the callback with the canonical helper in `src/domains/meals/grocery-sync.ts`.
2. Reuse the in-context plan only if it is still present for the same week; otherwise re-fetch the grocery plan for that week with `view: "full"` before writing anything. The callback is not safe to apply against stale or missing plan context.
3. Resolve each parsed display name against the current grocery plan before choosing `action_status`.
4. Map statuses with the same helper logic as `src/domains/meals/grocery-sync.ts`:
   - `purchased` → `action_status="purchased"`
   - `have enough of` → `action_status="have_enough"` for pantry-sufficiency-eligible lines, otherwise `action_status="confirmed"`
   - `pantry confirmed` → `action_status="have_enough"` for pantry-sufficiency-eligible lines, otherwise `action_status="confirmed"`
5. Call `meals_upsert_grocery_plan_action` once per item with:
   ```
   week_start=<resolved week>
   item_key=<resolved key>
   action_status=<mapped>
   source_type="artifact"
   source_agent="fluent-grocery-ui"
   source_skill="fluent-visual-sync"
   confidence=1.0
   ```
6. Report status per item. If any call fails, surface the error inline — do not silently drop it.

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
<h2 class="sr-only">Interactive grocery checklist for the week of <WEEK>, grouped by to-buy, verify-quantity, and check-pantry.</h2>

<style>
  /* keep under ~40 lines; see interactive module for full token set */
</style>

<div class="gl-header">
  <div class="gl-title">Grocery list</div>
  <div class="gl-sub">Week of <WEEK></div>
</div>

<div class="gl-metrics">
  <div class="gl-metric"><div class="gl-metric-label">To buy</div><div class="gl-metric-value" id="m-buy">0</div></div>
  <div class="gl-metric"><div class="gl-metric-label">Verify quantity</div><div class="gl-metric-value" id="m-verify">0</div></div>
  <div class="gl-metric"><div class="gl-metric-label">Check pantry</div><div class="gl-metric-value" id="m-pantry">0</div></div>
</div>

<div class="gl-section" data-section="buy">
  <div class="gl-section-header">
    <div class="gl-section-title">To buy</div>
    <div class="gl-section-count" id="c-buy"></div>
  </div>
  <div id="list-buy"></div>
</div>

<!-- repeat for verify and pantry -->

<div class="gl-section gl-covered">
  <button type="button" class="gl-covered-toggle" onclick="toggleCovered()">
    <span>Covered (<span id="c-covered">0</span>)</span>
    <span id="covered-toggle-copy">Show</span>
  </button>
  <div id="list-covered" hidden></div>
</div>

<div class="gl-actions">
  <button onclick="sendPrompt('Sync my grocery checkboxes to Fluent for week ' + ITEMS.weekStart + ': ' + getCheckedSummary())">Sync checked items to Fluent ↗</button>
  <button onclick="sendPrompt('Show me recipes that use the items I still need to buy')">Show recipes for unchecked items ↗</button>
</div>

<script>
  const ITEMS = { weekStart: "2026-04-13", buy: [...], verify: [...], pantry: [...], covered: [...] };
  let coveredExpanded = false;

  function renderRow(item, section) { /* ... */ }
  function render() { /* renders all sections + binds click handlers */ }
  function updateCounts() { /* updates metric cards + section counts */ }
  function toggleCovered() { coveredExpanded = !coveredExpanded; render(); }

  window.getCheckedSummary = function() {
    const summary = { purchased: [], verified: [], pantryConfirmed: [] };
    document.querySelectorAll('.gl-row.checked').forEach(row => {
      const section = row.dataset.section;
      if (section === 'covered') return;
      const name = row.querySelector('.gl-name').childNodes[0].textContent.trim();
      if (section === 'buy') summary.purchased.push(name);
      else if (section === 'verify') summary.verified.push(name);
      else if (section === 'pantry') summary.pantryConfirmed.push(name);
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
