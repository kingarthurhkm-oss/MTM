# Korea Board

The sole game map is `korea-72x126-v1`. Both the public Army and fictional formation scenarios use this same Board. There is no East Asia mask, old-grid projection, old-map constructor, or fallback in the runtime. Saves require version 3 and the exact mapId; incompatible saves are rejected without mutating the current game. Autosaves use a separate Korea slot.

## Authoritative inputs

Vendored under `app/src/main/assets/game/data/korea-map/`:

- `korea_72x126_mask.txt`: all land/sea cells, unchanged.
- `korea_72x126_cities_ports_adjacent_sea.csv`: city row/col and corrected port_row/port_col. CSV display port coordinates are used even where original city coordinates differ, including Dokdo.
- `korea_72x126_ktx_hex_paths.csv`: route_id, sequence and tile anchors, unchanged.
- `korea_72x126_ktx_stations.csv`: station names and exact tile anchors.

`source-manifest.json` records upstream Git blob identities. Text is normalized to LF for cross-platform checks; data values are unchanged. The generated module stores SHA-256 hashes of vendored inputs. `npm test` checks compilation freshness. PNG is a visual reference only, never runtime terrain or a build input.

## Coordinate contract

The upstream script calls the display flat-top in a comment, but its actual centers and polygons implement **pointy-top odd-r**. Follow its math, not that comment.

```
axial.q = col - floor(row / 2)
axial.r = row
col = axial.q + floor(axial.r / 2)
row = axial.r
tile.id = row * metadata.columns + col

x = sqrt(3)*radius/2 + sqrt(3)*radius*(axial.q + axial.r/2)
y = radius + 1.5*radius*axial.r
distance = max(abs(dq), abs(dr), abs(dq + dr))
```

The half-hex padding is the only translation from Manus centers. Hex corners are at angles 30 + 60k degrees. Axial direction indices are NW, SE, W, SW, NE, E; opposites are 1,0,5,4,3,2. `tile.q/r` remain offset aliases for existing callers; `tile.axial` is always the geometry coordinate. No algorithm substitutes offset coordinates for axial ones. Clicks use the inverse pointy-top projection followed by cube rounding. `HexLayout` generates bounds, polygons and coastline edges. Camera fitting, minimap, labels, pointer transforms, paths, range rings and sectors all use these same coordinates.

## Facilities and rail

8 cities, 15 ports and 35 stations are ordinary Game sites with health, ownership, repair and supply behavior. Another 30 fictional power/comms/road/airport/energy sites preserve existing support systems. There are no procedural extra ports or imaginary rail lines. All ports are validated as coastal land with at least one sea neighbor.

Every CSV route retains its original ordered `points`. Expanded `segments` record the exact path between successive source sequence anchors. Deduplicated symmetric railEdges drive movement and supply discounts, and the renderer draws those same edges. Adjacent rail tiles without an edge do not receive a rail discount. Roads are rebuilt without clearing railEdges.

The source has two inconsistencies that cannot be fixed by coordinate conversion alone:

| Source span | Explicit connection |
|---|---|
| 경부고속철도 sequence 19 → 20 | 082-34 → **082-35** → 083-35 |
| 수서고속철도 SRT sequence 16 → 17 | 082-34 → **082-35** → 083-35 |
| 강릉선 KTX sequence 7 → 8 | 070-37 → **070-38** → 071-38 |

The three spans are two graph steps apart. Each gets the shortest land connection; original endpoints and sequence numbers remain intact. A disconnected path fails loudly instead of producing a visual-only line.

Mokpo station and Honam sequence 42 are **100-25**, which the mask marks as sea. The real port is the adjacent land tile **100-26**. Both sources are preserved: 100-25 remains neutral sea, with an explicit railBridge terminal reachable by land units/supply only over its rail edge. It does not permit walking into neighboring ordinary sea. The terminal's effective site control follows its connected shore; its sea tile control remains neutral. This is a source-data compatibility rule, not a claim about an actual offshore station.

## Ownership and formation placement

The inputs supply no country mask or geographic transform. An affine fit from original city raw offsets and lon/lat georeferences the new grid. Only the Korean country polygons from the previously bundled Natural Earth dataset are retained as build-time boundary metadata. Polygon inclusion assigns initial ownership; generalized coastal/island cells outside vector outlines use the nearest Korean boundary. No old tile mask or projection participates. Sea is always 0/neutral. City ownership is checked against named countries.

Army `region_id` resolves to a source city/station where available, otherwise an approximate municipality representative from `municipalities.json`. `place-army-regions.mjs` computes the nearest blue land tile, never reads/scales old hexes, and records the anchor basis in rok-army.json. Deployment chooses the nearest unoccupied blue land by hex distance, then world distance and stable tile ID. Support units reserve their positions first. Remaining support/naval collisions disperse on the correct domain; transports retain their adjacent port berth. Region labels continue to identify the starting municipality while unit.tile records its current location.

Terrain defaults to plains because the authoritative inputs supply no terrain elevations. Forest/river metadata remains empty. Combat and terrain modifier hooks remain in the engine. Distances and action ranges stay in game hexes, without any geographic scale conversion.

## Rebuild and verify

```
npm run build:map
npm test
npm run standalone
```

[Current verification results](KOREA-VALIDATION.md). Pages deploys the standalone v4 bundle from main. Android also builds from main, packaging the exact same game assets.
