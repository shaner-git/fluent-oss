import { STYLE_CLOSET_TEMPLATE_URI } from './domains/style/closet-manager';

export const FLUENT_PUBLIC_CONTRACT_VERSION = '2026-10-08.fluent-core-v2.3';

export const FLUENT_PUBLIC_TOOL_NAMES = [
  'fluent_get_capabilities',
  'fluent_get_account_status',
  'fluent_get_account',
  'fluent_get_closet_context',
  'fluent_get_profile',
  'fluent_update_profile',
  'fluent_list_closet_items',
  'fluent_get_closet_item',
  'fluent_update_closet_item',
  'fluent_set_closet_item_cover',
  'fluent_reorder_closet_item_photos',
  'fluent_hide_closet_item_photo',
  'fluent_replace_closet_item_photo',
  'fluent_undo_closet_item_photo_change',
  'fluent_add_closet_item_photo',
  'fluent_restore_closet_item',
  'fluent_merge_closet_items',
  'fluent_save_closet_item_product_details',
  'fluent_undo_closet_item_merge',
  'fluent_add_closet_item',
  'fluent_record_closet_item_feedback',
  'fluent_set_closet_item_photo',
  'fluent_archive_closet_item',
  'fluent_list_closet_evidence',
  'fluent_get_closet_item_photos',
  'fluent_show_closet',
] as const;

// Only the stable current Closet resource is public. The frozen closet-manager templates (v8, v20-v27,
// v33, the v34 alias) and the v7 alias call tool names removed in contract 2026-10-08.fluent-core-v2.3,
// so they were dropped from the public profile; their source stays for byte-pinned source tests.
export const FLUENT_PUBLIC_RESOURCE_URIS = [
  STYLE_CLOSET_TEMPLATE_URI,
] as const;

export const FLUENT_PUBLIC_WRITE_TOOL_NAMES = [
  'fluent_update_profile',
  'fluent_update_closet_item',
  'fluent_set_closet_item_cover',
  'fluent_reorder_closet_item_photos',
  'fluent_hide_closet_item_photo',
  'fluent_replace_closet_item_photo',
  'fluent_undo_closet_item_photo_change',
  'fluent_add_closet_item_photo',
  'fluent_restore_closet_item',
  'fluent_merge_closet_items',
  'fluent_save_closet_item_product_details',
  'fluent_undo_closet_item_merge',
  'fluent_add_closet_item',
  'fluent_record_closet_item_feedback',
  'fluent_set_closet_item_photo',
  'fluent_archive_closet_item',
] as const;

export const FLUENT_PUBLIC_RENDER_ADAPTERS = [
  'fluent_show_closet',
] as const;

export const FLUENT_PUBLIC_OPTIONAL_CAPABILITIES = [
  'structured_content',
  'shared_context',
  'provenance',
  'read_after_write',
  'style_closet',
  'style_media',
  'mcp_apps',
] as const;

export const FLUENT_PUBLIC_PROFILE_POLICY =
  'One product-safe Fluent profile is exposed by hosted and open-source /mcp. It supports Style; Meals, Health, Wellbeing and budgets are retired. Writes require explicit user intent and read-after-write proof. Browser execution, retailer checkout, product-page extraction, raw financial data, medical decisions, and operator tooling are not part of the public contract.';

export function fluentPublicProfile() {
  return {
    contractVersion: FLUENT_PUBLIC_CONTRACT_VERSION,
    tools: [...FLUENT_PUBLIC_TOOL_NAMES],
    resources: [...FLUENT_PUBLIC_RESOURCE_URIS],
    writeTools: [...FLUENT_PUBLIC_WRITE_TOOL_NAMES],
    renderAdapters: [...FLUENT_PUBLIC_RENDER_ADAPTERS],
  } as const;
}
