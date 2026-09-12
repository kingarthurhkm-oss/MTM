"""Build a small, offline map from world-atlas 2.0.2 / Natural Earth 1:50m.

Only coastlines and country boundaries come from geographic data. Terrain,
roads, infrastructure and formations are procedural game content.
Usage: python3 tools/build-geography.py /path/to/countries-50m.json
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COLUMNS, ROWS = 240, 480
topo = json.loads(Path(sys.argv[1]).read_text()) if len(sys.argv) > 1 else None
if topo is None:
    existing = json.loads((ROOT / 'app/src/main/assets/game/geography.js').read_text().split(' = ', 1)[1].rstrip(';\n'))
    countries = existing['countries']
else:
    sx, sy = topo['transform']['scale']
    tx, ty = topo['transform']['translate']
    arcs = []
    for arc in topo['arcs']:
        x = y = 0
        out = []
        for dx, dy in arc:
            x += dx
            y += dy
            out.append([x * sx + tx, y * sy + ty])
        arcs.append(out)


    def ring(ids):
        out = []
        for index in ids:
            points = arcs[index] if index >= 0 else arcs[~index][::-1]
            out.extend(points if not out else points[1:])
        return out


    def clip(points):
        for axis, boundary, greater in [(0, 118, True), (0, 147, False),
                                        (1, 24, True), (1, 46, False)]:
            old, points = points, []
            if not old:
                break
            prev = old[-1]
            for cur in old:
                inside = (cur[axis] >= boundary) if greater else (cur[axis] <= boundary)
                was_inside = (prev[axis] >= boundary) if greater else (prev[axis] <= boundary)
                if inside != was_inside:
                    f = (boundary - prev[axis]) / (cur[axis] - prev[axis])
                    points.append([prev[0] + f * (cur[0] - prev[0]), prev[1] + f * (cur[1] - prev[1])])
                if inside:
                    points.append(cur)
                prev = cur
        return [[round(x, 4), round(y, 4)] for x, y in points]


    countries = []
    for geom in topo['objects']['countries']['geometries']:
        if geom.get('type') not in ['Polygon', 'MultiPolygon']:
            continue
        polys = [geom['arcs']] if geom['type'] == 'Polygon' else geom['arcs']
        polys = [[clip(ring(a)) for a in poly] for poly in polys]
        polys = [[r for r in poly if len(r) >= 3] for poly in polys]
        polys = [p for p in polys if p]
        if polys:
            countries.append({'id': str(geom['id']), 'name': geom['properties']['name'], 'polygons': polys})


def contains(point, points):
    x, y = point
    inside = False
    px, py = points[-1]
    for cx, cy in points:
        if (cy > y) != (py > y) and x < (px - cx) * (y - cy) / (py - cy) + cx:
            inside = not inside
        px, py = cx, cy
    return inside


def merc(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


indexed = []
for c in countries:
    for poly in c['polygons']:
        outer = poly[0]
        xs, ys = zip(*outer)
        indexed.append((min(xs), max(xs), min(ys), max(ys), c['id'], poly))
cells = []
top, bottom = merc(46), merc(24)
for row in range(ROWS):
    for col in range(COLUMNS):
        lon = 118 + col / (COLUMNS - 1) * 29
        y = top - (row + (col % 2) * 0.5) / (ROWS - .5) * (top - bottom)
        lat = math.degrees(2 * math.atan(math.exp(y)) - math.pi / 2)
        owner = 0
        for x0, x1, y0, y1, cid, poly in indexed:
            if x0 <= lon <= x1 and y0 <= lat <= y1 and contains((lon, lat), poly[0]):
                if any(contains((lon, lat), hole) for hole in poly[1:]):
                    continue
                owner = 1 if cid == '410' else 2 if cid == '408' else 3
                break
        cells.append(owner)

# Preserve small Korean islands below the tile resolution. These are display
# and gameplay markers, not legal maritime boundaries or surveyed outlines.
islands = [('제주도', 126.55, 33.38), ('울릉도', 130.90, 37.50),
           ('독도', 131.87, 37.24), ('백령도', 124.67, 37.97),
           ('연평도', 125.69, 37.67), ('흑산도', 125.43, 34.68),
           ('거문도', 127.31, 34.03)]
for name, lon, lat in islands:
    col = round((lon - 118) / 29 * (COLUMNS - 1))
    row = round((top - merc(lat)) / (top - bottom) * (ROWS - .5) - (col % 2) * .5)
    cells[row * COLUMNS + col] = 1
rle = []
for cell in cells:
    if rle and rle[-2] == cell:
        rle[-1] += 1
    else:
        rle.extend([cell, 1])
data = {'columns': COLUMNS, 'rows': ROWS, 'bounds': [118, 24, 147, 46],
        'countries': countries, 'ownersRLE': rle, 'islands': islands,
        'source': 'world-atlas 2.0.2 / Natural Earth 1:50m'}
previous = json.loads((ROOT / 'app/src/main/assets/game/geography.js').read_text().split(' = ', 1)[1].rstrip(';\n'))
data['legacyMap'] = previous.get('legacyMap') or {k: previous[k] for k in ('columns', 'rows', 'ownersRLE')}
(ROOT / 'app/src/main/assets/game/geography.js').write_text(
    'export const GEOGRAPHY = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('Map:', len(cells), 'tiles;', {i: cells.count(i) for i in range(4)})
