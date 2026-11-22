#!/usr/bin/env python3
"""Register Princes Street drone imagery to the LiDAR roofs."""

import argparse
import json
import math
from pathlib import Path
import runpy

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from rasterio.transform import from_bounds
from rasterio.warp import transform_bounds

ROOT = Path(__file__).resolve().parents[1]
PHOTO = json.loads((ROOT / "src/data/princes-street-roof-photo.json").read_text())
WIDTH, HEIGHT = 640, 466
DETAIL_WIDTH, DETAIL_HEIGHT = 960, 700
CAMERA_LON, CAMERA_LAT = -3.19495361111111, 55.9510940833333
# Fit the pinhole camera to the two ends of the surveyed street frontage.
# The source EXIF locates the camera, and the fit absorbs lens and height error.
FOCAL, ALTITUDE = 3098.532, 158.540
YAW, PITCH = math.radians(72.99119), math.radians(-19.73627)
MERCATOR_METRE = math.cos(math.radians(55.9533)) * 6371008.8 / 6378137

# Visible roof planes and their surveyed elevations. Trace the photo within a
# 960 × 650 inspection window beginning at (200, 460) in the source.
ROOF_PLANES = [
    (PHOTO["flatRoof"]["elevation"], [(238, 235), (289, 218), (340, 205), (386, 182), (421, 178),
            (467, 170), (513, 172), (555, 177), (592, 180), (621, 190),
            (485, 248), (446, 247), (414, 245), (382, 243),
            (344, 234), (317, 242), (279, 246)]),
    (83.0, [(171, 395), (226, 396), (240, 375), (270, 373),
            (279, 381), (302, 376), (357, 356), (383, 344),
            (404, 358), (380, 380), (334, 401), (281, 418), (189, 414)]),
    (91.2, [(255, 260), (292, 251), (330, 247), (353, 245), (384, 245),
            (421, 252), (424, 263), (411, 273), (387, 273),
            (373, 271), (350, 269), (316, 276), (271, 281)]),
    (85.3, [(325, 351), (381, 334), (412, 336), (449, 351),
            (426, 355), (384, 348), (362, 355)]),
]

# Surveyed roof coordinates (along the street, inward from the front wall)
# matched to deck edges and skylights at 00:31 in Nick Hawkes's 4K clip.
DETAIL_ANCHORS = [
    (3.5, 6, 2106, 1779), (3.5, 29.6, 2444, 1784),
    (41, 6, 2148, 2045), (41, 29.6, 2562, 2055),
    (10.6, 15, 2216, 1825), (10.6, 22.8, 2356, 1828),
    (28, 15, 2240, 1949), (28, 22.8, 2399, 1953),
]
# Reverse view from the same photographer at 00:29 in the second 4K clip.
NORTH_ANCHORS = [
    (3.5, 6, 2998, 255), (3.5, 29.6, 3245, 411),
    (41, 6, 2541, 375), (41, 29.6, 2763, 548),
    (10.6, 15, 2975, 330), (10.6, 22.8, 3082, 398),
    (28, 15, 2735, 383), (28, 22.8, 2843, 465),
]


def sample(raster, x, y):
    """Bilinear sampling in pixel coordinates, with the pixel centres at integers."""
    x = np.clip(x, 0, raster.shape[1] - 2)
    y = np.clip(y, 0, raster.shape[0] - 2)
    col, row = x.astype(int), y.astype(int)
    dx, dy = (x - col)[..., None], (y - row)[..., None]
    return (
        (1 - dy) * ((1 - dx) * raster[row, col] + dx * raster[row, col + 1])
        + dy * ((1 - dx) * raster[row + 1, col] + dx * raster[row + 1, col + 1])
    )


def roof_mask(size, polygon):
    mask = Image.new("L", size)
    ImageDraw.Draw(mask).polygon([(x + 200, y + 460) for x, y in polygon], fill=255)
    return np.asarray(mask.filter(ImageFilter.GaussianBlur(3)))


