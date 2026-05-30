---
name: fluent-meals
description: Use when the user wants Meals help on top of Fluent MCP, such as planning dinners for the week, checking kitchen inventory, generating a grocery list, fixing meal data, or placing a grocery order from a plan.
---

# Fluent Meals

Use this skill for Fluent Meals workflows on top of Fluent MCP.

## When to Use This

Use this skill when the user wants Meals help that depends on Fluent meal state, such as:

- planning meals for the week
- checking kitchen inventory
- generating a grocery list from a plan
- fixing recipe, grocery, or inventory state
- ordering groceries from a hosted plan with current inventory truth

## What This Skill Does

- Reads canonical meal state from Fluent MCP.
- Handles meals first-use onboarding when the meals domain is not ready.
- Orchestrates weekly planning, grocery generation, inventory work, and recipe reads.
- Keeps browser ordering outside the shared Fluent contract, with an early-access purchase lane and a local fallback path for self-hosted or operator recovery.
- Requires a hosted order preflight before retailer automation.

## Core Rules

- Use `fluent-core` patterns for readiness and lifecycle checks.
- If capability discovery is deferred in the client, use `meals_list_tools` as the fallback directory.
- Follow the host routing matrix in [docs/fluent-host-surface-routing-matrix.md](../../../../docs/fluent-host-surface-routing-matrix.md) before choosing a rich render path.
- Start setup, calibration, confidence-sensitive planning, inferred-food-pattern confirmation, and "what do you know about how we eat?" turns with `meals_get_onboarding_calibration`.
- In Claude visualizer-only hosts, use the Claude visual path rather than ChatGPT-oriented render tools. In Claude.ai, render-tool visibility is only a candidate path; call the render tool for ordinary grocery-list-first turns when appropriate, but classify the run as MCP Apps-capable only after a `ui://` resource visibly mounts or an explicit mount failure is observed.
- Prefer summary reads first.
- If a summary read already answers the user's question, stop there unless the next step needs detail the summary did not provide.
- Avoid duplicate reads in the same turn unless the user asks for a refresh.
- Use writes only when the user clearly intends to change meal state.
- Treat short grocery-status updates such as "Got Greek yogurt", "bought salmon", "picked up avocado", "we have garlic", or "I have enough Caesar dressing" as write intents, not acknowledgements. Resolve the item against the current week's grocery plan, call `meals_upsert_grocery_plan_action`, then acknowledge the persisted result.
- Keep retailer ordering and local browser execution outside Fluent Core.
- Keep final recommendations and prioritization in the agent.
- Treat the grocery plan as planning state, not the final order list.
- For pantry-style blockers, prefer lightweight sufficiency confirmation for the full week plan instead of inventing exact quantities.
- Receipt-backed `purchased` actions should refresh future durable-coverage evidence, but should not invent exact quantities.
- When the user explicitly wants meals to support a training week, read Health context and use its `trainingSupportSummary` as guidance only.
- During explicit weekly meal planning or revision, pass that compact Health summary into `meals_generate_plan` or `meals_accept_plan_candidate` as `training_context`.
- Do not read Health just because it exists. Only cross over when the current user request includes a clear training signal such as workouts, training, fitness, cutting, bulking, recovery, or a request to make meals support a training week.
- When surfacing calories, protein, fiber, or similar totals from a generated meal plan, describe them as plan estimates or plan totals, not personalized dietary targets.

## First-Use Flow

When the user explicitly wants to set up Meals, or a Meals task needs state that is not ready:

1. Use the `fluent-core` flow to confirm Meals is enabled and onboarding is in progress.
2. Call `meals_get_onboarding_calibration` to separate confirmed preferences, pantry evidence, meal-history inference, grocery readiness, and unresolved questions.
3. If capability discovery is deferred, call `meals_list_tools` and use its grouped output as the fallback directory.
4. Ask only the minimum setup questions needed for the current request: usually household shape, allergies or hard avoids, cooking cadence, weeknight time, and grocery expectation for new users, or 1-3 confirm/correct questions for returning/imported users.
5. Use `meals_record_calibration_response` only after explicit confirmation, rejection, correction, starter preference input, or pantry stale/accidental marking.
6. When setup is complete, finish onboarding through the `fluent-core` flow.

