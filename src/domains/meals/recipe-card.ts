import type { MealRecipeRecord } from './types';

export const MEALS_RECIPE_CARD_WIDGET_VERSION = 'v7';
export const MEALS_RECIPE_CARD_TEMPLATE_URI = `ui://widget/fluent-recipe-card-${MEALS_RECIPE_CARD_WIDGET_VERSION}.html`;

export interface RecipeCardIngredientViewModel {
  item: string;
  quantity: number | null;
  unit: string | null;
  canonicalItem: string | null;
  orderingPolicy: string | null;
  substitutionContext: string | null;
}

export interface RecipeCardStepViewModel {
  durationMinutes: number | null;
  equipment: string[];
  index: number;
  notes: string | null;
  title: string | null;
  detail: string;
}

export interface RecipeCardMacroViewModel {
  calories: number | null;
  fiberGrams: number | null;
  proteinGrams: number | null;
  sodiumMilligrams: number | null;
}

export interface RecipeCardViewModel {
  activeTimeMinutes: number | null;
  costPerServingCad: number | null;
  id: string;
  ingredientCount: number;
  ingredients: RecipeCardIngredientViewModel[];
  kidFriendly: boolean;
  macros: RecipeCardMacroViewModel | null;
  mealType: string;
  prepNotes: string | null;
  reheatGuidance: string | null;
  servings: number | null;
  servingNotes: string | null;
  slug: string | null;
  status: string;
  stepCount: number;
  steps: RecipeCardStepViewModel[];
  title: string;
  totalTimeMinutes: number | null;
}

export function buildRecipeCardViewModel(recipe: MealRecipeRecord | null): RecipeCardViewModel | null {
  if (!recipe) {
    return null;
  }

  const raw = asRecord(recipe.raw) ?? {};
  const ingredients = asArray(raw.ingredients)
    .map((entry) => normalizeIngredient(entry))
    .filter((entry): entry is RecipeCardIngredientViewModel => entry !== null);
  const steps = asArray(raw.instructions)
    .map((entry, index) => normalizeStep(entry, index))
    .filter((entry): entry is RecipeCardStepViewModel => entry !== null);

  return {
    activeTimeMinutes: asFiniteNumber(raw.active_time),
    costPerServingCad: asFiniteNumber(raw.cost_per_serving_cad),
    id: recipe.id,
    ingredientCount: ingredients.length,
    ingredients,
    kidFriendly: raw.kid_friendly === true,
    macros: normalizeMacros(raw.macros),
    mealType: recipe.mealType,
    prepNotes: asString(raw.prep_notes),
    reheatGuidance: asString(raw.reheat_guidance),
    servings: asFiniteNumber(raw.servings),
    servingNotes: asString(raw.serving_notes),
    slug: recipe.slug,
    status: recipe.status,
    stepCount: steps.length,
    steps,
    title: recipe.name,
    totalTimeMinutes: asFiniteNumber(raw.total_time),
  };
}

export function buildRecipeCardStructuredContent(viewModel: RecipeCardViewModel) {
  return {
    activeTimeMinutes: viewModel.activeTimeMinutes,
    experience: 'recipe_card',
    hasCookMode: viewModel.stepCount > 0,
    ingredientCount: viewModel.ingredientCount,
    mealType: viewModel.mealType,
    recipeCard: viewModel,
    recipeId: viewModel.id,
    servings: viewModel.servings,
    stepCount: viewModel.stepCount,
    title: viewModel.title,
    totalTimeMinutes: viewModel.totalTimeMinutes,
  };
}

export function buildRecipeCardMetadata(viewModel: RecipeCardViewModel) {
  return {
    experience: 'recipe_card',
    recipeCard: viewModel,
    version: MEALS_RECIPE_CARD_WIDGET_VERSION,
  };
}

