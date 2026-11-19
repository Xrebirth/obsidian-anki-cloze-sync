export interface AnkiSyncSettings {
  ankiConnectUrl: string;
  deckName: string;
  modelName: string;
  basicModelName: string;
  plainBasicModelName: string;
  choiceModelName: string;
  imageOcclusionModelName: string;
  removedCardAction: RemovedCardAction;
  autoSync: boolean;
  autoSyncDelayMs: number;
  syncMedia: boolean;
  ignorePaths: string[];
}

export type RemovedCardAction = "keep" | "suspend" | "delete";

export const DEFAULT_SETTINGS: AnkiSyncSettings = {
  ankiConnectUrl: "http://127.0.0.1:8765",
  deckName: "Obsidian",
  modelName: "Obsidian Cloze",
  basicModelName: "Obsidian Basic",
  plainBasicModelName: "Obsidian Q&A",
  choiceModelName: "Obsidian Choice",
  imageOcclusionModelName: "Obsidian Image Occlusion",
  removedCardAction: "suspend",
  autoSync: true,
  autoSyncDelayMs: 1500,
  syncMedia: true,
  ignorePaths: []
};

export interface NoteFileConfig {
  enabled: boolean;
  deckName: string;
}

/**
 * Local bookkeeping for one Markdown note. Notes no longer carry plugin tags,
 * so the plugin itself remembers which Anki note IDs belong to which file.
 */
export interface FileSyncRegistryEntry {
  path: string;
  noteIds: number[];
  updatedAt: number;
  deckName?: string;
  suspendedNoteIds?: number[];
}

export type FileSyncRegistry = Record<string, FileSyncRegistryEntry>;

export interface StoredPluginData {
  settings: AnkiSyncSettings;
  syncRegistry: FileSyncRegistry;
  /** Notes suspended by the plugin; restored when their card comes back. */
  suspendedNoteIds?: number[];
}

export interface DeckBlockInfo {
  /** Line containing `<!-- Deck_START -->`. */
  startLine: number;
  /** Line containing `<!-- Deck_END -->`. */
  endLine: number;
  /** First content line after `Deck_START` (may be past the end when empty). */
  contentStartLine: number;
  /** Last content line before `Deck_END`. */
  contentEndLine: number;
  /** `<!-- Anki-ID: n -->` markers written after `Deck_END`, in card order. */
  markerIds: Array<{ noteId: number; line: number }>;
  /** Line index where the next missing marker should be inserted. */
  insertLine: number;
}

export interface ParsedCardBase {
  /** Anki note id (never a card id) parsed from `<!-- Anki-ID: n -->`. */
  ankiId: number | null;
  /** Legacy UUID parsed from `<!-- anki-sync-id: ... -->`, used for migration only. */
  legacySyncId: string | null;
  /** Line holding the card-level marker, when one exists. */
  markerLine: number | null;
  /** Set when this card lives inside a `Deck_START`/`Deck_END` block. */
  deckBlock: DeckBlockInfo | null;
  startLine: number;
  endLine: number;
}

export interface ParsedClozeCard extends ParsedCardBase {
  kind: "cloze";
  markdown: string;
}

export interface ParsedBasicCard extends ParsedCardBase {
  kind: "basic" | "plain";
  questionMarkdown: string;
  answerMarkdown: string;
}

export interface ChoiceOption {
  markdown: string;
  correct: boolean;
}

export interface ParsedChoiceCard extends ParsedCardBase {
  kind: "choice";
  mode: "single" | "multiple";
  questionMarkdown: string;
  options: ChoiceOption[];
  explanationMarkdown: string;
}

export interface ImageOcclusionMask {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParsedImageOcclusionCard extends ParsedCardBase {
  kind: "image-occlusion";
  imageMarkdown: string;
  masks: ImageOcclusionMask[];
  answerMarkdown: string;
}

export type ParsedFlashcard =
  | ParsedClozeCard
  | ParsedBasicCard
  | ParsedChoiceCard
  | ParsedImageOcclusionCard;

export interface ParsedDocument {
  cards: ParsedFlashcard[];
  deckBlocks: DeckBlockInfo[];
  /** Legacy `<!-- anki-sync-file-id: ... -->` value, removed on the next sync. */
  legacyFileId: string | null;
  legacyFileIdLine: number | null;
  /** Structural problems such as an unclosed Deck block. */
  diagnostics: SyncDiagnostic[];
}

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  suspended: number;
  unchanged: number;
  duplicates: number;
  total: number;
}

export interface SyncDiagnostic {
  severity: "error" | "warning";
  message: string;
  line?: number;
}

export interface SyncPreview {
  filePath: string;
  enabled: boolean;
  deckName: string;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  total: number;
  diagnostics: SyncDiagnostic[];
  cards: SyncCardPreview[];
}

export interface SyncCardPreview {
  kind: ParsedFlashcard["kind"];
  line: number;
  status: "create" | "update" | "unchanged";
  frontHtml: string;
  backHtml: string;
}
