# lazyscaffold

> **Status: Alpha** — rough edges, fast-moving, expect breaking changes.

A tiny interactive CLI for scaffolding projects from a local template registry. Pick a template, name a folder, point at a path, and `lazyscaffold` copies the files and bootstraps a git repo with a first commit.

Built with [Bun](https://bun.com) and [`@clack/prompts`](https://github.com/natemoo-re/clack).

## Quick Setup

- Create a github repository with name `scaffold-templates`

```
cd ~/opt/
git clone https://github.com/jagdishdev32/lazyscaffold

# Initialize Template Folders
mkdir -p ~/opt/scaffold-templates/templates
cd ~/opt/scaffold-templates/templates
git init

npx create-next-app@latest nextjs-basic
cd nextjs-basic
#### Now make your changes

rm -rf .next .git node_modules

cd ~/opt/scaffold-templates/
cat << EOF > data.json
{
  "templates": [
    {
      "name": "Nextjs Basic",
      "description": "Nextjs with basic folder and files",
      "path": "templates/nextjs-basic"
    }
  ]
}
EOF

# Git add
git add -A && git commit -m "initial base"
git remote add origin {YOUR REPOSITORY URL}
git push origin main


```

## Features

- Interactive main menu (`Create template` / `Generate from template`)
- Loads templates from a local `data.json` (default: `~/opt/scaffold-templates/data.json`)
- Lists templates with descriptions, `← Back` navigation
- Validates folder name and target path
- Expands `~` → `$HOME` and resolves `..` / `../..` from cwd
- Recursive template copy
- Initializes a git repo and creates the first commit (`Initial setup`)
- Modular code split across `commands/`, `ui/`, `utils/`, `config`

## Requirements

- [Bun](https://bun.com) >= 1.3
- `git` on `PATH`

## Install / Run

From the project directory:

```bash
bun install
bun run start
```

Or invoke the entrypoint directly:

```bash
bun run src/index.ts
```

The `package.json` exposes a `lazyscaffold` bin entry pointing at `src/index.ts`.

## Configuration

All knobs live in [`src/config.ts`](src/config.ts):

| Key                            | Default                                       | Purpose                                          |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------ |
| `templatesDir`                 | `~/opt/scaffold-templates`                    | Where `data.json` and template folders live      |
| `templatesFolderName`          | `templates`                                   | Convention for the template sub-folder           |
| `dataFileName`                 | `data.json`                                   | Registry file name                               |
| `initialCommitMessage`         | `Initial setup`                               | Message used for the auto-generated first commit |
| `git.fallbackUserName`         | `lazyscaffold`                                | `user.name` set if no global git identity exists |
| `git.fallbackUserEmail`        | `lazyscaffold@local`                          | `user.email` set if no global git identity exists |

## Adding a template

Append to `~/opt/scaffold-templates/data.json`:

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

Drop the actual files into `~/opt/scaffold-templates/templates/<id>/`. The `path` field is resolved relative to the `data.json` file.

## Project Layout

```
src/
  index.ts              # entrypoint + main menu
  config.ts             # all configurable defaults
  templates.ts          # loads + parses data.json
  commands/
    create.ts           # stub for now
    generate.ts         # picker → folder/path → copy → git init
  ui/
    prompts.ts          # @clack/prompts wrapper
  utils/
    fs.ts               # path expansion, copy, git init
    template-helpers.ts # template → choice mapping
tests/
  flow.test.ts          # bun test suite
```

## Tests

```bash
bun test
```

## Roadmap / Upcoming

These are planned but **not implemented** — the project is in alpha:

- **`Create template` flow** — currently a no-op stub; will let you define a new template (folder picker, file selection, name, description) and write it back to `data.json`
- Template variable substitution (e.g. `{{projectName}}`) in template files
- Optional `git` flags: skip init, custom commit message, branch name
- `--yes` / non-interactive mode for scripting
- Template versioning + caching of remote registries
- Plugin/hook system for post-scaffold steps (`bun install`, framework CLIs, etc.)
- Dry-run mode and diff preview before writing
- Search/filter in the template picker
- Global install via `bun install -g` with a real `bin` shim
- Cross-platform path handling hardening (Windows, symlinks)
- TUI polish: keyboard shortcuts, theming, history

## Known Limitations

- No TTY detection — running in a non-interactive shell will hang on the first prompt
- Path expansion is manual (no `node:path`-style `~user` for other users)
- `Create template` is a stub; `Generate from template` is the only working flow
- Templates are read on every run; no caching
- No remote registry support — templates must live on disk
