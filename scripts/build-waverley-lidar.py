#!/usr/bin/env python3
"""Generate Waverley's local preview assets (requires numpy, Pillow and rasterio)."""

import argparse
from io import BytesIO
import json
import math
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from PIL import Image
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.windows import Window, from_bounds as bounds_window

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public/data/waverley-lidar"
SOURCE = "https://srsp-open-data.s3.eu-west-2.amazonaws.com/lidar/phase-5"
TERRAIN = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium"
WORLD = 2 * math.pi * 6378137
PIXELS = 256
BASE_ZOOM = 14
MAX_ZOOM = 17
BUILDINGS = (-3.193, 55.9515, -3.184, 55.9555)
PRINCES_ROOFS = (-3.19155, 55.95298, -3.18967, 55.95376)
GROUND = (-3.195, 55.9507, -3.182, 55.9563)
EDINBURGH_AREAS = {
    "grassmarket": (-3.197, 55.94735),
    "stockbridge": (-3.2097, 55.95875),
    "leith-shore": (-3.1693, 55.9763),
}
EDINBURGH_ROOF_SIZE = 128


def tile_bounds(z, x, y):
    span = WORLD / 2**z
    return (
        x * span - WORLD / 2,
        WORLD / 2 - (y + 1) * span,
        (x + 1) * span - WORLD / 2,
        WORLD / 2 - y * span,
    )


def tile_range(bounds, z):
    west, south, east, north = bounds
    span = WORLD / 2**z
    return (
        math.floor((west + WORLD / 2) / span),
        math.floor((WORLD / 2 - north) / span),
        math.floor((east + WORLD / 2) / span),
        math.floor((WORLD / 2 - south) / span),
    )


def read_survey(kind, bounds, quadrant="NT27SE"):
    url = f"{SOURCE}/{kind}/27700/gridded/{quadrant}_50CM_{kind.upper()}_PHASE5.tif"
    with rasterio.open(url) as survey:
        west, south, east, north = transform_bounds("EPSG:3857", survey.crs, *bounds)
        window = bounds_window(
            west - 10, south - 10, east + 10, north + 10, survey.transform
        ).round_offsets().round_lengths()
        window = window.intersection(Window(0, 0, survey.width, survey.height))
        return survey.read(1, window=window), survey.window_transform(window), survey.crs


def project(survey, bounds, width, height):
    source, transform, crs = survey
    dest = np.full((height, width), np.nan, dtype=np.float32)
    reproject(
        source,
        dest,
        src_transform=transform,
        src_crs=crs,
        src_nodata=-9999,
        dst_transform=from_bounds(*bounds, width, height),
        dst_crs="EPSG:3857",
        dst_nodata=np.nan,
        resampling=Resampling.bilinear,
    )
    return dest


def read_mapzen(bounds):
    x0, y0, x1, y1 = tile_range(bounds, BASE_ZOOM)
    data = np.empty(((y1 - y0 + 1) * PIXELS, (x1 - x0 + 1) * PIXELS), np.float32)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            with urlopen(f"{TERRAIN}/{BASE_ZOOM}/{x}/{y}.png", timeout=20) as response:
                rgb = np.array(Image.open(BytesIO(response.read())).convert("RGB"), dtype=np.float32)
            row, col = (y - y0) * PIXELS, (x - x0) * PIXELS
            data[row:row+PIXELS, col:col+PIXELS] = (
                rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256 - 32768
            )
    west, _, _, north = tile_bounds(BASE_ZOOM, x0, y0)
    _, south, east, _ = tile_bounds(BASE_ZOOM, x1, y1)
    transform = from_bounds(west, south, east, north, data.shape[1], data.shape[0])
    return data, transform, "EPSG:3857"


