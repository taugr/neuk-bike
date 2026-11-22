#!/usr/bin/env python3
"""Bake a terrain-aligned Castle Rock material from Phase 5 LiDAR and OSM."""

import argparse
from contextlib import ExitStack
import json
from pathlib import Path

import numpy as np
import osmium
from PIL import Image
import rasterio
from rasterio.features import rasterize
from rasterio.merge import merge
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject, transform, transform_bounds
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union


ROOT = Path(__file__).resolve().parents[1]
BOUNDS = json.loads((ROOT / "src/data/castle-rock-bounds.json").read_text())
MERCATOR = "EPSG:3857"
WGS84 = "EPSG:4326"
MERCATOR_BOUNDS = transform_bounds(WGS84, MERCATOR, *BOUNDS)
WIDTH, HEIGHT = 960, 740
GRID = from_bounds(*MERCATOR_BOUNDS, WIDTH, HEIGHT)
GROUND_SCALE = np.cos(np.deg2rad((BOUNDS[1] + BOUNDS[3]) / 2))
DX, DY = GRID.a * GROUND_SCALE, -GRID.e * GROUND_SCALE


def read_survey(directory, kind):
    with ExitStack() as stack:
        sources = [
            stack.enter_context(rasterio.open(directory / f"{square}-{kind}.tif"))
            for square in ("NT27SW", "NT27SE")
        ]
        native_bounds = transform_bounds(WGS84, sources[0].crs, *BOUNDS)
        padding = 3
        west, south, east, north = native_bounds
        survey, native_grid = merge(
            sources,
            bounds=(west - padding, south - padding, east + padding, north + padding),
            nodata=np.nan,
            dtype="float32",
            indexes=[1],
        )
        projected = np.full((HEIGHT, WIDTH), np.nan, dtype="float32")
        reproject(
            survey[0], projected, src_transform=native_grid, src_crs=sources[0].crs,
            src_nodata=np.nan, dst_transform=GRID, dst_crs=MERCATOR,
            dst_nodata=np.nan, resampling=Resampling.bilinear,
        )
    if not np.isfinite(projected).all():
        raise ValueError(f"The {kind} TIFFs must cover the preview bounds.")
    return projected


def rock_areas(path):
    """Locate actual rock and keep the material below the enclosure walls."""
    bounds = box(*MERCATOR_BOUNDS)
    west, south, east, north = BOUNDS
    cliffs, rocks, buildings = [], [], []
    enclosure = None
    ways = osmium.FileProcessor(path).with_locations().with_filter(
        osmium.filter.EntityFilter(osmium.osm.WAY)
    )
    for way in ways:
        natural = way.tags.get("natural")
        building = way.tags.get("building") is not None or way.tags.get("building:part") is not None
        if natural not in ("cliff", "bare_rock") and not building and way.id != 4301292:
            continue
        coords = [(node.lon, node.lat) for node in way.nodes if node.location.valid()]
        if len(coords) < 2 or not any(west <= lon <= east and south <= lat <= north for lon, lat in coords):
            continue
        xy = list(zip(*transform(WGS84, MERCATOR, *zip(*coords))))
        if natural == "cliff":
            cliffs.append(LineString(xy).intersection(bounds))
        elif len(xy) > 3 and xy[0] == xy[-1]:
            polygon = Polygon(xy).buffer(0).intersection(bounds)
            if natural == "bare_rock":
                rocks.append(polygon)
            elif way.id == 4301292:
                enclosure = polygon
            elif building:
                buildings.append(polygon)
    if not cliffs or not rocks or enclosure is None:
        raise ValueError("OSM input must include the Castle Rock cliff, bare rock and enclosure ways.")
    return unary_union(cliffs), unary_union(rocks), unary_union(buildings), enclosure


def mask(geometry):
    return rasterize(
        [(geometry, 1)], out_shape=(HEIGHT, WIDTH), transform=GRID, dtype="uint8",
    ).astype("float32")


def smoothstep(low, high, value):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def battery_flanks(x, y, terrain):
    """Recover rock below the internal batteries from their surveyed wall bases."""
    castle = json.loads((ROOT / "scripts/data/edinburgh-castle.json").read_text())
    west, _, _, north = MERCATOR_BOUNDS
    flanks = np.zeros_like(terrain)
    for wall in castle["walls"]:
        if wall["name"] not in ("Half Moon Battery", "Forewall Battery", "Argyle Battery"):
            continue
        longitude, latitude, _, base = zip(*wall["points"])
        mx, my = transform(WGS84, MERCATOR, longitude, latitude)
        for east, up, height in zip(mx, my, base):
            distance = np.hypot(x - (east - west) * GROUND_SCALE, y - (north - up) * GROUND_SCALE)
            horizontal = 1 - smoothstep(5, 15, distance)
            below_wall = 1 - smoothstep(height + 0.7, height + 2.7, terrain)
            np.maximum(flanks, horizontal * below_wall, out=flanks)
    return flanks


