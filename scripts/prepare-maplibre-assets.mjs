import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(
    new URL('../node_modules/maplibre-gl/package.json', import.meta.url),
    'utf8',
  ),
);
// Version the self-contained worker so an already installed PWA never reuses
// a worker cached for a previous MapLibre release.
const directory = new URL(
  `../public/vendor/maplibre-gl/${version}/`,
  import.meta.url,
);
mkdirSync(directory, { recursive: true });
for (const asset of ['maplibre-gl-worker.mjs']) {
  copyFileSync(
    new URL(`../node_modules/maplibre-gl/dist/${asset}`, import.meta.url),
    new URL(asset, directory),
  );
}
