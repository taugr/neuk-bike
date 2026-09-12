import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(
    new URL('../node_modules/maplibre-gl/package.json', import.meta.url),
    'utf8',
  ),
);
// The worker imports its shared module relatively. Version the directory so
// both URLs change together, including in an already installed PWA's cache.
const directory = new URL(
  `../public/vendor/maplibre-gl/${version}/`,
  import.meta.url,
);
mkdirSync(directory, { recursive: true });
for (const asset of ['maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs']) {
  copyFileSync(
    new URL(`../node_modules/maplibre-gl/dist/${asset}`, import.meta.url),
    new URL(asset, directory),
  );
}
