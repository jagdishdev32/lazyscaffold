import * as path from "node:path";
import { config, getDataFilePath } from "./config";
import { logError } from "./ui/prompts";

export type Template = {
  name: string;
  description: string;
  path: string;
  id: string;
};

type RawTemplate = {
  name: string;
  description: string;
  path: string;
};

type DataFile = {
  templates: RawTemplate[];
};

export const DEFAULT_DATA_DIR = config.templatesDir;
export const DEFAULT_DATA_FILE = getDataFilePath();

export async function loadTemplates(
  dataFile: string = DEFAULT_DATA_FILE
): Promise<Template[]> {
  const file = Bun.file(dataFile);
  if (!(await file.exists())) {
    logError(`Templates file not found: ${dataFile}`);
    return [];
  }
  let parsed: DataFile;
  try {
    parsed = (await file.json()) as DataFile;
  } catch (err) {
    logError(`Failed to parse ${dataFile}: ${(err as Error).message}`);
    return [];
  }
  const baseDir = path.dirname(dataFile);
  return (parsed.templates ?? []).map((tpl, idx) => ({
    id: tpl.path || `${tpl.name.toLowerCase().replace(/\s+/g, "-")}-${idx}`,
    name: tpl.name,
    description: tpl.description,
    path: path.isAbsolute(tpl.path) ? tpl.path : path.resolve(baseDir, tpl.path),
  }));
}
