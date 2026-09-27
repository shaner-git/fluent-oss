import { isStyleFitPhoto } from './helpers';
import type { StyleClosetItemViewModel } from './closet-manager';
import type { StylePhotoRecord } from './types';

/** Keep the selected display/source/context first, then expose other retained source photos.
 * Generated candidates remain subject to the existing Catalog/owner-context gates. */
export async function appendRetainedWardrobeMedia(
  existing: StyleClosetItemViewModel['media'],
  photos: StylePhotoRecord[],
  resolve: {
    resolveOwnedMediaUrl?: ((photoId: string) => Promise<string | null>) | null;
    resolveRemoteMediaUrl?: ((sourceUrl: string) => Promise<string | null>) | null;
  },
): Promise<StyleClosetItemViewModel['media']> {
  const seen = new Set(existing.map(photo => photo.id));
  const additional: StyleClosetItemViewModel['media'] = [];
  for (const photo of photos) {
    if (seen.has(photo.id) || photo.source === 'generated_metadata') continue;
    seen.add(photo.id);
    let url: string | null = null;
    try {
      url = photo.artifactAvailable
        ? await resolve.resolveOwnedMediaUrl?.(photo.id) ?? null
        : photo.sourceUrl ? await resolve.resolveRemoteMediaUrl?.(photo.sourceUrl) ?? null : null;
    } catch { /* An unavailable photo must not prevent browsing the rest of the item. */ }
    if (!url) continue;
    const fit = isStyleFitPhoto(photo);
    additional.push({
      id: photo.id, url, artifactBacked: photo.artifactAvailable === true,
      backgroundRemoved: photo.bgRemoved, source: photo.source,
      label: fit ? 'On you' : 'Original', isSourceEvidence: true,
      contextualRole: fit ? 'worn_source' : 'none', heroEligible: false,
    });
  }
  return [...existing, ...additional];
}
