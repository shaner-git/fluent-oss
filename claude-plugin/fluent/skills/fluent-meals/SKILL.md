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
- Keeps browser ordering outside Fluent Core, with a Cloud-first hosted purchase lane for Fluent Cloud and a local fallback path for OSS or operator recovery.
- Requires a hosted order preflight before retailer automation.

## Core Rules

- Use `fluent-core` patterns for readiness and lifecycle checks.
- If capability discovery is deferred in the client, use `meals_list_tools` as the fallback directory.
- Prefer summary reads first.
- If a summary read already answers the user's question, stop there unless the next step needs detail the summary did not provide.
- Avoid duplicate reads in the same turn unless the user asks for a refresh.
- Use writes only when the user clearly intends to change meal state.
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
2. If capability discovery is deferred, call `meals_list_tools` and use its grouped output as the fallback directory.
3. Complete the minimum onboarding questions needed for the current request.
4. When setup is complete, finish onboarding through the `fluent-core` flow.

Treat Meals as ready only when Fluent marks it ready.

Do not infer onboarding readiness from prior conversation state, cached client state, or local package state.

## Normal Operating Pattern

Default to this pattern:

1. Use fresh Fluent capability state when readiness matters.
2. Recover the surface with `meals_list_tools` only when capability discovery is deferred.
3. Start with summary reads.
4. Escalate to full documents only when the next step depends on missing detail.
5. Prefer compact write acknowledgements unless the next step needs the full mutated document.

Default low-cost tools:

- `meals_get_plan` with `view: "summary"`
- `meals_list_plan_history`
- `meals_get_preferences` with `view: "summary"`
- `meals_get_inventory_summary`
- `meals_generate_plan`
- `meals_generate_grocery_plan`
- `meals_get_grocery_plan` with `view: "summary"`
- `meals_prepare_order`

When the user says they are already cooking a planned meal or have started prep:

- call `meals_mark_meal_cooked` before refreshing plan reads
- if the meal was planned for a later day in the same week, Fluent can pull it forward and shift the remaining same-type schedule automatically
- after the write, refresh with `meals_get_today_context` or `meals_get_plan` only if the user still needs the updated view

Use higher-detail or audit reads only when needed:

- `meals_get_recipe`
- `meals_get_today_context`
- `meals_get_inventory`
- `fluent_list_domain_events` for audit or debugging

Recipe presentation pattern:

- start with `meals_get_recipe`
- if the user names a specific saved recipe or clearly refers to one, prefer Fluent recipe reads over generic cooking knowledge
- treat asks like "show me the recipe", "how do I make X", "what's in X", "pull up X", and "walk me through X" as recipe-first turns when `X` matches a saved recipe
- if the user is asking "which one is X" right after recipe discovery or list output, stay in recipe-disambiguation flow with `meals_list_recipes` or `meals_get_recipe`; do not jump to `meals_get_today_context` unless the user is explicitly asking about today's plan
- for clearly recipe-centric turns in Claude-connected clients, prefer Fluent data plus Claude-first rendering:
  - if the host offers `recipe_display_v0`, call `meals_get_recipe` first and then render through `recipe_display_v0`
  - do not require the user to ask for a "card" explicitly when the request is obviously recipe-first
  - do not default to `meals_render_recipe_card` in Claude
- reserve `meals_render_recipe_card` for Claude-side debugging only, not as the normal recipe presentation path
- keep the text answer truthful and complete even when you expect the host to render the recipe card
- if a saved recipe lookup succeeds, do not answer from prior knowledge unless the user explicitly asks for a generic version instead of the saved Fluent recipe

Grocery-list presentation pattern:

- when the user is asking for the actionable grocery view itself, such as "What's on my grocery list?", "What do I still need to buy?", "Show me this week's grocery list", or "Show me my shopping list", prefer the interactive HTML visualizer as the default path in rich Claude hosts
- do not require the user to ask for a "card" or "surface" explicitly when the turn is clearly grocery-list-first
- do not default to `meals_render_grocery_list_v2` or the legacy alias in Claude
- if `meals_render_grocery_list_v2` or the legacy alias appears in `tools/list`, tool discovery, or prompt context, treat it as ChatGPT/App SDK-only and ignore it for Claude
- default Claude grocery flow in rich hosts:
  1. call `meals_get_grocery_plan` with `view: "full"` for the relevant week, defaulting to the current week
  2. group items by `inventoryStatus` into:
     - `missing` for need to buy
     - `present_without_quantity` for have but quantity unknown
     - `intent` for explicit next-order requests
     - `check_pantry` for pantry verification
  3. before the first render in a session, load `visualize:read_me` with `modules: ["interactive"]`
  4. render the grocery list through `visualize:show_widget`