Treat Meals as ready only when Fluent marks it ready.

Do not infer onboarding readiness from prior conversation state, cached client state, or local package state.

Calibration language:

- Pantry ownership, old plans, accepted recipes, and grocery actions are evidence, not confirmed preference.
- Say "your pantry suggests" or "your meal history suggests" for inferred patterns. Do not say "you like X" unless the user confirmed it.
- Allergies, medical restrictions, dietary constraints, and hard avoids require explicit user confirmation.
- If calibration is thin, offer a starter plan or grocery list with lower confidence instead of forcing a long quiz.

## Normal Operating Pattern

Default to this pattern:

1. Use fresh Fluent capability state when readiness matters.
2. Recover the surface with `meals_list_tools` only when capability discovery is deferred.
3. Start with summary reads.
4. Escalate to full documents only when the next step depends on missing detail.
5. Prefer compact write acknowledgements unless the next step needs the full mutated document.

Default low-cost tools:

- `meals_get_onboarding_calibration` for setup, calibration, and confidence-sensitive planning or grocery turns
- `meals_get_plan` with `view: "summary"`
- `meals_list_plan_history`
- `meals_get_preferences` with `view: "summary"`
- `meals_get_inventory_summary`
- `meals_generate_plan`
- `meals_generate_grocery_plan`
- `meals_render_grocery_list_v2` for ordinary grocery-list-first display asks only when the active host can mount Fluent `ui://` resources or the run is explicitly probing that mount path
- `meals_get_current_grocery_list` with `view: "summary"` for ordinary grocery-list/status asks that only need text or counts
- `meals_get_grocery_plan` with `view: "summary"` only for explicit week-scoped/raw plan detail
- `meals_prepare_order`

When the user says they are already cooking a planned meal or have started prep:

- call `meals_mark_meal_cooked` before refreshing plan reads
- if the meal was planned for a later day in the same week, Fluent can pull it forward and shift the remaining same-type schedule automatically
- after the write, refresh with `meals_get_today_context` or `meals_get_plan` only if the user still needs the updated view

Use higher-detail reads only when needed:

- `meals_get_recipe`
- `meals_get_today_context`
- `meals_get_inventory`
- `meals_get_recipe_book`

Recipe-book setup and browsing:

- use `meals_get_recipe_book` for shelves, why-shown reasons, catalog gaps, and safe recipe-specific actions
- use `meals_apply_recipe_book_action` only after explicit user intent
- treat Want to try, Favorite, and Not for us as recipe-specific evidence, not broad household preference, allergy, dietary restriction, or hard avoid
- treat Pin to week as a week-scoped planning intent, not a durable preference

Recipe presentation pattern:

- start with `meals_get_recipe`
- if the user names a specific saved recipe or clearly refers to one, prefer Fluent recipe reads over generic cooking knowledge
- treat asks like "show me the recipe", "how do I make X", "what's in X", "pull up X", and "walk me through X" as recipe-first turns when `X` matches a saved recipe
- if the user is asking "which one is X" right after recipe discovery or list output, stay in recipe-disambiguation flow with `meals_list_recipes` or `meals_get_recipe`; do not jump to `meals_get_today_context` unless the user is explicitly asking about today's plan
- for clearly recipe-centric turns in Claude-connected clients, classify the host render mode first:
  - if the active host is MCP Apps-capable and can mount Fluent `ui://` resources, use `meals_show_recipe` or `meals_render_recipe_card` for ordinary saved-recipe opening prompts
  - otherwise, if the host offers `recipe_display_v0`, call `meals_get_recipe` first and then render through `recipe_display_v0`
  - do not require the user to ask for a "card" explicitly when the request is obviously recipe-first
