import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

describe("config", () => {
  test("exposes expected defaults", async () => {
    const { config, getDataFilePath } = await import("../src/config");
    expect(config.templatesDir).toBe(
      path.join(os.homedir(), "opt", "scaffold-templates")
    );
    expect(config.templatesFolderName).toBe("templates");
    expect(config.dataFileName).toBe("data.json");
    expect(config.initialCommitMessage).toBe("Initial setup");
    expect(config.git.fallbackUserName).toBe("lazyscaffold");
    expect(config.git.fallbackUserEmail).toBe("lazyscaffold@local");
    expect(getDataFilePath()).toBe(
      path.join(os.homedir(), "opt", "scaffold-templates", "data.json")
    );
  });
});

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

describe("validatePath / validateFolderName", () => {
  test("validatePath accepts undefined and empty without throwing", async () => {
    const { validatePath } = await import("../src/utils/fs");
    expect(validatePath(undefined)).toBeUndefined();
    expect(validatePath("")).toBeUndefined();
    expect(validatePath(".")).toBeUndefined();
    expect(validatePath("/tmp")).toBeUndefined();
  });

  test("validateFolderName rejects undefined and empty", async () => {
    const { validateFolderName } = await import("../src/utils/fs");
    expect(validateFolderName(undefined)).toBe("Folder name cannot be empty.");
    expect(validateFolderName("")).toBe("Folder name cannot be empty.");
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

describe("template placeholders", () => {
  test("extractPlaceholders finds unique placeholders", async () => {
    const { extractPlaceholders } = await import("../src/utils/template-placeholders");
    const found = extractPlaceholders("hello {{name}}, code: {{name}}, repo: {{githubURL}}");
    expect(found.sort()).toEqual(["githubURL", "name"]);
  });

  test("substituteContent replaces non-empty values and preserves empty placeholders", async () => {
    const { substituteContent } = await import("../src/utils/template-placeholders");
    const { content, replaced } = substituteContent(
      "Hi {{name}} ({{githubURL}}).",
      { name: "alice", githubURL: "" }
    );
    expect(content).toBe("Hi alice ({{githubURL}}).");
    expect(replaced).toBe(1);
  });

  test("substituteContent leaves unknown placeholders intact", async () => {
    const { substituteContent } = await import("../src/utils/template-placeholders");
    const { content, replaced } = substituteContent(
      "x {{a}} y {{b}}",
      { a: "1" }
    );
    expect(content).toBe("x 1 y {{b}}");
    expect(replaced).toBe(1);
  });
});

describe("template-files isTextFile", () => {
  test("matches allowlisted extensions and bare filenames", async () => {
    const { isTextFile } = await import("../src/utils/template-files");
    expect(isTextFile("a.md")).toBe(true);
    expect(isTextFile("a.json")).toBe(true);
    expect(isTextFile("Dockerfile")).toBe(true);
    expect(isTextFile("Makefile")).toBe(true);
  });

  test("does not treat binary extensions as text", async () => {
    const { isTextFile } = await import("../src/utils/template-files");
    expect(isTextFile("logo.png")).toBe(false);
    expect(isTextFile("font.woff2")).toBe(false);
    expect(isTextFile("package-lock.json")).toBe(false);
  });
});

describe("copyTemplate with substitution", () => {
  let work: string;
  beforeEach(async () => {
    work = await fs.mkdtemp(path.join(os.tmpdir(), "lazyscaffold-subst-"));
  });
  afterEach(async () => {
    await fs.rm(work, { recursive: true, force: true });
  });

  test("replaces placeholders in text files and renames files", async () => {
    const src = path.join(work, "src");
    const dst = path.join(work, "dst");
    await fs.mkdir(path.join(src, "{{projectName}}"), { recursive: true });
    await fs.writeFile(
      path.join(src, "README.md"),
      "# {{projectNameTitle}} ({{projectName}})\nrepo: {{githubURL}}\n"
    );
    await fs.writeFile(
      path.join(src, "{{projectName}}", "index.ts"),
      "export const slug = '{{projectName}}';"
    );

    const { copyTemplate } = await import("../src/utils/fs");
    const result = await copyTemplate(src, dst, {
      projectName: "my-app",
      projectNameTitle: "My App",
      githubURL: "https://github.com/me/my-app",
    });
    expect(result.files).toBe(2);
    expect(result.substituted).toBe(2);

    expect(await Bun.file(path.join(dst, "README.md")).text()).toBe(
      "# My App (my-app)\nrepo: https://github.com/me/my-app\n"
    );
    expect(await Bun.file(path.join(dst, "my-app", "index.ts")).text()).toBe(
      "export const slug = 'my-app';"
    );
  });

  test("preserves {{name}} literal when value is empty", async () => {
    const src = path.join(work, "src");
    const dst = path.join(work, "dst");
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(
      path.join(src, "config.json"),
      JSON.stringify({ name: "{{projectName}}", url: "{{githubURL}}" })
    );

    const { copyTemplate } = await import("../src/utils/fs");
    await copyTemplate(src, dst, { projectName: "kept", githubURL: "" });
    const out = JSON.parse(
      await Bun.file(path.join(dst, "config.json")).text()
    );
    expect(out.name).toBe("kept");
    expect(out.url).toBe("{{githubURL}}");
  });

  test("leaves binary files untouched when substitution is requested", async () => {
    const src = path.join(work, "src");
    const dst = path.join(work, "dst");
    await fs.mkdir(src, { recursive: true });
    const binary = Buffer.from([0xff, 0x00, 0xfe, 0x01, 0x80]);
    await fs.writeFile(path.join(src, "logo.png"), binary);

    const { copyTemplate } = await import("../src/utils/fs");
    const result = await copyTemplate(src, dst, { projectName: "x" });
    expect(result.files).toBe(1);
    expect(result.substituted).toBe(0);
    const out = await Bun.file(path.join(dst, "logo.png")).arrayBuffer();
    expect(Buffer.from(out).equals(binary)).toBe(true);
  });

  test("no values passed behaves as before (no substitution, no errors)", async () => {
    const src = path.join(work, "src");
    const dst = path.join(work, "dst");
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(
      path.join(src, "a.md"),
      "literal {{name}} preserved"
    );

    const { copyTemplate } = await import("../src/utils/fs");
    const result = await copyTemplate(src, dst);
    expect(result.files).toBe(1);
    expect(result.substituted).toBe(0);
    expect(await Bun.file(path.join(dst, "a.md")).text()).toBe(
      "literal {{name}} preserved"
    );
  });
});

describe("loadTemplates with variables", () => {
  let work: string;
  beforeEach(async () => {
    work = await fs.mkdtemp(path.join(os.tmpdir(), "lazyscaffold-tplvars-"));
  });
  afterEach(async () => {
    await fs.rm(work, { recursive: true, force: true });
  });

  test("auto-discovers placeholders from files when none declared", async () => {
    const tmplDir = path.join(work, "templates", "backend");
    await fs.mkdir(tmplDir, { recursive: true });
    await fs.writeFile(
      path.join(tmplDir, "README.md"),
      "# {{projectNameTitle}} ({{projectName}})"
    );
    await fs.writeFile(
      path.join(tmplDir, "package.json"),
      JSON.stringify({ name: "{{projectName}}", repo: "{{githubURL}}" })
    );
    await fs.writeFile(
      path.join(work, "data.json"),
      JSON.stringify({
        templates: [
          { name: "Backend", description: "x", path: "templates/backend" },
        ],
      })
    );

    const { loadTemplates } = await import("../src/templates");
    const tpls = await loadTemplates(path.join(work, "data.json"));
    expect(tpls).toHaveLength(1);
    const names = tpls[0].variables.map((v) => v.name).sort();
    expect(names).toEqual(["githubURL", "projectName", "projectNameTitle"]);
  });

  test("declared variables keep descriptions; auto-discovered appended", async () => {
    const tmplDir = path.join(work, "templates", "backend");
    await fs.mkdir(tmplDir, { recursive: true });
    await fs.writeFile(path.join(tmplDir, "a.md"), "x {{projectName}} {{githubURL}}");
    await fs.writeFile(
      path.join(work, "data.json"),
      JSON.stringify({
        templates: [
          {
            name: "Backend",
            description: "x",
            path: "templates/backend",
            variables: [
              { name: "projectName", description: "Slug" },
              { name: "projectNameTitle", description: "Title" },
            ],
          },
        ],
      })
    );

    const { loadTemplates } = await import("../src/templates");
    const tpls = await loadTemplates(path.join(work, "data.json"));
    expect(tpls[0].variables).toEqual([
      { name: "projectName", description: "Slug" },
      { name: "projectNameTitle", description: "Title" },
      { name: "githubURL" },
    ]);
  });
});
