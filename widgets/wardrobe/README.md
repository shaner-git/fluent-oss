# Wardrobe widget

The runtime serves the committed React/CSS bundle through both the current Closet resource and the published app's existing v7 resource URI. Tool schemas, permissions and resource metadata stay unchanged. Older cached resource aliases retain their existing renderer.

From this directory, run `npm ci`, then `npm run build` after editing `src/`. `npm run build -- --check` verifies that the committed bundle matches the source without rewriting it. Dependencies are isolated from the runtime package. Third-party license comments are retained in the bundle.

Inline browsing uses bounded pages and a complete widget-only metadata index. Only the visible records' signed photos are hydrated. Fullscreen browsing requires an acknowledged host display-mode change. Item and photo mutations use the existing public operations, with exact readback; ambiguous writes are never replayed automatically. Photo editing replaces the existing main, alternate or fit role; arbitrary photo reorder and deletion are not exposed.

`npm test` runs adapter/model checks in the development repository. Its loopback preview and synthetic fixture are development-only and are not exported or imported by the runtime bundle. Release acceptance additionally requires the exact candidate in the real assistant host.
