import type { AnkiNoteInfo } from "./anki-connect";

export function findStaleNoteIds(
  knownNoteIds: Iterable<number>,
  activeNoteIds: Iterable<number>
): number[] {
  const active = new Set(activeNoteIds);
  return [...new Set(knownNoteIds)].filter((noteId) => !active.has(noteId));
}

export interface RemappableCard {
  ankiId: number | null;
  deletedInAnki: boolean;
}

/**
 * Keeps Anki-IDs aligned with content when markers inside an Anki block shift.
 * A card is remapped only to an unambiguous note that is not currently claimed
 * by another visible marker.
 */
export function remapCardsByContent<T extends RemappableCard>(
  cards: T[],
  previousHashes: Record<string, string> | undefined,
  signatures: ReadonlyMap<T, string>,
  existingNoteIds?: ReadonlySet<number>,
  excludedNoteIds?: ReadonlySet<number>
): void {
  if (!previousHashes || Object.keys(previousHashes).length === 0) return;
  const hashesByNoteId = new Map<number, string>();
  for (const [key, value] of Object.entries(previousHashes)) {
    const noteId = Number.parseInt(key, 10);
    if (Number.isSafeInteger(noteId) && noteId > 0) {
      hashesByNoteId.set(noteId, value);
    }
  }
  const owners = new Map<number, T>();
  for (const card of cards) {
    if (card.ankiId !== null && !card.deletedInAnki) {
      owners.set(card.ankiId, card);
    }
  }
  const assigned = new Set<number>();
  const freed = new Set<number>();
  const pending: T[] = [];
  for (const card of cards) {
    if (card.deletedInAnki) continue;
    const signature = signatures.get(card);
    if (!signature) continue;
    if (card.ankiId !== null && hashesByNoteId.get(card.ankiId) === signature) {
      assigned.add(card.ankiId);
    } else {
      pending.push(card);
    }
  }

  // Resolve chains such as A→11, B→22, C→33 after one marker was deleted.
  // Reassigning a card frees its old marker for the next card in the chain.
  let progress = true;
  while (progress && pending.length > 0) {
    progress = false;
    for (let index = 0; index < pending.length; index += 1) {
      const card = pending[index] as T;
      const signature = signatures.get(card);
      if (!signature) continue;
      const candidates = [...hashesByNoteId.entries()]
        .filter(
          ([noteId, hash]) =>
            hash === signature &&
            !assigned.has(noteId) &&
            (existingNoteIds === undefined || existingNoteIds.has(noteId)) &&
            (excludedNoteIds === undefined || !excludedNoteIds.has(noteId)) &&
            (owners.get(noteId) === undefined || freed.has(noteId))
        )
        .map(([noteId]) => noteId);
      if (candidates.length !== 1) continue;
      const noteId = candidates[0] as number;
      const oldNoteId = card.ankiId;
      card.ankiId = noteId;
      assigned.add(noteId);
      if (oldNoteId !== null && oldNoteId !== noteId) freed.add(oldNoteId);
      pending.splice(index, 1);
      index -= 1;
      progress = true;
    }
  }
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
  legacyManagedTags: Iterable<string> = [],
  keepTags: Iterable<string> = []
): string[] {
  const managed = new Set(legacyManagedTags);
  const keep = new Set(keepTags);
  return tags.filter(
    (tag) => (isLegacyPluginTag(tag) || managed.has(tag)) && !keep.has(tag)
  );
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
