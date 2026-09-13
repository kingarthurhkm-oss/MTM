# Korea Board verification — 2026-09-13

Baseline: clean main synchronized with origin/main at `1032d69` before editing.
Source repository: `kingarthurhkm-oss/korea-map`, main `c9f348232d6e5ed918cf2b37f5c8fcf4be998f55`.

| Check | Result |
|---|---|
| Default Board | 72 columns × 126 rows = 9,072 tiles, both formation scenarios |
| Mask | All 9,072 cells match; 2,411 land and 6,661 sea |
| Initial control | 1,107 blue land, 1,304 red land, 6,661 neutral sea |
| Cities / ports / stations | 8 cities + 15 ports + 35 stations, exact authoritative coordinates |
| Ports | All 15 on land with at least one of the six neighbors at sea |
| Rail | 7 source routes; 140 undirected edges; every source sequence retained |
| Source exceptions | 3 sequence gaps filled with recorded shortest land paths; offshore Mokpo station retained as rail terminal |
| Coordinates | Exhaustive center round trips, regular sides, shared edges, reciprocal neighbors |
| Picking / camera | Both row parities; both sides of every edge; screen/world round trip at four zooms |
| Paths / movement | Land and sea routes, cost/reachable agreement, AP budgets, rail edge discount, no sea shortcut |
| Range / combat | Exact axial rings, attack previews and actual outcomes, artillery, AI, 45-turn campaign |
| Supply | Connected rail discount, operational cities/ports/stations, finite cargo, damage and repairs |
| Deployment | 36 municipality anchors; 55 Army formations; all 80 units valid and unstacked |
| Combat boundaries | Editor, ownership, allocations, combat, save round trip, HQ movement |
| Saves / new game | Version 3 + mapId; old-grid saves rejected atomically; deterministic reset |
| Tests | 53 automated Node tests passed, including embedded standalone Game |
| Browser | Actual new game, one-hex movement click, boundary creation, zoom/pan, full-map fit, turn resolution |
| Console | No error/warning during local game interactions |

Run `npm run build:map`, `npm test`, and `npm run standalone` to reproduce the data and engine checks.
The original PNG was visually compared only; no image was used to generate terrain or gameplay.

Municipal centers are approximate public city/county representatives for this fictional game.
The source does not provide a georeferencing transform or a country mask: geographic fitting and country boundaries are used only for the ownership/municipality layer. See [HEX-GRID.md](HEX-GRID.md) for the precise source exception policy.
