import * as path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  cancel,
  isCancel,
  logError,
  logInfo,
  logSuccess,
  logWarn,
  selectAction,
  showOutro,
  textInput,
} from "../ui/prompts";
import { loadTemplates } from "../templates";
import { getTemplateChoices } from "../utils/template-helpers";
import {
  copyTemplate,
  ensureDirectory,
  initGitRepo,
  pathExists,
  resolveTargetPath,
  validateFolderName,
  validatePath,
} from "../utils/fs";
import { config } from "../config";

export async function runGenerateTemplate(): Promise<void> {
  const templates = await loadTemplates();
  if (templates.length === 0) {
    logError("No templates available. Check your data.json file.");
    return;
  }

  while (true) {
    const selected = await selectAction<string>(
      "Select a template to generate:",
      getTemplateChoices(templates, true),
    );

    if (isCancel(selected)) cancel("Generation cancelled.");
    if (selected === "__back__") return;

    const tpl = templates.find((t) => t.id === selected);
    if (!tpl) {
      logError(`Template not found: ${selected?.toString()}`);
      continue;
    }

    logInfo(`Source: ${tpl.path}`);

    const folderName = await textInput({
      message: "Folder name:",
      placeholder: "my-awesome-project",
      validate: validateFolderName,
    });
    if (isCancel(folderName)) cancel("Generation cancelled.");
    const name = String(folderName ?? "").trim();

    const targetPathRaw = await textInput({
      message: "Target path:",
      placeholder: "Current directory",
      defaultValue: ".",
      validate: validatePath,
    });
    if (isCancel(targetPathRaw)) cancel("Generation cancelled.");
    const targetPath = String(targetPathRaw ?? "").trim() || ".";

    const fullPath = path.join(resolveTargetPath(targetPath), name);

    if (pathExists(fullPath)) {
      logWarn(`Folder already exists at ${fullPath}.`);
      const overwrite = await textInput({
        message: "Type 'overwrite' to continue, or press Ctrl+C to abort:",
      });
      if (isCancel(overwrite) || String(overwrite).trim() !== "overwrite") {
        cancel("Aborted by user.");
      }
    }

    const values: Record<string, string> = {};
    for (const v of tpl.variables) {
      const answer = await textInput({
        message: `${v.name}:`,
        placeholder: `{{${v.name}}}`,
      });
      if (isCancel(answer)) cancel("Generation cancelled.");
      values[v.name] = String(answer).trim();
    }

    const s = p.spinner();
    s.start(`Scaffolding ${tpl.name} into ${fullPath}`);
    try {
      await ensureDirectory(fullPath);
      const { files, substituted } = await copyTemplate(
        tpl.path,
        fullPath,
        values,
      );
      const tag = substituted > 0 ? ` (${substituted} substituted)` : "";
      s.stop(`${files} file(s) copied${tag}`);
    } catch (err) {
      s.stop("Failed");
      logError((err as Error).message);
      return;
    }

    const s2 = p.spinner();
    s2.start("Initializing git repository");
    const git = await initGitRepo(fullPath, config.initialCommitMessage);
    if (git.initialized && git.committed) {
      s2.stop("git repo initialized with first commit");
    } else if (git.initialized) {
      s2.stop("git repo initialized (commit skipped)");
    } else if (git.message) {
      s2.stop(git.message);
    } else {
      s2.stop("git already initialized");
    }

    logSuccess(`Created: ${pc.cyan(fullPath)}`);
    showOutro("Done! Happy hacking.");
    return;
  }
}
