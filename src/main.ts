import {
  Component,
  MarkdownRenderer,
  Notice,
  Plugin,
  TFile,
  sanitizeHTMLToDom
} from "obsidian";
import { AnkiConnectClient, type AnkiNoteInfo } from "./anki-connect";
import {
  collectMarkdownSyncIds,
  diagnoseMarkdown,
  findCrossFileIdConflicts,
  type MarkdownSyncIds
} from "./diagnostics";
import { diagnoseFrontmatter, resolveNoteFileConfig } from "./frontmatter";
import { isIgnoredPath, normalizeVaultPath } from "./ignore";
import { protectLatexForAnki } from "./latex";
import { openImageOcclusionCreator } from "./image-occlusion";
import { extractEmbeddedLinks, rewriteEmbeddedMediaForAnki } from "./media";
import { confirmDestructiveAction, SyncPreviewModal } from "./modals";
import {
  applyAnkiIdMarkers,
  parseDocument,
  type AnkiIdAssignment
} from "./parser";
import { AnkiSyncSettingTab } from "./settings";
import {
  classifyNoteOwnership,
  findStaleNoteIds,
  legacyFileIdTag,
  legacyPathTag,
  noteMatchesFields,
  noteSourceLinks,
  obsoletePluginTags
} from "./sync-utils";
import {
  DEFAULT_SETTINGS,
  type AnkiSyncSettings,
  type FileSyncRegistry,
  type FileSyncRegistryEntry,
  type NoteFileConfig,
  type ParsedBasicCard,
  type ParsedChoiceCard,
  type ParsedClozeCard,
  type ParsedFlashcard,
  type ParsedImageOcclusionCard,
  type StoredPluginData,
  type SyncDiagnostic,
  type SyncPreview,
  type SyncResult
} from "./types";

const EMPTY_RESULT = (): SyncResult => ({
  created: 0,
  updated: 0,
  deleted: 0,
  suspended: 0,
  unchanged: 0,
  duplicates: 0,
  total: 0
});

interface PreparedCard {
  card: ParsedFlashcard;
  fields: Record<string, string>;
  modelName: string;
}

interface LegacyRegistryEntry extends FileSyncRegistryEntry {
  managedTags?: string[];
}

