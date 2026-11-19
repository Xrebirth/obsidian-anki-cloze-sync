import type { AnkiSyncSettings, NoteFileConfig } from "./types";

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  if (["false", "no", "off", "0"].includes(value.toLowerCase())) return false;
  if (["true", "yes", "on", "1"].includes(value.toLowerCase())) return true;
  return fallback;
}

/**
 * Reads YAML `tags` (and the legacy `anki-tags`) as Anki tags. Anki does not
 * allow whitespace inside a tag, so comma/space separated strings are split;
 * a leading `#` is removed and duplicates are dropped.
 */
function toTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => toTags(item));
  if (typeof value !== "string") return [];
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#+/, "").trim())
    .filter((tag) => tag.length > 0);
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
    deckName,
    tags: [
      ...new Set([
        ...toTags(frontmatter.tags),
        ...toTags(frontmatter["anki-tags"])
      ])
    ]
  };
}
