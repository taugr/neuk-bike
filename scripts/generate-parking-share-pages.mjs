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
const assetBasePath = process.env.GITHUB_PAGES === "true" ? sitePath : "";
const socialImageWidth = 1200;
const socialImageHeight = 630;

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

function formatTypeLabel(value) {
  return value.replaceAll(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getCapacityTone(value) {
  if (typeof value !== "number" || value <= 0) {
    return "neutral";
  }

  if (value <= 4) {
    return "amber";
  }

  if (value <= 10) {
    return "teal";
  }

  return "green";
}

function formatCapacityDetail(value) {
  if (typeof value !== "number" || value <= 0) {
    return null;
  }

  return {
    emphasis: String(value),
    icon: "parking",
    label: "Spaces",
    tone: getCapacityTone(value),
    value: "Spaces",
  };
}

function formatStandType(value) {
  const type = normalizeText(value);

  if (!type) {
    return null;
  }

  if (["stands", "wide_stands", "staple", "hoop", "post_hoop"].includes(type)) {
    return {
      icon: "stand",
      label: "Type",
      tone: "teal",
      value: formatTypeLabel(type),
    };
  }

  if (["rack", "racks"].includes(type)) {
    return {
      icon: "parking",
      label: "Type",
      tone: "teal",
      value: formatTypeLabel(type),
    };
  }

  if (["shed", "building", "lockers", "streetpod"].includes(type)) {
    return {
      icon: type === "building" ? "building" : "storage",
      label: "Type",
      tone: "green",
      value: formatTypeLabel(type),
    };
  }

  if (["wall_loops", "anchors", "ground_slots", "front_wheel", "vertical_stand"].includes(type)) {
    return {
      icon: "fixture",
      label: "Type",
      tone: "amber",
      value: formatTypeLabel(type),
    };
  }

  return {
    icon: "unknown",
    label: "Type",
    tone: "neutral",
    value: formatTypeLabel(type),
  };
}

function formatCoverDetail(value) {
  if (value === "yes") {
    return {
      icon: "covered",
      label: "Cover",
      tone: "green",
      value: "Covered",
    };
  }

  if (value === "no") {
    return {
      icon: "not-covered",
      label: "Cover",
      tone: "muted",
      value: "Not covered",
    };
  }

  return null;
}

function formatAccessDetail(value) {
  const access = normalizeText(value);

  if (!access || access === "unknown") {
    return null;
  }

  if (["yes", "permissive", "destination"].includes(access)) {
    return {
      icon: "access-open",
      label: "Access",
      tone: "green",
      value: access === "yes" ? "Public access" : formatTypeLabel(access),
    };
  }

  if (["private", "employees", "permit", "residents"].includes(access)) {
    return {
      icon: "restricted",
      label: "Access",
      tone: "restricted",
      value: formatTypeLabel(access),
    };
  }

  if (access === "customers") {
    return {
      icon: "customer",
      label: "Access",
      tone: "amber",
      value: "Customers",
    };
  }

  if (access === "university") {
    return {
      icon: "university",
      label: "Access",
      tone: "teal",
      value: "University",
    };
  }

  return {
    icon: "unknown",
    label: "Access",
    tone: "neutral",
    value: formatTypeLabel(access),
  };
}

function getParkingPopupDetails(point) {
  return [
    formatCapacityDetail(point.properties.capacity),
    formatStandType(point.properties.bicycle_pa),
    formatCoverDetail(point.properties.covered),
    formatAccessDetail(point.properties.access),
  ].filter((detail) => detail !== null);
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

function wrapText(value, maxLineLength, maxLines) {
  const words = String(value).replaceAll(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maxLineLength) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;

    if (lines.length === maxLines) {
      break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\.*$/, "")}...`;
  }

  return lines;
}

function wrapSvgText(value, maxLineLength, maxLines) {
  return wrapText(value, maxLineLength, maxLines);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildDetailIcon(detail) {
  if (detail.emphasis) {
    return `<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="50" font-weight="850">${escapeHtml(detail.emphasis)}</text>`;
  }

  const iconPath = (() => {
    switch (detail.icon) {
      case "access-open":
        return '<path d="M-14 -2v-9a9 9 0 0 1 17 -4" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/><rect x="-13" y="-2" width="26" height="20" rx="4" stroke="currentColor" stroke-width="4" fill="none"/>';
      case "building":
        return '<path d="M-12 15v-30h24v30M-4 -7h2M6 -7h2M-4 2h2M6 2h2M-16 15h32" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
      case "covered":
        return '<path d="M-17 -2a17 17 0 0 1 34 0H-17ZM0 -19v34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
      case "customer":
        return '<path d="M-12 -5h24l-2 20h-20l-2 -20ZM-6 -5a6 6 0 0 1 12 0" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
      case "fixture":
        return '<path d="M-13 -9h26v18h-26zM-13 0h26M0 -9v18" stroke="currentColor" stroke-width="4" stroke-linejoin="round" fill="none"/>';
      case "not-covered":
        return '<path d="M-17 -2a17 17 0 0 1 34 0H-17ZM0 -19v34M-17 -17l34 34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
      case "parking":
        return '<path d="M-10 15v-30h10a10 10 0 1 1 0 20h-10" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
      case "restricted":
        return '<path d="M-11 -2v-8a11 11 0 0 1 22 0v8M-14 -2h28v20h-28z" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
      case "stand":
        return '<circle cx="-12" cy="8" r="9" stroke="currentColor" stroke-width="4" fill="none"/><circle cx="13" cy="8" r="9" stroke="currentColor" stroke-width="4" fill="none"/><path d="M-12 8h10l9 -17h-11l-5 17M-1 8h14M7 -9l6 17M-6 -9h-5M7 -9l-1 -7M4 -16h8" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
      case "storage":
        return '<path d="M-17 15v-22l17 -10 17 10v22M-8 15v-15h16v15" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
      case "university":
        return '<path d="M-17 -4L0 -14 17 -4 0 6 -17 -4ZM-10 0v10c6 4 14 4 20 0V0" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
      default:
        return '<circle cx="0" cy="0" r="15" stroke="currentColor" stroke-width="4" fill="none"/><path d="M-1 -5a6 6 0 1 1 6 6c-4 1 -5 3 -5 5M0 13h.1" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/>';
    }
  })();

  return `<g transform="scale(1.42)">${iconPath}</g>`;
}

function buildDetailLabel(detail, cellWidth) {
  const lines = wrapSvgText(detail.value, 14, 2);
  const firstLineY = lines.length === 1 ? 96 : 86;

  return lines
    .map(
      (line, index) =>
        `<text x="${cellWidth / 2}" y="${firstLineY + index * 25}" text-anchor="middle" fill="#123c37" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="24" font-weight="760">${escapeHtml(line)}</text>`,
    )
    .join("\n        ");
}

function buildDetailGrid(point) {
  const details = getParkingPopupDetails(point);
  const fallbackDetails =
    details.length > 0
      ? details
      : [
          {
            icon: "unknown",
            label: "Details",
            tone: "neutral",
            value: "Details unavailable",
          },
        ];
  const gridWidth = 560;
  const cellWidth = gridWidth / fallbackDetails.length;
  const cells = fallbackDetails.map((detail, index) => {
    const x = index * cellWidth;

    return `<g transform="translate(${x} 0)" color="#0f766e">
        <g transform="translate(${cellWidth / 2} 45)">
          ${buildDetailIcon(detail)}
        </g>
        ${buildDetailLabel(detail, cellWidth)}
      </g>`;
  });

  return `<g transform="translate(0 185)">
      ${cells.join("\n      ")}
    </g>`;
}

function buildSocialImage(point) {
  const titleLines = wrapText(point.name, 24, 2);

  return `<svg width="${socialImageWidth}" height="${socialImageHeight}" viewBox="0 0 ${socialImageWidth} ${socialImageHeight}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${socialImageWidth}" height="${socialImageHeight}" fill="#f6f8f5"/>
  <path d="M0 468C145 414 250 444 365 499C510 568 655 574 800 514C930 461 1035 419 1200 455V630H0V468Z" fill="#d9efe8"/>
  <path d="M0 520C155 470 285 505 410 552C555 607 705 612 850 557C970 511 1050 485 1200 512V630H0V520Z" fill="#b9e1d7"/>
  <g opacity="0.42">
    <path d="M95 102H310M145 152H420M845 120H1085M910 172H1120" stroke="#7aaea2" stroke-width="10" stroke-linecap="round"/>
  </g>
  <g transform="translate(92 116)">
    <path d="M206 0C101.07 0 16 85.07 16 190C16 327.69 194.83 418.58 200.9 421.57C204.07 423.15 207.93 423.15 211.1 421.57C217.17 418.58 396 327.69 396 190C396 85.07 310.93 0 206 0Z" fill="#0f766e"/>
    <circle cx="206" cy="176" r="149" fill="white"/>
    <path d="M148 263L148 109C148 89.64 163.64 74 183 74H229C248.36 74 264 89.64 264 109L264 263" stroke="#cfeee7" stroke-width="14" stroke-linecap="round" fill="none"/>
    <g stroke="#0b5c55" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <circle cx="117" cy="206" r="47"/>
      <circle cx="295" cy="206" r="47"/>
      <circle cx="192" cy="206" r="9" fill="#0b5c55"/>
      <polygon points="117,206 192,206 262,118 174,118"/>
      <line x1="192" y1="206" x2="174" y2="118"/>
      <line x1="262" y1="118" x2="295" y2="206"/>
      <line x1="174" y1="118" x2="169" y2="96"/>
      <path d="M155 96C161 96 174 94 183 99" stroke-width="10"/>
      <line x1="262" y1="118" x2="258" y2="96"/>
      <path d="M249 96Q258 96 271 90" stroke-width="9"/>
    </g>
  </g>
  <g transform="translate(525 116)">
    <text x="0" y="34" fill="#0f766e" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="28" font-weight="800">Edinburgh Cycle Parking</text>
    ${titleLines
      .map(
        (line, index) =>
          `<text x="0" y="${112 + index * 76}" fill="#123c37" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="68" font-weight="800">${escapeHtml(line)}</text>`,
      )
      .join("\n    ")}
    ${buildDetailGrid(point)}
  </g>
</svg>
`;
}

function buildSharePage(point) {
  const encodedId = encodeURIComponent(point.id);
  const title = `${point.name} | ${siteTitle}`;
  const description = `${describeParkingPoint(point)}. Find this cycle parking stand in Edinburgh.`;
  const shareUrl = `${siteUrl}${sitePath}/parking/${encodedId}/`;
  const socialImage = `${shareUrl}og-image.svg`;
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
    <meta property="og:image:type" content="image/svg+xml">
    <meta property="og:image:width" content="${socialImageWidth}">
    <meta property="og:image:height" content="${socialImageHeight}">
    <meta property="og:image:alt" content="${escapeHtml(`${point.name}: ${describeParkingPoint(point)}`)}">
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
      await writeFile(path.join(parkingPageDir, "og-image.svg"), buildSocialImage(point));
    }),
  );

  console.log(`Generated ${dataset.points.length} parking share pages and social preview images.`);
}

await main();