def visible_from_camera(surface, grid, mx, my, elevation, camera_x, camera_y, camera_z):
    distance = np.hypot(camera_x - mx, camera_y - my) * MERCATOR_METRE
    visible = np.ones(elevation.shape, dtype=bool)
    # Test the ray against the surveyed surface between the point and the
    # camera. Back slopes hidden behind a ridge keep their shaded material.
    for metres in (1.2, 2.4, 3.8, 5.5, 8, 11, 15, 21, 29, 39, 52, 69):
        fraction = metres / distance
        ray_x = mx + fraction * (camera_x - mx)
        ray_y = my + fraction * (camera_y - my)
        ray_z = elevation + fraction * (camera_z - elevation)
        col = (ray_x - grid.c) / grid.a - 0.5
        row = (ray_y - grid.f) / grid.e - 0.5
        inside = (
            (col >= 0) & (col < surface.shape[1] - 1)
            & (row >= 0) & (row < surface.shape[0] - 1)
        )
        height = sample(surface[..., None], col, row)[..., 0]
        visible &= ~(inside & (height > ray_z + 0.75))
    return visible


def fit_roof_plane(anchors):
    system, target = [], []
    for along, inward, u, v in anchors:
        system.extend((
            [along, inward, 1, 0, 0, 0, -u * along, -u * inward],
            [0, 0, 0, along, inward, 1, -v * along, -v * inward],
        ))
        target.extend((u, v))
    return np.append(np.linalg.lstsq(system, target, rcond=None)[0], 1).reshape(3, 3)


def roof_frame_camera(plane, focal, frame):
    # Recover a height axis from the known perpendicular axes in the roof
    # plane. The focal length is estimated from the framing of each clip.
    intrinsics = np.array([
        [focal, 0, frame.width / 2],
        [0, focal, frame.height / 2],
        [0, 0, 1],
    ])
    axes = np.linalg.solve(intrinsics, plane[:, :2])
    normal = np.cross(axes[:, 0], axes[:, 1])
    normal *= np.mean(np.linalg.norm(axes, axis=0)) / np.linalg.norm(normal)
    return np.column_stack((plane[:, :2], intrinsics @ normal, plane[:, 2]))


def register_flat_deck(frame, plane, x, y):
    left, front, right, back = PHOTO["flatRoof"]["plateau"]
    # Stay inside the photographed deck and blend into the shaded parapets.
    margin = np.minimum.reduce((x - left, y - front, right - x, back - y))
    visible = margin > 0
    pixels = np.column_stack((x[visible], y[visible], np.ones(visible.sum()))) @ plane.T
    rgb = sample(np.asarray(frame), *(pixels[:, :2] / pixels[:, 2:3]).T)
    weight = np.clip(margin[visible] / 1.25, 0, 1)
    alpha = 255 * weight**2 * (3 - 2 * weight)
    atlas = np.zeros((*visible.shape, 4), dtype="uint8")
    atlas[visible] = np.column_stack((rgb, alpha))
    return Image.fromarray(atlas)


def extract_roof_detail(atlas):
    # The surrounding roofs are in deep shadow in the footage. Preserve
    # small photographed features while bringing the broad tones closer to
    # the shaded material. Weight the blur so holes do not darken the edges.
    rgba = np.asarray(atlas).astype(np.float32)
    alpha = rgba[:, :, 3] / 255
    low_alpha = np.asarray(
        atlas.getchannel("A").filter(ImageFilter.GaussianBlur(9))
    ).astype(np.float32)
    weighted = Image.fromarray((rgba[:, :, :3] * alpha[:, :, None]).astype("uint8"))
    low = np.asarray(weighted.filter(ImageFilter.GaussianBlur(9))) * (
        255 / np.maximum(3, low_alpha[:, :, None])
    )
    # Centre the detail at 128. The map applies this contrast over its
    # shaded roof. Opacity above 0.68 is reserved for the full-colour deck.
    rgb = rgba[:, :, :3] - low + 128
    rgb[alpha == 0] = 128
    rgba[:, :, :3] = np.clip(rgb, 0, 255)
    rgba[:, :, 3] *= 0.68
    return Image.fromarray(rgba.astype("uint8"))