export function getRecipeCardWidgetHtml(): string {
  return `
<div id="recipe-card-root"></div>
<style>
  :root {
    color-scheme: light;
    --recipe-surface: #ffffff;
    --recipe-surface-alt: #f7f7f8;
    --recipe-ink: #0d0d0d;
    --recipe-ink-soft: #3c3c43;
    --recipe-muted: #6e6e73;
    --recipe-soft: #9a9a9f;
    --recipe-accent: #2f6feb;
    --recipe-border: rgba(0, 0, 0, 0.08);
    --recipe-border-strong: rgba(0, 0, 0, 0.14);
    --recipe-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.06);
    --recipe-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: var(--recipe-sans);
    color: var(--recipe-ink);
    background: transparent;
  }

  button {
    font: inherit;
  }

  .recipe-card {
    border: 1px solid var(--recipe-border);
    border-radius: 16px;
    background: var(--recipe-surface);
    padding: 18px 20px;
    box-shadow: var(--recipe-shadow);
  }

  .recipe-header {
    display: grid;
    gap: 14px;
    padding-bottom: 6px;
  }

  .recipe-header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .recipe-meal-type {
    margin: 0 0 4px;
    font-size: 11px;
    line-height: 1.3;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--recipe-muted);
  }

  .recipe-title {
    margin: 0;
    font-size: 20px;
    line-height: 1.25;
    letter-spacing: -0.01em;
    font-weight: 600;
  }

  .recipe-blurb {
    margin: 0;
    max-width: 60ch;
    color: var(--recipe-ink-soft);
    font-size: 14px;
    line-height: 1.5;
  }

  .recipe-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--recipe-surface-alt);
    margin-bottom: 18px;
  }

  .recipe-stat {
    min-width: 0;
  }

  .recipe-stat-label {
    display: block;
    margin-bottom: 2px;
    font-size: 12px;
    color: var(--recipe-muted);
    font-weight: 500;
    line-height: 1.25;
  }

  .recipe-stat-value {
    font-size: 18px;
    line-height: 1.1;
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .recipe-stat-value em {
    margin-left: 3px;
    font-size: 12px;
    font-style: normal;
    color: var(--recipe-muted);
    font-weight: 400;
  }

  .recipe-cook-mode {
    display: grid;
    gap: 10px;
    margin-top: 16px;
    padding: 14px 16px;
    border-radius: 10px;
    background: var(--recipe-surface);
    border: 1px solid var(--recipe-border);
  }

  .recipe-cook-mode-label {
    margin: 0;
    font-size: 11px;
    line-height: 1.3;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--recipe-muted);
    font-weight: 500;
  }

  .recipe-cook-mode-step {
    display: grid;
    gap: 8px;
  }

  .recipe-cook-mode-meta {
    font-size: 12px;
    line-height: 1.4;
    color: var(--recipe-muted);
  }

  .recipe-cook-mode-title {
    margin: 0;
    font-size: 14px;
    line-height: 1.35;
    font-weight: 600;
    color: var(--recipe-ink);
  }

  .recipe-cook-mode-detail {
    margin: 0;
    font-size: 16px;
    line-height: 1.4;
    color: var(--recipe-ink);
    letter-spacing: -0.01em;
  }

  .recipe-cook-mode-nav {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .recipe-cook-mode-nav button {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: var(--recipe-surface);
    color: var(--recipe-ink-soft);
    border: 1px solid var(--recipe-border);
    cursor: pointer;
  }

  .recipe-cook-mode-nav-label {
    font-size: 12px;
    line-height: 1.4;
    color: var(--recipe-muted);
  }

  .recipe-body {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 28px;
    margin-top: 12px;
  }

  .recipe-column-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .recipe-column-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--recipe-ink);
  }

  .recipe-ingredient-stack {
    display: grid;
    gap: 10px;
  }

  .recipe-unit-toggle {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 10px;
    border: 1px solid var(--recipe-border);
    background: var(--recipe-surface-alt);
  }

  .recipe-unit-toggle button {
    border: 0;
    background: transparent;
    color: var(--recipe-muted);
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.2;
    font-weight: 500;
    cursor: pointer;
  }

  .recipe-unit-toggle button[aria-pressed="true"] {
    background: var(--recipe-surface);
    color: var(--recipe-ink);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  }

  .recipe-servings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .recipe-servings-label {
    font-size: 14px;
    line-height: 1.4;
    color: var(--recipe-muted);
  }

  .recipe-servings {
    display: inline-flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--recipe-border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--recipe-surface);
  }

  .recipe-servings button {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    font-size: 16px;
    line-height: 1;
    color: var(--recipe-ink-soft);
    background: transparent;
    border: 0;
    cursor: pointer;
  }

  .recipe-servings-value {
    min-width: 32px;
    text-align: center;
    font-weight: 600;
    font-size: 13px;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  .recipe-ingredients,
  .recipe-steps {
    display: grid;
    gap: 0;
  }

  .recipe-ingredient {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid var(--recipe-border);
  }

  .recipe-ingredient:first-child {
    border-top: 0;
  }

  .recipe-ingredient-qty {
    font-size: 12px;
    line-height: 1.35;
    color: var(--recipe-ink-soft);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .recipe-ingredient-name {
    font-size: 14px;
    line-height: 1.35;
    color: var(--recipe-ink);
  }

  .recipe-ingredient-note {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--recipe-muted);
  }

  .recipe-step {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
    padding: 10px 0;
    border-top: 1px solid var(--recipe-border);
  }

  .recipe-step:first-child {
    border-top: 0;
  }

  .recipe-step-number {
    display: block;
    color: var(--recipe-muted-soft);
    font-size: 13px;
    line-height: 1.5;
    font-weight: 400;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }

  .recipe-step-title {
    margin-bottom: 2px;
    font-size: 14px;
    font-weight: 600;
    color: var(--recipe-ink);
  }

  .recipe-step-detail {
    font-size: 14px;
    line-height: 1.5;
    color: var(--recipe-ink-soft);
  }

  .recipe-step-time {
    white-space: nowrap;
    font-size: 12px;
    line-height: 1.4;
    color: var(--recipe-muted);
  }

  .recipe-notes {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--recipe-border);
    display: grid;
    gap: 6px;
  }

  .recipe-note {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--recipe-muted);
  }

  .recipe-fallback {
    border-radius: 16px;
    padding: 20px;
    border: 1px solid var(--recipe-border);
    background: var(--recipe-surface);
  }

  .recipe-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--recipe-border);
  }

  .recipe-foot-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 10px;
    border: 1px solid var(--recipe-border);
    background: var(--recipe-surface);
    color: var(--recipe-ink);
    font-size: 14px;
    line-height: 1.2;
    font-weight: 500;
    cursor: default;
  }

  .recipe-foot-button--primary {
    background: var(--recipe-accent);
    color: #fff;
    border-color: rgba(47, 111, 235, 0.2);
  }

  @media (max-width: 760px) {
    .recipe-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .recipe-body {
      grid-template-columns: 1fr;
      gap: 20px;
    }

    .recipe-column-head,
    .recipe-servings-row {
      flex-wrap: wrap;
    }
  }
</style>
<script>
  (function () {
    var root = document.getElementById('recipe-card-root');
    var DEFAULT_STATE = { cookMode: false, currentStep: 0, servings: null, unitSystem: 'metric' };
    var MEAL_LABELS = {
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      dinner: 'Dinner',
      snack: 'Snack'
    };

    function getOpenAI() {
      return window.openai || {};
    }

    function getViewModel() {
      var metadata = getOpenAI().toolResponseMetadata;
      if (metadata && metadata.recipeCard) {
        return metadata.recipeCard;
      }
      var summary = getSummary();
      return summary && summary.recipeCard ? summary.recipeCard : null;
    }

    function getSummary() {
      return getOpenAI().toolOutput || null;
    }

    function getState() {
      var widgetState = getOpenAI().widgetState || {};
      return {
        cookMode: widgetState.cookMode === true,
        currentStep: Number.isFinite(widgetState.currentStep) ? widgetState.currentStep : 0,
        servings: Number.isFinite(widgetState.servings) ? widgetState.servings : null,
        unitSystem: widgetState.unitSystem === 'imperial' ? 'imperial' : 'metric',
      };
    }

    function setState(nextState) {
      getOpenAI().setWidgetState && getOpenAI().setWidgetState(nextState);
      render(nextState);
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function notifyHeight() {
      getOpenAI().notifyIntrinsicHeight && getOpenAI().notifyIntrinsicHeight(document.body.scrollHeight);
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatMealType(value) {
      return MEAL_LABELS[value] || 'Recipe';
    }

    function buildIconPlay() {
      return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3l14 9-14 9V3z"></path></svg>';
    }

    function formatMinutes(value) {
      if (!Number.isFinite(value) || value <= 0) {
        return null;
      }
      if (value < 60) {
        return String(Math.round(value)) + ' min';
      }
      var hours = Math.floor(value / 60);
      var minutes = Math.round(value % 60);
      return minutes > 0 ? hours + ' hr ' + minutes + ' min' : hours + ' hr';
    }

    function formatCurrency(value) {
      if (!Number.isFinite(value)) {
        return null;
      }
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'CAD',
        maximumFractionDigits: 2,
      }).format(value);
    }

    function formatQuantity(value) {
      if (!Number.isFinite(value)) {
        return '';
      }
      var rounded = Math.round(value * 100) / 100;
      return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\\.$/, '');
    }

    function convertUnitSystem(quantity, unit, unitSystem) {
      if (!Number.isFinite(quantity)) {
        return { quantity: quantity, unit: unit };
      }

      var normalizedUnit = String(unit || '').toLowerCase();
      if (unitSystem === 'imperial') {
        if (normalizedUnit === 'g') {
          var ounces = quantity / 28.3495;
          if (ounces >= 16) {
            return { quantity: ounces / 16, unit: 'lb' };
          }
          return { quantity: ounces, unit: 'oz' };
        }
        if (normalizedUnit === 'kg') {
          return { quantity: quantity * 2.20462, unit: 'lb' };
        }
        if (normalizedUnit === 'ml') {
          if (quantity >= 240) {
            return { quantity: quantity / 240, unit: 'cups' };
          }
          return { quantity: quantity / 29.5735, unit: 'fl oz' };
        }
        if (normalizedUnit === 'l') {
          return { quantity: quantity * 4.22675, unit: 'cups' };
        }
        return { quantity: quantity, unit: unit };
      }

      if (normalizedUnit === 'oz') {
        return { quantity: quantity * 28.3495, unit: 'g' };
      }
      if (normalizedUnit === 'lb') {
        return { quantity: quantity * 453.592, unit: 'g' };
      }
      if (normalizedUnit === 'fl oz') {
        return { quantity: quantity * 29.5735, unit: 'ml' };
      }
      if (normalizedUnit === 'cup' || normalizedUnit === 'cups') {
        return { quantity: quantity * 240, unit: 'ml' };
      }
      if (normalizedUnit === 'qt' || normalizedUnit === 'qts') {
        return { quantity: quantity * 946.353, unit: 'ml' };
      }
      return { quantity: quantity, unit: unit };
    }

    function scaleQuantity(quantity, baseServings, currentServings) {
      if (!Number.isFinite(quantity) || !Number.isFinite(baseServings) || baseServings <= 0 || !Number.isFinite(currentServings)) {
        return quantity;
      }
      return quantity * (currentServings / baseServings);
    }

    function buildStats(viewModel, currentServings) {
      var stats = [];
      var totalTime = formatMinutes(viewModel.totalTimeMinutes);
      var activeTime = formatMinutes(viewModel.activeTimeMinutes);
      var price = formatCurrency(viewModel.costPerServingCad);

      if (activeTime) {
        stats.push({ label: 'Active', value: escapeHtml(activeTime), unit: null });
      }
      if (totalTime) {
        stats.push({ label: 'Total', value: escapeHtml(totalTime), unit: null });
      }
      if (Number.isFinite(currentServings)) {
        stats.push({ label: 'Serves', value: escapeHtml(currentServings), unit: null });
      }
      if (price) {
        stats.push({ label: 'Cost', value: escapeHtml(price), unit: '/ea' });
      }

      return [
        '<div class="recipe-stats">',
        stats.slice(0, 4).map(function (stat) {
          return [
            '<div class="recipe-stat">',
            '<span class="recipe-stat-label">' + stat.label + '</span>',
            '<span class="recipe-stat-value">' + stat.value + (stat.unit ? '<em>' + stat.unit + '</em>' : '') + '</span>',
            '</div>',
          ].join('');
        }).join(''),
        '</div>',
      ].join('');
    }

    function deriveIngredientNote(ingredient) {
      if (ingredient.substitutionContext) {
        return ingredient.substitutionContext;
      }
      return null;
    }

    function buildIngredients(viewModel, currentServings, unitSystem) {
      if (!Array.isArray(viewModel.ingredients) || viewModel.ingredients.length === 0) {
        return '<p class="recipe-note">Ingredient detail is not available for this recipe yet.</p>';
      }

      return viewModel.ingredients.map(function (ingredient) {
        var scaledQuantity = scaleQuantity(ingredient.quantity, viewModel.servings, currentServings);
        var converted = convertUnitSystem(scaledQuantity, ingredient.unit, unitSystem);
        var quantityParts = [];
        if (Number.isFinite(converted.quantity)) {
          quantityParts.push(formatQuantity(converted.quantity));
        }
        if (converted.unit) {
          quantityParts.push(converted.unit);
        }
        var note = deriveIngredientNote(ingredient);

        return [
          '<div class="recipe-ingredient">',
          '<span class="recipe-ingredient-qty">' + escapeHtml(quantityParts.join(' ') || '—') + '</span>',
          '<span class="recipe-ingredient-name">' + escapeHtml(ingredient.item) + (note ? '<span class="recipe-ingredient-note">' + escapeHtml(note) + '</span>' : '') + '</span>',
          '</div>',
        ].join('');
      }).join('');
    }

    function buildStepList(viewModel) {
      if (!Array.isArray(viewModel.steps) || viewModel.steps.length === 0) {
        return '<p class="recipe-note">Step-by-step instructions are not available for this recipe yet.</p>';
      }

      return viewModel.steps.map(function (step) {
        var timeLabel = Number.isFinite(step.durationMinutes) ? formatMinutes(step.durationMinutes) : '';
        var stepLabel = String(step.index).padStart(2, '0');
        return [
          '<div class="recipe-step">',
          '<span class="recipe-step-number">' + escapeHtml(stepLabel) + '</span>',
          '<div>',
          '<div class="recipe-step-title">' + escapeHtml(step.title || 'Step ' + step.index) + '</div>',
          '<div class="recipe-step-detail">' + escapeHtml(step.detail) + '</div>',
          '</div>',
          timeLabel ? '<div class="recipe-step-time">' + escapeHtml(timeLabel) + '</div>' : '<div></div>',
          '</div>',
        ].join('');
      }).join('');
    }

    function buildNotes(viewModel) {
      var notes = [];
      var deckCopy = deriveDeckCopy(viewModel);
      if (viewModel.prepNotes) {
        notes.push({ label: 'Prep note', body: viewModel.prepNotes });
      }
      if (viewModel.reheatGuidance) {
        notes.push({ label: 'Reheat', body: viewModel.reheatGuidance });
      }
      if (!notes.length && viewModel.servingNotes) {
        notes.push({ label: 'Serving', body: viewModel.servingNotes });
      }
      if (!notes.length && viewModel.macros) {
        var macroBits = [];
        if (Number.isFinite(viewModel.macros.calories)) {
          macroBits.push('Calories ' + formatQuantity(viewModel.macros.calories));
        }
        if (Number.isFinite(viewModel.macros.proteinGrams)) {
          macroBits.push('Protein ' + formatQuantity(viewModel.macros.proteinGrams) + ' g');
        }
        if (Number.isFinite(viewModel.macros.fiberGrams)) {
          macroBits.push('Fiber ' + formatQuantity(viewModel.macros.fiberGrams) + ' g');
        }
        if (Number.isFinite(viewModel.macros.sodiumMilligrams)) {
          macroBits.push('Sodium ' + formatQuantity(viewModel.macros.sodiumMilligrams) + ' mg');
        }
        if (macroBits.length > 0) {
          notes.push({ label: 'Macros', body: macroBits.join(' • ') });
        }
      }
      return notes.filter(function (note) {
        return note.body !== deckCopy;
      });
    }

    function hasNotes(viewModel) {
      return buildNotes(viewModel).length > 0;
    }

    function renderNotesPanel(viewModel) {
      var notes = buildNotes(viewModel);
      if (!notes.length) {
        return '';
      }

      return [
        '<section class="recipe-notes">',
        notes.map(function (note) {
          return '<p class="recipe-note"><strong>' + escapeHtml(note.label) + ':</strong> ' + escapeHtml(note.body) + '</p>';
        }).join(''),
        '</section>',
      ].join('');
    }

    function deriveDeckCopy(viewModel) {
      if (viewModel.prepNotes) {
        return viewModel.prepNotes;
      }
      if (viewModel.servingNotes) {
        return viewModel.servingNotes;
      }
      if (viewModel.stepCount > 0) {
        return 'Saved recipe details with scaled ingredients and a step-by-step method.';
      }
      return 'Saved recipe details and scaled ingredients.';
    }

    function buildCookMode(viewModel, state) {
      if (!Array.isArray(viewModel.steps) || viewModel.steps.length === 0) {
        return '';
      }

      var currentIndex = clamp(state.currentStep || 0, 0, viewModel.steps.length - 1);
      var currentStep = viewModel.steps[currentIndex];
      var metaBits = [];
      if (Number.isFinite(currentStep.durationMinutes)) {
        metaBits.push(formatMinutes(currentStep.durationMinutes));
      }
      if (Array.isArray(currentStep.equipment) && currentStep.equipment.length > 0) {
        metaBits.push('Equipment: ' + currentStep.equipment.join(', '));
      }
      if (currentStep.notes) {
        metaBits.push(currentStep.notes);
      }

      return [
        '<section class="recipe-cook-mode">',
        '<p class="recipe-cook-mode-label">Cook mode</p>',
        '<div class="recipe-cook-mode-step">',
        '<div class="recipe-cook-mode-meta">Step ' + escapeHtml(currentStep.index) + ' of ' + escapeHtml(viewModel.steps.length) + '</div>',
        currentStep.title ? '<h3 class="recipe-cook-mode-title">' + escapeHtml(currentStep.title) + '</h3>' : '',
        '<p class="recipe-cook-mode-detail">' + escapeHtml(currentStep.detail) + '</p>',
        metaBits.length > 0 ? '<div class="recipe-cook-mode-meta">' + escapeHtml(metaBits.join(' • ')) + '</div>' : '',
        '</div>',
        '<div class="recipe-cook-mode-nav">',
        '<button type="button" data-action="prev-step" aria-label="Previous step">←</button>',
        '<button type="button" data-action="next-step" aria-label="Next step">→</button>',
        '<span class="recipe-cook-mode-nav-label">Stay in cook mode while you work through the steps.</span>',
        '</div>',
        '</section>',
      ].join('');
    }

    function renderFallback(summary) {
      var title = summary && summary.title ? summary.title : 'Recipe card';
      var description = summary && summary.recipeId
        ? 'The recipe summary loaded, but the richer widget payload is still syncing.'
        : 'Recipe card data is still loading.';

      root.innerHTML = [
        '<article class="recipe-fallback">',
        '<p class="recipe-meal-type">Recipe</p>',
        '<h1 class="recipe-title">' + escapeHtml(title) + '</h1>',
        '<p class="recipe-blurb">' + escapeHtml(description) + '</p>',
        '</article>',
      ].join('');
      notifyHeight();
    }

    function bindClick(selector, handler) {
      var element = root.querySelector(selector);
      if (element) {
        element.addEventListener('click', handler);
      }
    }

    function bindActions(viewModel, state) {
      bindClick('[data-action="servings-down"]', function () {
        if (!Number.isFinite(viewModel.servings) || viewModel.servings <= 1) {
          return;
        }
        var nextServings = Math.max(1, Number.isFinite(state.servings) ? state.servings - 1 : viewModel.servings - 1);
        setState({
          cookMode: state.cookMode,
          currentStep: state.currentStep,
          servings: nextServings,
          unitSystem: state.unitSystem,
        });
      });

      bindClick('[data-action="servings-up"]', function () {
        if (!Number.isFinite(viewModel.servings)) {
          return;
        }
        var nextServings = Number.isFinite(state.servings) ? state.servings + 1 : viewModel.servings + 1;
        setState({
          cookMode: state.cookMode,
          currentStep: state.currentStep,
          servings: nextServings,
          unitSystem: state.unitSystem,
        });
      });

      bindClick('[data-action="unit-metric"]', function () {
        setState({
          cookMode: state.cookMode,
          currentStep: state.currentStep,
          servings: state.servings,
          unitSystem: 'metric',
        });
      });

      bindClick('[data-action="unit-imperial"]', function () {
        setState({
          cookMode: state.cookMode,
          currentStep: state.currentStep,
          servings: state.servings,
          unitSystem: 'imperial',
        });
      });

      bindClick('[data-action="toggle-cook-mode"]', function () {
        setState({
          cookMode: !state.cookMode,
          currentStep: state.currentStep,
          servings: state.servings,
          unitSystem: state.unitSystem,
        });
      });

      bindClick('[data-action="next-step"]', function () {
        setState({
          cookMode: true,
          currentStep: clamp(state.currentStep + 1, 0, viewModel.steps.length - 1),
          servings: state.servings,
          unitSystem: state.unitSystem,
        });
      });

      bindClick('[data-action="prev-step"]', function () {
        setState({
          cookMode: true,
          currentStep: clamp(state.currentStep - 1, 0, viewModel.steps.length - 1),
          servings: state.servings,
          unitSystem: state.unitSystem,
        });
      });
    }

    function render(overrideState) {
      var viewModel = getViewModel();
      var summary = getSummary();

      if (!viewModel) {
        renderFallback(summary);
        return;
      }

      var state = overrideState || getState();
      var currentServings = Number.isFinite(state.servings) ? state.servings : viewModel.servings;
      var stats = buildStats(viewModel, currentServings);
      var notesPanel = hasNotes(viewModel) ? renderNotesPanel(viewModel) : '';
      var unitToggle = [
        '<div class="recipe-unit-toggle" role="tablist" aria-label="Ingredient units">',
        '<button type="button" data-action="unit-imperial" aria-pressed="' + escapeHtml(state.unitSystem === 'imperial') + '">Imperial</button>',
        '<button type="button" data-action="unit-metric" aria-pressed="' + escapeHtml(state.unitSystem !== 'imperial') + '">Metric</button>',
        '</div>',
      ].join('');
      var servingsControl = Number.isFinite(viewModel.servings)
        ? [
            '<div class="recipe-servings">',
            '<button type="button" data-action="servings-down" aria-label="Decrease servings">−</button>',
            '<span class="recipe-servings-value">' + escapeHtml(currentServings) + '</span>',
            '<button type="button" data-action="servings-up" aria-label="Increase servings">+</button>',
            '</div>',
          ].join('')
        : '';
      var deck = deriveDeckCopy(viewModel);

      root.innerHTML = [
        '<article class="recipe-card">',
        '<section class="recipe-header">',
        '<div class="recipe-header-top">',
        '<div>',
        '<p class="recipe-meal-type">' + escapeHtml(formatMealType(viewModel.mealType)) + '</p>',
        '<h1 class="recipe-title">' + escapeHtml(viewModel.title) + '</h1>',
        '</div>',
        '</div>',
        '<p class="recipe-blurb">' + escapeHtml(deck) + '</p>',
        stats,
        '</section>',
        state.cookMode ? buildCookMode(viewModel, state) : '',
        '<section class="recipe-body">',
        '<div>',
        '<div class="recipe-ingredient-stack">',
        '<div class="recipe-column-head">',
        '<h2 class="recipe-column-title">Ingredients</h2>',
        unitToggle,
        '</div>',
        '<div class="recipe-servings-row">',
        '<span class="recipe-servings-label">Servings</span>',
        servingsControl,
        '</div>',
        '</div>',
        '<div class="recipe-ingredients">' + buildIngredients(viewModel, currentServings, state.unitSystem) + '</div>',
        '</div>',
        '<div>',
        '<div class="recipe-column-head">',
        '<h2 class="recipe-column-title">Method</h2>',
        '</div>',
        '<div class="recipe-steps">' + buildStepList(viewModel) + '</div>',
        '</div>',
        '</section>',
        notesPanel,
        '<div class="recipe-foot">',
        '<button type="button" class="recipe-foot-button recipe-foot-button--primary" data-action="toggle-cook-mode">' + buildIconPlay() + '<span>' + escapeHtml(state.cookMode ? 'Back to overview' : (viewModel.stepCount > 0 ? 'Start cook mode' : 'View recipe')) + '</span></button>',
        '</div>',
        '</article>',
      ].join('');

      bindActions(viewModel, state);
      notifyHeight();
    }

    window.addEventListener('openai:set_globals', function () {
      render();
    }, { passive: true });

    window.addEventListener('message', function (event) {
      if (event.source !== window.parent) {
        return;
      }

      var message = event.data;
      if (!message || message.jsonrpc !== '2.0') {
        return;
      }

      if (message.method === 'ui/notifications/tool-result' || message.method === 'ui/notifications/tool-input') {
        render();
      }
    }, { passive: true });

    render(DEFAULT_STATE);
  })();
</script>
  `.trim();
}

