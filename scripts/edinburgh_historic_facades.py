"""Associate historic street-facing walls with mapped streets and ground-floor uses."""

from collections import Counter
from itertools import pairwise
import json
import math
import re
from urllib.parse import urlencode
from urllib.request import urlopen

import osmium
from shapely import make_valid, prepare
from shapely.affinity import scale
from shapely.geometry import LineString, Point, shape
from shapely.strtree import STRtree

from edinburgh_terraces import METRES_X, METRES_Y

AREAS = {"Old Town": "old-town", "New Town": "new-town"}
CONSERVATION_AREAS = (
    "https://services2.arcgis.com/1qjjJoUN1p26Md36/ArcGIS/rest/services/"
    "EdinConservationAreas/FeatureServer/0/query?"
    + urlencode({"where": "Name IN ('Old Town','New Town')", "outFields": "Name",
                 "outSR": 4326, "f": "geojson"})
)
BUILDINGS = {
    "yes", "house", "apartments", "residential", "terrace", "detached",
    "semidetached_house", "retail", "commercial", "mixed_use", "office",
    "hotel", "dormitory",
}
STREETS = {
    "living_street", "residential", "pedestrian", "unclassified", "primary",
    "secondary", "tertiary", "service", "footway", "steps", "path",
}
SHOP_AMENITIES = {"bar", "cafe", "fast_food", "pub", "restaurant", "pharmacy", "bank"}


def eligible_building(tags):
    year = re.match(r"^(\d{4})", tags.get("start_date", ""))
    return (
        tags.get("building") in BUILDINGS
        and (not year or int(year[1]) < 1950)
        and tags.get("building:material") not in ("glass", "metal")
        and tags.get("amenity") not in ("place_of_worship", "university", "school", "hospital")
        and tags.get("tourism") not in ("museum", "gallery")
        and tags.get("historic") not in ("castle", "monument", "ruins", "city_gate")
        and tags.get("railway") is None
        and tags.get("shop") not in ("mall", "supermarket")
    )


def ground_shop(tags):
    shop = tags.get("shop")
    return (
        (bool(shop and shop not in ("no", "vacant", "mall", "supermarket"))
         or tags.get("amenity") in SHOP_AMENITIES)
        and tags.get("level", "0") in ("0", "0.0")
        and tags.get("location") != "underground"
    )


def metric(geometry):
    return scale(geometry, xfact=METRES_X, yfact=METRES_Y, origin=(0, 0))


