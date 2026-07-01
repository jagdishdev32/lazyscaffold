import * as p from "@clack/prompts";
import pc from "picocolors";

export type Choice<T> = {
  label: string;
  value: T;
  hint?: string;
};

export async function showIntro(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" lazyscaffold ")));
}

export async function showOutro(message: string): Promise<void> {
  p.outro(message);
}

export async function selectAction<T extends string>(
  message: string,
  options: Choice<T>[]
): Promise<T | symbol> {
  return p.select({
    message,
    options: options.map((opt) => ({
      label: opt.label,
      value: opt.value as T,
      hint: opt.hint,
    })),
  }) as Promise<T | symbol>;
}

export async function textInput(options: {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | undefined;
}): Promise<string | symbol> {
  return p.text({
    message: options.message,
    placeholder: options.placeholder,
    defaultValue: options.defaultValue,
    validate: options.validate,
  });
}

export async function confirmAction(message: string): Promise<boolean | symbol> {
  return p.confirm({ message });
}

export function isCancel(value: unknown): boolean {
  return p.isCancel(value);
}

export function cancel(message = "Operation cancelled."): never {
  p.cancel(message);
  process.exit(0);
}

export function logInfo(message: string): void {
  p.log.info(pc.cyan(message));
}

export function logSuccess(message: string): void {
  p.log.success(pc.green(message));
}

export function logWarn(message: string): void {
  p.log.warn(pc.yellow(message));
}

export function logError(message: string): void {
  p.log.error(pc.red(message));
}
