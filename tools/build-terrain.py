"""Sample real Terrarium DEM once; rebuild lightweight terrain offline from statistics.

--sample downloads/caches PNGs (requires Pillow). Default and --check need only
Python's standard library and the committed per-hex statistics, never network.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import io
import json
import math
from pathlib import Path
import statistics
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/game'
SAMPLES = ROOT / 'tools/data/terrain-samples.json'
CONFIG = ROOT / 'tools/terrain-config.json'
URL = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'

def geography():
    return json.loads((ASSETS / 'geography.js').read_text().split('export const GEOGRAPHY = ', 1)[1].strip().removesuffix(';'))

def land_ids(g):
    ids, offset = [], 0
    for owner, count in zip(g['ownersRLE'][::2], g['ownersRLE'][1::2]):
        if owner:
            ids.extend(range(offset, offset + count))
        offset += count
    return ids

def coordinates(g, tile, x=0, y=0):
    """Inverse of Board.project; x/y are offsets in units of hex radius."""
    row, col = divmod(tile, g['columns'])
    ref = g['georeference']
    return ((col + .5 * (row % 2) + x / math.sqrt(3) - ref['lon'][1]) / ref['lon'][0],
            (row + y / 1.5 - ref['lat'][1]) / ref['lat'][0])

def offsets(step):
    n = round(1 / step)
    return [(i * step, j * step) for i in range(-n, n + 1) for j in range(-n, n + 1)
            if abs(i * step) <= math.sqrt(3) / 2 and abs(j * step) <= 1 - abs(i * step) / math.sqrt(3) + 1e-9]

def pixel(lon, lat, zoom):
    size = 256 * 2 ** zoom
    return ((lon + 180) / 360 * size,
            (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * size)

def percentile(values, fraction):
    a = sorted(values)
    index = (len(a) - 1) * fraction
    lo = math.floor(index)
    return a[lo] + (a[min(lo + 1, len(a) - 1)] - a[lo]) * (index - lo)

def classify(median, relief, cfg):
    if median >= cfg['mountainMedianMeters'] or (median >= cfg['mountainReliefMinMedianMeters'] and relief >= cfg['mountainReliefMeters']):
        return 'mountain'
    if median >= cfg['hillsMedianMeters'] or (median >= cfg['hillsReliefMinMedianMeters'] and relief >= cfg['hillsReliefMeters']):
        return 'hills'
    return 'plains'

def sample(g, cfg, cache):
    from PIL import Image
    points = {tile: [[pixel(*coordinates(g, tile, x * scale, y * scale), cfg['zoom']) for x, y in offsets(cfg['sampleStep'])]
                    for scale in cfg['coastalFootprintScales']]
              for tile in land_ids(g)}
    keys = sorted({(int(x) // 256, int(y) // 256) for groups in points.values() for pts in groups for x, y in pts})
    cache.mkdir(parents=True, exist_ok=True)
    def fetch(key):
        x, y = key
        url = URL.format(z=cfg['zoom'], x=x, y=y)
        path = cache / f'{cfg["zoom"]}-{x}-{y}.png'
        if not path.exists():
            with urllib.request.urlopen(url, timeout=60) as response:
                raw = response.read()
            im = Image.open(io.BytesIO(raw))
            im.load()
            if im.size != (256, 256) or im.mode != 'RGB':
                raise ValueError(f'Invalid DEM tile: {url}')
            path.write_bytes(raw)
        raw = path.read_bytes()
        im = Image.open(io.BytesIO(raw))
        im.load()
        if im.size != (256, 256) or im.mode != 'RGB':
            raise ValueError(f'Invalid cached DEM tile: {path}')
        return key, im, dict(url=url, sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        fetched = list(executor.map(fetch, keys))
    images = {key: im for key, im, _ in fetched}
    rows = []
    for tile, groups in points.items():
        for scale, pts in zip(cfg['coastalFootprintScales'], groups):
            heights = []
            for px, py in pts:
                x, y = int(px), int(py)
                r, green, b = images[x // 256, y // 256].getpixel((x % 256, y % 256))
                height = r * 256 + green + b / 256 - 32768
                if not -12000 < height < 9000:
                    raise ValueError(f'Invalid elevation at tile {tile}: {height}')
                if height >= 0:
                    heights.append(height)
            if heights:
                break
        if not heights:
            raise ValueError(f'No land DEM near generalized coastal tile {tile}; inspect georeference')
        med = statistics.median(heights)
        relief = percentile(heights, .9) - percentile(heights, .1)
        rows.append([tile, round(med, 2), round(relief, 2), len(heights), round(statistics.mean(heights), 2), scale])
    return dict(schema=1, mapId=g['id'], maskSha256=g['sourceHashes']['korea_72x126_mask.txt'],
                georeference=g['georeference'], zoom=cfg['zoom'], sampleStep=cfg['sampleStep'], coastalFootprintScales=cfg['coastalFootprintScales'],
                samplesPerHex=len(offsets(cfg['sampleStep'])), downloadedAt=datetime.date.today().isoformat(),
                source='Mapzen / Tilezen Terrain Tiles on AWS (USGS SRTM/GMTED2010; NOAA ETOPO1 bathymetry)',
                sources=[meta for _, _, meta in fetched],
                columns=['tile', 'medianMeters', 'p90MinusP10Meters', 'nonnegativeSamples', 'meanMeters', 'footprintScale'], rows=rows)

def generate(g, cfg, data):
    assert data['mapId'] == g['id'] and data['maskSha256'] == g['sourceHashes']['korea_72x126_mask.txt'], 'Map changed: resample DEM'
    assert data['georeference'] == g['georeference'], 'Coordinates changed: resample DEM'
    assert data['zoom'] == cfg['zoom'] and data['sampleStep'] == cfg['sampleStep'], 'Sampling configuration changed: resample DEM'
    assert data['coastalFootprintScales'] == cfg['coastalFootprintScales'], 'Coastal sampling changed: resample DEM'
    assert [r[0] for r in data['rows']] == land_ids(g), 'Incomplete or unordered terrain samples'
    assert data['samplesPerHex'] == len(offsets(cfg['sampleStep']))
    codes, counts = [], dict(plains=0, hills=0, mountain=0)
    for tile, med, relief, count, avg, scale in data['rows']:
        assert all(math.isfinite(x) for x in [med, relief, avg]) and med >= 0 and relief >= 0
        assert isinstance(count, int) and 0 < count <= data['samplesPerHex'] and scale in cfg['coastalFootprintScales']
        terrain = classify(med, relief, cfg)
        counts[terrain] += 1
        codes.append(str(['plains', 'hills', 'mountain'].index(terrain)))
    result = dict(mapId=g['id'], columns=g['columns'], rows=g['rows'], maskSha256=data['maskSha256'],
                  georeference=g['georeference'], counts=counts, landCodes=''.join(codes))
    return '// Generated by tools/build-terrain.py. See docs/TERRAIN.md for DEM attribution.\nexport const TERRAIN_DATA = ' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n', counts

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sample', action='store_true')
    parser.add_argument('--cache', type=Path, default=ROOT / 'test-results/dem-cache')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.sample and args.check:
        parser.error('--sample and --check are mutually exclusive')
    g, cfg = geography(), json.loads(CONFIG.read_text())
    if args.sample:
        data = sample(g, cfg, args.cache)
        SAMPLES.parent.mkdir(parents=True, exist_ok=True)
        SAMPLES.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    else:
        data = json.loads(SAMPLES.read_text())
    content, counts = generate(g, cfg, data)
    target = ASSETS / 'terrain-data.js'
    if args.check:
        assert target.read_text() == content, 'terrain-data.js stale; run python3 tools/build-terrain.py'
    else:
        target.write_text(content)
    print(json.dumps(dict(counts=counts, samplesPerHex=data['samplesPerHex'],
                          coastalBufferHexes=[r[0] for r in data['rows'] if r[5] != 1]), ensure_ascii=False))

if __name__ == '__main__':
    main()
