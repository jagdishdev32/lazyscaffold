import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

describe("loadTemplates", () => {
  test("loads templates from a data.json file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "lazyscaffold-"));
    const tmplDir = path.join(tmp, "templates", "my-tpl");
    await fs.mkdir(tmplDir, { recursive: true });
    await fs.writeFile(path.join(tmplDir, "README.md"), "# hi");
    await fs.writeFile(
      path.join(tmp, "data.json"),
      JSON.stringify({
        templates: [
          { name: "My Tpl", description: "A test template", path: "templates/my-tpl" },
        ],
      })
    );

    const { loadTemplates } = await import("../src/templates");
    const tpls = await loadTemplates(path.join(tmp, "data.json"));
    expect(tpls).toHaveLength(1);
    expect(tpls[0].name).toBe("My Tpl");
    expect(tpls[0].id).toBe("templates/my-tpl");
    expect(tpls[0].path).toBe(tmplDir);
    expect(tpls[0].description).toBe("A test template");
  });

  test("returns empty array when data file missing", async () => {
    const { loadTemplates } = await import("../src/templates");
    const tpls = await loadTemplates("/tmp/__definitely_does_not_exist__/data.json");
    expect(tpls).toEqual([]);
  });
});

describe("copyTemplate", () => {
  let work: string;
  beforeEach(async () => {
    work = await fs.mkdtemp(path.join(os.tmpdir(), "lazyscaffold-copy-"));
  });
  afterEach(async () => {
    await fs.rm(work, { recursive: true, force: true });
  });

  test("copies all files recursively", async () => {
    const src = path.join(work, "src");
    const dst = path.join(work, "dst");
    await fs.mkdir(path.join(src, "nested"), { recursive: true });
    await fs.writeFile(path.join(src, "a.txt"), "a");
    await fs.writeFile(path.join(src, "nested", "b.txt"), "b");

    const { copyTemplate } = await import("../src/utils/fs");
    const { files } = await copyTemplate(src, dst);
    expect(files).toBe(2);
    expect(await Bun.file(path.join(dst, "a.txt")).text()).toBe("a");
    expect(await Bun.file(path.join(dst, "nested", "b.txt")).text()).toBe("b");
  });

  test("throws on missing source", async () => {
    const { copyTemplate } = await import("../src/utils/fs");
    expect(
      copyTemplate("/tmp/__no__", path.join(work, "dst"))
    ).rejects.toThrow();
  });
});

describe("resolveTargetPath", () => {
  test("expands ~ to $HOME", async () => {
    const { resolveTargetPath } = await import("../src/utils/fs");
    expect(resolveTargetPath("~")).toBe(os.homedir());
    expect(resolveTargetPath("~/projects")).toBe(
      path.join(os.homedir(), "projects")
    );
  });

  test("resolves .. relative to cwd", async () => {
    const { resolveTargetPath } = await import("../src/utils/fs");
    const cwd = process.cwd();
    expect(resolveTargetPath("..")).toBe(path.dirname(cwd));
    expect(resolveTargetPath("../..")).toBe(path.dirname(path.dirname(cwd)));
    expect(resolveTargetPath("../foo")).toBe(
      path.join(path.dirname(cwd), "foo")
    );
  });

  test("keeps absolute paths absolute and normalizes them", async () => {
    const { resolveTargetPath } = await import("../src/utils/fs");
    expect(resolveTargetPath("/tmp/foo/../bar")).toBe("/tmp/bar");
  });
});

describe("initGitRepo", () => {
  let work: string;
  beforeEach(async () => {
    work = await fs.mkdtemp(path.join(os.tmpdir(), "lazyscaffold-git-"));
  });
  afterEach(async () => {
    await fs.rm(work, { recursive: true, force: true });
  });

  test("initializes a repo and creates the first commit", async () => {
    await fs.writeFile(path.join(work, "a.txt"), "hello");

    const { initGitRepo } = await import("../src/utils/fs");
    const result = await initGitRepo(work, "Initial setup");
    expect(result.initialized).toBe(true);
    expect(result.committed).toBe(true);

    const isRepo =
      Bun.spawnSync(["git", "rev-parse", "--is-inside-work-tree"], { cwd: work })
        .exitCode === 0;
    expect(isRepo).toBe(true);

    const log = Bun.spawnSync(["git", "log", "--oneline"], { cwd: work });
    expect(log.stdout.toString()).toContain("Initial setup");
  });

  test("does not re-initialize an existing repo but still commits", async () => {
    await fs.writeFile(path.join(work, "a.txt"), "hi");
    Bun.spawnSync(["git", "init"], { cwd: work });
    Bun.spawnSync(["git", "config", "user.email", "x@x"], { cwd: work });
    Bun.spawnSync(["git", "config", "user.name", "x"], { cwd: work });

    const { initGitRepo } = await import("../src/utils/fs");
    const result = await initGitRepo(work, "Initial setup");
    expect(result.initialized).toBe(false);
    expect(result.committed).toBe(true);
  });
});

describe("lazyscaffold flows (mocked I/O)", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("create-template flow is a stub", async () => {
    const { runCreateTemplate } = await import("../src/commands/create");
    const infoMock = mock(() => {});
    const outroMock = mock(() => {});
    const cancelMock = mock(() => {
      throw new Error("__cancelled__");
    });
    mock.module("../src/ui/prompts", () => ({
      logInfo: infoMock,
      showOutro: outroMock,
      cancel: cancelMock,
    }));
    expect(runCreateTemplate()).rejects.toThrow("__cancelled__");
  });

  test("generate-template: back option returns to caller", async () => {
    const selectMock = mock(async () => "__back__");
    const logInfoMock = mock(() => {});
    mock.module("../src/ui/prompts", () => ({
      selectAction: selectMock,
      logInfo: logInfoMock,
      logSuccess: () => {},
      logWarn: () => {},
      logError: () => {},
      isCancel: (v: unknown) => typeof v === "symbol",
      cancel: (m: string) => {
        throw new Error(m);
      },
      textInput: async () => "x",
      showOutro: () => {},
    }));
    const { runGenerateTemplate } = await import("../src/commands/generate");
    await runGenerateTemplate();
    expect(selectMock).toHaveBeenCalledTimes(1);
  });
});
