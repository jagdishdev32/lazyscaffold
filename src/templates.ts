import * as path from "node:path";
import { config, getDataFilePath } from "./config";
import { logError } from "./ui/prompts";
import { collectTemplatePlaceholders } from "./utils/template-placeholders";

export type Variable = {
  name: string;
  description?: string;
};

export type Template = {
  name: string;
  description: string;
  path: string;
  id: string;
  variables: Variable[];
};

type RawVariable = {
  name: string;
  description?: string;
};

type RawTemplate = {
  name: string;
  description: string;
  path: string;
  variables?: RawVariable[];
};

type DataFile = {
  templates: RawTemplate[];
};

export const DEFAULT_DATA_DIR = config.templatesDir;
export const DEFAULT_DATA_FILE = getDataFilePath();

async function resolveVariables(
  declared: RawVariable[] | undefined,
  templateDir: string
): Promise<Variable[]> {
  const discovered: string[] = await collectTemplatePlaceholders(templateDir);
  const result: Variable[] = [];
  const seen = new Set<string>();
  for (const v of declared ?? []) {
    if (!seen.has(v.name)) {
      result.push({ name: v.name, description: v.description });
      seen.add(v.name);
    }
  }
  for (const name of discovered) {
    if (!seen.has(name)) {
      result.push({ name });
      seen.add(name);
    }
  }
  return result;
}

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
  const out: Template[] = [];
  for (const [idx, tpl] of (parsed.templates ?? []).entries()) {
    const resolvedPath = path.isAbsolute(tpl.path)
      ? tpl.path
      : path.resolve(baseDir, tpl.path);
    out.push({
      id: tpl.path || `${tpl.name.toLowerCase().replace(/\s+/g, "-")}-${idx}`,
      name: tpl.name,
      description: tpl.description,
      path: resolvedPath,
      variables: await resolveVariables(tpl.variables, resolvedPath),
    });
  }
  return out;
}
