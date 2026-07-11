import { projectConfig } from "@/config/project.config";

export type NormalizedLabel = {
  label: string;
  fullName: string;
  valid: boolean;
  reason: string | null;
};

export function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

export function normalizeLabel(input: string, suffix: string): NormalizedLabel {
  let label = input.trim().toLowerCase();
  const configuredEnding = `.${suffix}`;
  if (label.endsWith(configuredEnding)) label = label.slice(0, -configuredEnding.length);

  let reason: string | null = null;
  if (label.length < projectConfig.names.minLength || label.length > projectConfig.names.maxLength) {
    reason = `Use ${projectConfig.names.minLength} to ${projectConfig.names.maxLength} characters.`;
  }
  else if (!/^[a-z0-9-]+$/.test(label)) reason = "Use lowercase letters, numbers, and hyphens only.";
  else if (label.startsWith("-") || label.endsWith("-")) reason = "A hyphen cannot be first or last.";
  else if (label.includes("--")) reason = "Consecutive hyphens are not supported.";

  return {
    label,
    fullName: label ? `${label}.${suffix}` : `.${suffix}`,
    valid: reason === null,
    reason,
  };
}