- for simple recipe-data questions, stop at `meals_get_recipe` and a text answer instead of rendering a visual
- reserve `meals_render_recipe_card` for explicit visualizer-only render probes; in Claude MCP Apps-capable runs it is the normal Fluent recipe-card path
- keep the text answer truthful and complete even when you expect the host to render the recipe card
- if a saved recipe lookup succeeds, do not answer from prior knowledge unless the user explicitly asks for a generic version instead of the saved Fluent recipe

Grocery-list presentation pattern:

- when the user is asking for the actionable grocery view itself, such as "What's on my grocery list?", "What do I still need to buy?", "Show me this week's grocery list", or "Show me my shopping list", first classify the host render mode:
  - if the active host is MCP Apps-capable and can mount Fluent `ui://` resources, use `meals_render_grocery_list_v2`
  - otherwise, in rich Claude visualizer hosts, prefer the interactive HTML visualizer
- In Claude.ai, if `meals_render_grocery_list_v2` is present in the available Fluent tools, treat it as a candidate native Fluent resource path, not proof of MCP Apps capability by itself.
- For Claude.ai runs where `ui://` mounting has been proven or is being explicitly tested, call `meals_render_grocery_list_v2` directly for normal prompts like "Show me my grocery list." Do not call the run MCP Apps-capable unless the resource visibly mounts or an explicit mount failure is captured.
- treat "yes", "pull it up", "bring up the grocery list", "show it", and similar confirmations after an assistant offers to show the grocery list as grocery-list-first turns; do not answer with another offer or a text-only summary when `visualize:show_widget` is available
- in rich Claude visualizer hosts, load and follow `fluent-visual-sync` before the first grocery checklist render in a session only after `meals_render_grocery_list_v2` is unavailable or fails to mount; the user should not need to name the skill explicitly
- for parity/release checks, "prepared visual rendering" is not enough: the assistant must actually mount the chosen visual path, either by calling `meals_render_grocery_list_v2` in an MCP Apps-capable host or by calling `visualize:show_widget` in a Claude visualizer host; otherwise it must plainly say that the visual did not render before falling back to text
- if a visualizer call fails, does not mount, or the user says they cannot see it on mobile, fall back to canonical grocery data plus a compact text checklist; do not create a local artifact with fake or copy-only sync unless the user explicitly asks for a standalone file
- do not require the user to ask for a "card" or "surface" explicitly when the turn is clearly grocery-list-first
- do not default to `meals_render_grocery_list_v2` in ordinary Claude visualizer-only runs
- if `meals_render_grocery_list_v2` appears in `tools/list`, tool discovery, or prompt context during a Claude.ai grocery-list-first run, do not ignore it; call it before loading visual-sync, reading raw grocery-plan data, or composing a custom visualizer widget
- default Claude grocery flow in visualizer-only rich hosts:
  1. call `meals_get_current_grocery_list` with `view: "full"` for the current living list; pass `week_start` only when the user explicitly names a week
  2. use the response `selectionReason`, `weekRelation`, `trustLabel`, and `sourceProvenance` to tell the user what list is being shown, especially when Fluent falls back to a past list or future plan needs
  3. group items from the current list/grocery plan by `inventoryStatus` into:
     - `missing` for need to buy
     - `present_without_quantity` for have but quantity unknown
     - `intent` for explicit next-order requests
     - `check_pantry` for pantry verification
  4. before the first render in a session, load `visualize:read_me` with `modules: ["interactive"]`
  5. render the grocery list through `visualize:show_widget`
  6. do not describe the visual as shown, prepared, or rendered unless the widget is actually mounted; if it is not mounted, say that the visualizer did not render and give the text checklist from the same `meals_get_current_grocery_list` response
- gather or reconcile extra grocery state first only when the turn specifically needs underlying plan detail, reconciliation detail, or intent reconciliation:
  - `meals_prepare_order`
  - `meals_list_grocery_intents`
- do not require the user to ask for a "card" or "surface" explicitly when the turn is clearly grocery-list-first
- for simple grocery data questions, stop at canonical data plus text instead of rendering a widget
- keep the text answer truthful and complete even when you expect the host to render the grocery list

