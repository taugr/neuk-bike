import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const datasetPath = path.join(projectRoot, "src/data/cycle-parking.json");
const outputRoot = path.join(projectRoot, "out");
const parkingOutputRoot = path.join(outputRoot, "parking");
const siteUrl = "https://tom-auger.github.io";
const sitePath = "/edinburgh-cycle-parking";
const siteTitle = "Edinburgh Cycle Parking";
const socialImage = `${siteUrl}${sitePath}/og-image.png`;
const assetBasePath = process.env.GITHUB_PAGES === "true" ? sitePath : "";

function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatCapacity(value) {
  return typeof value === "number" && value > 0 ? `${value} spaces` : "Not listed";
}

function formatCovered(value) {
  if (value === "yes") {
    return "Covered";
  }

  if (value === "no") {
    return "Not covered";
  }

  return "Not listed";
}

function describeParkingPoint(point) {
  const capacity = formatCapacity(point.properties.capacity);
  const kind = normalizeText(point.properties.bicycle_pa) ?? "type not listed";
  const covered = formatCovered(point.properties.covered);
  const details = [capacity, kind];

  if (covered !== "Not listed") {
    details.push(covered.toLowerCase());
  }

  return details.join(", ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildSharePage(point) {
  const encodedId = encodeURIComponent(point.id);
  const title = `${point.name} | ${siteTitle}`;
  const description = `${describeParkingPoint(point)}. Find this cycle parking stand in Edinburgh.`;
  const shareUrl = `${siteUrl}${sitePath}/parking/${encodedId}/`;
  const appUrl = `${assetBasePath}/?parking=${encodedId}`;
  const canonicalUrl = `${siteUrl}${sitePath}/?parking=${encodedId}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="noindex, follow">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(shareUrl)}">
    <meta property="og:site_name" content="${escapeHtml(siteTitle)}">
    <meta property="og:locale" content="en_GB">
    <meta property="og:image" content="${escapeHtml(socialImage)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Edinburgh Cycle Parking map preview">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(socialImage)}">
    <meta http-equiv="refresh" content="0; url=${escapeHtml(appUrl)}">
  </head>
  <body>
    <p><a href="${escapeHtml(appUrl)}">Open this parking stand</a></p>
  </body>
</html>
`;
}

async function main() {
  const dataset = JSON.parse(await readFile(datasetPath, "utf8"));

  await rm(parkingOutputRoot, { force: true, recursive: true });

  await Promise.all(
    dataset.points.map(async (point) => {
      const parkingPageDir = path.join(parkingOutputRoot, encodeURIComponent(point.id));
      await mkdir(parkingPageDir, { recursive: true });
      await writeFile(path.join(parkingPageDir, "index.html"), buildSharePage(point));
    }),
  );

  console.log(`Generated ${dataset.points.length} parking share pages.`);
}

await main();
