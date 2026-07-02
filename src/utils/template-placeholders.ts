import * as fs from "node:fs/promises";
import * as path from "node:path";

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function extractPlaceholders(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(PLACEHOLDER_RE)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

export async function collectTemplatePlaceholders(
  templateDir: string
): Promise<string[]> {
  const found = new Set<string>();
  const stack: string[] = [templateDir];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const baseName = entry.name;
        for (const ph of extractPlaceholders(baseName)) found.add(ph);
        try {
          const buf = await fs.readFile(full, { encoding: "utf8" });
          for (const ph of extractPlaceholders(buf)) found.add(ph);
        } catch {
          continue;
        }
      }
    }
  }
  return [...found];
}

export function substituteContent(
  content: string,
  values: Record<string, string>
): { content: string; replaced: number } {
  let replaced = 0;
  const next = content.replace(PLACEHOLDER_RE, (full, key: string) => {
    const v = values[key];
    if (v === undefined || v === "") return full;
    replaced++;
    return v;
  });
  return { content: next, replaced };
}