function normalizeIngredient(input: unknown): RecipeCardIngredientViewModel | null {
  const record = asRecord(input);
  if (!record) {
    return null;
  }

  const item = asString(record.item) ?? asString(record.canonical_item);
  if (!item) {
    return null;
  }

  return {
    canonicalItem: asString(record.canonical_item),
    item,
    orderingPolicy: asString(record.ordering_policy),
    quantity: asFiniteNumber(record.quantity),
    substitutionContext: asString(record.substitution_context),
    unit: asString(record.unit),
  };
}

function normalizeStep(input: unknown, index: number): RecipeCardStepViewModel | null {
  if (typeof input === 'string' && input.trim()) {
    return {
      detail: input.trim(),
      durationMinutes: null,
      equipment: [],
      index: index + 1,
      notes: null,
      title: null,
    };
  }

  const record = asRecord(input);
  if (!record) {
    return null;
  }

  const detail = asString(record.detail);
  if (!detail) {
    return null;
  }

  return {
    detail,
    durationMinutes: asFiniteNumber(record.duration_minutes),
    equipment: asStringArray(record.equipment),
    index: asFiniteNumber(record.step_number) ?? index + 1,
    notes: asString(record.notes),
    title: asString(record.title),
  };
}

function normalizeMacros(input: unknown): RecipeCardMacroViewModel | null {
  const record = asRecord(input);
  if (!record) {
    return null;
  }

  const macros: RecipeCardMacroViewModel = {
    calories: asFiniteNumber(record.calories),
    fiberGrams: asFiniteNumber(record.fiber_g),
    proteinGrams: asFiniteNumber(record.protein_g),
    sodiumMilligrams: asFiniteNumber(record.sodium_mg),
  };

  return Object.values(macros).some((value) => value !== null) ? macros : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}
