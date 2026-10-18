import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parkingModelCatalog,
  resolveParkingModelType,
} from '../src/lib/parking-model-catalog.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(root, 'output/parking-model-gallery');
await mkdir(destination, { recursive: true });
for (const [source, target] of [
  ['parking-model-mesh', 'mesh'],
  ['parking-model-catalog', 'catalog'],
  ['parking-model-shaders', 'shaders'],
]) {
  const code = await readFile(resolve(root, `src/lib/${source}.ts`), 'utf8');
  await writeFile(
    resolve(destination, `${target}.js`),
    stripTypeScriptTypes(code),
  );
}
await copyFile(
  resolve(root, 'scripts/parking-model-gallery.html'),
  resolve(destination, 'index.html'),
);
const manifest = JSON.parse(
  await readFile(resolve(root, 'public/data/parking/manifest.json'), 'utf8'),
);
const counts = new Map();
for (const chunk of Object.values(manifest.chunks)) {
  const data = JSON.parse(
    await readFile(resolve(root, 'public/data/parking', chunk.path), 'utf8'),
  );
  for (const point of Array.isArray(data) ? data : data.points) {
    const type = point.properties.bicycle_pa;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
}
let total = 0,
  modeled = 0,
  unspecified = 0;
const unmapped = [];
for (const [type, count] of counts) {
  total += count;
  if (resolveParkingModelType(type)) modeled += count;
  else if (!type?.trim()) unspecified += count;
  else unmapped.push({ type, count });
}
const report = {
  families: parkingModelCatalog.length,
  total,
  modeled,
  unspecified,
  unmapped: unmapped.sort((a, b) => b.count - a.count),
};
await writeFile(
  resolve(destination, 'coverage.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
console.log(`Gallery written to ${destination}`);
console.log(
  'Serve with: python3 -m http.server 4190 --bind 127.0.0.1 --directory output/parking-model-gallery',
);
