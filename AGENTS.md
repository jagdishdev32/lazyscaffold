# AGENTS.md

Repo-specific notes for AI agents working in `lazyscaffold`. Lines here answer "would an agent miss this without help?" — if it's obvious, it's not here.

## What this is

Alpha-stage interactive CLI (`@clack/prompts` TUI, Bun runtime, ESM). Scaffolds new project folders by copying from a local template registry at `~/opt/scaffold-templates/data.json`, then `git init` + first commit. `Create template` is a stub.

## Commands

- `bun install` — install deps (Bun only; no `npm`).
- `bun run start` — run the CLI in dev (`bun run src/index.ts`).
- `bun test` — run the test suite (`bun:test`, not jest/vitest).
- `bun link` — expose `lazyscaffold` on `PATH` via Bun's global bin dir (`$HOME/.bun/bin`). README has a wrapper for shells without that on PATH.
- There is no `lint`, no `typecheck`, no `build` script. `tsconfig.json` has `"noEmit": true`. Do not add a build step without asking.

## Architecture (entrypoints, not file tree)

- `src/index.ts:14` `main()` — top-level menu: `Create template` (stub) | `Generate from template`. There is no return-to-menu loop; after any flow the process exits.
- `src/commands/generate.ts:28` `runGenerateTemplate()` — the only real flow: `loadTemplates` → `selectAction` (with `← Back` sentinel) → folder name → target path → overwrite gate → `copyTemplate` → `initGitRepo` → outro.
- `src/utils/fs.ts:46` `copyTemplate` — recursive walk using `node:fs/promises` `cp`. Treats every file as opaque bytes. **No placeholder substitution happens here yet** — see the plop feature below.
- `src/utils/fs.ts:92` `initGitRepo` — `git init` only if not already a repo, but **always** runs `git add -A` and `git commit -m "Initial setup" --no-gpg-sign`. Sets local-only identity (`config.git.fallbackUserName/Email`) if none exists. Returns `{ initialized, committed, message? }`.
- `src/templates.ts:25` `loadTemplates(dataFile?)` — reads `data.json` via `Bun.file`, derives `id` from `path` (else from lowercased name + index), resolves relative `path` against the data file's dir.
- `src/ui/prompts.ts:54` `cancel(message)` — calls `p.cancel(message)` then `process.exit(0)`. **Every cancel exits the process.** No cleanup path. Mocked tests throw from this instead.
- `src/utils/template-helpers.ts:22` — `__back__` magic-string sentinel; checked at `src/commands/generate.ts:42`. Don't reuse the literal as a template `path`.

## Test conventions (`bun test`)

- Single file: `tests/flow.test.ts`. Uses `fs.mkdtemp(path.join(os.tmpdir(), "lazyscaffold-<purpose>-"))` for isolation; cleans with `fs.rm(work, { recursive: true, force: true })` in `afterEach`.
- `mock.module("../src/ui/prompts", () => ({ ... }))` is the pattern for stubbing the UI. The mocked `cancel` **throws** to surface the call (since real `cancel` exits). Use `await import(...)` so the mock is applied to that module load.
- The `initGitRepo` tests run real `git` (no mock) and assert on `Bun.spawnSync(["git", "log", "--oneline"], ...)` output.
- `isCancel` in the mock must be `(v) => typeof v === "symbol"` — the real one is `p.isCancel`, identity is the cancel symbol.

## Configuration (`src/config.ts`)

All knobs are in the frozen `config` object. No env vars, no CLI flags, no override mechanism.

| Key | Default | Use |
|---|---|---|
| `templatesDir` | `~/opt/scaffold-templates` | Where `data.json` + `templates/<id>/` live |
| `templatesFolderName` | `"templates"` | Informational; `loadTemplates` does not consult it |
| `dataFileName` | `"data.json"` | Registry filename |
| `initialCommitMessage` | `"Initial setup"` | First commit message |
| `git.fallbackUserName` | `"lazyscaffold"` | Local-only `user.name` fallback |
| `git.fallbackUserEmail` | `"lazyscaffold@local"` | Local-only `user.email` fallback |

`getDataFilePath()` returns `path.join(config.templatesDir, config.dataFileName)`.

## `data.json` shape

```json
{
  "templates": [
    {
      "name": "Nextjs Basic",
      "description": "Nextjs with basic folder and files",
      "path": "templates/nextjs-basic"
    }
  ]
}
```

`id` is **derived**, not stored. Relative `path` is resolved against the data file's directory; absolute paths pass through.

## Quirk: `targetPath` default is `"."`

`src/commands/generate.ts:63` sets `defaultValue: "."`. `path.join(resolveTargetPath("."), name)` becomes `path.join(process.cwd(), name)`. Running from inside an existing project folder creates a sibling.

