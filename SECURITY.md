# Security

Fluent is early-access software with a supported single-user OSS runtime. This page summarizes the security controls that are implemented in this repository today.

## Reporting

Report security issues to `hello@meetfluent.app`. The current support page is `https://meetfluent.app/support`.

## Implemented Controls

- Style image delivery uses signed URLs for stored and remote images. Remote image fetches are normalized through a public URL guard, block localhost/common private numeric ranges, do not follow redirects, require an `image/*` content type, and cap responses at 5 MB.
  <!-- sources: src/style-image-handler.ts; src/domains/style/media.ts -->
- Public Style and Budget writes require `approval="explicit_user_approved"` through `requireExplicitPublicWriteApproval` on seven write tools: `fluent_set_budget_envelope`, `fluent_log_budget_spend`, `fluent_update_style_item_patch`, `fluent_create_style_item`, `fluent_refresh_style_item_profile`, `fluent_set_style_item_image`, and `fluent_archive_item`. Meals recipe, grocery-list-change, grocery-shopping-result, and meal-plan write helpers enforce the same approval value in the vNext write layer.
  <!-- sources: src/mcp-core.ts; src/vnext-write-layer.ts -->
- Hosted public writes and auth endpoints have generous Cloudflare Workers rate-limit bindings for abuse prevention. Public writes are limited to 30 allowed calls per 60 seconds keyed by authenticated `userId` with `tenantId` fallback; a trip returns the MCP tool error `rate limit — try again shortly`. Hosted auth is limited to 20 allowed calls per 60 seconds keyed by `CF-Connecting-IP` on `POST /api/auth/*` and `GET /authorize`; a trip returns HTTP 429 with `Retry-After: 30`. If a binding is absent, the limiter allows the request; the OSS runtime does not configure these bindings and remains single-user/no-op for rate limiting.
  <!-- sources: wrangler.jsonc; src/rate-limits.ts; src/config.ts; src/index.ts; src/mcp-core.ts; src/vnext-write-layer.ts; src/local/server.ts -->
- Hosted OAuth exposes the public hosted scopes (`meals:read`, `meals:write`, `style:read`, `style:write`) plus standard OAuth identity/offline scopes. Shared personal facts are filtered server-side by the `visibleTo` consent predicate, including host-family visibility, before cross-domain or host-facing reads.
  <!-- sources: src/auth.ts; src/better-auth.ts; src/personal-context.ts -->
- The OSS runtime is single-user in v1 and protects `/mcp` with bearer-token auth. `/health` and `/codex-probe` remain open for local/runtime checks.
  <!-- sources: src/local/server.ts; src/local/runtime.ts; docs/oss/README.md -->
- Account deletion supports waitlist-only self-serve deletion and operator-assisted provisioned-account deletion. Data exports are authenticated downloads and carry a 7-day retention/expiry window.
  <!-- sources: docs / cloud / account-deletion.md; src/cloud/user-data-export.ts; src/cloud/user-data-export-routes.ts -->
