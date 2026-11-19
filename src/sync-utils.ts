import type { AnkiNoteInfo } from "./anki-connect";

export function findStaleNoteIds(
  knownNoteIds: Iterable<number>,
  activeNoteIds: Iterable<number>
): number[] {
  const active = new Set(activeNoteIds);
  return [...new Set(knownNoteIds)].filter((noteId) => !active.has(noteId));
}

/** Legacy tags added by older releases; every one of them is removed on sync. */
export const LEGACY_PLUGIN_TAG_PREFIXES = [
  "obsidian_sync_id_",
  "obsidian_file_id_",
  "obsidian_file_",
  "obsidian_content_"
] as const;
export const REMOVED_CARD_TAG = "obsidian_sync_removed";

export const legacyFileIdTag = (fileId: string): string => `obsidian_file_id_${fileId}`;
export const legacySyncIdTag = (syncId: string): string => `obsidian_sync_id_${syncId}`;
export const legacyPathTag = (path: string): string =>
  `obsidian_file_${path.replace(/[^a-zA-Z0-9_]/g, "_")}`;

export function isLegacyPluginTag(tag: string): boolean {
  return (
    tag === REMOVED_CARD_TAG ||
    LEGACY_PLUGIN_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix))
  );
}

/** Tags that must be stripped from an Anki note the plugin touches. */
export function obsoletePluginTags(
  tags: string[],
  legacyManagedTags: Iterable<string> = []
): string[] {
  const managed = new Set(legacyManagedTags);
  return tags.filter((tag) => isLegacyPluginTag(tag) || managed.has(tag));
}

const SOURCE_LINK_PATTERN = /obsidian:\/\/open\?[^"'\s<>]*/g;

export interface NoteSourceLink {
  vault: string | null;
  file: string | null;
}

function normalizeVaultPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.?\//, "").toLowerCase();
}

export function noteFieldValue(
  note: AnkiNoteInfo,
  fieldName: string
): string | null {
  const field = note.fields?.[fieldName];
  if (!field) return null;
  return typeof field === "string" ? field : field.value ?? null;
}

export function noteSourceLinks(note: AnkiNoteInfo): NoteSourceLink[] {
  const links: NoteSourceLink[] = [];
  for (const value of Object.values(note.fields ?? {})) {
    const text = typeof value === "string" ? value : value?.value;
    if (typeof text !== "string" || !text.includes("obsidian://open")) continue;
    for (const match of text.matchAll(SOURCE_LINK_PATTERN)) {
      try {
        const url = new URL(match[0].replaceAll("&amp;", "&"));
        links.push({
          vault: url.searchParams.get("vault"),
          file: url.searchParams.get("file")
        });
      } catch {
        // Ignore malformed links; they carry no ownership information.
      }
    }
  }
  return links;
}

export type NoteOwnership = "owned" | "foreign" | "unknown";

/**
 * Notes created by this plugin advertise their source note through an
 * `obsidian://` link. Without tags, that link is the only safe way to notice a
 * copied Anki-ID before the plugin overwrites an unrelated note.
 */
export function classifyNoteOwnership(
  note: AnkiNoteInfo,
  filePath: string,
  vaultName: string
): NoteOwnership {
  const links = noteSourceLinks(note);
  if (links.length === 0) return "unknown";
  const expectedPath = normalizeVaultPath(filePath);
  const expectedVault = vaultName.toLowerCase();
  let sawForeign = false;
  for (const link of links) {
    if (!link.file) continue;
    const samePath = normalizeVaultPath(link.file) === expectedPath;
    const sameVault = !link.vault || link.vault.toLowerCase() === expectedVault;
    if (samePath && sameVault) return "owned";
    sawForeign = true;
  }
  return sawForeign ? "foreign" : "unknown";
}

export function noteMatchesFields(
  note: AnkiNoteInfo,
  fields: Record<string, string>
): boolean {
  for (const [name, value] of Object.entries(fields)) {
    if ((noteFieldValue(note, name) ?? "") !== value) return false;
  }
  return true;
}

export async function createBinaryHash(value: ArrayBuffer | ArrayBufferView): Promise<string> {
  const source = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}
