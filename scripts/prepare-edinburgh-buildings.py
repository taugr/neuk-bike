#!/usr/bin/env python3
"""Stage Edinburgh footprints and sampled public elevation data for the mesh build."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import math
import re
from urllib.request import urlopen
from xml.etree import ElementTree

import numpy as np
import osmium
from PIL import Image
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.windows import Window, from_bounds as bounds_window
from shapely import from_wkb, make_valid, prepare, union_all
from shapely.geometry import shape, mapping
from shapely.strtree import STRtree
from edinburgh_historic_facades import HistoricFacades, eligible_building, ground_shop
from edinburgh_terraces import mapped_terrace_dividers, party_wall_joints, terrace_addresses

ZOOM = 16
SAMPLES = 160
WORLD = 2 * math.pi * 6378137
SPAN = WORLD / (2 ** ZOOM)
STEP = SPAN / SAMPLES
LIDAR = "https://srsp-open-data.s3.eu-west-2.amazonaws.com"
TERRAIN = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium"
BOUNDARY = (
    "https://hub.arcgis.com/api/v3/datasets/19f10f5b3a0c4ca0ba3b5707a2ac383d_12"
    "/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1"
)


def coordinates(lon, lat):
    return ((lon + 180) / 360, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2)


def metres(tags, key):
    text = tags.get(key, "").strip()
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(m|ft)?", text)
    if not match:
        return None
    value = float(match[1]) * (0.3048 if match[2] == "ft" else 1)
    return value if 0 <= value <= 200 else None


def footprint_chunks(pbf, boundary, stage):
    cache = stage / "footprints.json"
    if cache.exists():
        return json.loads(cache.read_text())
    historic = HistoricFacades(pbf, stage)
    matcher = osmium.filter.KeyFilter("building", "building:part")
    factory = osmium.geom.WKBFactory()
    records = []
    xmin, ymin, xmax, ymax = boundary.bounds
    prepare(boundary)
    for area in (osmium.FileProcessor(str(pbf)).with_areas(matcher)
                 .with_filter(osmium.filter.EntityFilter(osmium.osm.AREA))
                 .with_filter(matcher)):
        tags = area.tags
        if tags.get("building") in ("no", "proposed", "construction") or tags.get("construction") or tags.get("building:part") == "no":
            continue
        exterior = next(iter(area.outer_rings()), None)
        if exterior is None or not any(
            xmin <= node.lon <= xmax and ymin <= node.lat <= ymax
            for node in exterior if node.location.valid()
        ):
            continue
        try:
            geometry = from_wkb(bytes.fromhex(factory.create_multipolygon(area)))
        except RuntimeError:
            continue
        if not geometry.is_valid:
            geometry = make_valid(geometry)
        parts = [geometry] if geometry.geom_type == "Polygon" else getattr(geometry, "geoms", [])
        for polygon in parts:
            if polygon.geom_type != "Polygon" or polygon.area < 1.6e-10:
                continue
            center = polygon.representative_point()
            if not boundary.covers(center):
                continue
            levels = metres(tags, "building:levels")
            explicit_height = metres(tags, "height")
            base = metres(tags, "min_height") or (metres(tags, "building:min_level") or 0) * 3
            category = tags.get("building") or tags.get("building:part")
            default = 3 if category in ("shed", "garage", "garages", "hut", "roof", "carport") else 7
            height = explicit_height or ((levels * 3 + (metres(tags, "roof:height") or 1)) if levels else default)
            if height <= base:
                continue
            grouped = category == "terrace" or tags.get("house") == "terrace"
            historic_home = not base and eligible_building(tags)
            records.append((polygon, center, height, base, bool(tags.get("building:part")),
                            grouped, levels, historic_home, historic_home and ground_shop(tags)))

    # Following the usual simple 3D buildings convention, parts that cover the
    # outline should replace the parent solid instead of being drawn inside it.
    parts = [record[0] for record in records if record[4]]
    tree = STRtree(parts)
    records = [
        record for record in records
        if record[4] or not any(
            record[0].covers(parts[i]) and parts[i].area > record[0].area * 0.85
            for i in tree.query(record[0])
        )
    ]
    exterior_records = [i for i, record in enumerate(records) if not record[4]]
    boundaries = party_wall_joints([records[i][0] for i in exterior_records])
    joints = dict(zip(exterior_records, boundaries))
    addresses = terrace_addresses(pbf, boundary.bounds)
    historic.set_footprints(record[0] for record in records if not record[4])
    terrace_count = 0
    manifest = {}
    files = {}
    parent = stage / "footprints"
    parent.mkdir(exist_ok=True)
    try:
        for index, (polygon, center, height, base, part, grouped, levels, historic_home, shop) in enumerate(records):
            x, y = coordinates(center.x, center.y)
            key = f"{int(x * 2**ZOOM)}-{int(y * 2**ZOOM)}"
            if key not in files:
                files[key] = (parent / f"{key}.ndjson").open("w")
            outline = polygon.simplify(0.000001, preserve_topology=True)
            feature = {
                "geometry": mapping(outline),
                "properties": {"render_height": height, "render_min_height": base},
                "anchor": [x, y],
            }
            if index in joints and joints[index]:
                feature["properties"]["party_wall_joints"] = sorted(joints[index])
            if grouped and not part:
                dividers = mapped_terrace_dividers(polygon, addresses)
                if dividers:
                    feature["properties"]["terrace_dividers"] = dividers
                    terrace_count += 1
            if historic_home and not part:
                facade = historic.frontage(outline, center, levels, shop)
                if facade:
                    feature["properties"]["historic_facade"] = facade
            files[key].write(json.dumps(feature, separators=(",", ":")) + "\n")
            manifest[key] = manifest.get(key, 0) + 1
    finally:
        for file in files.values():
            file.close()
    cache.write_text(json.dumps(manifest))
    print(f"Edinburgh footprints: {sum(manifest.values()):,} across {len(manifest)} chunks", flush=True)
    print(f"Façade evidence: {sum(bool(entry) for entry in boundaries):,} outlines with shared walls, "
          f"{terrace_count:,} grouped terraces with aligned mapped entrances", flush=True)
    print(f"Historic façade candidates: {dict(historic.counts)}", flush=True)
    return manifest


def tile_box(x, y, zoom=ZOOM):
    span = WORLD / 2**zoom
    return (
        x * span - WORLD / 2, WORLD / 2 - (y + 1) * span,
        (x + 1) * span - WORLD / 2, WORLD / 2 - y * span,
    )


def survey_inventory(kind):
    prefix = f"lidar/phase-5/{kind}/27700/gridded/"
    keys = {}
    for square in ("NT", "NS"):
        with urlopen(f"{LIDAR}/?list-type=2&prefix={prefix}{square}", timeout=40) as response:
            catalog = ElementTree.fromstring(response.read())
        for item in catalog.findall("{*}Contents/{*}Key"):
            filename = item.text.rsplit("/", 1)[-1]
            match = re.fullmatch(r"(N[ST])(\d)(\d)(NW|NE|SW|SE)_50CM_.*\.tif", filename)
            if match:
                base_e = 200000 if square == "NS" else 300000
                x = base_e + int(match[2]) * 10000 + (5000 if match[4][1] == "E" else 0)
                y = 600000 + int(match[3]) * 10000 + (5000 if match[4][0] == "N" else 0)
                keys[(x, y)] = item.text
    return keys


def source_window(path, bounds, stage):
    cache = stage / "archive" / (path.rsplit("/", 1)[-1] + ".npz")
    cache.parent.mkdir(exist_ok=True)
    if cache.exists():
        with np.load(cache) as saved:
            return saved["data"], rasterio.Affine(*saved["transform"])
    with rasterio.open(f"{LIDAR}/{path}") as source:
        window = bounds_window(*bounds, source.transform).round_offsets().round_lengths()
        window = window.intersection(Window(0, 0, source.width, source.height))
        width, height = math.ceil(window.width / 4), math.ceil(window.height / 4)
        data = source.read(1, window=window, out_shape=(height, width), resampling=Resampling.average)
        data = data.astype(np.float32)
        data[data <= -9000] = np.nan
        transform = source.window_transform(window) * rasterio.Affine.scale(window.width / width, window.height / height)
    np.savez_compressed(cache, data=data, transform=list(transform)[:6])
    return data, transform


def prep_surveys(chunks, stage):
    keys = [tuple(map(int, key.split("-"))) for key in chunks]
    left, right = min(x for x, _ in keys) - 1, max(x for x, _ in keys) + 1
    top, bottom = min(y for _, y in keys) - 1, max(y for _, y in keys) + 1
    west, _, _, north = tile_box(left, top)
    _, south, east, _ = tile_box(right, bottom)
    width, height = (right - left + 1) * SAMPLES, (bottom - top + 1) * SAMPLES
    transform = from_bounds(west, south, east, north, width, height)
    selected = {}
    for x, y in keys:
        w, s, e, n = transform_bounds("EPSG:3857", "EPSG:27700", *tile_box(x, y))
        for qx in range(math.floor(w / 5000) * 5000, math.floor(e / 5000) * 5000 + 1, 5000):
            for qy in range(math.floor(s / 5000) * 5000, math.floor(n / 5000) * 5000 + 1, 5000):
                selected.setdefault((qx, qy), []).append((w, s, e, n))
    shape = (height, width)
    arrays = {}
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
                      GDAL_HTTP_TIMEOUT="60", GDAL_HTTP_MAX_RETRY="3"):
        for kind in ("dsm", "dtm"):
            output = np.full(shape, np.nan, dtype=np.float32)
            inventory = survey_inventory(kind)
            jobs = [(inventory[quarter], (
                min(box[0] for box in boxes) - 30, min(box[1] for box in boxes) - 30,
                max(box[2] for box in boxes) + 30, max(box[3] for box in boxes) + 30,
            )) for quarter, boxes in selected.items() if quarter in inventory]
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(source_window, path, bounds, stage) for path, bounds in jobs]
                for (path, _), future in zip(jobs, futures):
                    data, window_transform = future.result()
                    reproject(
                        data, output, src_transform=window_transform, src_crs="EPSG:27700",
                        dst_transform=transform, dst_crs="EPSG:3857", src_nodata=np.nan,
                        dst_nodata=np.nan, init_dest_nodata=False, resampling=Resampling.bilinear,
                    )
                    print(f"{kind} {path.rsplit('/', 1)[-1]} ({data.shape[1]} × {data.shape[0]})", flush=True)
            arrays[kind] = output
    roof, ground = arrays["dsm"], arrays["dtm"]
    assets = stage / "surveys"
    assets.mkdir(exist_ok=True)
    ground_tiles = set()
    for x, y in keys:
        col, row = (x - left) * SAMPLES, (y - top) * SAMPLES
        area = (slice(row, row + SAMPLES), slice(col, col + SAMPLES))
        samples = np.stack((roof[area], ground[area]), axis=-1)
        packed = np.where(np.isfinite(samples), np.rint(samples * 10), -32768).astype("<i2")
        if np.isfinite(samples).all(axis=-1).any():
            packed.tofile(assets / f"{x}-{y}.bin")
        if np.isfinite(ground[area]).any():
            ground_tiles.add((x, y))

    write_dem(stage, ground, transform, ground_tiles, keys)
    (stage / "survey.json").write_text(json.dumps({"zoom": ZOOM, "samples": SAMPLES}))
    print(f"Edinburgh elevation: {len(ground_tiles)} terrain chunks available", flush=True)


def write_dem(stage, ground, transform, ground_tiles, keys):
    # One Mapzen parent supplies the continuous background for all its children.
    parent_zoom = 14
    detailed = {(x + dx, y + dy) for x, y in ground_tiles
                for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
    overview = {(x >> 1, y >> 1) for x, y in detailed}
    parent_tiles = {(x >> 2, y >> 2) for x, y in detailed.union(keys)}
    parents = stage / "mapzen"
    parents.mkdir(exist_ok=True)

    def fetch_parent(point):
        x, y = point
        file = parents / f"{x}-{y}.png"
        if not file.exists():
            with urlopen(f"{TERRAIN}/{parent_zoom}/{x}/{y}.png", timeout=25) as response:
                file.write_bytes(response.read())
        return point

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(fetch_parent, sorted(parent_tiles)))
    dem = stage / "dem"
    tile_keys = sorted([(ZOOM, x, y) for x, y in detailed] +
                       [(ZOOM - 1, x, y) for x, y in overview])
    pixel = np.arange(256, dtype=np.float32) + 0.5
    for zoom, x, y in tile_keys:
        px, py = x >> (zoom - parent_zoom), y >> (zoom - parent_zoom)
        rgb = np.array(Image.open(parents / f"{px}-{py}.png").convert("RGB"), dtype=np.float32)
        bg = rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256 - 32768
        bounds = tile_box(x, y, zoom)
        tile_transform = from_bounds(*bounds, 256, 256)
        def project(data, source_transform):
            result = np.full((256, 256), np.nan, dtype=np.float32)
            reproject(data, result, src_transform=source_transform, src_crs="EPSG:3857",
                      dst_transform=tile_transform, dst_crs="EPSG:3857",
                      src_nodata=np.nan, dst_nodata=np.nan, resampling=Resampling.bilinear)
            return result
        base = project(bg, from_bounds(*tile_box(px, py, parent_zoom), 256, 256))
        window = bounds_window(*bounds, transform).round_offsets().round_lengths()
        col, row = int(window.col_off), int(window.row_off)
        x0, y0 = max(0, col - 1), max(0, row - 1)
        x1 = min(ground.shape[1], col + int(window.width) + 2)
        y1 = min(ground.shape[0], row + int(window.height) + 2)
        surveyed = (project(ground[y0:y1, x0:x1], transform * rasterio.Affine.translation(x0, y0))
                    if x0 < x1 and y0 < y1 else np.full((256, 256), np.nan, dtype=np.float32))
        tile_set = detailed if zoom == ZOOM else overview
        edge = np.full((256, 256), 64, dtype=np.float32)
        for neighbor, distance in (
            ((x - 1, y), pixel[None, :]), ((x + 1, y), 256 - pixel[None, :]),
            ((x, y - 1), pixel[:, None]), ((x, y + 1), 256 - pixel[:, None]),
        ):
            if neighbor not in tile_set:
                edge = np.minimum(edge, distance)
        mix = np.clip(edge / 64, 0, 1)
        mix = mix * mix * (3 - 2 * mix)
        elevation = base + (np.where(np.isfinite(surveyed), surveyed, base) - base) * mix
        encoded = np.rint((elevation + 32768) * 256).astype(np.uint32)
        data = np.stack((encoded >> 16, encoded >> 8, encoded), axis=-1).astype(np.uint8)
        target = dem / str(zoom) / str(x) / f"{y}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(data).save(target, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pbf", type=Path)
    parser.add_argument("stage", type=Path)
    args = parser.parse_args()
    args.stage.mkdir(parents=True, exist_ok=True)
    boundary_path = args.stage / "council.geojson"
    if not boundary_path.exists():
        with urlopen(BOUNDARY, timeout=45) as response:
            boundary_path.write_bytes(response.read())
    boundary = union_all([make_valid(shape(feature["geometry"]))
                          for feature in json.loads(boundary_path.read_text())["features"]])
    if boundary.is_empty:
        raise ValueError("The Edinburgh boundary is empty")
    chunks = footprint_chunks(args.pbf, boundary, args.stage)
    if not (args.stage / "survey.json").exists():
        prep_surveys(chunks, args.stage)
    (args.stage / "boundary.json").write_text(json.dumps(
        mapping(boundary.simplify(0.00008, preserve_topology=True)), separators=(",", ":")
    ))
    for path in (args.stage / "mapzen").glob("*.png"):
        raw = path.with_suffix(".bin")
        if raw.exists():
            continue
        rgb = np.array(Image.open(path).convert("RGB"), dtype=np.float32)
        elevation = rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256 - 32768
        np.rint(elevation * 10).astype("<i2").tofile(raw)


if __name__ == "__main__":
    main()