def register_detail_frames(east_frame, north_frame, bounds):
    grid = from_bounds(*bounds, DETAIL_WIDTH, DETAIL_HEIGHT)
    origin, end = (
        np.array(transform_bounds("EPSG:4326", "EPSG:3857", *point, *point)[:2])
        for point in (PHOTO["flatRoof"]["west"], PHOTO["flatRoof"]["east"])
    )
    along = (end - origin) / np.linalg.norm(end - origin)
    inward = np.array([-along[1], along[0]])
    row, col = np.indices((DETAIL_HEIGHT, DETAIL_WIDTH))
    mx, my = grid.c + (col + 0.5) * grid.a, grid.f + (row + 0.5) * grid.e
    offset = np.stack((mx - origin[0], my - origin[1]), axis=-1) * MERCATOR_METRE
    x, y = offset @ along, offset @ inward
    east_plane = fit_roof_plane(DETAIL_ANCHORS)
    deck = register_flat_deck(east_frame, east_plane, x, y)
    if north_frame is None:
        return deck

    lidar = runpy.run_path(str(ROOT / "scripts/build-waverley-lidar.py"))
    west, south, east, north = bounds
    padded = (west - 32, south - 32, east + 116, north + 116)
    measured = lidar["read_survey"]("dsm", padded)
    surface = lidar["project"](measured, padded, 860, 760)
    surface_grid = from_bounds(*padded, 860, 760)
    elevation = lidar["project"](measured, bounds, DETAIL_WIDTH, DETAIL_HEIGHT)
    terrain = lidar["project"](
        lidar["read_survey"]("dtm", bounds), bounds, DETAIL_WIDTH, DETAIL_HEIGHT
    )
    # Clip to the Princes Street frontage. At the parts that the two
    # cameras cannot see, leave the map's surveyed and shaded roofs visible.
    margin = np.minimum.reduce((x + 48.5, 43.0 - x, y - 3.2, 32.0 - y))
    roof = (margin > 0) & (elevation - terrain > 8)
    slope_south, slope_east = np.gradient(
        elevation, abs(grid.e) * MERCATOR_METRE, grid.a * MERCATOR_METRE
    )
    roof &= np.hypot(slope_south, slope_east) < 1.15
    # The original frame has a lower viewing angle. Use it where the
    # reverse view is absent, then keep its calibrated central deck.
    atlas = Image.new("RGBA", (DETAIL_WIDTH, DETAIL_HEIGHT))
    for frame, plane, focal in (
        (east_frame, east_plane, 2600),
        (north_frame, fit_roof_plane(NORTH_ANCHORS), 2700),
    ):
        camera = roof_frame_camera(plane, focal, frame)
        cam_x, cam_y, cam_z = -np.linalg.solve(camera[:, :3], camera[:, 3])
        cam_z += PHOTO["flatRoof"]["elevation"]
        camera_east, camera_north = origin + (cam_x * along + cam_y * inward) / MERCATOR_METRE
        visible = np.zeros_like(roof)
        visible[roof] = visible_from_camera(
            surface, surface_grid, mx[roof], my[roof], elevation[roof],
            camera_east, camera_north, cam_z,
        )
        facing = (
            cam_z - elevation
            - slope_east * (camera_east - mx) * MERCATOR_METRE
            + slope_south * (camera_north - my) * MERCATOR_METRE
        )
        visible &= facing > 15
        height = elevation[visible] - PHOTO["flatRoof"]["elevation"]
        pixel = np.column_stack((x[visible], y[visible], height, np.ones(height.size))) @ camera.T
        u, v = (pixel[:, :2] / pixel[:, 2:3]).T
        frame_edge = np.minimum.reduce((u, v, frame.width - 1 - u, frame.height - 1 - v))
        rgb = sample(np.asarray(frame), u, v)
        weight = np.clip(margin[visible] / 1.3, 0, 1) * np.clip(frame_edge / 16, 0, 1)
        rgba = np.zeros((*roof.shape, 4), dtype="uint8")
        rgba[visible] = np.column_stack((rgb, weight * 248))
        # Drop isolated slivers at steep ridges and feather the remaining
        # edges into the shaded roof without sampling the occluded side.
        alpha = (
            Image.fromarray(rgba[:, :, 3])
            .filter(ImageFilter.MinFilter(7))
            .filter(ImageFilter.MaxFilter(7))
            .filter(ImageFilter.GaussianBlur(3.2))
        )
        rgba[:, :, 3] = np.minimum(rgba[:, :, 3], np.asarray(alpha))
        atlas.alpha_composite(Image.fromarray(rgba))
    atlas = extract_roof_detail(atlas)
    atlas.alpha_composite(deck)
    return atlas


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Full-resolution source listed in the licence notice.")
    parser.add_argument("--detail-frame", action="store_true", help="Use the 4K video frame at 00:31.")
    parser.add_argument("--north-frame", type=Path, help="Add the reverse 4K view at 00:29.")
    args = parser.parse_args()
    if args.north_frame and not args.detail_frame:
        parser.error("--north-frame requires --detail-frame.")
    photo = Image.open(args.source).convert("RGB")
    bounds = transform_bounds("EPSG:4326", "EPSG:3857", *PHOTO["bounds"])
    if args.detail_frame:
        if photo.size != (3840, 2160):
            parser.error("Use the uncropped 3840 × 2160 video frame at 00:31.")
        north_frame = None
        if args.north_frame:
            north_frame = Image.open(args.north_frame).convert("RGB")
            if north_frame.size != (3840, 2160):
                parser.error("Use the uncropped 3840 × 2160 reverse view at 00:29.")
        output = ROOT / "public" / PHOTO["detailTexture"].lstrip("/")
        register_detail_frames(photo, north_frame, bounds).save(
            output, quality=91, method=6, alpha_quality=95, exact=True
        )
        print(f"{output.name}: {output.stat().st_size:,} bytes")
        return
    if photo.size != (4032, 2268):
        parser.error("Use the original, uncropped photo.")

    lidar = runpy.run_path(str(ROOT / "scripts/build-waverley-lidar.py"))
    grid = from_bounds(*bounds, WIDTH, HEIGHT)
    # A margin is needed to detect occlusion from adjacent structures.
    west, south, east, north = bounds
    padded = (west - 22, south - 22, east + 22, north + 22)
    measured = lidar["read_survey"]("dsm", padded)
    surface = lidar["project"](measured, padded, WIDTH + 160, HEIGHT + 160)
    surface_grid = from_bounds(*padded, WIDTH + 160, HEIGHT + 160)
    elevation = lidar["project"](measured, bounds, WIDTH, HEIGHT)

    row, col = np.indices(elevation.shape)
    mx, my = grid.c + (col + 0.5) * grid.a, grid.f + (row + 0.5) * grid.e
    camera_x, camera_y, _, _ = transform_bounds(
        "EPSG:4326", "EPSG:3857", CAMERA_LON, CAMERA_LAT, CAMERA_LON, CAMERA_LAT
    )
    x, y = (mx - camera_x) * MERCATOR_METRE, (my - camera_y) * MERCATOR_METRE
    along = x * math.sin(YAW) + y * math.cos(YAW)
    across = x * math.cos(YAW) - y * math.sin(YAW)
    aperture = np.asarray(photo)
    atlas = Image.new("RGBA", (WIDTH, HEIGHT))
    for plane, polygon in ROOF_PLANES:
        # Project the fit plane instead of reprojecting each LiDAR return.
        # This keeps features on a flat roof straight through height noise.
        z = plane - ALTITUDE
        depth = along * math.cos(PITCH) + z * math.sin(PITCH)
        u = photo.width / 2 + FOCAL * across / depth
        v = photo.height / 2 + FOCAL * (along * math.sin(PITCH) - z * math.cos(PITCH)) / depth
        alpha = sample(roof_mask(photo.size, polygon)[..., None], u, v)[..., 0]
        confidence = np.nan_to_num(np.clip((2.7 - abs(elevation - plane)) / 1.6, 0, 1))
        alpha *= confidence
        visible = alpha > 0
        alpha[visible] *= visible_from_camera(
            surface, surface_grid, mx[visible], my[visible],
            elevation[visible], camera_x, camera_y, ALTITUDE,
        )
        alpha = np.asarray(Image.fromarray(alpha.astype("uint8")).filter(ImageFilter.GaussianBlur(1)))
        rgb = sample(aperture, u, v)
        atlas.alpha_composite(Image.fromarray(np.dstack((rgb, alpha)).astype("uint8")))

    output = ROOT / "public" / PHOTO["texture"].lstrip("/")
    atlas.save(output, quality=86, method=6, alpha_quality=95)
    print(f"{output.name}: {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