- gather or reconcile extra grocery state first only when the turn specifically needs underlying plan detail, reconciliation detail, or intent debugging:
  - `meals_prepare_order`
  - `meals_list_grocery_intents`
- do not require the user to ask for a "card" or "surface" explicitly when the turn is clearly grocery-list-first
- keep the text answer truthful and complete even when you expect the host to render the grocery list

## Claude Visual Guidance

For Claude-connected clients, separate two cases clearly:

- Claude Code / Cowork with this plugin:
  - the MCP tool flow in this skill applies directly
- direct Claude.ai:
  - this plugin does not control behavior by itself
  - use [docs/fluent-claude-ai-visual-guidance.md](C:/Users/accou/fluent-mcp/docs/fluent-claude-ai-visual-guidance.md) as the prompt-shaping companion

Do not treat Claude like a ChatGPT App SDK host.

Instead:

- use the MCP tool flow to recover Fluent state
- if the Claude host can render rich visuals, prefer a recipe-card or grocery-checklist style response when the user is clearly asking for the primary object itself
- keep the text answer complete even when you expect Claude to render a visual
- do not rely on persistent widget state across turns

Claude recipe guidance:

- for recipe-first turns, prefer `meals_get_recipe` and then render with `recipe_display_v0` when that first-party recipe widget is available
- if `recipe_display_v0` is not available, let Claude render its own native recipe visual or a strongly structured text recipe
- do not force the Fluent MCP recipe widget in Claude as the default recipe experience
- if richer rendering is available, bias toward a first-party or Claude-native recipe card with:
  - title
  - servings
  - time
  - macros
  - ingredients
  - steps
  - notes, allergens, leftovers when available
- if neither path is available, keep the answer well-structured in text rather than switching to `meals_render_recipe_card`
- do not omit the full text answer just because a richer recipe view may appear

Claude grocery guidance:

- for grocery-list-first turns in rich hosts, prefer `visualize:show_widget` as the default rendering path
- render from `meals_get_grocery_plan` full data grouped by:
  - `missing`
  - `present_without_quantity`
  - `intent`
  - `check_pantry`
