import { describe, test, expect, mock } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

describe("REPRO: runGenerateTemplate end-to-end", () => {
  test("happy path produces files and a git commit", async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "lazy-real-"));
    const tmplRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lazy-tmpl-"));
    await fs.writeFile(path.join(tmplRoot, "README.md"), "# hi");
    await fs.mkdir(path.join(tmplRoot, "src"));
    await fs.writeFile(path.join(tmplRoot, "src", "index.ts"), "export {};");
    await fs.writeFile(
      path.join(tmplRoot, "data.json"),
      JSON.stringify({
        templates: [
          { name: "Demo", description: "demo tpl", path: "." },
        ],
      })
    );

    // id will be "." (the path field)
    const queue = [".", "demo-app", "."];
    const pop = () => queue.shift();

    const log: string[] = [];
    mock.module("../src/ui/prompts", () => ({
      selectAction: async () => {
        const v = pop();
        return v === undefined ? "__back__" : v;
      },
      textInput: async () => {
        const v = pop();
        return v === undefined ? "x" : v;
      },
      isCancel: (v: unknown) => typeof v === "symbol",
      cancel: (m: string) => {
        throw new Error("CANCELLED: " + m);
      },
      logInfo: (m: string) => log.push("info:" + m),
      logSuccess: (m: string) => log.push("success:" + m),
      logWarn: (m: string) => log.push("warn:" + m),
      logError: (m: string) => log.push("error:" + m),
      showOutro: (m: string) => log.push("outro:" + m),
    }));

    mock.module("../src/config", () => ({
      config: {
        templatesDir: tmplRoot,
        templatesFolderName: "templates",
        dataFileName: "data.json",
        initialCommitMessage: "Initial setup",
        git: { fallbackUserName: "x", fallbackUserEmail: "x@x" },
      },
      getDataFilePath: () => path.join(tmplRoot, "data.json"),
    }));

    process.chdir(work);
    const targetDir = path.join(work, "demo-app");

    const { runGenerateTemplate } = await import("../src/commands/generate");
    await runGenerateTemplate();

    console.log("LOG:", log);
    console.log("targetDir exists:", await Bun.file(targetDir + "/README.md").exists());

    expect(log.some((l) => l.startsWith("error"))).toBe(false);
    expect(await Bun.file(targetDir + "/README.md").exists()).toBe(true);
    expect(await Bun.file(targetDir + "/src/index.ts").exists()).toBe(true);

    const gitCheck = Bun.spawnSync(["git", "log", "--oneline"], { cwd: targetDir });
    expect(gitCheck.stdout.toString()).toContain("Initial setup");

    await fs.rm(work, { recursive: true, force: true });
    await fs.rm(tmplRoot, { recursive: true, force: true });
  });
});