def blur(values, metres):
    """Separable Gaussian at a ground distance in metres."""
    for axis, spacing in ((0, DY), (1, DX)):
        offsets = np.arange(-int(3 * metres / spacing), int(3 * metres / spacing) + 1)
        weights = np.exp(-0.5 * (offsets * spacing / metres) ** 2)
        weights /= weights.sum()
        pad = len(offsets) // 2
        padded = np.pad(values, ((pad, pad), (0, 0)) if axis == 0 else ((0, 0), (pad, pad)), mode="edge")
        values = np.apply_along_axis(lambda line: np.convolve(line, weights, mode="valid"), axis, padded)
    return values


def noise(x, y, z):
    """Continuous value noise in three dimensions, including measured height."""
    i, j, k = np.floor(x), np.floor(y), np.floor(z)
    u, v, w = (smoothstep(0, 1, value) for value in (x - i, y - j, z - k))
    result = np.zeros_like(z)
    for a, wx in ((0, 1 - u), (1, u)):
        for b, wy in ((0, 1 - v), (1, v)):
            for c, wz in ((0, 1 - w), (1, w)):
                hashed = np.sin((i + a) * 127.1 + (j + b) * 311.7 + (k + c) * 74.7) * 43758.5453
                result += wx * wy * wz * (hashed - np.floor(hashed))
    return result


def material(dtm, dx, dy, x, y):
    # Fracture fields run in world space, so their detail follows the cliff face.
    weathering = noise(x / 8, y / 8, dtm / 6)
    grains = noise(x / 0.9, y / 0.9, dtm / 0.9)
    facets = noise(x / 3.2, y / 3.2, dtm / 2.6)
    fault = noise(x / 15, y / 15, dtm / 11) - 0.5
    cross_joint = (0.71 * x + 0.5 * y + 0.34 * dtm) / 3.6 + fault * 1.8
    bedding = (dtm - 0.13 * x + 0.09 * y) / 3.1 + (weathering - 0.5) * 0.75 + fault
    joints = np.maximum(
        (1 - smoothstep(0.015, 0.13, np.abs(cross_joint - np.round(cross_joint))))
        * smoothstep(-0.38, 0.26, fault),
        (1 - smoothstep(0.013, 0.12, np.abs(bedding - np.round(bedding))))
        * smoothstep(0.23, 0.75, facets),
    )
    norm = np.sqrt(1 + dx**2 + dy**2)
    illumination = np.clip((0.58 * dx + 0.58 * dy + 0.57) / norm, -0.3, 1)
    cavities = np.clip(blur(dtm, 2.1) - dtm, 0, 1.25)
    tone = (86 + 31 * illumination + 37 * (facets - 0.5) + 24 * (weathering - 0.5)
            + 24 * (grains - 0.5) - 25 * joints - 9 * cavities)
    return tone + 4 + 9 * weathering, tone + 4 * weathering, tone - 5 - 6 * weathering


def bake(lidar_dir, osm, output):
    dtm = read_survey(lidar_dir, "dtm")
    surface = read_survey(lidar_dir, "dsm")
    cliffs, bare_rock, buildings, enclosure = rock_areas(osm)
    y, x = np.indices(dtm.shape, dtype="float32") + 0.5
    x, y = x * DX, y * DY
    dy, dx = np.gradient(blur(dtm, 0.55), DY, DX)
    broad_dy, broad_dx = np.gradient(blur(dtm, 1.4), DY, DX)
    slope = np.maximum(np.hypot(dx, dy) * 0.86, np.hypot(broad_dx, broad_dy))
    mapped = blur(mask(cliffs.buffer(12 / GROUND_SCALE).union(bare_rock)), 2.4)
    # Outside mapped outcrops, require a steep, exposed face close to the ramparts.
    flanks = blur(mask(enclosure.buffer(19 / GROUND_SCALE)), 3)
    canopy = blur(np.maximum(surface - dtm, 0), 0.9)
    mapped_rock = mapped * smoothstep(0.28, 0.88, slope) * (1 - smoothstep(2.8, 7.0, canopy))
    inferred_rock = flanks * smoothstep(0.74, 1.5, slope) * (1 - smoothstep(0.7, 3.3, canopy))
    wall_bases = battery_flanks(x, y, dtm)
    internal_rock = wall_bases * smoothstep(0.41, 0.92, slope) * (1 - smoothstep(3, 8, canopy))
    outside = 1 - blur(mask(enclosure), 0.65)
    protection = blur(mask(buildings.buffer(0.6 / GROUND_SCALE)), 0.65)
    edge = smoothstep(0.5, 5, np.minimum.reduce((x, y, x.max() - x, y.max() - y)))
    exposed = np.maximum(np.maximum(mapped_rock, inferred_rock) * outside, internal_rock)
    opacity = exposed * (1 - protection) * edge
    rgba = np.stack((*material(dtm, dx, dy, x, y), opacity * 255), axis=-1)
    output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(np.round(rgba), 0, 255).astype("uint8")).save(
        output, "WEBP", quality=84, alpha_quality=95, method=6,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lidar_dir", type=Path, help="Directory with NT27SW and NT27SE DTM/DSM GeoTIFFs")
    parser.add_argument("osm", type=Path, help="Scotland OpenStreetMap PBF")
    parser.add_argument("output", type=Path, help="Output Castle Rock WebP")
    args = parser.parse_args()
    bake(args.lidar_dir, args.osm, args.output)