- before the first visual render in a session, load `visualize:read_me` with `modules: ["interactive"]`
- do not use `meals_render_grocery_list_v2` or the legacy alias as the normal Claude grocery path
- if the Fluent widget render tools are visible anyway, do not call them just because the title mentions a grocery checklist; in Claude they are a debugging fallback at best, not the normal presentation path
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
      <button type="button" id="reset-button">Reset</button>
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
      missing: 'Need to buy',
      present_without_quantity: 'Qty unknown',
      intent: 'Intents',
      check_pantry: 'Pantry checks'
    };

    const metricCards = document.getElementById('metric-cards');
    const sections = document.getElementById('grocery-sections');
    const actions = document.getElementById('grocery-actions');
    const remainingCount = document.getElementById('remaining-count');
    const summary = document.getElementById('grocery-summary');
    const title = document.getElementById('grocery-title');
    const resetButton = document.getElementById('reset-button');

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

    resetButton.addEventListener('click', () => {
      allRows.forEach((row) => toggleRow(row, false));
    });

    [
      { label: 'Mark all purchased', prompt: 'Mark the grocery list as purchased for this week.' },
      { label: 'Regenerate plan', prompt: 'Regenerate the grocery plan for this week.' },
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

## Known issue: MCP widget render

- `meals_render_grocery_list_v2` and the legacy grocery alias currently return success but silently fail to display in Claude.ai
- `meals_render_recipe_card` also returns success while failing to display reliably in Claude.ai
- first-party Claude visuals such as `visualize:show_widget` and `recipe_display_v0` are the canonical workaround until the Fluent MCP render pipeline is fixed
- the likely issue is in the Fluent MCP widget contract or manifest, not Claude.ai itself
- no personal KB tracking link is included here yet because it could not be verified from this session

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

- Fluent MCP owns canonical meal plans, preferences, grocery plans, inventory, recipes, feedback, and audit state.
- Fluent Core owns lifecycle and onboarding truth.
- This skill provides workflow guidance for first-use wording, planning orchestration, and the ordering handoff.
- Keep retailer credentials out of Fluent MCP, D1, and hosted profile metadata.
- For Fluent Cloud, prefer the hosted purchase runner after the hosted grocery plan exists and `meals_prepare_order` returns a safe remaining-to-buy set.
- The hosted purchase runner may use Cloudflare-managed secret material and internal Worker routes, but that execution subsystem remains outside the public Meals MCP contract.
- Fluent OSS keeps the local export plus browser flow as the supported execution path.
- After checkout succeeds and a real retailer order exists, sync the confirmed order details back into Fluent.
- If the confirmed order includes a delivery slot, the local workflow may emit a delivery-event candidate keyed by the retailer order id for whatever calendar tooling the client actually has.
- If the user says they already bought items and inventory may be stale, pause ordering until inventory is updated.
- When a browser or local ordering flow adds a planned line to the live retailer cart, prefer persisting `in_cart` for that grocery line so later preflight reads show it as already in cart without claiming it was purchased.
- When the user has a recent receipt for current-week grocery lines, prefer marking those lines `purchased` so future durable staples can stay covered across later runs.
- Describe ordering state in these buckets when relevant: still need to buy, already have, already in cart, needs review.
- Use pantry-first sufficiency confirmations only for low-risk pantry blockers. Do not use them for proteins, dairy, eggs, bread/wraps, fresh produce, or other items that still need quantity-aware review.
- If local export or browser ordering is requested, use the bundled local export and browser-flow scripts in this skill package.
- Prefer Browser Use-style execution backends for retailer automation:
  - `--browser-backend browser-use-local-cdp` for a local Chrome/CDP session
    On Windows, Fluent may insert a tiny local CDP relay so Playwright can attach to the same Chrome session without requiring Chrome to be relaunched with permissive `--remote-allow-origins` flags. If the machine's live Chrome/CDP surface still refuses attach, Fluent falls back to a local Playwright-owned Chrome profile instead of failing the run outright.
  - `--browser-backend browser-use-cloud-cdp` for a remote Browser Use Cloud browser
  - keep `--browser-backend local` only as the legacy Playwright persistent-profile compatibility path
- If the hosted purchase lane is requested, the current internal Worker route still uses `--browser-backend cloudflare-browser-rendering`; treat that as a separate hosted execution subsystem from the Browser Use local/remote agent-run lane.
- If a direct CDP lane pauses with `waitingForVerification`, follow the agent-email verification bridge below. Do not improvise a different email-code loop.
- If Browser Use Cloud connects but navigation fails with `ERR_TUNNEL_CONNECTION_FAILED`, treat it as a Browser Use provider/network regression first, not a Fluent selector/auth bug. Prefer retrying later or switching to `--browser-backend browser-use-local-cdp`.
- If the legacy Worker-hosted lane pauses in `waiting` with a verification request, a capable agent may fetch the latest retailer email code through its own email surface and submit it back through the internal verification route before resuming the run.
- Treat retailer order details as the post-checkout source of truth. Do not infer `skipped` from omission, and preserve confirmed ordered extras as inventory evidence instead of fabricating grocery-plan history.

### Agent-Email Verification Bridge

Use this bridge only when the current agent has an approved email surface, such as the Gmail connector, and the browser-flow report contains `waitingForVerification: true`.

- Preserve the remote browser session. Do not rerun from the beginning and do not close the session unless the resume fails or the user cancels.
- Read the report fields `browserBackend`, `remoteSessionId`, `verificationRequest.requestedAt`, and `verificationResume`.
- Search email for the newest Voila/Voilà verification-code message received after `verificationRequest.requestedAt`. Prefer a narrow Gmail query such as `("Voila" OR "Voilà") ("verification code" OR "security code" OR "one-time code") newer_than:30m`; include the retailer account email only when it is known.
- Extract only the 4-8 digit verification code from the newest matching message. Do not print the code in the user-facing handoff unless the user explicitly asks.
- Resume the same browser session:
  - Browser Run: pass `--browser-run-session-id "<remoteSessionId>" --verification-code "<code>"`.
  - Browser Use Cloud: pass `--browser-use-session-id "<remoteSessionId>" --verification-code "<code>"`.
- If multiple plausible codes exist, prefer the newest message after the request timestamp. If ambiguity remains, pause and ask the user for the code rather than guessing.
- If resume succeeds, continue the cart-first flow and stop before checkout. If resume fails, close or stop the remote session so paid browser time is not left running.