## Claude Visual Guidance

For Claude-connected clients, separate two cases clearly:

- Claude Code / Cowork with this plugin:
  - the MCP tool flow in this skill applies directly
- direct Claude.ai:
  - this plugin does not control behavior by itself
  - use [docs/fluent-claude-ai-visual-guidance.md](../../../../docs/fluent-claude-ai-visual-guidance.md) as the prompt-shaping companion

Do not treat ordinary Claude visualizer-only runs like ChatGPT App SDK hosts. If the active Claude run explicitly proves MCP Apps UI-resource mounting, classify that run under the MCP Apps path instead.

Instead:

- use the MCP tool flow to recover Fluent state
- if the Claude host can render rich visuals, prefer a recipe-card or grocery-checklist style response when the user is clearly asking for the primary object itself
- keep the text answer complete even when you expect Claude to render a visual
- do not rely on persistent widget state across turns

Claude recipe guidance:

- for recipe-first turns in MCP Apps-capable hosts, prefer `meals_show_recipe` or `meals_render_recipe_card`
- in Claude.ai, the presence of `meals_show_recipe` or `meals_render_recipe_card` is a candidate MCP Apps recipe path, not proof by itself; use it before `recipe_display_v0` only when `ui://` mounting is proven live or the turn is explicitly testing that path
- for recipe-first turns in visualizer-only hosts, prefer `meals_get_recipe` and then render with `recipe_display_v0` when that first-party recipe widget is available
- if `recipe_display_v0` is not available in a visualizer-only host, let Claude render its own native recipe visual or a strongly structured text recipe
- if richer rendering is available, bias toward a first-party or Claude-native recipe card with:
  - title
  - servings
  - time
  - macros
  - ingredients
  - steps
  - notes, allergens, leftovers when available
- if neither rich path is available, keep the answer well-structured in text
- do not omit the full text answer just because a richer recipe view may appear

Claude grocery guidance:

- for grocery-list-first turns in MCP Apps-capable hosts, prefer `meals_render_grocery_list_v2`
- in Claude.ai, the presence of `meals_render_grocery_list_v2` is a candidate MCP Apps grocery path, not proof by itself; use it before `meals_get_grocery_plan` only when `ui://` mounting is proven live or the turn is explicitly testing that path
- for grocery-list-first turns in rich Claude visualizer-only hosts, prefer `visualize:show_widget` as the default rendering path
- if the previous assistant turn offered to show the grocery list and the user accepts, render the widget immediately; do not require a second explicit visual request
- load and follow `fluent-visual-sync` before rendering the first visualizer checklist in a session only when the native render tool is unavailable or fails; the widget then includes the sync round-trip, stable item keys, and supported action statuses
- for release parity, count only a visible mounted MCP Apps resource, a visible mounted visualizer, or an explicit host-render failure as valid evidence; a text response that says the visual was prepared is a failed visual pass
- if `visualize:show_widget` is unavailable, say that plainly and provide a text checklist from fresh Fluent data; avoid switching to file artifacts or JSX snippets as the default fallback because they break the Fluent writeback expectation
- render from `meals_get_current_grocery_list` full data grouped by:
  - `missing`
  - `present_without_quantity`
  - `intent`
  - `check_pantry`
- before the first visualizer render in a session, load `visualize:read_me` with `modules: ["interactive"]`
- do not use `meals_render_grocery_list_v2` as the normal Claude visualizer-only path
- if the Fluent widget render tools are visible in Claude.ai or another candidate MCP Apps host, `meals_render_grocery_list_v2` is not proof by itself; it becomes the native Fluent grocery-list presentation path only when `ui://` mounting is proven live or the turn is explicitly testing that path
- surface row notes when present:
  - `preferredBrands` as `X preferred`
  - `avoidBrands` as `avoid X`
  - `blockedSubstituteTerms` in natural language such as `block or wedge, not shredded`
  - `uncertainty: "inventory_unit_mismatch"` as `unit mismatch in inventory`
  - the record `note` when it adds meaning beyond the fields above
