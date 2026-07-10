import { BUDGETS_ENVELOPE_SETUP_TEMPLATE_URI } from './domains/budgets/envelope-setup';
import { MEALS_GROCERY_LIST_PUBLIC_TEMPLATE_URI } from './domains/meals/grocery-list';
import { STYLE_CLOSET_TEMPLATE_URI } from './domains/style/closet-manager';

export const FLUENT_PUBLIC_CONTRACT_VERSION = '2026-07-09.fluent-core-v2.0';

export const FLUENT_PUBLIC_TOOL_NAMES = [
  'fluent_get_capabilities',
  'fluent_get_account_status',
  'fluent_get_context',
  'fluent_get_shared_profile',
  'fluent_update_shared_profile_patch',
  'fluent_list_items',
  'fluent_get_item',
  'fluent_save_recipe',
  'fluent_update_recipe_patch',
  'fluent_record_recipe_feedback',
  'fluent_save_meal_plan',
  'fluent_apply_grocery_list_change',
  'fluent_apply_grocery_shopping_result',
  'fluent_get_purchase_context',
  'fluent_set_budget_envelope',
  'fluent_log_budget_spend',
  'fluent_update_style_item_patch',
  'fluent_create_style_item',
  'fluent_refresh_style_item_profile',
  'fluent_set_style_item_image',
  'fluent_archive_item',
  'fluent_list_evidence',
  'fluent_get_media_bundle',
  'fluent_render_surface',
  'fluent_render_budgets_surface',
  'fluent_render_style_closet_surface',
] as const;

export const FLUENT_PUBLIC_RESOURCE_URIS = [
  MEALS_GROCERY_LIST_PUBLIC_TEMPLATE_URI,
  BUDGETS_ENVELOPE_SETUP_TEMPLATE_URI,
  STYLE_CLOSET_TEMPLATE_URI,
] as const;

export const FLUENT_PUBLIC_WRITE_TOOL_NAMES = [
  'fluent_update_shared_profile_patch',
  'fluent_save_recipe',
  'fluent_update_recipe_patch',
  'fluent_record_recipe_feedback',
  'fluent_save_meal_plan',
  'fluent_apply_grocery_list_change',
  'fluent_apply_grocery_shopping_result',
  'fluent_set_budget_envelope',
  'fluent_log_budget_spend',
  'fluent_update_style_item_patch',
  'fluent_create_style_item',
  'fluent_refresh_style_item_profile',
  'fluent_set_style_item_image',
  'fluent_archive_item',
] as const;

export const FLUENT_PUBLIC_RENDER_ADAPTERS = [
  'fluent_render_surface',
  'fluent_render_budgets_surface',
  'fluent_render_style_closet_surface',
] as const;

export const FLUENT_PUBLIC_OPTIONAL_CAPABILITIES = [
  'structured_content',
  'shared_context',
  'provenance',
  'read_after_write',
  'meals_planning',
  'recipe_management',
  'grocery_list',
  'grocery_shopping_reconcile',
  'budget_envelopes',
  'style_closet',
  'style_media',
  'mcp_apps',
] as const;

export const FLUENT_PUBLIC_PROFILE_POLICY =
  'One product-safe Fluent profile is exposed by hosted and open-source /mcp. It supports Meals, Style, and narrow manual budget envelopes; Health and Wellbeing remain reserved. Writes require explicit user intent and read-after-write proof. Browser execution, retailer checkout, product-page extraction, raw financial data, medical decisions, and operator tooling are not part of the public contract.';

export function fluentPublicProfile() {
  return {
    contractVersion: FLUENT_PUBLIC_CONTRACT_VERSION,
    tools: [...FLUENT_PUBLIC_TOOL_NAMES],
    resources: [...FLUENT_PUBLIC_RESOURCE_URIS],
    writeTools: [...FLUENT_PUBLIC_WRITE_TOOL_NAMES],
    renderAdapters: [...FLUENT_PUBLIC_RENDER_ADAPTERS],
  } as const;
}
