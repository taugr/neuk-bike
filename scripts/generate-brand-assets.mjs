// Next.js already supplies sharp; this optional asset tool adds no dependency.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const root = new URL('../', import.meta.url);
const asset = (name) => fileURLToPath(new URL(`public/${name}`, root));
const logo = await readFile(asset('favicon.svg'), 'utf8');
const logoBuffer = Buffer.from(logo);

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  let image = sharp(logoBuffer, { density: 192 }).resize(size, size);
  // iOS supplies its own corner mask; avoid black transparent corners.
  if (name === 'apple-touch-icon.png') {
    image = image.flatten({ background: '#027973' });
  }
  await image.png().toFile(asset(name));
}

// A maskable icon's essential artwork fits inside the central 80% circle.
// Scale the complete tile to 76%; the bicycle fits well inside that circle.
const maskableSize = 512;
const safeTile = await sharp(logoBuffer, { density: 192 })
  .resize(390, 390)
  .png()
  .toBuffer();
const maskable = await sharp({
  create: {
    width: maskableSize,
    height: maskableSize,
    channels: 3,
    background: '#027973',
  },
})
  .composite([{ input: safeTile, left: 61, top: 61 }])
  .png()
  .toBuffer();
await sharp(maskable)
  .flatten({ background: '#027973' })
  .png()
  .toFile(asset('icon-maskable-512.png'));

// ICO with real 16/32/48px frames, rather than a renamed single PNG.
const frames = await Promise.all(
  [16, 32, 48].map((size) =>
    sharp(logoBuffer).resize(size, size).png().toBuffer(),
  ),
);
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = [16, 32, 48][index];
  header[entry + 1] = header[entry];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(asset('favicon.ico'), Buffer.concat([header, ...frames]));

// Retain the existing social-card layout; embed the same canonical mark.
const artwork = logo.replace(/<svg[^>]*>/, '').replace('</svg>', '');
const template = await readFile(
  new URL('assets/brand/social-card.svg', root),
  'utf8',
);
const social = template.replace('{{logo}}', artwork);
await writeFile(asset('og-image.svg'), social);
await sharp(Buffer.from(social))
  .flatten({ background: '#f6f8f5' })
  .png()
  .toFile(asset('og-image.png'));
console.log('Generated Bike Neuk favicons, install icons and social preview.');