- before rendering, scan intent items for one-week quantity anomalies and add flagged `sendPrompt()` actions such as `Fix chicken breast intent`
- do not invent fake action controls in plain text if the host is not actually providing them

### Claude grocery widget reference

Use this HTML and JS shape as the default starting point for `visualize:show_widget`. Keep the outer container transparent, keep all colors in CSS variables, use sentence case, avoid gradients and shadows, and update checked state with JS classes instead of CSS `:checked`.

```html
<section class="grocery-widget" aria-labelledby="grocery-title">
  <style>
    :root {
      --bg: transparent;
      --panel: var(--theme-surface, #ffffff);
      --panel-border: var(--theme-border, #d4d4d8);
      --text: var(--theme-text, #171717);
      --muted: var(--theme-muted, #52525b);
      --subtle: var(--theme-subtle, #71717a);
      --accent: var(--theme-accent, #2563eb);
      --accent-soft: var(--theme-accent-soft, #dbeafe);
      --danger: var(--theme-danger, #b91c1c);
    }

    .grocery-widget {
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 system-ui, sans-serif;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .grocery-header,
    .metrics,
    .grocery-sections,
    .grocery-actions {
      display: grid;
      gap: 12px;
    }

    .grocery-header {
      grid-template-columns: 1fr auto;
      align-items: start;
      margin-bottom: 16px;
    }

    .header-copy {
      display: grid;
      gap: 4px;
    }

    .eyebrow {
      color: var(--muted);
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .title-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: baseline;
    }

    .title-row h1 {
      font-size: 28px;
      line-height: 1.05;
      margin: 0;
    }

    .remaining {
      color: var(--muted);
      font-size: 14px;
    }

    .button-row,
    .grocery-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    button {
      appearance: none;
      border: 1px solid var(--panel-border);
      background: var(--panel);
      color: var(--text);
      border-radius: 999px;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
    }

    .metrics {
      grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
      margin-bottom: 16px;
    }

    .metric-card,
    .section-card {
      border: 1px solid var(--panel-border);
      border-radius: 16px;
      background: var(--panel);
      padding: 14px;
    }

    .metric-label {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .metric-value {
      font-size: 24px;
      line-height: 1;
    }

    .grocery-sections {
      margin-bottom: 16px;
    }

    .section-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
      margin-bottom: 10px;
    }

    .section-head h3 {
      margin: 0;
      font-size: 16px;
    }

    .section-count {
      color: var(--muted);
      font-size: 12px;
    }

    .rows {
      display: grid;
      gap: 8px;
    }

    .row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: start;
      padding: 8px 0;
      border-top: 1px solid var(--panel-border);
    }

    .row:first-child {
      border-top: 0;
      padding-top: 0;
    }

    .row-main {
      display: grid;
      gap: 3px;
    }

    .row-name {
      font-weight: 600;
    }

    .row-notes {
      color: var(--muted);
      font-size: 12px;
    }

    .row-qty {
      color: var(--subtle);
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .is-checked .row-name,
    .is-checked .row-notes,
    .is-checked .row-qty {
      color: var(--muted);
      text-decoration: line-through;
    }
  </style>

  <h2 class="sr-only" id="grocery-summary"></h2>

  <div class="grocery-header">
    <div class="header-copy">
      <div class="eyebrow">Grocery list</div>
      <div class="title-row">
        <h1 id="grocery-title">Week of April 13</h1>
        <div class="remaining"><span id="remaining-count">0</span> items remaining</div>
      </div>
    </div>
    <div class="button-row">
      <button type="button" id="refresh-button">Refresh from Fluent</button>
    </div>
  </div>

  <div class="metrics" id="metric-cards"></div>
  <div class="grocery-sections" id="grocery-sections"></div>
  <div class="grocery-actions" id="grocery-actions"></div>

  <script>
    const data = {
      weekLabel: 'Week of April 13',
      groups: {
        missing: [
          {
            id: 'greek-yogurt',
            name: 'Plain Greek yogurt',
            quantity: '490 g',
            notes: ['Siggi\\'s preferred', 'avoid sweetened tubs']
          }
        ],
        present_without_quantity: [],
        intent: [
          {
            id: 'chicken-breast-intent',
            name: 'Chicken breast',
            quantity: '2300 g',
            notes: ['explicit next-order request']
          }
        ],
        check_pantry: [
          {
            id: 'rolled-oats',
            name: 'Rolled oats',
            quantity: '225 g',
            notes: ['unit mismatch in inventory']
          }
        ]
      },
      anomalyActions: [
        {
          label: 'Fix chicken breast intent',
          prompt: 'Review and fix the chicken breast grocery intent for this week because the quantity looks too high.'
        }
      ]
    };

    const groupLabels = {
      missing: 'To buy',
      present_without_quantity: 'Check amount',
      intent: 'Intents',
      check_pantry: 'Check at home'
    };

    const metricCards = document.getElementById('metric-cards');
    const sections = document.getElementById('grocery-sections');
    const actions = document.getElementById('grocery-actions');
    const remainingCount = document.getElementById('remaining-count');
    const summary = document.getElementById('grocery-summary');
    const title = document.getElementById('grocery-title');
    const refreshButton = document.getElementById('refresh-button');

    const allRows = [];
    title.textContent = data.weekLabel;

    function roundDisplay(value) {
      return String(Math.round(Number(value)));
    }

    function updateRemaining() {
      const unchecked = allRows.filter((row) => !row.classList.contains('is-checked')).length;
      remainingCount.textContent = roundDisplay(unchecked);
      summary.textContent = `${unchecked} items remaining for ${data.weekLabel}`;
    }

    function toggleRow(row, checked) {
      row.classList.toggle('is-checked', checked);
      const input = row.querySelector('input');
      input.checked = checked;
      updateRemaining();
    }

    function sendPrompt(prompt) {
      if (window.claude?.complete) {
        window.claude.complete(prompt);
      } else {
        console.log(prompt);
      }
    }

    refreshButton.addEventListener('click', () => {
      sendPrompt('Refresh my grocery list from Fluent.');
    });

    Object.entries(groupLabels).forEach(([key, label]) => {
      const items = data.groups[key] || [];

      const metric = document.createElement('div');
      metric.className = 'metric-card';
      metric.innerHTML = `
        <div class="metric-label">${label}</div>
        <div class="metric-value">${roundDisplay(items.length)}</div>
      `;
      metricCards.appendChild(metric);

      const card = document.createElement('section');
      card.className = 'section-card';
      const rows = items
        .map((item) => `
          <label class="row" data-row-id="${item.id}">
            <input type="checkbox" />
            <div class="row-main">
              <div class="row-name">${item.name}</div>
              ${item.notes && item.notes.length ? `<div class="row-notes">${item.notes.join(' · ')}</div>` : ''}
            </div>
            <div class="row-qty">${item.quantity || ''}</div>
          </label>
        `)
        .join('');

      card.innerHTML = `
        <div class="section-head">
          <h3>${label}</h3>
          <div class="section-count">${roundDisplay(items.length)}</div>
        </div>
        <div class="rows">${rows || '<div class="row-notes">No items.</div>'}</div>
      `;
      sections.appendChild(card);
    });

    document.querySelectorAll('.row').forEach((row) => {
      allRows.push(row);
      const input = row.querySelector('input');
      input.addEventListener('change', () => toggleRow(row, input.checked));
    });

    [
      { label: 'Mark bought', prompt: 'Mark the grocery list as bought for this week.' },
      { label: 'Refresh list', prompt: 'Refresh my grocery list from Fluent.' },
      ...data.anomalyActions
    ].forEach((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', () => sendPrompt(action.prompt));
      actions.appendChild(button);
    });

    updateRemaining();
  </script>
</section>
```

