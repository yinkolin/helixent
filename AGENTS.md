## Helixent

Helixent is a small library for building **ReAct-style** agent loops on the **Bun** stack.

This project is organized into **four layers**, plus a separate `community` area for third-party integrations, and CLI/TUI and skills support.

## Architecture (4 layers)

### 1) `foundation`

Core primitives that everything else builds on:

- **Models**: the `Model` abstraction and provider-facing contracts.
- **Messages**: a single transcript type that flows end-to-end through the system.
- **Tools**: tool definitions and execution plumbing (the "actions" an agent can invoke).

Files:
- `src/foundation/models/*`
- `src/foundation/messages/*`
- `src/foundation/tools/*`

Design intent:

- Keep these types stable and reusable.
- Prefer adding new backends by extending `ModelProvider`.
- Keep `Message` as the single source of truth for the conversation transcript.

### 2) `agent`

A reusable **ReAct-style agent loop**:

- Maintains state over a conversation transcript.
- Chooses between "think / act / observe" style steps.
- Orchestrates tool calls and feeds observations back into the next reasoning step.

Files:
- `src/agent/agent.ts`
- `src/agent/agent-middleware.ts`
- `src/agent/skills/*` (skill system middleware)

This layer should depend only on `foundation`, and remain generic (not coding-specific).

### 3) `coding`

A layer for coding-specific agents and tools.

- **Leading Agent**: `src/coding/agents/lead-agent.ts`
- **Tools**: `src/coding/tools/*`, including `bash`, `read_file`, `write_file`, `str_replace`, `list_files`, `glob_search`, `grep_search`, `apply_patch`, `file_info`, `mkdir`, `move_path`

### 4) `cli`

CLI layer for interactive agent usage:

- `src/cli/tui/*` - Terminal UI components built with Ink
- `src/cli/tui/hooks/*` - React hooks for the agent loop
- `src/cli/tui/themes/*` - TUI theming

## `community` (in-repo integrations)

In-repo integrations live under `src/community/*`.

- Treat these as optional adapters over `foundation` interfaces.
- Avoid coupling `foundation`/`agent` to integrations.

Current integrations:

- `src/community/openai`: `OpenAIModelProvider` backed by the `openai` SDK, using Chat Completions with function tools.

## Skills

Skill system for enhancing agent capabilities:

- Skills are loaded from the `skills/` directory at the project root
- Each skill is a self-contained module with a `SKILL.md` definition
- Skill middleware: `src/agent/skills/skill-reader.ts`, `src/agent/skills/skills-middleware.ts`

Current skills:
- `skill-creator` - Create and manage skills
- `frontend-design` - Frontend design and UI development

## Stack

- **Runtime / package manager**: [Bun](https://bun.com)
- **Language**: TypeScript (strict, `moduleResolution: "bundler"`)
- **Dependencies**: `openai` (provider SDK), `zod` (tool parameter schemas), `ink` (TUI), `react` (UI components)

## Imports

- **Internal**: `@/*` maps to `./src/*` via `tsconfig` `paths`

## Conventions

- Keep comments minimal and intent-focused.
- Avoid drive-by refactors outside the task at hand.
- Provider options: `OpenAIModelProvider` merges `Model.options` into `chat.completions.create` (provider-specific flags allowed). Defaults include `temperature: 0` and `top_p: 0`.
- Agent loop: when an assistant message contains tool calls, tools are invoked in parallel and appended as `tool_result` messages before continuing.

## Commands

```bash
bun install
bun run dev
bun run check
bun run check:types
bun run lint
bun run lint:fix
bun run build:js
bun run build:bin
```

Environment variables used by the sample root `index.ts` are provider-specific (e.g. `ARK_BASE_URL`, `ARK_API_KEY` for an OpenAI-compatible endpoint).

## Notes: tool use rendering (CLI vs TUI)

There are two parallel renderers for `tool_use` content:

- `src/cli/tui/message-text.ts` (`toolUseText`) produces **ANSI-colored plain text**
- `src/cli/tui/components/message-history.tsx` (`ToolUseContentItem`) produces **Ink components**

These share a largely identical mapping from `tool_use.name` to a short summary (e.g. `bash` shows `description + command`, file tools show `description + path`, search tools show `path :: pattern`, `apply_patch` shows `unified diff patch`). However, they are intentionally not directly reused because:

- `todo_write` in the TUI depends on `todoSnapshots` and renders richer state (current/next todo + counts), while the plain-text renderer is intentionally minimal.
- The presentation layers differ (ANSI strings include symbols/spacing; TUI colors and `⏺` marker are rendered outside the tool summary component).

If you want to de-duplicate in the future, prefer extracting a **shared structured summary** helper (e.g. `{ title: string; detail?: string }`) and have each renderer format it for its own output, keeping `todo_write` special-cased in the TUI.

## Quality gate

Run `bun run check` as the main gate (`tsc --noEmit` + ESLint). Use `bun run check:types` for type-check-only validation.
