import {
  cancel,
  logInfo,
  showOutro,
} from "../ui/prompts";

export async function runCreateTemplate(): Promise<void> {
  logInfo("Create-template flow is not implemented yet.");
  showOutro("Nothing to do for now. 👋");
  cancel("Returning to main menu.");
}
