import type { Template } from "../templates";

export function findTemplate(
  templates: Template[],
  id: string
): Template | undefined {
  return templates.find((tpl) => tpl.id === id);
}

export function getTemplateChoices(
  templates: Template[],
  includeBack = true
): { label: string; value: string; hint?: string }[] {
  const choices = templates.map((tpl) => ({
    label: tpl.name,
    value: tpl.id,
    hint: tpl.description,
  }));
  if (includeBack) {
    choices.push({
      label: "← Back",
      value: "__back__",
      hint: "Return to main menu",
    });
  }
  return choices;
}
