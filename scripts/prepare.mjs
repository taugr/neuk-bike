import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import process from 'node:process';
import husky from 'husky';

const mapLibreAssetDirectory = new URL(
  '../public/vendor/maplibre-gl/',
  import.meta.url,
);

mkdirSync(mapLibreAssetDirectory, { recursive: true });

for (const asset of ['maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs']) {
  copyFileSync(
    new URL(`../node_modules/maplibre-gl/dist/${asset}`, import.meta.url),
    new URL(asset, mapLibreAssetDirectory),
  );
}

const skipCommands = new Set(['pack', 'publish']);

if (
  process.env.CI === 'true' ||
  skipCommands.has(process.env.npm_command ?? '') ||
  !existsSync('.git')
) {
  process.exit(0);
}

try {
  husky();
} catch (error) {
  console.warn(error instanceof Error ? error.message : String(error));
}
