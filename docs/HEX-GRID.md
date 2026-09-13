# Regular Hex map

The refactor is based on `codex/peninsula-development` at
`a4f05154daab741b921baca9eaca86a9d4532ba9`. That branch already contained
240 × 480 tiles (115,200), rather than the older 120 × 240 map.
Before publishing, concurrent remote changes were integrated through commit
`51aee66`, including the latest air-wing range of 200. The full suite passed
with this range and also with the intermediate remote value of 36; the
standalone HTML was rebuilt to match the latest source.

## Coordinates and rendering

`hex.js` is the common flat-top regular hex implementation. For circumradius
`s`, column pitch is `3s/2`, vertical pitch is `sqrt(3)s`, and every side is `s`.
With the half-tile origin padding, axial coordinates project as:

```
x = s + 3s/2 * q
y = sqrt(3)s/2 + sqrt(3)s * (r + q/2)
distance(a,b) = max(abs(dq), abs(dr), abs(dq + dr))
```

The inverse projection uses cube rounding. `Board.closest()` returns the
containing tile, or -1 outside the grid; it no longer snaps empty map space to
an edge tile. `worldToScreen` and `screenToWorld` share a uniform camera zoom.
`HexLayout` supplies all polygon corners, edges and complete map bounds.

The retained grid occupies approximately 2413.389 × 5571.551 world units.
The renderer does not compress it to the old Mercator rectangle. **Consequently
the map has a taller geographic presentation than before:** geographic labels
follow the retained tile mask, rather than claiming a scale-preserving Mercator
projection. This preserves every tile's land/sea identity and adjacency without
relocating units. Camera fit and the letterboxed minimap use the new bounds.
The maximum hex distance across South Korean tiles adjacent to North Korea is
24 steps, approximately the requested twenty-tile front.

Existing `ownersRLE` is the sole land/sea source. Every tile is painted; the
country polygons, graticule and decorative island ellipses no longer form a
second map underneath the grid. All 6,394 land-to-sea edges are rendered once
as coastlines. Foreign land retains its display-only rule. The overview cache
and minimap are generated from these tiles, and zoomed views draw vector tile
geometry directly to avoid magnifying a raster coastline. Existing fictional
infrastructure lines remain supported.

## Compatibility

- `tile.id`, `tile.q`, `tile.r`, `Board.id(q,r)` and Army region anchors retain
  the existing odd-q offset convention: `id = row * columns + column`.
- `tile.axial = {q: column, r: row - floor(column/2)}` is the standard coordinate.
  `Board.axialId()` reverses the conversion. Six axial direction vectors preserve
  the old neighbor order as well as neighbor membership.
- Movement, range, supply and Combat Boundary continue to use the same tile
  IDs, links and hex distances. HQ positions and sector allocations are unchanged.
- Legacy geographic coordinates are used only for deterministic scenario
  placement, geographic anchor lookup and v1 save conversion. They do not pick
  screen clicks. Version 2 saves require no migration or version bump.
- The existing synthetic mountain classifications were renamed `legacyTerrain`.
  Existing movement, combat, supply and AI effects still read them with identical
  constants. Future terrain metadata does not affect game rules.

## Future metadata defaults

| Field | Allowed values | Default |
|---|---|---|
| domain | land / sea | Existing ownership mask |
| terrain | plains / hills / mountain | plains |
| forest | boolean | false |
| urban | none / low / medium / high | none |
| riverEdges | Edge indices 0–5 | [] |
| roadEdges | Edge indices 0–5 | [] |
| railEdges | Edge indices 0–5 | [] |

Each tile owns separate edge arrays. Direction indices are north, south,
northwest, southwest, northeast, southeast, in that order. Opposites are
1, 0, 5, 4, 3, 2. This schema does not populate real terrain, forests, cities,
rivers, roads or railways. No GIS, DEM or OSM data was researched or downloaded.

## Validation (2026-09-13)

- Full Node suite: 52 passing tests, including AI, Army, engine, saves, sectors,
  actual UI event handlers, geometry and the generated standalone HTML.
- Exhaustive geometry: all 115,200 tile centers round trip; all six side lengths
  and radii agree; shared endpoints coincide; adjacent centers have equal spacing
  and hex distance 1; complete tile polygons fit inside map bounds.
- Pointer geometry: points just inside/outside all six edges on odd and even
  columns select the correct tile through camera zooms 0.12, 0.8, 3 and 6.
- Land/sea owners exactly match the original RLE. Coastline coverage has no
  missing or duplicated land/sea edges.
- Pre-refactor snapshots: both initial scenarios and both v1 save conversions
  produce byte-identical state hashes. Version 2 saves round trip unchanged.
- Actual browser game: source assets and generated offline HTML were opened;
  regular hexes, coastlines without the polygon background, unit selection,
  reachable highlights, a one-hex move (9 → 7.8 AP under existing rules), sector
  editing/confirmation, pan and cursor-anchored wheel zoom were checked. The
  committed sector stayed aligned with its tile through pan and zoom. Browser
  warnings/errors were empty. Pinch and pointer cancellation also pass the
  existing UI event tests. Android APK/device execution was not performed.

`tests/fixtures/map-v2-state-hashes.json` contains SHA-256 hashes captured from
the base commit before modifying the engine, not regenerated expected states.
`downloads/peninsula-2026-v3.html` is rebuilt from the new modules. The existing
APK remains the prior build.
