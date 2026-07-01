import { existsSync } from "node:fs";
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { config } from "../config";
import { logError } from "../ui/prompts";

export function resolveTargetPath(target: string): string {
  const expanded = expandHome(target.trim());
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(process.cwd(), expanded);
}

function expandHome(p: string): string {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export function validateFolderName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "Folder name cannot be empty.";
  if (trimmed === "." || trimmed === "..") return "Folder name cannot be '.' or '..'.";
  if (/[<>:"|?*\x00-\x1F]/.test(trimmed)) {
    return "Folder name contains invalid characters.";
  }
  return undefined;
}

export function validatePath(p: string): string | undefined {
  const trimmed = p.trim();
  if (!trimmed) return "Path cannot be empty.";
  return undefined;
}

export function pathExists(p: string): boolean {
  return existsSync(p);
}

export async function ensureDirectory(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

export async function copyTemplate(
  sourceDir: string,
  destDir: string
): Promise<{ files: number }> {
  if (!existsSync(sourceDir)) {
    throw new Error(`Template source not found: ${sourceDir}`);
  }
  await ensureDirectory(destDir);

  let count = 0;
  async function walk(src: string, dest: string): Promise<void> {
    const entries = await readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await ensureDirectory(d);
        await walk(s, d);
      } else if (entry.isFile()) {
        await cp(s, d);
        count++;
      } else if (entry.isSymbolicLink()) {
        const target = await stat(s).catch(() => null);
        if (target?.isFile()) {
          await cp(s, d);
          count++;
        }
      }
    }
  }

  try {
    await walk(sourceDir, destDir);
  } catch (err) {
    logError(`Copy failed: ${(err as Error).message}`);
    throw err;
  }
  return { files: count };
}

export type GitInitResult = {
  initialized: boolean;
  committed: boolean;
  message?: string;
};

export async function initGitRepo(
  dir: string,
  commitMessage = "Initial setup"
): Promise<GitInitResult> {
  const result: GitInitResult = { initialized: false, committed: false };

  const gitExists = (() => {
    try {
      return Bun.spawnSync(["git", "--version"]).exitCode === 0;
    } catch {
      return false;
    }
  })();
  if (!gitExists) {
    result.message = "git is not installed; skipping.";
    return result;
  }

  const isRepo =
    Bun.spawnSync(["git", "rev-parse", "--is-inside-work-tree"], {
      cwd: dir,
    }).exitCode === 0;

  if (!isRepo) {
    const init = Bun.spawnSync(["git", "init"], { cwd: dir });
    if (init.exitCode !== 0) {
      result.message = `git init failed: ${init.stderr.toString()}`;
      return result;
    }
    result.initialized = true;
  }

  const add = Bun.spawnSync(["git", "add", "-A"], { cwd: dir });
  if (add.exitCode !== 0) {
    result.message = `git add failed: ${add.stderr.toString()}`;
    return result;
  }

  const hasIdentity =
    Bun.spawnSync(["git", "config", "user.email"], { cwd: dir }).exitCode === 0;
  if (!hasIdentity) {
    Bun.spawnSync(["git", "config", "user.email", config.git.fallbackUserEmail], {
      cwd: dir,
    });
    Bun.spawnSync(["git", "config", "user.name", config.git.fallbackUserName], {
      cwd: dir,
    });
  }

  const commit = Bun.spawnSync(["git", "commit", "-m", commitMessage, "--no-gpg-sign"], {
    cwd: dir,
  });
  if (commit.exitCode !== 0) {
    result.message = `git commit failed: ${commit.stderr.toString()}`;
    return result;
  }
  result.committed = true;
  return result;
}
