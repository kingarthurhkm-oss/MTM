# MTM Multi-Agent Workflow

## What this is

MTM does not need a separate "multi-agent application" yet. At this stage, the repository itself stores the shared operating rules, while separate Codex sessions act as the agents.

The GitHub repository is the shared workspace and source of truth:

```text
User
  |
  v
Lead / Orchestrator session
  |-- Map session
  |-- Gameplay session
  |-- Data session
  `-- QA session
          |
          v
       GitHub MTM
```

Each session can be a separate Codex task/chat. The sessions do not magically share private working memory. They coordinate through remote branches, commits, pull requests, and files such as `AGENTS.md`.

## Baseline branch

Current development baseline:

`codex/peninsula-development`

Every new task should first synchronize with this branch unless the user names a different baseline.

Recommended task branches:

```text
codex/peninsula-development
  |-- agent/map/<task-name>
  |-- agent/gameplay/<task-name>
  |-- agent/data/<task-name>
  `-- agent/qa/<task-name>
```

Do not create permanent empty branches just for the names above. Create a task branch when an actual task exists so branches stay understandable.

## How the user operates it today

### 1. Lead session

Give one Codex session this instruction:

```text
Act as the Lead Agent for MTM.
Before planning, fetch the latest origin/codex/peninsula-development and report the current commit SHA.
Read AGENTS.md and follow it.
Break my request into Map, Gameplay, Data, and QA tasks only where needed.
Identify dependencies and tell me which tasks can run in parallel.
Do not merge to main.
```

The Lead session produces task prompts and integration order.

### 2. Specialist sessions

Open another Codex task/chat for each required role. Example Map Agent prompt:

```text
Act as the Map Agent for MTM.
Fetch the latest origin/codex/peninsula-development before starting and verify the current commit SHA.
Read AGENTS.md and follow the Map Agent section.
Create/use an agent/map/<task-name> branch.
Only change map/grid/coordinate/rendering concerns required by this task.
When done, run relevant validation, commit, push, and report the branch, commit SHA, changed files, tests, and any contract the Data or Gameplay Agent needs.
```

Use the same pattern for Gameplay, Data, and QA by changing the role and branch prefix.

### 3. Handoffs

Agents hand work to one another using commit SHAs, not vague statements such as "I finished it."

Example:

```text
Map Agent output:
branch: agent/map/grid-240x480
commit: abc1234
coordinate contract: old(x,y) -> new(2x,2y)
```

Then the Data Agent receives the exact upstream commit/branch to inspect.

### 4. QA and integration

After implementation branches are ready, QA validates the combined candidate. The Lead session then reviews the commits and chooses an integration order into `codex/peninsula-development`.

`main` remains the stable/release branch and should only be updated deliberately.

## What this setup does NOT do

This repository configuration does not automatically spawn four AI processes. It creates a shared protocol that lets multiple Codex sessions behave like a coordinated team.

Automatic orchestration is a later step. That would require an external runner or service—such as a script/CLI/API workflow, CI job, or agent framework—to automatically create tasks, invoke agents, wait for results, and merge/retry work.

So there are two levels:

```text
Level 1 (now)
MTM repo + AGENTS.md + Git branches + multiple Codex sessions
You/Lead session orchestrate the work.

Level 2 (later)
Orchestrator program/service + Codex/API/CLI + GitHub automation
The system itself launches and coordinates agents.
```

## Recommended starting rule

For the current MTM stage, stay at Level 1 until branch-based collaboration feels natural. It is easier to inspect, cheaper to operate, and much safer while the architecture is still changing.
