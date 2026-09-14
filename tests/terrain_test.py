import copy
import importlib.util
import json
import math
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('terrain', ROOT / 'tools/build-terrain.py')
terrain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(terrain)

class TerrainTests(unittest.TestCase):
    def setUp(self):
        self.cfg = json.loads(terrain.CONFIG.read_text())

    def test_boundaries(self):
        c = lambda median, relief: terrain.classify(median, relief, self.cfg)
        self.assertEqual(c(649, 0), 'hills')
        self.assertEqual(c(650, 0), 'mountain')
        self.assertEqual(c(150, 449), 'hills')
        self.assertEqual(c(150, 450), 'mountain')
        self.assertEqual(c(149, 0), 'plains')
        self.assertEqual(c(150, 0), 'hills')
        self.assertEqual(c(40, 119), 'plains')
        self.assertEqual(c(40, 120), 'hills')
        self.assertEqual(c(2, 187), 'plains')  # floodplain with hills in footprint
        self.assertAlmostEqual(terrain.percentile([0, 10, 20, 30, 40], .1), 4)

    def test_geometry(self):
        g = terrain.geography()
        pts = terrain.offsets(self.cfg['sampleStep'])
        self.assertEqual(len(pts), 67)
        self.assertIn((0, 0), pts)
        for x, y in pts:
            self.assertLessEqual(abs(x), math.sqrt(3) / 2)
            self.assertLessEqual(abs(y), 1 - abs(x) / math.sqrt(3) + 1e-9)
        for tile in terrain.land_ids(g):
            lon, lat = terrain.coordinates(g, tile)
            row, col = divmod(tile, g['columns'])
            self.assertAlmostEqual(lon*g['georeference']['lon'][0]+g['georeference']['lon'][1], col+.5*(row%2))
            self.assertAlmostEqual(lat*g['georeference']['lat'][0]+g['georeference']['lat'][1], row)

    def test_reproducibility(self):
        data = json.loads(terrain.SAMPLES.read_text())
        g = terrain.geography()
        output, counts = terrain.generate(g, self.cfg, data)
        self.assertEqual(output, (terrain.ASSETS/'terrain-data.js').read_text())
        self.assertEqual(sum(counts.values()), 2411)
        for mutate in [lambda d:d['rows'].pop(), lambda d:d.update(maskSha256='bad'),
                       lambda d:d['rows'][0].__setitem__(1, float('nan')),
                       lambda d:d['rows'][0].__setitem__(3, 0)]:
            bad = copy.deepcopy(data)
            mutate(bad)
            with self.assertRaises(AssertionError):
                terrain.generate(g, self.cfg, bad)

if __name__ == '__main__':
    unittest.main()
