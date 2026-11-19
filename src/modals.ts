import { App, Modal, sanitizeHTMLToDom } from "obsidian";
import type { SyncPreview } from "./types";

export class SyncPreviewModal extends Modal {
  constructor(app: App, private readonly preview: SyncPreview) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("anki-sync-preview");
    contentEl.createEl("h2", { text: "Anki 同步预览" });
    contentEl.createEl("p", { text: this.preview.filePath, cls: "anki-sync-preview-path" });

    if (!this.preview.enabled) {
      contentEl.createEl("p", { text: "此笔记已被排除同步或位于忽略列表中。" });
      return;
    }

    const summary = contentEl.createDiv({ cls: "anki-sync-preview-grid" });
    for (const [label, value] of [
      ["新增", this.preview.created],
      ["更新", this.preview.updated],
      ["不变", this.preview.unchanged],
      ["移除", this.preview.removed]
    ] as const) {
      const item = summary.createDiv({ cls: "anki-sync-preview-stat" });
      item.createEl("strong", { text: String(value) });
      item.createSpan({ text: label });
    }
    const meta = contentEl.createDiv({ cls: "anki-sync-preview-meta" });
    meta.createSpan({ cls: "anki-sync-pill", text: `牌组：${this.preview.deckName}` });
    if (this.preview.tags.length === 0) {
      meta.createSpan({ cls: "anki-sync-pill anki-sync-pill--muted", text: "无标签" });
    } else {
      for (const tag of this.preview.tags) {
        meta.createSpan({ cls: "anki-sync-pill", text: `#${tag}` });
      }
    }

    if (this.preview.diagnostics.length > 0) {
      contentEl.createEl("h3", { text: "诊断" });
      const list = contentEl.createEl("ul", { cls: "anki-sync-diagnostics" });
      for (const diagnostic of this.preview.diagnostics) {
        const line = diagnostic.line ? `第 ${diagnostic.line} 行：` : "";
        list.createEl("li", {
          text: `${line}${diagnostic.message}`,
          cls: `anki-sync-diagnostic-${diagnostic.severity}`
        });
      }
    }

    if (this.preview.cards.length > 0) {
      contentEl.createEl("h3", { text: "卡片内容" });
      for (const [index, card] of this.preview.cards.entries()) {
        const details = contentEl.createEl("details", { cls: "anki-sync-card-preview" });
        const status = card.status === "create" ? "新增" : card.status === "update" ? "更新" : "不变";
        details.createEl("summary", {
          text: `${index + 1}. 第 ${card.line} 行｜${card.kind.toUpperCase()}｜${status}`
        });
        const columns = details.createDiv({ cls: "anki-sync-card-preview-columns" });
        const front = columns.createDiv();
        front.createEl("strong", { text: "正面" });
        front
          .createDiv({ cls: "anki-sync-card-preview-content" })
          .append(sanitizeHTMLToDom(card.frontHtml));
        const back = columns.createDiv();
        back.createEl("strong", { text: "背面" });
        back
          .createDiv({ cls: "anki-sync-card-preview-content" })
          .append(sanitizeHTMLToDom(card.backHtml));
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function confirmDestructiveAction(
  app: App,
  title: string,
  message: string,
  confirmLabel: string
): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    class DestructiveConfirmModal extends Modal {
      onOpen(): void {
        this.contentEl.createEl("h2", { text: title });
        this.contentEl.createEl("p", { text: message });
        const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
        buttons.createEl("button", { text: "取消" }).addEventListener("click", () => {
          resolved = true;
          resolve(false);
          this.close();
        });
        const confirmButton = buttons.createEl("button", {
          text: confirmLabel,
          cls: "mod-warning"
        });
        confirmButton.addEventListener("click", () => {
          resolved = true;
          resolve(true);
          this.close();
        });
      }

      onClose(): void {
        this.contentEl.empty();
        if (!resolved) resolve(false);
      }
    }
    new DestructiveConfirmModal(app).open();
  });
}
