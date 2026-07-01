import {
  cancel,
  isCancel,
  logInfo,
  selectAction,
  showIntro,
} from "./ui/prompts";
import { runCreateTemplate } from "./commands/create";
import { runGenerateTemplate } from "./commands/generate";

type MainAction = "create" | "generate";

async function main(): Promise<void> {
  showIntro();

  const action = await selectAction<MainAction>("What would you like to do?", [
    {
      label: "Create template",
      value: "create",
      hint: "Define a new reusable template",
    },
    {
      label: "Generate from template",
      value: "generate",
      hint: "Scaffold a project from an existing template",
    },
  ]);

  if (isCancel(action)) cancel("No action selected. Bye!");

  switch (action) {
    case "create":
      logInfo("Starting create-template flow...");
      await runCreateTemplate();
      break;
    case "generate":
      logInfo("Starting generate-template flow...");
      await runGenerateTemplate();
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
