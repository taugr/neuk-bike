# Bike Neuk artwork

`approved-original.png` is the accepted clear bicycle concept from Library
`libfile_6c24ac7f64ec81919342e133b0e56618` (version 0). It is the visual reference,
not a runtime asset. Do not substitute the route concept or an earlier icon.

`public/favicon.svg` is the canonical production vector. Its tile and bicycle
contours were traced from the original, with small edge noise smoothed for icon
rendering. The reference's presentation canvas, texture and external shadow
are omitted; the silhouette, proportions, cream `#fef8ef` and teal `#027973`
are retained. The tile has transparent outer corners.

Run `pnpm generate:brand` to regenerate the PNG, multi-size ICO and social card
from this vector and `assets/brand/social-card.svg`. It uses sharp supplied by the existing Next.js installation.
Inspect the results whenever the source is changed; generated files are committed.

The Apple touch icon is opaque so iOS can apply its own mask. The maskable icon
uses an opaque teal canvas with the complete tile scaled to 76%, keeping the
essential bicycle within the central 80% diameter safe circle. Other icons
retain alpha. The same artwork works on both existing light and dark themes.

All runtime brand URLs use `bicycle-1`. Change that version in layout, finder,
manifest and service worker together if the artwork changes. Also bump the
runtime app-shell cache, preserving the separate offline-area cache.
