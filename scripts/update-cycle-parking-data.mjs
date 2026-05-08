import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceUrl =
  "https://services-eu1.arcgis.com/FgpikkYuSUOuITxp/arcgis/rest/services/Cycle_Parking/FeatureServer/46/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";

const licenceUrl = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
const attribution =
  "Copyright City of Edinburgh Council, contains Ordnance Survey data (c) Crown copyright and database right 2026.";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "src/data/cycle-parking.json");

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanProperty(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value);
}

function pickName(properties, index) {
  const candidates = [
    properties.LOCATION,
    properties.Location,
    properties.location,
    properties.NAME,
    properties.Name,
    properties.name,
    properties.DESCRIPTION,
    properties.Description,
  ];

  const name = candidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );
  return name?.trim() ?? `Cycle parking ${index + 1}`;
}

function normalizeFeature(feature, index) {
  if (
    !isRecord(feature) ||
    !isRecord(feature.geometry) ||
    !Array.isArray(feature.geometry.coordinates)
  ) {
    return null;
  }

  const [longitude, latitude] = feature.geometry.coordinates;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }

  const rawProperties = isRecord(feature.properties) ? feature.properties : {};
  const properties = Object.fromEntries(
    Object.entries(rawProperties).map(([key, value]) => [key, cleanProperty(value)]),
  );
  const rawId = properties.OBJECTID ?? properties.FID ?? feature.id ?? index;

  return {
    id: String(rawId),
    name: pickName(properties, index),
    latitude,
    longitude,
    properties,
  };
}

const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch cycle parking data: ${response.status} ${response.statusText}`);
}

const geojson = await response.json();
if (!isRecord(geojson) || !Array.isArray(geojson.features)) {
  throw new Error("ArcGIS response did not include a GeoJSON features array.");
}

const points = geojson.features
  .map(normalizeFeature)
  .filter(Boolean)
  .sort((left, right) => left.name.localeCompare(right.name));

const dataset = {
  metadata: {
    sourceUrl,
    licenceUrl,
    attribution,
    refreshedAt: new Date().toISOString(),
    recordCount: points.length,
  },
  points,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`);

console.log(`Wrote ${points.length} cycle parking records to ${outputPath}`);
