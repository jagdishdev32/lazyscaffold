const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".html",
  ".css",
  ".scss",
  ".yml",
  ".yaml",
  ".toml",
  ".env",
  ".gitignore",
  ".svg",
  ".xml",
  ".sh",
  ".bash",
]);

const TEXT_FILENAMES = new Set(["Dockerfile", "Makefile"]);

const BINARY_FILENAMES = new Set([
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

export function isTextFile(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  if (BINARY_FILENAMES.has(base)) return false;
  if (TEXT_FILENAMES.has(base)) return true;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return false;
  const ext = base.slice(dot).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

export function applyFilenameSubstitution(
  name: string,
  values: Record<string, string>
): string {
  let out = name;
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}
