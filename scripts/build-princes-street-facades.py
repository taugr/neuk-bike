"""Project four licensed street photos into one map-aligned façade texture."""

import argparse
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
FRONTAGE = json.loads((ROOT / "src/data/princes-street-facades.json").read_text())
WIDTH, HEIGHT = 1536, 408
LENGTH = 94.14

# Source image, calibration resize, image corners (NW, NE, SE, SW), destination
# width in metres, and top/bottom elevations at the west and east endpoints.
# Photos of the white buildings overlap along the west end of the block.
PATCHES = [
    ("8383344.jpg", "1120x", [(22, 331), (99, 346), (103, 638), (22, 641)],
     (0, 5.4), (82.0, 82.0), (67.5, 67.5)),
    ("19-20.jpg", "1120x840>", [(-49, 252), (322, 353), (345, 751), (-39, 757)],
     (0, 27.6), (82.0, 82.1), (67.5, 67.2)),
    ("19-20.jpg", "1120x840>", [(317, 190), (571, 326), (607, 750), (345, 751)],
     (27.6, 41.8), (89.1, 89.1), (67.2, 67.0)),
    ("16-18.jpg", "1120x840>", [(143, 250), (276, 235), (277, 608), (130, 603)],
     (41.8, 49.4), (85.0, 85.0), (67.0, 66.9)),
    ("16-18.jpg", "1120x840>", [(279, 466), (391, 457), (391, 611), (279, 608)],
     (49.4, 56.0), (72.1, 72.1), (66.9, 66.9)),
    ("10-15.jpg", "1120x840>", [(178, 213), (861, 82), (902, 515), (141, 489)],
     (49.4, LENGTH), (86.7, 86.7), (66.9, 66.8)),
]


def magick(*args):
    subprocess.run(["magick", *map(str, args)], check=True)


def x(distance):
    return (WIDTH - 1) * distance / LENGTH


def y(elevation):
    return (HEIGHT - 1) * (FRONTAGE["top"] - elevation) / (
        FRONTAGE["top"] - FRONTAGE["bottom"]
    )


def polygon(points):
    return "polygon " + " ".join(f"{px:.3f},{py:.3f}" for px, py in points)


def make_patch(source_dir, work, patch_index, patch):
    name, size, corners, (west, east), (top_w, top_e), (base_w, base_e) = patch
    target = [(x(west), y(top_w)), (x(east), y(top_e)),
              (x(east), y(base_e)), (x(west), y(base_w))]
    control_points = " ".join(
        f"{sx},{sy} {dx:.3f},{dy:.3f}"
        for (sx, sy), (dx, dy) in zip(corners, target)
    )
    warped = work / "warped.png"
    mask = work / "mask.png"
    output = work / f"patch-{patch_index}.png"
    magick(
        source_dir / name, "-auto-orient", "-resize", size, "-alpha", "on",
        "-virtual-pixel", "transparent", "-define", f"distort:viewport={WIDTH}x{HEIGHT}+0+0",
        "-distort", "Perspective", control_points, "+repage", warped,
    )
    # Leave the lowest part of busy pavement shots to the shaded model. Clip
    # the bus, bus shelter and passing riders out of the affected patches.
    street_cut = 2.05
    visible = [*target[:2], (x(east), y(base_e + street_cut)), (x(west), y(base_w + street_cut))]
    commands = ["-fill", "white", "-draw", polygon(visible)]
    holes = {
        3: [(41.7, 70.9), (45.0, 70.9), (45.0, 66.1), (41.7, 66.1)],
        5: [(49.0, 74.1), (56.4, 74.1), (56.4, 71.0), (63.5, 71.0),
            (63.5, 66.1), (49.0, 66.1)],
    }
    if patch_index in holes:
        path = polygon([(x(distance), y(elevation)) for distance, elevation in holes[patch_index]])
        commands.extend(["-fill", "black", "-draw", path])
    magick("-size", f"{WIDTH}x{HEIGHT}", "xc:black", *commands,
           "-blur", "0x0.85", "-alpha", "copy", mask)
    magick(warped, mask, "-compose", "DstIn", "-composite", output)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path, help="Source JPEGs named as in the texture licence.")
    args = parser.parse_args()
    output = ROOT / "public" / FRONTAGE["texture"].lstrip("/")
    with tempfile.TemporaryDirectory() as temp:
        work = Path(temp)
        patches = [make_patch(args.source_dir, work, index, patch) for index, patch in enumerate(PATCHES)]
        magick(*patches, "-background", "none", "-flatten", "-strip", "-quality", "82", output)
    print(f"{output.name}: {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
