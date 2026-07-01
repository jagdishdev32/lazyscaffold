import { homedir } from "node:os";
import * as path from "node:path";

export const config = {
  templatesDir: path.join(homedir(), "opt", "scaffold-templates"),
  templatesFolderName: "templates",
  dataFileName: "data.json",
  initialCommitMessage: "Initial setup",
  git: {
    fallbackUserName: "lazyscaffold",
    fallbackUserEmail: "lazyscaffold@local",
  },
} as const;

export function getDataFilePath(): string {
  return path.join(config.templatesDir, config.dataFileName);
}
