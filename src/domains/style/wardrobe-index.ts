import type { StyleItemRecord } from './types';

/** Widget-only search metadata: no photos, private notes, signed URLs or profile evidence. */
export interface WardrobeIndexItem {
  id: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  size: string | null;
  colour: string | null;
  createdAt: string | null;
}

export function buildWardrobeIndex(items: readonly StyleItemRecord[]): WardrobeIndexItem[] {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    brand: item.brand,
    category: item.category,
    subcategory: item.subcategory,
    size: item.size,
    colour: item.colorFamily ?? item.colorName ?? null,
    createdAt: item.createdAt ?? null,
  }));
}

// Keep this out of structuredContent and its published output schema. The render tool
// attaches it to _meta for the widget, without hydrating every garment's media.
const indexes = new WeakMap<object, WardrobeIndexItem[]>();
export function rememberWardrobeIndex(result: object, items: readonly StyleItemRecord[]): void {
  indexes.set(result, buildWardrobeIndex(items));
}
export function wardrobeIndexFor(result: object): WardrobeIndexItem[] | undefined {
  return indexes.get(result);
}
