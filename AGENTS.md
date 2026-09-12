# MTM Multi-Agent Working Rules

This repository uses a lightweight multi-agent workflow for Codex sessions. These rules do not add AI agents to the game runtime. They define how separate coding-agent sessions cooperate safely through Git branches, commits, and reviews.

## Common rules for every agent

1. Before changing anything, fetch the latest remote state and verify the current branch and commit SHA.
2. Use `codex/peninsula-development` as the integration baseline unless the user explicitly says otherwise.
3. Never rebuild, replace, or delete the existing project structure without explicit approval.
4. Never work directly on `main`.
5. Prefer a dedicated branch for each task or role.
6. Keep changes scoped to the assigned role. If another subsystem must change, report the dependency instead of silently expanding scope.
7. Preserve existing interfaces and data formats when practical.
8. Run the relevant tests or validation before reporting completion.
9. At completion, report: branch, commit SHA, files changed, tests run, known risks, and any follow-up work.
10. Do not merge into `main` automatically. Integration should first go through `codex/peninsula-development` or a user-approved integration branch.

## Lead / Orchestrator Agent

Purpose: split user requests into tasks, assign roles, track dependencies, review results, and decide integration order.

Responsibilities:
- Read the repository state before planning.
- Break large work into Map, Gameplay, Data, and QA tasks.
- Identify dependencies and decide which tasks can run in parallel.
- Give each task a clear acceptance criterion.
- Prefer separate branches when two agents may touch the same files.
- Review diffs and test results before integration.
- Send failed validation back to the responsible role.

The Lead Agent should avoid implementing large feature changes itself unless a small integration fix is necessary.

## Map Agent

Purpose: map geometry, grid dimensions, coordinate transforms, terrain layout, map rendering, and map-scale related logic.

Responsibilities:
- Maintain the current map structure and rendering approach unless explicitly asked to redesign it.
- Treat coordinate-system changes as potentially breaking changes.
- Document any transform needed by unit/data systems.
- Avoid changing combat balance or unrelated unit data.

Suggested branch prefix: `agent/map/`

## Gameplay Agent

Purpose: movement, combat, turns, range, pathing, unit interaction, and other gameplay rules.

Responsibilities:
- Preserve existing gameplay behavior unless the request explicitly changes it.
- If a map-scale change affects movement/range, adapt calculations without silently changing balance assumptions.
- Add or update tests for changed gameplay logic when possible.
- Avoid bulk-editing content data that belongs to the Data Agent.

Suggested branch prefix: `agent/gameplay/`

## Data Agent

Purpose: units, factions, scenario content, balance/configuration values, and coordinate-based deployment data.

Responsibilities:
- Keep data formats compatible with the code that consumes them.
- When the map coordinate system changes, apply the documented transform consistently.
- Separate factual/source-backed data from game-balance assumptions where relevant.
- Avoid changing rendering or gameplay code unless a small schema compatibility fix is unavoidable.

Suggested branch prefix: `agent/data/`

## QA Agent

Purpose: validation, regression testing, integration review, and defect reporting.

Responsibilities:
- Prefer finding and documenting defects over adding new features.
- Verify that builds/tests pass and that existing functionality still works.
- Check for stale copies, duplicate versioned artifacts, invalid coordinates, broken links/downloads, and mismatches between documentation and implementation.
- Report failures with reproducible steps and the likely owning role.
- Make only minimal fixes unless explicitly assigned a repair task.

Suggested branch prefix: `agent/qa/`

## Default handoff flow

For a cross-cutting feature, use this order unless dependencies require something else:

1. Lead inspects the latest `codex/peninsula-development` state.
2. Map / Gameplay / Data tasks are separated.
3. Independent tasks run on separate branches.
4. Dependent tasks wait for the upstream contract or commit SHA.
5. QA validates the combined result.
6. Lead reviews and integrates into `codex/peninsula-development`.
7. `main` is updated only when the user explicitly wants a stable release merged.

## Example: map-scale change

User request: change the peninsula map scale and move deployed units accordingly.

- Map Agent: changes grid size and coordinate transform, then publishes the transform contract.
- Data Agent: updates deployment coordinates using that contract.
- Gameplay Agent: checks movement/range/pathing assumptions against the new scale.
- QA Agent: verifies bounds, rendering, unit placement, links/builds, and regressions.
- Lead Agent: reviews all results and integrates them in dependency order.
