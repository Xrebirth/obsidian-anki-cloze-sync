import {
  CHOICE_QUESTION_PATTERN,
  IMAGE_OCCLUSION_MASK_PATTERN,
  IMAGE_OCCLUSION_PATTERN,
  findLegacyFileId,
  parseDocument,
  scanAnkiIdMarkers,
  scanLegacySyncIds
} from "./parser";
import type { ParsedFlashcard, SyncDiagnostic } from "./types";

export interface MarkdownSyncIds {
  legacyFileId: string | null;
  ankiIds: number[];
  legacySyncIds: string[];
}

/**
 * Collects every Anki note ID referenced by a Markdown note. This is used for
 * the vault-wide index, so it only scans marker lines instead of parsing cards.
 */
export function collectMarkdownSyncIds(markdown: string): MarkdownSyncIds {
  return {
    legacyFileId: findLegacyFileId(markdown)?.id ?? null,
    ankiIds: scanAnkiIdMarkers(markdown),
    legacySyncIds: scanLegacySyncIds(markdown)
  };
}

function isCoveredByCard(cards: ParsedFlashcard[], line: number): boolean {
  return cards.some(
    (card) => line >= card.startLine && line <= (card.markerLine ?? card.endLine)
  );
}

/** Structural and format diagnostics for one Markdown note. */
export function diagnoseMarkdown(markdown: string): SyncDiagnostic[] {
  const diagnostics: SyncDiagnostic[] = [];
  const lines = markdown.split("\n");
  const document = parseDocument(markdown);
  const cards = document.cards;
  const cardStartLines = new Set(cards.map((card) => card.startLine));
  diagnostics.push(...document.diagnostics);

  if (lines[0]?.trim() === "---" && !lines.slice(1).some((line) => line.trim() === "---")) {
    diagnostics.push({ severity: "error", line: 1, message: "Frontmatter 缺少结尾的 ---。" });
  }

  const seenNoteIds = new Set<number>();
  for (const noteId of scanAnkiIdMarkers(markdown)) {
    if (seenNoteIds.has(noteId)) {
      diagnostics.push({ severity: "error", message: `Anki-ID 重复：${noteId}` });
    }
    seenNoteIds.add(noteId);
  }
  const seenLegacyIds = new Set<string>();
  for (const legacyId of document.cards.flatMap((card) =>
    card.legacySyncId ? [card.legacySyncId] : []
  )) {
    if (seenLegacyIds.has(legacyId)) {
      diagnostics.push({ severity: "error", message: `旧版同步 ID 重复：${legacyId}` });
    }
    seenLegacyIds.add(legacyId);
  }
  if (document.legacyFileId) {
    diagnostics.push({
      severity: "warning",
      line: (document.legacyFileIdLine ?? 0) + 1,
      message: "检测到旧版 anki-sync-file-id 标记，下次同步成功后会自动移除。"
    });
  }

  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;

    if (/^\s*Q(?:C)?\s*[:：]/i.test(line) && !cardStartLines.has(index)) {
      if (!isCoveredByCard(cards, index)) {
        diagnostics.push({
          severity: "warning",
          line: index + 1,
          message: "问题缺少相符且非空白的答案，这一题不会同步。"
        });
      }
    }

    if (CHOICE_QUESTION_PATTERN.test(line) && !cardStartLines.has(index)) {
      if (!isCoveredByCard(cards, index)) {
        diagnostics.push({
          severity: "warning",
          line: index + 1,
          message: "选择题格式无效：至少需要两个选项，并恰好用 [-] 标记正确答案。"
        });
      }
    }

    if (IMAGE_OCCLUSION_PATTERN.test(line) && !cardStartLines.has(index)) {
      if (!isCoveredByCard(cards, index)) {
        diagnostics.push({
          severity: "warning",
          line: index + 1,
          message: "影像遮挡题缺少图片或有效的 MASK；坐标格式应为 x, y, 宽, 高，且范围为 0–100。"
        });
      }
    }

    let maskBlockStart = index - 1;
    while (maskBlockStart >= 0 && IMAGE_OCCLUSION_MASK_PATTERN.test(lines[maskBlockStart] ?? "")) {
      maskBlockStart -= 1;
    }
    if (
      IMAGE_OCCLUSION_MASK_PATTERN.test(line) &&
      !IMAGE_OCCLUSION_PATTERN.test(lines[maskBlockStart] ?? "")
    ) {
      diagnostics.push({
        severity: "warning",
        line: index + 1,
        message: "MASK 前没有对应的 IO 图片，这一行不会同步。"
      });
    }

    let answerBlockStart = index - 1;
    while (answerBlockStart >= 0 && IMAGE_OCCLUSION_MASK_PATTERN.test(lines[answerBlockStart] ?? "")) {
      answerBlockStart -= 1;
    }
    const isImageOcclusionAnswer =
      IMAGE_OCCLUSION_MASK_PATTERN.test(lines[index - 1] ?? "") &&
      IMAGE_OCCLUSION_PATTERN.test(lines[answerBlockStart] ?? "");
    if (/^\s*A(?:C)?\s*[:：]/i.test(line) && !isImageOcclusionAnswer && !isCoveredByCard(cards, index)) {
      diagnostics.push({
        severity: "warning",
        line: index + 1,
        message: "答案前没有对应的问题，这一行不会同步。"
      });
    }
  }
  if (inFence) {
    diagnostics.push({ severity: "warning", message: "Markdown 代码块尚未关闭。" });
  }
  const clozeStarts = markdown.match(/\{\{c\d+::/g)?.length ?? 0;
  const parsedClozeCount = cards.filter((card) => card.kind === "cloze").length;
  if (clozeStarts > 0 && parsedClozeCount === 0) {
    diagnostics.push({ severity: "warning", message: "检测到未完成或无法解析的 Cloze 语法。" });
  }
  return diagnostics;
}

export function findCrossFileIdConflicts(
  currentPath: string,
  current: MarkdownSyncIds,
  others: Array<{ path: string; ids: MarkdownSyncIds }>
): SyncDiagnostic[] {
  const diagnostics: SyncDiagnostic[] = [];
  for (const other of others) {
    if (other.path === currentPath) continue;
    const duplicates = current.ankiIds.filter((noteId) => other.ids.ankiIds.includes(noteId));
    for (const noteId of new Set(duplicates)) {
      diagnostics.push({
        severity: "error",
        message: `Anki-ID ${noteId} 也出现在「${other.path}」；每张 Anki 卡片只能对应一个位置。`
      });
    }
    const legacyDuplicates = current.legacySyncIds.filter((id) =>
      other.ids.legacySyncIds.includes(id)
    );
    for (const legacyId of new Set(legacyDuplicates)) {
      diagnostics.push({
        severity: "warning",
        message: `旧版同步 ID ${legacyId} 也出现在「${other.path}」；请避免复制含有同步标记的笔记。`
      });
    }
  }
  return diagnostics;
}