### Claude recipe widget reference

Use this structure when rendering through `recipe_display_v0`. Keep the data object at the top so Claude only has to swap values, not regenerate the layout logic.

```html
<section class="recipe-card">
  <script>
    const recipe = {
      title: 'Berry Protein Overnight Oats',
      servings: 5,
      totalTime: 10,
      activeTime: 10,
      macros: {
        calories: 410,
        protein: 32,
        fiber: 9,
        sodium: 180
      },
      ingredients: [
        '225 g rolled oats',
        '45 g chia seeds',
        '490 g plain Greek yogurt',
        '480 g unsweetened almond milk',
        '80 g maple syrup',
        '420 g frozen mixed berries',
        '45 g sliced almonds'
      ],
      steps: [
        'Combine oats, chia, Greek yogurt, milk, and maple syrup in a bowl.',
        'Fold in frozen berries and portion into jars.',
        'Refrigerate overnight.',
        'Top with sliced almonds before serving.'
      ],
      notes: [
        '410 cal, 32 g protein, 9 g fiber, 180 mg sodium per serving',
        'Allergen: dairy',
        'Leftovers: yes'
      ]
    };
  </script>
</section>
```

## Weekly Planning Loop

For explicit weekly planning:

1. Confirm meals is ready.
2. Read planning inputs with summary-first calls:
   - `meals_get_preferences`
   - `meals_get_inventory_summary`
   - `meals_list_plan_history`