def write_ground(ground, measured, output=ASSETS):
    # Read enough low-resolution terrain to cover every prepared tile.
    x0, y0, x1, y1 = tile_range(ground, BASE_ZOOM + 1)
    west, _, _, north = tile_bounds(BASE_ZOOM + 1, x0, y0)
    _, south, east, _ = tile_bounds(BASE_ZOOM + 1, x1, y1)
    background = read_mapzen((west + 1, south + 1, east - 1, north - 1))
    ranges = {}
    for z in range(BASE_ZOOM + 1, MAX_ZOOM + 1):
        x0, y0, x1, y1 = ranges[z] = tile_range(ground, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                box = tile_bounds(z, x, y)
                base = project(background, box, PIXELS, PIXELS)
                survey = project(measured, box, PIXELS, PIXELS)
                west, south, east, north = box
                step = (east - west) / PIXELS
                xs = west + (np.arange(PIXELS) + 0.5) * step
                ys = north - (np.arange(PIXELS) + 0.5) * step
                edge_x = np.minimum(xs - ground[0], ground[2] - xs)
                edge_y = np.minimum(ys - ground[1], ground[3] - ys)
                # Feather over ~60 ground metres so higher-resolution tiles join Mapzen.
                blend = np.clip(np.minimum(edge_x, edge_y[:, None]) / 110, 0, 1)
                blend = np.where(np.isfinite(survey), blend * blend * (3 - 2 * blend), 0)
                metres = base + (np.nan_to_num(survey) - base) * blend
                rgb24 = np.round((metres + 32768) * 256).astype(np.uint32)
                rgb = np.stack((rgb24 >> 16, rgb24 >> 8, rgb24), axis=-1).astype(np.uint8)
                path = output / f"dem/{z}/{x}/{y}.png"
                path.parent.mkdir(parents=True, exist_ok=True)
                Image.fromarray(rgb).save(path, optimize=True)
    return ranges


def write_surface(bounds, spacing, surface, terrain, filename):
    west, south, east, north = transform_bounds("EPSG:4326", "EPSG:3857", *bounds)
    step = spacing / math.cos(math.radians((bounds[1] + bounds[3]) / 2))
    width, height = math.ceil((east - west) / step), math.ceil((north - south) / step)
    extent = (west, south, east, north)
    samples = np.stack(
        (project(surface, extent, width, height), project(terrain, extent, width, height)),
        axis=-1,
    )
    np.where(np.isfinite(samples), np.rint(samples * 10), -32768).astype("<i2").tofile(
        ASSETS / filename
    )
    return {"bounds": bounds, "width": width, "height": height}


def write_edinburgh_pilot():
    output = ROOT / "public/data/edinburgh-lidar"
    # These sites are all in OS square NT27. Derive the 5 km quadrants needed
    # for each area so a crop can cross a survey delivery boundary.
    def read_area(kind, bounds):
        x0, y0, x1, y1 = transform_bounds("EPSG:3857", "EPSG:27700", *bounds)
        quarters = [
            name for name, east, north in (
                ("SW", 320000, 670000), ("SE", 325000, 670000),
                ("NW", 320000, 675000), ("NE", 325000, 675000),
            )
            if x0 < east + 5000 and x1 > east and y0 < north + 5000 and y1 > north
        ]
        sources = [read_survey(kind, bounds, f"NT27{q}") for q in quarters]
        west, south, east, north = bounds
        width = math.ceil((east - west) / 1.5)
        height = math.ceil((north - south) / 1.5)
        mosaic = np.full((height, width), np.nan, dtype=np.float32)
        for survey in sources:
            layer = project(survey, bounds, width, height)
            mosaic = np.where(np.isfinite(layer), layer, mosaic)
        return mosaic, from_bounds(*bounds, width, height), "EPSG:3857"

    tiles = set()
    dem_tiles = set()
    for name, (lng, lat) in EDINBURGH_AREAS.items():
        bounds = transform_bounds(
            "EPSG:4326", "EPSG:3857",
            lng - 0.00155, lat - 0.0009, lng + 0.00155, lat + 0.0009,
        )
        x0, y0, x1, y1 = tile_range(bounds, MAX_ZOOM)
        west, _, _, north = tile_bounds(MAX_ZOOM, x0, y0)
        _, south, east, _ = tile_bounds(MAX_ZOOM, x1, y1)
        ground = (west - 110, south - 110, east + 110, north + 110)
        terrain = read_area("dtm", ground)
        surface = read_area("dsm", (west, south, east, north))
        ranges = write_ground(ground, terrain, output)
        for z, (left, top, right, bottom) in ranges.items():
            dem_tiles.update(f"{z}/{x}/{y}" for x in range(left, right + 1)
                             for y in range(top, bottom + 1))
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                box = tile_bounds(MAX_ZOOM, x, y)
                samples = np.stack([
                    project(source, box, EDINBURGH_ROOF_SIZE, EDINBURGH_ROOF_SIZE)
                    for source in (surface, terrain)
                ], axis=-1)
                coverage = np.isfinite(samples).all(axis=-1).mean()
                if coverage < 0.95:
                    raise ValueError(f"{name} tile {x}/{y}: only {coverage:.1%} surveyed")
                path = output / f"roofs/{x}/{y}.bin"
                path.parent.mkdir(parents=True, exist_ok=True)
                np.where(np.isfinite(samples), np.rint(samples * 10), -32768).astype("<i2").tofile(path)
                tiles.add(f"{x}/{y}")
        print(f"{name}: {(x1-x0+1)*(y1-y0+1)} roof tiles, surveyed ground and roof", flush=True)
    metadata = {
        "zoom": MAX_ZOOM, "samples": EDINBURGH_ROOF_SIZE,
        "roofTiles": sorted(tiles), "demTiles": sorted(dem_tiles),
    }
    (ROOT / "src/data/edinburgh-lidar.json").write_text(
        json.dumps(metadata, indent=2) + "\n"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--princes-roofs-only", action="store_true")
    modes.add_argument("--edinburgh-pilot", action="store_true")
    args = parser.parse_args()
    ASSETS.mkdir(parents=True, exist_ok=True)
    metadata = ROOT / "src/data/waverley-lidar.json"
    ground = transform_bounds("EPSG:4326", "EPSG:3857", *GROUND)
    buildings = transform_bounds("EPSG:4326", "EPSG:3857", *BUILDINGS)
    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="30",
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="2",
    ):
        if args.edinburgh_pilot:
            write_edinburgh_pilot()
            return
        if args.princes_roofs_only:
            detail = transform_bounds("EPSG:4326", "EPSG:3857", *PRINCES_ROOFS)
            terrain = read_survey("dtm", detail)
            surface = read_survey("dsm", detail)
        else:
            terrain = read_survey("dtm", ground)
            surface = read_survey("dsm", buildings)
    detail = write_surface(PRINCES_ROOFS, 0.5, surface, terrain, "princes-roofs.bin")
    if args.princes_roofs_only:
        existing = json.loads(metadata.read_text())
        existing["roofDetail"] = detail
        metadata.write_text(json.dumps(existing, indent=2) + "\n")
        print(f"Princes Street surface: {detail['width']} × {detail['height']}")
        return
    ranges = write_ground(ground, terrain)
    meta = {
        **write_surface(BUILDINGS, 2, surface, terrain, "surface.bin"),
        "baseZoom": BASE_ZOOM, "maxZoom": MAX_ZOOM, "demTiles": ranges,
        "roofDetail": detail,
    }
    metadata.write_text(json.dumps(meta, indent=2) + "\n")
    print(f"Surface: {meta['width']} × {meta['height']}; DEM tile ranges: {ranges}")


if __name__ == "__main__":
    main()