## Quirk: overwrite requires literal `"overwrite"`

`src/commands/generate.ts:72-78` uses a plain `textInput` with no validator. The check is `String(overwrite).trim() !== "overwrite"` — exact, case-sensitive. Empty, "yes", typos all abort.

## Quirk: `runCreateTemplate` exits the process

`src/commands/create.ts:8-10` is a stub that calls `cancel()`, which `process.exit(0)`s. Picking `Create template` from the menu terminates the program — there is no "return to main menu" today.

## Quirk: `initGitRepo` swallows partial-failure messages

If `git init` succeeds but `git add` fails, `result.message` is set but the caller only displays it on the `!initialized && message` branch (`src/commands/generate.ts:99-100`). The message is hidden in that state.

## Plop-style template variables (implemented)

Templates can declare variables in `data.json`. At generate time, the user is prompted for each; **leaving a prompt empty leaves `{{varName}}` literals intact in the output**.

### Declaring variables

Add an optional `variables` array per template:

```json
{
  "name": "Backend",
  "description": "Express + Prisma backend",
  "path": "templates/backend",
  "variables": [
    { "name": "projectName", "description": "Project slug (kebab-case)" },
    { "name": "projectNameTitle", "description": "Project title (Title Case)" },
    { "name": "githubURL", "description": "GitHub repo URL" }
  ]
}
```

- `name` — the placeholder identifier. Must match the bareword inside `{{...}}`. `[A-Za-z_][A-Za-z0-9_]*`.
- `description` (optional) — shown as the prompt hint.

### Auto-discovery

If `variables` is omitted (or for any variable not declared), `loadTemplates` scans text files in the template directory for `{{name}}` patterns and auto-derives the rest. Declared and discovered variables are merged: declared entries keep their description and order; new discoveries are appended.

### Substitution rules

- `{{name}}` is replaced in every text file and in every file/directory **name** when a non-empty value is given.
- When a prompt is left empty, the literal `{{name}}` is preserved verbatim — file contents and file/dir names. The user is expected to fill it in later.
- Substitution runs on the **text extension allowlist** (see `src/utils/template-files.ts`): `.md .txt .json .ts .tsx .js .jsx .mjs .cjs .html .css .scss .yml .yaml .toml .env .gitignore .svg .xml .sh .bash` plus `Dockerfile` / `Makefile` (exact name match). Everything else (images, fonts, lockfiles, compiled output) is copied as opaque bytes via `cp` — no substitution.
- If a file in the allowlist contains invalid UTF-8, it is copied unchanged (no substitution, no error).
- Filename substitution: `{{name}}` inside a file or directory basename is replaced when the value is non-empty. Empty value keeps the literal `{{name}}` in the path.

### Prompt order

1. Template picker
2. Folder name
3. Target path
4. Overwrite gate (if needed)
5. **Variable prompts** (declared + auto-discovered, in that order)
6. Copy + substitute
7. Git init + first commit
8. Outro

Cancel at any prompt exits the process (existing behavior).

## Where to add things

- New CLI flag / non-interactive mode → `src/index.ts` (parse with `Bun.argv`; route into commands). The `bin` in `package.json` already points at `src/index.ts`; Bun runs the shebang directly.
- New config key → `src/config.ts`. Update `tests/flow.test.ts:6-21` (`config defaults` test).
- New template metadata field → `src/templates.ts` (`Template`, `RawTemplate`, `DataFile`) and `loadTemplates` mapping.
- New file utility (path, fs, copy semantics) → `src/utils/fs.ts`. Keep `copyTemplate`'s return shape additive.
- New text-vs-binary decision → `src/utils/template-files.ts` (the allowlist + matcher).
- New TUI primitive → add a wrapper to `src/ui/prompts.ts`. Do not import `@clack/prompts` directly outside this file except for `p.spinner` (currently used inline in `src/commands/generate.ts:2,80,92`).

## Things you might assume but should verify

- `demo-app/` is a **Next.js 16 sample used as a test fixture template**, not part of lazyscaffold. Its `AGENTS.md` / `CLAUDE.md` are scoped to it. Do not edit it as part of lazyscaffold changes; do not run its scripts in the lazyscaffold CI.
- `template-helpers.ts` exports `findTemplate` but `runGenerateTemplate` inlines the same `find` (`src/commands/generate.ts:44`). Either remove `findTemplate` or switch the caller — flag for the next cleanup pass.
- There is no checked-in `data.json`. Fresh clones have zero templates; the README walks the user through creating one.
- `copyTemplate` silently skips directory symlinks and non-file/non-dir entries. Templates that rely on either will lose them.
- `Bun.spawnSync` is used directly throughout `src/utils/fs.ts` (not `node:child_process`). Keep it that way for consistency with the rest of the file.
