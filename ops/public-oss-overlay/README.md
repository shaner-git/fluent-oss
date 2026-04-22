# Public OSS Overlay

This folder defines the public export boundary and scrub policy inputs for Fluent OSS.

- `public-artifact-boundary.json` is the machine-readable list of public roots scanned by `npm run check:public-scrub`
- keep internal-only material outside those roots until it is intentionally exported
