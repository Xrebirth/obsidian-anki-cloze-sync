import type { AnkiSyncSettings, NoteFileConfig } from "./types";

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  if (["false", "no", "off", "0"].includes(value.toLowerCase())) return false;
  if (["true", "yes", "on", "1"].includes(value.toLowerCase())) return true;
  return fallback;
}

export function resolveNoteFileConfigFromData(
  frontmatter: Record<string, unknown>,
  settings: AnkiSyncSettings
): NoteFileConfig {
  const deckValue = frontmatter["anki-deck"];
  const deckName = typeof deckValue === "string" && deckValue.trim()
    ? deckValue.trim()
    : settings.deckName;

  return {
    enabled: toBoolean(frontmatter["anki-sync"], true),
    deckName
  };
}