class HistoricFacades:
    def __init__(self, pbf, stage):
        path = stage / "conservation.geojson"
        if not path.exists():
            with urlopen(CONSERVATION_AREAS, timeout=30) as response:
                raw = response.read()
        else:
            raw = path.read_bytes()
        self.areas = {
            AREAS[feature["properties"]["Name"]]: make_valid(shape(feature["geometry"]))
            for feature in json.loads(raw)["features"]
            if feature["properties"]["Name"] in AREAS
        }
        if set(self.areas) != set(AREAS.values()) or any(area.is_empty for area in self.areas.values()):
            raise ValueError("Expected both Edinburgh Old Town and New Town conservation areas")
        if not path.exists():
            path.write_bytes(raw)
        for area in self.areas.values():
            prepare(area)
        self.counts = Counter()
        bounds = [area.bounds for area in self.areas.values()]
        self.bounds = (min(a[0] for a in bounds) - 0.0006, min(a[1] for a in bounds) - 0.0004,
                       max(a[2] for a in bounds) + 0.0006, max(a[3] for a in bounds) + 0.0004)
        streets, doors, shops = [], [], []
        for obj in (osmium.FileProcessor(str(pbf), osmium.osm.NODE | osmium.osm.WAY)
                    .with_locations()
                    .with_filter(osmium.filter.KeyFilter("highway", "entrance", "shop", "amenity"))):
            tags = obj.tags
            if obj.is_node():
                if not self.near_districts(obj.lon, obj.lat):
                    continue
                point = Point(obj.lon * METRES_X, obj.lat * METRES_Y)
                if tags.get("entrance") in ("main", "yes", "home", "staircase"):
                    doors.append(point)
                if ground_shop(tags):
                    shops.append(point)
                continue
            highway = tags.get("highway")
            if (highway not in STREETS or tags.get("tunnel") not in (None, "no")
                    or tags.get("bridge") not in (None, "no")
                    or tags.get("service") in ("parking_aisle", "driveway")
                    or (highway in ("steps", "path", "footway", "service") and not tags.get("name"))):
                continue
            for a, b in pairwise(obj.nodes):
                if not (a.location.valid() and b.location.valid()
                        and (self.near_districts(a.lon, a.lat) or self.near_districts(b.lon, b.lat))):
                    continue
                line = LineString([(a.lon * METRES_X, a.lat * METRES_Y), (b.lon * METRES_X, b.lat * METRES_Y)])
                if line.length >= 0.4:
                    streets.append(line)
        self.streets = STRtree(streets)
        self.doors = STRtree(doors)
        self.shops = STRtree(shops)

    def near_districts(self, lon, lat):
        west, south, east, north = self.bounds
        return west <= lon <= east and south <= lat <= north

    def set_footprints(self, polygons):
        self.solids = STRtree([
            metric(polygon) for polygon in polygons
            if self.near_districts(polygon.centroid.x, polygon.centroid.y)
        ])

    def frontage(self, polygon, center, levels, shop):
        if not self.near_districts(center.x, center.y):
            return
        district = next((name for name, area in self.areas.items() if area.covers(center)), None)
        if not district:
            return
        walls = metric(polygon)
        vertices = list(walls.exterior.coords)
        winding = 1 if walls.exterior.is_ccw else -1
        shop_points = [self.shops.geometries[i] for i in self.shops.query(walls, predicate="covers")]
        doorway_points = [self.doors.geometries[i] for i in self.doors.query(walls.boundary.buffer(0.9), predicate="intersects")]
        faces = []
        rear = []
        fronts = []
        for index, (a, b) in enumerate(zip(vertices, vertices[1:])):
            side = LineString([a, b])
            width = side.length
            if width < 3.6 or width > 70:
                continue
            nx, ny = winding * (b[1] - a[1]) / width, winding * (a[0] - b[0]) / width
            midpoint = side.interpolate(0.5, normalized=True)
            # Shared and embedded walls do not get openings.
            if any(self.solids.query(Point(p.x + nx * 0.65, p.y + ny * 0.65), predicate="within").size
                   for fraction in (0.15, 0.5, 0.85) for p in [side.interpolate(fraction, normalized=True)]):
                continue
            doors = [round(side.project(p, normalized=True), 4) for p in doorway_points
                     if side.distance(p) <= 0.9 and 0.07 < side.project(p, normalized=True) < 0.93]
            street = self.street_in_front(midpoint, nx, ny)
            if not street and not doors:
                rear.append((index, nx, ny, midpoint))
                continue
            shops = [round(side.project(p, normalized=True), 4) for p in shop_points
                     if side.distance(p) <= 8 and 0.08 < side.project(p, normalized=True) < 0.92]
            if shop and street and not shops:
                shops = [0.5]
            faces.append([index, "front", sorted(set(doors)), sorted(set(shops))])
            fronts.append((nx, ny))
        for index, nx, ny, middle in rear:
            if not any(nx * fx + ny * fy < -0.85 for fx, fy in fronts):
                continue
            if all((x - middle.x) * nx + (y - middle.y) * ny < 3.2 for x, y in vertices):
                faces.append([index, "rear", [], []])
        if faces:
            self.counts[district] += 1
            return {"district": district, "levels": levels, "faces": faces}

    def street_in_front(self, midpoint, nx, ny):
        for i in self.streets.query(midpoint, predicate="dwithin", distance=20):
            line = self.streets.geometries[i]
            start, end = line.coords
            if abs(nx * (end[0] - start[0]) + ny * (end[1] - start[1])) > 0.56 * line.length:
                continue
            nearest = line.interpolate(line.project(midpoint))
            dx, dy = nearest.x - midpoint.x, nearest.y - midpoint.y
            length = math.hypot(dx, dy)
            if length < 0.8 or dx * nx + dy * ny < 0.78 * length:
                continue
            ray = LineString([(midpoint.x + dx * (0.65 / length), midpoint.y + dy * (0.65 / length)), nearest])
            if not self.solids.query(ray, predicate="intersects").size:
                return True
        return False