export default class AnkiFlashcardSyncPlugin extends Plugin {
  settings: AnkiSyncSettings = DEFAULT_SETTINGS;
  private syncRegistry: FileSyncRegistry = {};
  private suspendedNoteIds = new Set<number>();
  private legacyManagedTags = new Set<string>();
  private readonly syncTimers = new Map<string, number>();
  private readonly syncingFiles = new Set<TFile>();
  private readonly pendingSyncFiles = new Set<TFile>();
  private readonly deletedDuringSync = new Map<TFile, string>();
  private readonly idsByPath = new Map<string, MarkdownSyncIds>();
  private readonly pendingIdRefreshes = new Map<string, Promise<void>>();
  private readonly infrastructurePromises = new Map<string, Promise<void>>();
  private idIndexPromise?: Promise<void>;
  private registryReconcilePromise?: Promise<void>;
  private vaultSyncPromise?: Promise<void>;
  private saveChain: Promise<void> = Promise.resolve();
  private statusBar?: HTMLElement;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new AnkiSyncSettingTab(this.app, this));
    this.statusBar = this.addStatusBarItem();
    this.statusBar.setText("Anki Sync：就绪");
    void this.ensureIdIndex();
    this.app.workspace.onLayoutReady(() => {
      void this.reconcileRegistryPaths();
    });

    this.addRibbonIcon("refresh-cw", "同步整个 Vault 到 Anki", () => {
      void this.syncVault();
    });

    this.addCommand({
      id: "sync-current-note",
      name: "同步当前笔记到 Anki",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.syncActiveFile(true);
        return true;
      }
    });

    this.addCommand({
      id: "preview-current-note-sync",
      name: "预览当前笔记的 Anki 同步",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.previewActiveFile();
        return true;
      }
    });

    this.addCommand({
      id: "create-image-occlusion-card",
      name: "新增或编辑图像遮挡卡片",
      editorCallback: (editor) => openImageOcclusionCreator(this.app, editor)
    });

    this.addCommand({
      id: "sync-entire-vault",
      name: "同步整个 Vault 到 Anki",
      callback: () => void this.syncVault()
    });

    this.addCommand({
      id: "test-anki-connect",
      name: "测试 AnkiConnect 连接",
      callback: () => void this.testConnection()
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        void this.refreshIdIndexForFile(file);
        if (this.isIgnored(file.path)) return;
        if (this.syncingFiles.has(file)) {
          this.pendingSyncFiles.add(file);
          return;
        }
        if (!this.settings.autoSync) return;
        this.scheduleSync(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        void this.refreshIdIndexForFile(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        const timer = this.syncTimers.get(file.path);
        if (timer !== undefined) window.clearTimeout(timer);
        this.syncTimers.delete(file.path);
        this.pendingSyncFiles.delete(file);
        this.idsByPath.delete(file.path);
        if (this.syncingFiles.has(file)) {
          this.deletedDuringSync.set(file, file.path);
        } else {
          void this.handleDeletedFile(file.path);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        const wasMarkdown = oldPath.toLowerCase().endsWith(".md");
        const isMarkdown = file.extension.toLowerCase() === "md";
        if (!wasMarkdown && !isMarkdown) return;
        const timer = this.syncTimers.get(oldPath);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          this.syncTimers.delete(oldPath);
        }
        if (wasMarkdown && !isMarkdown) {
          this.idsByPath.delete(oldPath);
          this.pendingSyncFiles.delete(file);
          if (this.syncingFiles.has(file)) {
            this.deletedDuringSync.set(file, oldPath);
          } else {
            void this.handleDeletedFile(oldPath);
          }
          return;
        }
        const ids = this.idsByPath.get(oldPath);
        if (ids) {
          this.idsByPath.delete(oldPath);
          this.idsByPath.set(file.path, ids);
        }
        const entry = this.syncRegistry[oldPath];
        if (entry) {
          delete this.syncRegistry[oldPath];
          entry.path = file.path;
          this.syncRegistry[file.path] = entry;
        }
        if (!wasMarkdown && isMarkdown) {
          void this.refreshIdIndexForFile(file);
          if (this.settings.autoSync && !this.isIgnored(file.path)) this.scheduleSync(file);
          return;
        }
        if (timer !== undefined && this.settings.autoSync && !this.isIgnored(file.path)) {
          this.scheduleSync(file);
        }
        void this.savePluginData();
      })
    );
  }

  onunload(): void {
    for (const timer of this.syncTimers.values()) window.clearTimeout(timer);
    this.syncTimers.clear();
  }

  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) as
      | (Partial<StoredPluginData> & Partial<AnkiSyncSettings>)
      | null;
    const storedSettings = raw?.settings ?? raw ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings);
    // Older releases stored an additional-tags setting; notes are untagged now.
    delete (this.settings as unknown as Record<string, unknown>).additionalTags;
    this.settings.ignorePaths = Array.isArray(this.settings.ignorePaths)
      ? this.settings.ignorePaths.filter((value): value is string => typeof value === "string")
      : [];

    this.syncRegistry = {};
    this.legacyManagedTags.clear();
    const storedRegistry = (raw?.syncRegistry ?? {}) as Record<string, LegacyRegistryEntry>;
    for (const entry of Object.values(storedRegistry)) {
      if (!entry || typeof entry.path !== "string" || entry.path.length === 0) continue;
      const noteIds = Array.isArray(entry.noteIds)
        ? entry.noteIds.filter((noteId) => Number.isSafeInteger(noteId) && noteId > 0)
        : [];
      const existing = this.syncRegistry[entry.path];
      this.syncRegistry[entry.path] = {
        path: entry.path,
        noteIds: [...new Set([...(existing?.noteIds ?? []), ...noteIds])],
        updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : Date.now(),
        deckName: entry.deckName
      };
      for (const tag of entry.managedTags ?? []) this.legacyManagedTags.add(tag);
    }
    this.suspendedNoteIds = new Set(
      (raw?.suspendedNoteIds ?? []).filter((noteId) => Number.isSafeInteger(noteId) && noteId > 0)
    );
  }

  async saveSettings(): Promise<void> {
    this.infrastructurePromises.clear();
    await this.savePluginData();
  }

  private async savePluginData(): Promise<void> {
    const payload: StoredPluginData = {
      settings: { ...this.settings, ignorePaths: [...this.settings.ignorePaths] },
      syncRegistry: Object.fromEntries(
        Object.entries(this.syncRegistry).map(([path, entry]) => [
          path,
          { ...entry, noteIds: [...entry.noteIds] }
        ])
      ),
      suspendedNoteIds: [...this.suspendedNoteIds]
    };
    const save = this.saveChain.then(() => this.saveData(payload));
    this.saveChain = save.catch(() => undefined);
    await save;
  }

  private isIgnored(path: string): boolean {
    return isIgnoredPath(path, this.settings.ignorePaths);
  }

  private scheduleSync(file: TFile): void {
    const scheduledPath = file.path;
    const previousTimer = this.syncTimers.get(scheduledPath);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      this.syncTimers.delete(scheduledPath);
      void this.syncFile(file, false).catch(() => undefined);
    }, this.settings.autoSyncDelayMs);
    this.syncTimers.set(scheduledPath, timer);
  }

  private async refreshIdIndexForFile(file: TFile): Promise<void> {
    const path = file.path;
    const refresh = (async () => {
      try {
        const source = await this.app.vault.cachedRead(file);
        if (file.path === path && this.app.vault.getAbstractFileByPath(path) === file) {
          this.idsByPath.set(path, collectMarkdownSyncIds(source));
        }
      } catch {
        // A delete or rename event will remove or relocate the index entry.
      }
    })();
    this.pendingIdRefreshes.set(path, refresh);
    try {
      await refresh;
    } finally {
      if (this.pendingIdRefreshes.get(path) === refresh) {
        this.pendingIdRefreshes.delete(path);
      }
    }
  }

  private async syncActiveFile(showNotice: boolean): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice("请先打开一个 Markdown 笔记。");
      return;
    }
    try {
      await this.syncFile(file, showNotice);
    } catch {
      // syncFile already reports manual errors.
    }
  }

  private async previewActiveFile(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") return;
    this.setStatus(`预览中：${file.basename}`);
    try {
      const preview = await this.createSyncPreview(file);
      new SyncPreviewModal(this.app, preview).open();
      this.setStatus("Anki Sync：预览完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus("Anki Sync：预览失败");
      new Notice(`无法生成同步预览：${message}`, 8000);
    }
  }

  async createSyncPreview(file: TFile): Promise<SyncPreview> {
    const source = await this.app.vault.read(file);
    const config = resolveNoteFileConfig(source, this.settings);
    const diagnostics = [
      ...diagnoseMarkdown(source),
      ...diagnoseFrontmatter(source)
    ];
    if (this.isIgnored(file.path)) {
      diagnostics.push({
        severity: "warning",
        message: "此文件在「忽略的文件路径」中，不会同步。"
      });
    }
    const document = parseDocument(source);
    const cards = document.cards;
    const base: SyncPreview = {
      filePath: file.path,
      enabled: config.enabled && !this.isIgnored(file.path),
      deckName: config.deckName,
      created: 0,
      updated: 0,
      unchanged: 0,
      removed: 0,
      total: cards.length,
      diagnostics,
      cards: []
    };
    if (!base.enabled || diagnostics.some((item) => item.severity === "error")) return base;

    const client = new AnkiConnectClient(this.settings.ankiConnectUrl);
    const noteInfoById = await this.fetchNoteInfos(
      client,
      cards.flatMap((card) => (card.ankiId ? [card.ankiId] : []))
    );
    const previousEntry = this.syncRegistry[file.path];
    const activeNoteIds = new Set<number>();

    for (const card of cards) {
      const modelName = this.modelForCard(card);
      const fields = await this.buildFields(file, card, null);
      const frontHtml = card.kind === "cloze"
        ? fields.Text ?? ""
        : card.kind === "image-occlusion"
          ? this.buildImageOcclusionPreview(file, card, fields, false)
          : card.kind === "choice"
            ? this.buildChoicePreview(fields, false)
            : fields.Front ?? "";
      const backHtml = card.kind === "cloze"
        ? fields["Back Extra"] ?? ""
        : card.kind === "image-occlusion"
          ? this.buildImageOcclusionPreview(file, card, fields, true)
          : card.kind === "choice"
            ? this.buildChoicePreview(fields, true)
            : fields.Back ?? "";
      const noteInfo = card.ankiId ? noteInfoById.get(card.ankiId) : undefined;
      if (!noteInfo) {
        base.created += 1;
        base.cards.push({ kind: card.kind, line: card.startLine + 1, status: "create", frontHtml, backHtml });
        continue;
      }
      activeNoteIds.add(noteInfo.noteId);
      const unchanged =
        noteInfo.modelName === modelName && noteMatchesFields(noteInfo, fields);
      if (unchanged) {
        base.unchanged += 1;
        base.cards.push({ kind: card.kind, line: card.startLine + 1, status: "unchanged", frontHtml, backHtml });
      } else {
        base.updated += 1;
        base.cards.push({ kind: card.kind, line: card.startLine + 1, status: "update", frontHtml, backHtml });
      }
    }
    base.removed = findStaleNoteIds(previousEntry?.noteIds ?? [], activeNoteIds).length;
    return base;
  }

  async syncFile(file: TFile, showNotice: boolean): Promise<SyncResult> {
    if (this.isIgnored(file.path)) {
      this.setStatus("Anki Sync：已忽略");
      if (showNotice) new Notice("此文件在「忽略的文件路径」中，不会同步。");
      return EMPTY_RESULT();
    }
    if (this.syncingFiles.has(file)) {
      this.pendingSyncFiles.add(file);
      return EMPTY_RESULT();
    }
    this.syncingFiles.add(file);
    this.setStatus(`同步中：${file.basename}`);

    let assignments: AnkiIdAssignment[] = [];
    try {
      let source = await this.app.vault.read(file);
      let config = resolveNoteFileConfig(source, this.settings);
      if (!config.enabled) {
        this.setStatus("Anki Sync：已由 frontmatter 排除");
        if (showNotice) new Notice("此笔记已设置 anki-sync: false，不会同步。");
        return EMPTY_RESULT();
      }

      const diagnostics = [
        ...diagnoseMarkdown(source),
        ...diagnoseFrontmatter(source),
        ...(await this.getCrossFileDiagnostics(file.path, source))
      ];
      const errors = diagnostics.filter((item) => item.severity === "error");
      if (errors.length > 0) {
        throw new Error(errors[0]?.message ?? "笔记内容无法安全同步。");
      }

      const document = parseDocument(source);
      const cards = document.cards;
      this.idsByPath.set(file.path, collectMarkdownSyncIds(source));

      const client = new AnkiConnectClient(this.settings.ankiConnectUrl);
      await this.ensureInfrastructure(client, config, cards);

      let noteInfoById = await this.fetchNoteInfos(
        client,
        cards.flatMap((card) => (card.ankiId ? [card.ankiId] : []))
      );
      await this.adoptLegacyNotes(client, document, cards, file, noteInfoById);
      noteInfoById = await this.fetchNoteInfos(
        client,
        cards.flatMap((card) => (card.ankiId ? [card.ankiId] : []))
      );

      const registeredNoteIds = new Set(this.syncRegistry[file.path]?.noteIds ?? []);
      for (const card of cards) {
        if (!card.ankiId) continue;
        const noteInfo = noteInfoById.get(card.ankiId);
        if (!noteInfo) continue;
        if (this.isForeignNote(noteInfo, file, registeredNoteIds)) {
          throw new Error(
            `Anki-ID ${card.ankiId} 指向另一份笔记创建的 Anki 卡片；已停止同步以避免覆盖。`
          );
        }
      }

      const preparedCards: PreparedCard[] = [];
      for (let index = 0; index < cards.length; index += 1) {
        const card = cards[index] as ParsedFlashcard;
        this.setStatus(`准备同步：${file.basename}（${index + 1}/${cards.length}）`);
        preparedCards.push({
          card,
          fields: await this.buildFields(file, card, client),
          modelName: this.modelForCard(card)
        });
      }

      const result = EMPTY_RESULT();
      result.total = cards.length;
      const previousEntry = this.syncRegistry[file.path];
      const previousNoteIds = new Set(previousEntry?.noteIds ?? []);
      const activeNoteIds = new Set<number>();
      const deckChanged = previousEntry?.deckName !== config.deckName;

      for (const { card, fields, modelName } of preparedCards) {
        const currentNoteId = card.ankiId;
        const currentInfo = currentNoteId ? noteInfoById.get(currentNoteId) : undefined;
        const noteInfo = currentInfo && currentInfo.noteId === currentNoteId
          ? currentInfo
          : undefined;

        if (!noteInfo) {
          const noteId = await client.addNote({
            deckName: config.deckName,
            modelName,
            fields,
            options: { allowDuplicate: true }
          });
          assignments.push({ card, noteId });
          activeNoteIds.add(noteId);
          result.created += 1;
          continue;
        }

        if (noteInfo.modelName !== modelName) {
          const replacementId = await client.addNote({
            deckName: config.deckName,
            modelName,
            fields,
            options: { allowDuplicate: true }
          });
          await client.deleteNotes([noteInfo.noteId]);
          this.suspendedNoteIds.delete(noteInfo.noteId);
          assignments.push({ card, noteId: replacementId });
          activeNoteIds.add(replacementId);
          result.updated += 1;
          continue;
        }

        await this.restoreIfPluginSuspended(client, noteInfo);
        const fieldsMatch = noteMatchesFields(noteInfo, fields);
        const obsoleteTags = obsoletePluginTags(noteInfo.tags, this.legacyManagedTags);
        if (fieldsMatch && !deckChanged && obsoleteTags.length === 0) {
          result.unchanged += 1;
        } else {
          if (!fieldsMatch) await client.updateNote(noteInfo.noteId, fields);
          if (!fieldsMatch || deckChanged) {
            await client.changeDeck(noteInfo.cards, config.deckName);
          }
          if (obsoleteTags.length > 0) {
            await client.removeTags([noteInfo.noteId], obsoleteTags);
          }
          result.updated += 1;
        }
        assignments.push({ card, noteId: noteInfo.noteId });
        activeNoteIds.add(noteInfo.noteId);
      }

      const markerUpdate = applyAnkiIdMarkers(source, assignments, true);
      source = markerUpdate.changed
        ? await this.app.vault.process(file, (current) =>
          applyAnkiIdMarkers(current, assignments, true).markdown
        )
        : source;
      this.idsByPath.set(file.path, collectMarkdownSyncIds(source));

      const knownNoteIds = new Set<number>([
        ...previousNoteIds,
        ...cards.flatMap((card) => (card.ankiId ? [card.ankiId] : []))
      ]);
      const staleNoteIds = findStaleNoteIds(knownNoteIds, activeNoteIds);
      await this.handleRemovedNotes(client, staleNoteIds, result, showNotice, file.path);

      if (activeNoteIds.size > 0 || previousEntry) {
        this.syncRegistry[file.path] = {
          path: file.path,
          noteIds: [...activeNoteIds],
          updatedAt: Date.now(),
          deckName: config.deckName
        };
      } else {
        delete this.syncRegistry[file.path];
      }
      await this.savePluginData();

      this.setStatus(
        `Anki Sync：新增 ${result.created}、更新 ${result.updated}、不变 ${result.unchanged}、暂停 ${result.suspended}、删除 ${result.deleted}`
      );
      if (showNotice) {
        new Notice(
          `Anki 同步完成：新增 ${result.created}、更新 ${result.updated}、不变 ${result.unchanged}、暂停 ${result.suspended}、删除 ${result.deleted}`,
          8000
        );
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (assignments.length > 0) {
        // Notes created before the failure still need their Anki-ID markers,
        // otherwise the next sync would create duplicates.
        try {
          const current = await this.app.vault.read(file);
          const updated = applyAnkiIdMarkers(current, assignments, false);
          if (updated.changed) {
            await this.app.vault.process(file, (source) =>
              applyAnkiIdMarkers(source, assignments, false).markdown
            );
          }
        } catch {
          // Keep the original error; the markers can be rewritten next time.
        }
      }
      this.setStatus("Anki Sync：失败");
      if (showNotice) new Notice(`Anki 同步失败：${message}`, 8000);
      console.error("Anki Flashcard Sync", error);
      throw error;
    } finally {
      assignments = [];
      this.syncingFiles.delete(file);
      const deletedPath = this.deletedDuringSync.get(file);
      if (deletedPath) {
        this.deletedDuringSync.delete(file);
        await this.handleDeletedFile(deletedPath);
        if (file.path !== deletedPath) await this.handleDeletedFile(file.path);
      } else if (
        this.pendingSyncFiles.delete(file) &&
        this.app.vault.getAbstractFileByPath(file.path) === file
      ) {
        this.scheduleSync(file);
      }
    }
  }

  /**
   * A note whose source link points at another existing note is treated as
   * foreign. Stale links left by a rename are tolerated, and notes registered
   * for this file are always trusted.
   */
  private isForeignNote(
    noteInfo: AnkiNoteInfo,
    file: TFile,
    registeredNoteIds: ReadonlySet<number>
  ): boolean {
    if (registeredNoteIds.has(noteInfo.noteId)) return false;
    if (
      classifyNoteOwnership(noteInfo, file.path, this.app.vault.getName()) !== "foreign"
    ) {
      return false;
    }
    // A moved card keeps its Anki-ID: the new note may take ownership once the
    // old note no longer lists that ID.
    return this.noteClaimedByOtherFile(noteInfo, file.path);
  }

  /** True when another existing Markdown note still references this note ID. */
  private noteClaimedByOtherFile(noteInfo: AnkiNoteInfo, path: string): boolean {
    const expectedPath = normalizeVaultPath(path);
    return noteSourceLinks(noteInfo).some((link) => {
      if (!link.file) return false;
      const linkedPath = normalizeVaultPath(link.file);
      if (!linkedPath || linkedPath === expectedPath) return false;
      if (!(this.app.vault.getAbstractFileByPath(link.file) instanceof TFile)) return false;
      return (this.idsByPath.get(link.file)?.ankiIds ?? []).includes(noteInfo.noteId);
    });
  }

  /** True when the note's source link points at another Markdown note that exists. */
  private notePointsAtExistingOtherFile(
    noteInfo: AnkiNoteInfo,
    path: string
  ): boolean {
    const expectedPath = normalizeVaultPath(path);
    return noteSourceLinks(noteInfo).some((link) => {
      if (!link.file) return false;
      const linkedPath = normalizeVaultPath(link.file);
      if (!linkedPath || linkedPath === expectedPath) return false;
      return this.app.vault.getAbstractFileByPath(link.file) instanceof TFile;
    });
  }

  private async fetchNoteInfos(
    client: AnkiConnectClient,
    noteIds: Array<number | null>
  ): Promise<Map<number, AnkiNoteInfo>> {
    const ids = [
      ...new Set(
        noteIds.filter(
          (noteId): noteId is number =>
            typeof noteId === "number" && Number.isSafeInteger(noteId) && noteId > 0
        )
      )
    ];
    const map = new Map<number, AnkiNoteInfo>();
    if (ids.length === 0) return map;
    const infos = await client.notesInfo(ids);
    ids.forEach((noteId, index) => {
      const info = infos[index];
      if (info && info.noteId === noteId && info.modelName) map.set(noteId, info);
    });
    return map;
  }

  /**
   * Adopts notes created by older plugin versions. Those notes still carry
   * tracking tags, which are removed here together with the legacy markers on
   * the next marker update.
   */
  private async adoptLegacyNotes(
    client: AnkiConnectClient,
    document: ReturnType<typeof parseDocument>,
    cards: ParsedFlashcard[],
    file: TFile,
    noteInfoById: Map<number, AnkiNoteInfo>
  ): Promise<void> {
    const pending = cards.filter((card) => !card.ankiId && card.legacySyncId);
    if (pending.length === 0) return;
    const queried = await client.findBySyncIds(
      pending.flatMap((card) => (card.legacySyncId ? [card.legacySyncId] : []))
    );
    const candidateIds = [...new Set([...queried.values()].flat())].filter(
      (noteId) => !noteInfoById.has(noteId)
    );
    if (candidateIds.length > 0) {
      const extraInfos = await this.fetchNoteInfos(client, candidateIds);
      for (const [noteId, info] of extraInfos) noteInfoById.set(noteId, info);
    }

    const fileIdTag = document.legacyFileId
      ? legacyFileIdTag(document.legacyFileId)
      : null;
    const pathTag = legacyPathTag(file.path);
    const registeredNoteIds = new Set(this.syncRegistry[file.path]?.noteIds ?? []);

    for (const card of pending) {
      if (!card.legacySyncId) continue;
      const candidates = queried.get(card.legacySyncId) ?? [];
      const owned = candidates.find((noteId) => {
        const info = noteInfoById.get(noteId);
        if (!info) return false;
        if (info.tags.includes(pathTag)) return true;
        if (fileIdTag && info.tags.includes(fileIdTag)) return true;
        return registeredNoteIds.has(noteId);
      });
      if (owned === undefined) continue;
      const info = noteInfoById.get(owned);
      if (!info) continue;
      // Copied notes share the legacy tags too; do not hijack a note whose
      // source link still points at another existing note.
      if (this.isForeignNote(info, file, new Set<number>())) continue;
      card.ankiId = owned;
      const tags = obsoletePluginTags(info.tags, this.legacyManagedTags);
      if (tags.length > 0) {
        await client.removeTags([owned], tags);
        info.tags = info.tags.filter((tag) => !tags.includes(tag));
      }
      await this.restoreIfPluginSuspended(client, info);
    }
  }

  private async handleRemovedNotes(
    client: AnkiConnectClient,
    noteIds: number[],
    result: SyncResult,
    mayAskForDelete: boolean,
    path: string
  ): Promise<void> {
    if (noteIds.length === 0 || this.settings.removedCardAction === "keep") return;
    const infos = await client.notesInfo(noteIds);
    const existing = infos.filter(
      (info, index) => info && info.noteId === noteIds[index] && info.modelName
    );
    // A card moved to another note now belongs there; leave it alone.
    const owned = existing.filter((info) => !this.noteClaimedByOtherFile(info, path));
    if (owned.length === 0) return;

    if (this.settings.removedCardAction === "delete" && mayAskForDelete) {
      const confirmed = await confirmDestructiveAction(
        this.app,
        "永久删除 Anki 卡片？",
        `将永久删除 ${owned.length} 则 Anki note 及其复习记录。这个动作无法由插件恢复。`,
        "永久删除"
      );
      if (confirmed) {
        await client.deleteNotes(owned.map((info) => info.noteId));
        for (const info of owned) this.suspendedNoteIds.delete(info.noteId);
        result.deleted += owned.length;
        return;
      }
    }
    await Promise.all(
      owned.map((info) => {
        const tags = obsoletePluginTags(info.tags, this.legacyManagedTags);
        return tags.length > 0 ? client.removeTags([info.noteId], tags) : Promise.resolve();
      })
    );
    await client.suspendCards(owned.flatMap((info) => info.cards));
    for (const info of owned) this.suspendedNoteIds.add(info.noteId);
    result.suspended += owned.length;
  }

  private async restoreIfPluginSuspended(
    client: AnkiConnectClient,
    noteInfo: AnkiNoteInfo
  ): Promise<void> {
    if (!this.suspendedNoteIds.has(noteInfo.noteId)) return;
    await client.unsuspendCards(noteInfo.cards);
    this.suspendedNoteIds.delete(noteInfo.noteId);
  }

  private async buildFields(
    file: TFile,
    card: ParsedFlashcard,
    client: AnkiConnectClient | null
  ): Promise<Record<string, string>> {
    if (card.kind === "cloze") return this.buildClozeFields(file, card, client);
    if (card.kind === "image-occlusion") return this.buildImageOcclusionFields(file, card, client);
    if (card.kind === "choice") return this.buildChoiceFields(file, card, client);
    return this.buildBasicFields(file, card, client);
  }

  private async buildClozeFields(
    file: TFile,
    card: ParsedClozeCard,
    client: AnkiConnectClient | null
  ): Promise<Record<string, string>> {
    const html = await this.renderMarkdown(file, card.markdown, client);
    return {
      Text: html,
      "Back Extra": `<div>来源：${escapeHtml(file.path)}</div>${this.buildSourceLink(file)}`
    };
  }

  private async buildBasicFields(
    file: TFile,
    card: ParsedBasicCard,
    client: AnkiConnectClient | null
  ): Promise<Record<string, string>> {
    const [front, back] = await Promise.all([
      this.renderMarkdown(file, card.questionMarkdown, client),
      this.renderMarkdown(file, card.answerMarkdown, client)
    ]);
    return { Front: front, Back: `${back}${this.buildSourceLink(file)}` };
  }

  private async buildImageOcclusionFields(
    file: TFile,
    card: ParsedImageOcclusionCard,
    client: AnkiConnectClient | null
  ): Promise<Record<string, string>> {
    const [renderedImage, answer] = await Promise.all([
      this.renderMarkdown(file, card.imageMarkdown, client),
      card.answerMarkdown ? this.renderMarkdown(file, card.answerMarkdown, client) : Promise.resolve("")
    ]);
    const probe = createDiv();
    probe.append(sanitizeHTMLToDom(renderedImage));
    const image = probe.querySelector("img");
    if (!image) {
      throw new Error(`第 ${card.startLine + 1} 行的 IO 题型没有可用的图片。`);
    }
    image.removeAttribute("loading");
    const masks = card.masks.map((mask, index) =>
      `<span class="image-occlusion-mask" data-order="${index + 1}" style="left:${mask.x}%;top:${mask.y}%;width:${mask.width}%;height:${mask.height}%;" aria-label="图像遮挡区域 ${index + 1}"></span>`
    ).join("");
    return {
      Image: image.outerHTML,
      Mask: masks,
      Answer: answer,
      "Back Extra": this.buildSourceLink(file)
    };
  }

  private async buildChoiceFields(
    file: TFile,
    card: ParsedChoiceCard,
    client: AnkiConnectClient | null
  ): Promise<Record<string, string>> {
    const [question, explanation, renderedOptions] = await Promise.all([
      this.renderMarkdown(file, card.questionMarkdown, client),
      card.explanationMarkdown
        ? this.renderMarkdown(file, card.explanationMarkdown, client)
        : Promise.resolve(""),
      Promise.all(card.options.map((option) => this.renderMarkdown(file, option.markdown, client)))
    ]);
    const options = renderedOptions.map((content, index) => {
      const option = card.options[index];
      return [
        `<div class="choice-option" data-choice-index="${index}" data-correct="${option?.correct === true}">`,
        `<span class="choice-option-marker" aria-hidden="true">${index + 1}</span>`,
        `<div class="choice-option-content">${content}</div>`,
        '<span class="choice-option-result"></span>',
        "</div>"
      ].join("");
    }).join("");
    return {
      Question: question,
      Options: options,
      Explanation: explanation,
      Mode: card.mode,
      "Back Extra": this.buildSourceLink(file)
    };
  }

  private buildChoicePreview(fields: Record<string, string>, revealed: boolean): string {
    const options = sanitizeHTMLToDom(fields.Options ?? "");
    const list = createEl("ol");
    for (const option of Array.from(options.querySelectorAll<HTMLElement>(".choice-option"))) {
      const item = list.createEl("li");
      const content = option.querySelector(".choice-option-content");
      if (revealed && option.dataset.correct === "true") {
        item.createEl("strong", { text: "正确答案：" });
      }
      if (content) item.append(...Array.from(content.childNodes).map((node) => node.cloneNode(true)));
    }
    const preview = createDiv();
    preview.append(sanitizeHTMLToDom(fields.Question ?? ""), list);
    if (revealed && fields.Explanation) {
      preview.createEl("hr");
      const explanation = preview.createDiv();
      explanation.append(sanitizeHTMLToDom(fields.Explanation));
    }
    if (revealed && fields["Back Extra"]) {
      preview.append(sanitizeHTMLToDom(fields["Back Extra"]));
    }
    return preview.innerHTML;
  }

  private buildImageOcclusionPreview(
    file: TFile,
    card: ParsedImageOcclusionCard,
    fields: Record<string, string>,
    revealed: boolean
  ): string {
    const imageFragment = sanitizeHTMLToDom(fields.Image ?? "");
    const embeddedLink = extractEmbeddedLinks(card.imageMarkdown)[0];
    const embeddedFile = embeddedLink
      ? this.app.metadataCache.getFirstLinkpathDest(embeddedLink, file.path)
      : null;
    const image = imageFragment.querySelector("img");
    if (image && embeddedFile instanceof TFile) {
      image.setAttribute("src", this.app.vault.getResourcePath(embeddedFile));
    }
    const maskFragment = sanitizeHTMLToDom(fields.Mask ?? "");
    if (revealed) {
      for (const mask of Array.from(maskFragment.querySelectorAll(".image-occlusion-mask"))) {
        mask.classList.add("image-occlusion-mask--revealed");
      }
    }
    const preview = createDiv();
    const stage = preview.createDiv({ cls: "image-occlusion-stage" });
    stage.append(imageFragment, maskFragment);
    if (revealed && fields.Answer) {
      const answer = preview.createDiv({ cls: "standard-answer-content" });
      answer.append(sanitizeHTMLToDom(fields.Answer));
    }
    if (revealed && fields["Back Extra"]) {
      preview.append(sanitizeHTMLToDom(fields["Back Extra"]));
    }
    return preview.innerHTML;
  }

  private async renderMarkdown(
    file: TFile,
    markdown: string,
    client: AnkiConnectClient | null
  ): Promise<string> {
    const component = new Component();
    component.load();
    const container = createDiv();
    const latex = protectLatexForAnki(markdown);
    try {
      await MarkdownRenderer.render(this.app, latex.markdown, container, file.path, component);
      if (this.settings.syncMedia) {
        const rewritten = await rewriteEmbeddedMediaForAnki(
          this.app,
          file,
          markdown,
          container,
          client
        );
        return latex.restore(rewritten.html);
      }
      return latex.restore(container.innerHTML);
    } finally {
      component.unload();
    }
  }

  private modelForCard(card: ParsedFlashcard): string {
    if (card.kind === "cloze") return this.settings.modelName;
    if (card.kind === "image-occlusion") return this.settings.imageOcclusionModelName;
    if (card.kind === "choice") return this.settings.choiceModelName;
    return card.kind === "plain" ? this.settings.plainBasicModelName : this.settings.basicModelName;
  }

  private async ensureInfrastructure(
    client: AnkiConnectClient,
    config: NoteFileConfig,
    cards: ParsedFlashcard[]
  ): Promise<void> {
    if (cards.length === 0) return;
    const endpoint = this.settings.ankiConnectUrl;
    await this.ensureInfrastructureOnce(`deck:${endpoint}:${config.deckName}`, () =>
      client.ensureDeck(config.deckName)
    );
    if (cards.some((card) => card.kind === "cloze")) {
      await this.ensureInfrastructureOnce(`cloze:${endpoint}:${this.settings.modelName}`, () =>
        client.ensureClozeModel(this.settings.modelName)
      );
    }
    if (cards.some((card) => card.kind === "basic")) {
      await this.ensureInfrastructureOnce(`basic:${endpoint}:${this.settings.basicModelName}`, () =>
        client.ensureBasicModel(this.settings.basicModelName)
      );
    }
    if (cards.some((card) => card.kind === "plain")) {
      await this.ensureInfrastructureOnce(`plain:${endpoint}:${this.settings.plainBasicModelName}`, () =>
        client.ensurePlainBasicModel(this.settings.plainBasicModelName)
      );
    }
    if (cards.some((card) => card.kind === "choice")) {
      await this.ensureInfrastructureOnce(`choice:${endpoint}:${this.settings.choiceModelName}`, () =>
        client.ensureChoiceModel(this.settings.choiceModelName)
      );
    }
    if (cards.some((card) => card.kind === "image-occlusion")) {
      await this.ensureInfrastructureOnce(
        `image-occlusion:${endpoint}:${this.settings.imageOcclusionModelName}`,
        () => client.ensureImageOcclusionModel(this.settings.imageOcclusionModelName)
      );
    }
  }

  private async ensureInfrastructureOnce(key: string, action: () => Promise<void>): Promise<void> {
    let pending = this.infrastructurePromises.get(key);
    if (!pending) {
      pending = action().catch((error) => {
        this.infrastructurePromises.delete(key);
        throw error;
      });
      this.infrastructurePromises.set(key, pending);
    }
    await pending;
  }

  private buildSourceLink(file: TFile): string {
    const vault = encodeURIComponent(this.app.vault.getName());
    const path = encodeURIComponent(file.path);
    const sourceUrl = `obsidian://open?vault=${vault}&file=${path}`;
    return `<div class="obsidian-source"><a href="${sourceUrl}">在 Obsidian 打开「${escapeHtml(file.basename)}」</a></div>`;
  }

  private async syncVault(): Promise<void> {
    if (this.vaultSyncPromise) {
      new Notice("Vault 同步已在进行中。");
      return this.vaultSyncPromise;
    }
    const sync = this.performVaultSync();
    this.vaultSyncPromise = sync;
    try {
      await sync;
    } finally {
      if (this.vaultSyncPromise === sync) this.vaultSyncPromise = undefined;
    }
  }

  private async performVaultSync(): Promise<void> {
    await this.reconcileRegistryPaths();
    const files = this.app.vault.getMarkdownFiles();
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let suspended = 0;
    let deleted = 0;
    let failed = 0;
    let ignored = 0;
    for (const [index, file] of files.entries()) {
      this.setStatus(`Vault 同步：${index + 1}/${files.length}（${file.basename}）`);
      if (this.isIgnored(file.path)) {
        ignored += 1;
        continue;
      }
      try {
        const result = await this.syncFile(file, false);
        created += result.created;
        updated += result.updated;
        unchanged += result.unchanged;
        suspended += result.suspended;
        deleted += result.deleted;
      } catch {
        failed += 1;
      }
    }
    new Notice(
      `Vault 同步完成：新增 ${created}、更新 ${updated}、不变 ${unchanged}、暂停 ${suspended}、删除 ${deleted}、失败 ${failed}、忽略 ${ignored}`,
      10000
    );
  }

  private async handleDeletedFile(path: string): Promise<void> {
    const entry = this.syncRegistry[path];
    if (!entry) return;
    if (this.isIgnored(path)) return;
    delete this.syncRegistry[path];
    const noteIds = [...new Set(entry.noteIds)];
    try {
      if (noteIds.length > 0) {
        const client = new AnkiConnectClient(this.settings.ankiConnectUrl);
        if (this.settings.removedCardAction === "keep") {
          new Notice(`已保留来自「${path}」的 ${noteIds.length} 则 Anki notes。`);
        } else {
          const infos = await client.notesInfo(noteIds);
          const ownedInfos = infos.filter(
            (info, index) =>
              info &&
              info.noteId === noteIds[index] &&
              info.modelName &&
              !this.notePointsAtExistingOtherFile(info, path)
          );
          const existingNoteIds = ownedInfos.map((info) => info.noteId);
          await Promise.all(
            ownedInfos.map((info) => {
              const tags = obsoletePluginTags(info.tags, this.legacyManagedTags);
              return tags.length > 0
                ? client.removeTags([info.noteId], tags)
                : Promise.resolve();
            })
          );
          if (this.settings.removedCardAction === "delete" && existingNoteIds.length > 0) {
            const confirmed = await confirmDestructiveAction(
              this.app,
              "来源笔记已删除",
              `「${path}」已删除。是否永久删除其 ${existingNoteIds.length} 则 Anki notes 与复习记录？取消时会改为暂停。`,
              "永久删除"
            );
            if (confirmed) {
              await client.deleteNotes(existingNoteIds);
              for (const noteId of existingNoteIds) this.suspendedNoteIds.delete(noteId);
            } else {
              await client.suspendCards(ownedInfos.flatMap((info) => info.cards));
              for (const info of ownedInfos) this.suspendedNoteIds.add(info.noteId);
            }
          } else if (existingNoteIds.length > 0) {
            await client.suspendCards(ownedInfos.flatMap((info) => info.cards));
            for (const info of ownedInfos) this.suspendedNoteIds.add(info.noteId);
            new Notice(`已暂停来自已删除笔记「${path}」的 ${existingNoteIds.length} 则 Anki notes。`);
          }
        }
      }
      await this.savePluginData();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`无法处理已删除笔记的 Anki 卡片：${message}`, 8000);
      await this.savePluginData();
    }
  }

  private async ensureIdIndex(): Promise<void> {
    if (this.idIndexPromise) return this.idIndexPromise;
    this.idIndexPromise = (async () => {
      const files = this.app.vault.getMarkdownFiles();
      const sources = await Promise.all(files.map(async (file) => ({
        path: file.path,
        source: await this.app.vault.cachedRead(file)
      })));
      this.idsByPath.clear();
      for (const item of sources) {
        this.idsByPath.set(item.path, collectMarkdownSyncIds(item.source));
      }
    })();
    return this.idIndexPromise;
  }

  private async reconcileRegistryPaths(): Promise<void> {
    if (this.registryReconcilePromise) return this.registryReconcilePromise;
    this.registryReconcilePromise = this.performRegistryReconciliation();
    try {
      await this.registryReconcilePromise;
    } finally {
      this.registryReconcilePromise = undefined;
    }
  }

  private async performRegistryReconciliation(): Promise<void> {
    const existingPaths = new Set(this.app.vault.getMarkdownFiles().map((file) => file.path));
    const missingPaths = Object.keys(this.syncRegistry).filter(
      (path) => !existingPaths.has(path) && !this.isIgnored(path)
    );
    for (const path of missingPaths) await this.handleDeletedFile(path);
  }

  private async getCrossFileDiagnostics(path: string, source: string): Promise<SyncDiagnostic[]> {
    await this.ensureIdIndex();
    await Promise.all(this.pendingIdRefreshes.values());
    const current = collectMarkdownSyncIds(source);
    const others = [...this.idsByPath.entries()].map(([otherPath, ids]) => ({
      path: otherPath,
      ids
    }));
    return findCrossFileIdConflicts(path, current, others);
  }

  private async testConnection(): Promise<void> {
    try {
      const client = new AnkiConnectClient(this.settings.ankiConnectUrl);
      const version = await client.invoke<number>("version");
      new Notice(`AnkiConnect 连接成功（API ${version}）。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(message, 8000);
    }
  }

  private setStatus(text: string): void {
    this.statusBar?.setText(text);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