3. Read more detail only if needed.
4. Call `meals_generate_plan`.
5. Present the candidate and collect approval or revisions.
6. On approval, call `meals_accept_plan_candidate`.
7. Generate the grocery plan with `meals_generate_grocery_plan`.
8. Before any retailer ordering, run `meals_prepare_order` to reconcile what still needs to be bought right now.
9. Only start local export or browser ordering from the reconciled `remainingToBuy` artifact.

When the user names a specific weekday or date for a meal during planning or revision:

- treat that as a slot-level constraint, not a soft preference
- pass it into `meals_generate_plan` as `overrides.pinnedMeals`
- use one entry per fixed slot with `{ date, mealType, recipeId }`
- prefer this for requests like "make Friday spaghetti", "put salmon on Wednesday lunch", or "move tacos to Apr 17 dinner"
- if the recipe is not identified yet, resolve the recipe first, then regenerate with the pinned slot
- do not rely on the planner's default dinner ordering to preserve a named weekday
- when multiple explicit weekday requests exist, include all of them in the same `pinnedMeals` array so the candidate is generated around the full set of constraints

When Meals is supporting a training week:

- read Health summary context, not raw training internals
- only do that when the current prompt clearly contains a training signal
- bias the whole day around harder training days, with dinner complexity as the strongest lever
- use `training_context` only for explicit planning or revision workflows, not casual meal chat
- let `nutritionSupportMode` and `weekComplexity` shape choices, but do not let Health overwrite canonical meal state
- keep food execution canonical in Meals

Do not run the full planning loop for ordinary chat unless the user is clearly planning or revising a week.

## Ordering Execution Boundary

- Fluent MCP owns canonical meal plans, preferences, grocery plans, inventory, recipes, and feedback state.
- Fluent owns lifecycle and onboarding truth.
- This skill provides workflow guidance for first-use wording, planning orchestration, and the ordering handoff.
- Keep retailer credentials out of Fluent MCP, D1, and hosted profile metadata.
- Before any retailer handoff, use `meals_prepare_order` to reconcile what still needs to be bought right now.
- Do not complete checkout inside Claude. Stop at a reconciled list, cart/preflight handoff, or explicit external runner boundary.
- If the user says they already bought items and inventory may be stale, pause ordering until inventory is updated.
- Describe ordering state in these buckets when relevant: still need to buy, already have, already in cart, needs review.
- Use pantry-first sufficiency confirmations only for low-risk pantry blockers. Do not use them for proteins, dairy, eggs, bread/wraps, fresh produce, or other items that still need quantity-aware review.
- Treat retailer order details as the post-checkout source of truth. Do not infer `skipped` from omission, and preserve confirmed ordered extras as inventory evidence instead of fabricating grocery-plan history.
