"""Find visual façade divisions from mapped walls and terrace entrances."""

import math
import re

import osmium
from shapely import line_merge
from shapely.affinity import scale
from shapely.geometry import Point
from shapely.strtree import STRtree

METRES_X = 62_600
METRES_Y = 111_200


def terrace_addresses(pbf, bounds):
    xmin, ymin, xmax, ymax = bounds
    points = []
    numbers = []
    for node in (osmium.FileProcessor(str(pbf), osmium.osm.NODE)
                 .with_filter(osmium.filter.KeyFilter("addr:housenumber", "entrance"))):
        if not (xmin <= node.lon <= xmax and ymin <= node.lat <= ymax):
            continue
        number = node.tags.get("addr:housenumber", "")
        if re.fullmatch(r"[0-9]+[A-Za-z]?", number):
            points.append(Point(node.lon, node.lat))
            numbers.append(number.casefold())
        elif node.tags.get("entrance") in ("main", "yes", "home"):
            points.append(Point(node.lon, node.lat))
            numbers.append(None)
    return points, numbers, STRtree(points)


def mapped_terrace_dividers(polygon, addresses):
    """Use the midpoints between a complete-looking row of mapped dwelling entrances."""
    points, numbers, tree = addresses
    # A mapped threshold can sit just outside the wall line.
    near = polygon.buffer(0.000008)
    candidates = [i for i in tree.query(near) if near.covers(points[i])]
    addressed = [i for i in candidates if numbers[i]]
    if len({numbers[i] for i in addressed}) >= 2:
        candidates = list({numbers[i]: i for i in addressed}.values())
    else:
        candidates = [i for i in candidates if not numbers[i]]
        if len(candidates) < 3:
            return []
    if len(candidates) < 2:
        return []

    metric = scale(polygon, xfact=METRES_X, yfact=METRES_Y, origin=(0, 0))
    rectangle = list(metric.minimum_rotated_rectangle.exterior.coords)
    edges = [(b[0] - a[0], b[1] - a[1]) for a, b in zip(rectangle, rectangle[1:])]
    dx, dy = max(edges, key=lambda v: math.hypot(*v))
    length = math.hypot(dx, dy)
    if length < 8 or length / min(math.hypot(*v) for v in edges) < 1.45:
        return []
    ux, uy = dx / length, dy / length
    along = lambda x, y: x * ux + y * uy
    across = lambda x, y: x * -uy + y * ux
    lo = min(along(x, y) for x, y in rectangle)
    hi = max(along(x, y) for x, y in rectangle)
    values = sorted(along(points[i].x * METRES_X, points[i].y * METRES_Y) for i in candidates)
    distinct = [values[0]]
    for value in values[1:]:
        if value - distinct[-1] >= 1.2:
            distinct.append(value)
    gaps = [b - a for a, b in zip(distinct, distinct[1:])]
    if not gaps or min(gaps) < 2.8 or max(gaps) > 14 or max(gaps) / min(gaps) > 2:
        return []
    if max(distinct[0] - lo, hi - distinct[-1]) > 0.9 * max(gaps):
        return []

    across_lo = min(across(x, y) for x, y in rectangle) - 1
    across_hi = max(across(x, y) for x, y in rectangle) + 1
    def point(s, t):
        return [round((s * ux - t * uy) / METRES_X, 9),
                round((s * uy + t * ux) / METRES_Y, 9)]
    return [[point((a + b) / 2, across_lo), point((a + b) / 2, across_hi)]
            for a, b in zip(distinct, distinct[1:])]


def party_wall_joints(polygons):
    """Locate ends of mapped shared walls, including an edge split by a node."""
    tree = STRtree(polygons)
    joints = [set() for _ in polygons]
    for i, polygon in enumerate(polygons):
        boundary = polygon.boundary
        for j in tree.query(polygon, predicate="touches"):
            if j <= i:
                continue
            shared = boundary.intersection(polygons[j].boundary)
            lines = [shared] if shared.geom_type == "LineString" else getattr(shared, "geoms", [])
            if shared.geom_type == "MultiLineString":
                merged = line_merge(shared)
                lines = [merged] if merged.geom_type == "LineString" else merged.geoms
            for line in lines:
                if line.geom_type != "LineString" or line.length * METRES_X < 1.1:
                    continue
                ends = [tuple(line.coords[0][:2]), tuple(line.coords[-1][:2])]
                joints[i].update(ends)
                joints[j].update(ends)
    return joints
