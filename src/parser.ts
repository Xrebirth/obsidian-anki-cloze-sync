import type {
  DeckBlockInfo,
  ImageOcclusionMask,
  ParsedBasicCard,
  ParsedChoiceCard,
  ParsedClozeCard,
  ParsedDocument,
  ParsedFlashcard,
  ParsedImageOcclusionCard,
  SyncDiagnostic
} from "./types";

export const ANKI_ID_PATTERN = /^ {0,3}<!--\s*anki[-_ ]?id\s*[:：]\s*(\d+)\s*-->\s*$/i;
export const ANKI_DELETE_PATTERN =
  /^ {0,3}<!--\s*anki[-_ ]?delete\s*-->\s*$/i;
export const ANKI_DELETE_MARKER = "<!-- Anki-Delete -->";
export const LEGACY_SYNC_ID_PATTERN =
  /^ {0,3}<!--\s*anki[-_ ]sync[-_ ]id\s*[:：]\s*([a-zA-Z0-9-]+)\s*-->\s*$/i;
export const LEGACY_FILE_ID_PATTERN =
  /^ {0,3}<!--\s*anki[-_ ]sync[-_ ]file[-_ ]id\s*[:：]\s*([a-zA-Z0-9-]+)\s*-->\s*$/i;
export const BLOCK_START_PATTERN = /^ {0,3}<!--\s*anki[ _-]?start\s*-->\s*$/i;
export const BLOCK_END_PATTERN = /^ {0,3}<!--\s*anki[ _-]?end\s*-->\s*$/i;
export const ANKI_ID_MARKER_PREFIX = "<!-- Anki-ID:";
const CLOZE_PATTERN = /\{\{c\d+::[\s\S]+?}}/;
const HEADING_OR_RULE_PATTERN = /^\s*(?:#{1,6}\s+|(?:---+|___+|\*\*\*+)\s*$)/;
const FENCE_PATTERN = /^\s*(```|~~~)/;
const INDENTED_CODE_PATTERN = /^(?:\t| {4})/;
const isIndentedCode = (line: string): boolean => INDENTED_CODE_PATTERN.test(line);
const QUESTION_PATTERN = /^\s*Q\s*[:：]\s*(.*)$/i;
const ANSWER_PATTERN = /^\s*A\s*[:：]\s*(.*)$/i;
const CODE_QUESTION_PATTERN = /^\s*QC\s*[:：]\s*(.*)$/i;
const CODE_ANSWER_PATTERN = /^\s*AC\s*[:：]\s*(.*)$/i;
export const CHOICE_QUESTION_PATTERN = /^\s*Q([SM])\s*[:：]\s*(.*)$/i;
export const CHOICE_OPTION_PATTERN = /^\s*-\s+\[([ xX-])\]\s+(.+?)\s*$/;
export const CHOICE_EXPLANATION_PATTERN = /^\s*E\s*[:：]\s*(.*)$/i;
export const IMAGE_OCCLUSION_PATTERN = /^\s*IO\s*[:：]\s*(.*)$/i;
export const IMAGE_OCCLUSION_MASK_PATTERN =
  /^\s*<!--\s*MASK\s*[:：]\s*(.*?)\s*-->\s*$/i;
const IMAGE_OCCLUSION_ANSWER_PATTERN = /^\s*A\s*[:：]\s*(.*)$/i;
const REMOVED_NUMBERED_QUESTION_PATTERN = /^\s*Q(?:C)?\d+\s*[:：]/i;

const isQuestionBoundary = (line: string): boolean =>
  QUESTION_PATTERN.test(line) ||
  CODE_QUESTION_PATTERN.test(line) ||
  CHOICE_QUESTION_PATTERN.test(line) ||
  IMAGE_OCCLUSION_PATTERN.test(line) ||
  REMOVED_NUMBERED_QUESTION_PATTERN.test(line);

export interface LineMarker {
  ankiId: number | null;
  legacySyncId: string | null;
  deleted: boolean;
}

/** Parses a single `Anki-ID`, `Anki-Delete` or legacy `anki-sync-id` line. */
export function parseLineMarker(line: string): LineMarker | null {
  const ankiMatch = line.match(ANKI_ID_PATTERN);
  if (ankiMatch) {
    const noteId = Number.parseInt(ankiMatch[1] ?? "", 10);
    if (Number.isSafeInteger(noteId) && noteId > 0) {
      return { ankiId: noteId, legacySyncId: null, deleted: false };
    }
  }
  if (ANKI_DELETE_PATTERN.test(line)) {
    return { ankiId: null, legacySyncId: null, deleted: true };
  }
  const legacyMatch = line.match(LEGACY_SYNC_ID_PATTERN);
  if (legacyMatch) {
    return {
      ankiId: null,
      legacySyncId: legacyMatch[1] ?? null,
      deleted: false
    };
  }
  return null;
}

export function ankiIdMarker(noteId: number): string {
  return `<!-- Anki-ID: ${noteId} -->`;
}

export function ankiDeleteMarker(): string {
  return ANKI_DELETE_MARKER;
}

interface FenceState {
  marker: "`" | "~";
  length: number;
}

function openingFence(line: string): FenceState | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(?:[^`~].*)?$/)?.[1];
  if (!match) return null;
  return { marker: match.charAt(0) as "`" | "~", length: match.length };
}

function closesFence(line: string, fence: FenceState): boolean {
  const closing = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/)?.[1];
  return Boolean(
    closing && closing.charAt(0) === fence.marker && closing.length >= fence.length
  );
}

export interface DeckScanResult {
  blocks: DeckBlockInfo[];
  diagnostics: SyncDiagnostic[];
}

/**
 * Finds `<!-- Anki_START -->` / `<!-- Anki_END -->` regions. The markers only
 * delimit card content: they are never sent to Anki. Every `Anki-ID` comment
 * written after `Anki_END` belongs to the cards inside the block, in order.
 */
export function scanDeckBlocks(markdown: string): DeckScanResult {
  const lines = markdown.split("\n");
  const blocks: DeckBlockInfo[] = [];
  const diagnostics: SyncDiagnostic[] = [];
  let fence: FenceState | null = null;
  let openStart: number | null = null;
  let inFrontmatter = (lines[0] ?? "").trim() === "---";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (inFrontmatter) {
      if (index > 0 && line.trim() === "---") inFrontmatter = false;
      continue;
    }
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const opening = openingFence(line);
    if (opening) {
      fence = opening;
      continue;
    }

    if (BLOCK_START_PATTERN.test(line)) {
      if (openStart !== null) {
        diagnostics.push({
          severity: "warning",
          line: index + 1,
          message: "上一个 Anki_START 尚未结束，这一行会被当作普通内容。"
        });
        continue;
      }
      openStart = index;
      continue;
    }

    if (!BLOCK_END_PATTERN.test(line)) continue;
    if (openStart === null) {
      diagnostics.push({
        severity: "warning",
        line: index + 1,
        message: "检测到没有 Anki_START 的 Anki_END，已忽略这一行。"
      });
      continue;
    }

    let cursor = index + 1;
    while (cursor < lines.length && (lines[cursor] ?? "").trim() === "") cursor += 1;
    const markerIds: Array<{
      noteId: number | null;
      line: number;
      deleted: boolean;
    }> = [];
    while (cursor < lines.length) {
      const line = lines[cursor] ?? "";
      const markerMatch = line.match(ANKI_ID_PATTERN);
      if (markerMatch) {
        const noteId = Number.parseInt(markerMatch[1] ?? "", 10);
        if (!Number.isSafeInteger(noteId) || noteId <= 0) break;
        markerIds.push({ noteId, line: cursor, deleted: false });
      } else if (ANKI_DELETE_PATTERN.test(line)) {
        markerIds.push({ noteId: null, line: cursor, deleted: true });
      } else {
        break;
      }
      cursor += 1;
    }

    blocks.push({
      startLine: openStart,
      endLine: index,
      contentStartLine: openStart + 1,
      contentEndLine: index - 1,
      markerIds,
      insertLine:
        markerIds.length > 0
          ? (markerIds[markerIds.length - 1] as { line: number }).line + 1
          : index + 1
    });
    openStart = null;
  }

  if (openStart !== null) {
    diagnostics.push({
      severity: "error",
      line: openStart + 1,
      message: "Anki_START 缺少对应的 Anki_END，这个区块不会同步。"
    });
  }

  return { blocks, diagnostics };
}

/**
 * Replaces Anki block regions with a horizontal rule so cards outside a block stop
 * at the block boundary while line numbers stay stable.
 */
function maskDeckRegions(lines: string[], blocks: DeckBlockInfo[]): string[] {
  const masked = [...lines];
  for (const block of blocks) {
    const lastMarker = block.markerIds[block.markerIds.length - 1];
    const end = lastMarker ? Math.max(block.endLine, lastMarker.line) : block.endLine;
    for (let index = block.startLine; index <= end; index += 1) {
      masked[index] = index === block.startLine ? "***" : "";
    }
  }
  return masked;
}

function startsStandaloneClozeParagraphs(
  lines: string[],
  startLine: number,
  endLine: number
): boolean {
  if (startLine >= endLine) return false;

  const firstLine = lines[startLine] ?? "";
  if (
    parseLineMarker(firstLine) ||
    isIndentedCode(firstLine) ||
    HEADING_OR_RULE_PATTERN.test(firstLine) ||
    FENCE_PATTERN.test(firstLine) ||
    isQuestionBoundary(firstLine)
  ) {
    return false;
  }

  const paragraphLines: string[] = [];
  let cursor = startLine;
  while (cursor < endLine) {
    const line = lines[cursor] ?? "";
    if (
      line.trim() === "" ||
      HEADING_OR_RULE_PATTERN.test(line) ||
      FENCE_PATTERN.test(line) ||
      isQuestionBoundary(line) ||
      parseLineMarker(line)
    ) {
      break;
    }
    paragraphLines.push(line);
    cursor += 1;
  }

  return CLOZE_PATTERN.test(paragraphLines.join("\n"));
}

function parseBasicCardsIn(
  lines: string[],
  from: number,
  to: number,
  allowBlankLines: boolean
): ParsedBasicCard[] {
  const cards: ParsedBasicCard[] = [];
  let index = from;
  let inFence = false;
  let inFrontmatter = from === 0 && (lines[0] ?? "").trim() === "---";
  if (inFrontmatter) index = 1;

  while (index < to) {
    const line = lines[index] ?? "";
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      index += 1;
      continue;
    }
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      index += 1;
      continue;
    }
    if (inFence) {
      index += 1;
      continue;
    }
    if (!allowBlankLines && isIndentedCode(line)) {
      index += 1;
      continue;
    }

    const codeQuestionMatch = line.match(CODE_QUESTION_PATTERN);
    const questionMatch = codeQuestionMatch ?? line.match(QUESTION_PATTERN);
    if (!questionMatch) {
      index += 1;
      continue;
    }

    const kind = codeQuestionMatch ? "basic" : "plain";
    const answerPattern = codeQuestionMatch ? CODE_ANSWER_PATTERN : ANSWER_PATTERN;
    const questionLines = [questionMatch[1] ?? ""];
    const startLine = index;
    let cursor = index + 1;
    let answerMatch: RegExpMatchArray | null = null;
    let inQuestionFence = false;

    while (cursor < to) {
      const candidate = lines[cursor] ?? "";
      if (!inQuestionFence) {
        const possibleAnswer = isIndentedCode(candidate)
          ? null
          : candidate.match(answerPattern);
        if (possibleAnswer) {
          answerMatch = possibleAnswer;
          break;
        }
      }
      if (FENCE_PATTERN.test(candidate)) {
        inQuestionFence = !inQuestionFence;
        questionLines.push(candidate);
        cursor += 1;
        continue;
      }
      if (!inQuestionFence) {
        if (isQuestionBoundary(candidate) && !isIndentedCode(candidate)) break;
        if (
          !allowBlankLines &&
          !isIndentedCode(candidate) &&
          (candidate.trim() === "" || HEADING_OR_RULE_PATTERN.test(candidate))
        ) {
          break;
        }
      }
      questionLines.push(candidate);
      cursor += 1;
    }

    if (!answerMatch) {
      index += 1;
      continue;
    }

    const answerLines = [answerMatch[1] ?? ""];
    let endLine = cursor;
    let marker: LineMarker | null = null;
    let markerLine: number | null = null;
    let inAnswerFence = false;
    cursor += 1;

    while (cursor < to) {
      const candidate = lines[cursor] ?? "";
      if (!inAnswerFence) {
        const lineMarker = parseLineMarker(candidate);
        if (lineMarker) {
          marker = lineMarker;
          markerLine = cursor;
          cursor += 1;
          break;
        }
      }
      if (FENCE_PATTERN.test(candidate)) {
        inAnswerFence = !inAnswerFence;
        answerLines.push(candidate);
        endLine = cursor;
        cursor += 1;
        continue;
      }
      if (!inAnswerFence) {
        if (candidate.trim() === "") {
          if (allowBlankLines) {
            answerLines.push(candidate);
            cursor += 1;
            continue;
          }
          const blankStart = cursor;
          while (cursor < to && (lines[cursor] ?? "").trim() === "") cursor += 1;
          // Outside an Anki block, blank lines may still be part of a multiline
          // answer; only stop when the next paragraph is an independent Cloze card.
          if (startsStandaloneClozeParagraphs(lines, cursor, to)) break;
          answerLines.push(...lines.slice(blankStart, cursor));
          continue;
        }
        if (isQuestionBoundary(candidate) && !isIndentedCode(candidate)) break;
        if (!allowBlankLines && !isIndentedCode(candidate) && HEADING_OR_RULE_PATTERN.test(candidate)) break;
      }
      answerLines.push(candidate);
      endLine = cursor;
      cursor += 1;
    }

    const questionMarkdown = questionLines.join("\n").trim();
    const answerMarkdown = answerLines.join("\n").trim();
    if (questionMarkdown && answerMarkdown) {
      cards.push({
        kind,
        ankiId: marker?.ankiId ?? null,
        legacySyncId: marker?.legacySyncId ?? null,
        deletedInAnki: marker?.deleted ?? false,
        markerLine,
        deckBlock: null,
        questionMarkdown,
        answerMarkdown,
        startLine,
        endLine
      });
    }
    index = Math.max(cursor, index + 1);
  }

  return cards;
}

function parseChoiceCardsIn(
  lines: string[],
  from: number,
  to: number,
  allowBlankLines: boolean
): ParsedChoiceCard[] {
  const cards: ParsedChoiceCard[] = [];
  let index = from;
  let inFence = false;
  let inFrontmatter = from === 0 && (lines[0] ?? "").trim() === "---";
  if (inFrontmatter) index = 1;

  while (index < to) {
    const line = lines[index] ?? "";
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      index += 1;
      continue;
    }
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      index += 1;
      continue;
    }
    if (inFence) {
      index += 1;
      continue;
    }
    if (!allowBlankLines && isIndentedCode(line)) {
      index += 1;
      continue;
    }

    const questionMatch = line.match(CHOICE_QUESTION_PATTERN);
    if (!questionMatch) {
      index += 1;
      continue;
    }

    const mode = questionMatch[1]?.toUpperCase() === "S" ? "single" : "multiple";
    const questionLines = [questionMatch[2] ?? ""];
    const startLine = index;
    let cursor = index + 1;

    while (cursor < to) {
      const candidate = lines[cursor] ?? "";
      if (CHOICE_OPTION_PATTERN.test(candidate)) break;
      if (isQuestionBoundary(candidate) && !isIndentedCode(candidate)) break;
      if (!allowBlankLines) {
        if (
          !isIndentedCode(candidate) &&
          (candidate.trim() === "" ||
            HEADING_OR_RULE_PATTERN.test(candidate) ||
            CHOICE_EXPLANATION_PATTERN.test(candidate) ||
            parseLineMarker(candidate))
        ) {
          break;
        }
      } else if (CHOICE_EXPLANATION_PATTERN.test(candidate)) {
        break;
      }
      questionLines.push(candidate);
      cursor += 1;
    }

    const options: ParsedChoiceCard["options"] = [];
    let hasUnsupportedCompletedMarker = false;
    let endLine = startLine;
    while (cursor < to) {
      if (allowBlankLines) {
        while (cursor < to && (lines[cursor] ?? "").trim() === "") cursor += 1;
      }
      const optionMatch = (lines[cursor] ?? "").match(CHOICE_OPTION_PATTERN);
      if (!optionMatch) break;
      if ((optionMatch[1] ?? "").toLowerCase() === "x") {
        hasUnsupportedCompletedMarker = true;
      }
      options.push({
        correct: optionMatch[1] === "-",
        markdown: optionMatch[2]?.trim() ?? ""
      });
      endLine = cursor;
      cursor += 1;
    }

    if (allowBlankLines) {
      while (cursor < to && (lines[cursor] ?? "").trim() === "") cursor += 1;
    }

    const explanationLines: string[] = [];
    const explanationMatch = (lines[cursor] ?? "").match(CHOICE_EXPLANATION_PATTERN);
    if (explanationMatch) {
      explanationLines.push(explanationMatch[1] ?? "");
      endLine = cursor;
      cursor += 1;
      let inExplanationFence = false;
      while (cursor < to) {
        const candidate = lines[cursor] ?? "";
        if (!inExplanationFence && parseLineMarker(candidate)) break;
        if (FENCE_PATTERN.test(candidate)) {
          inExplanationFence = !inExplanationFence;
          explanationLines.push(candidate);
          endLine = cursor;
          cursor += 1;
          continue;
        }
        if (!inExplanationFence) {
          if (candidate.trim() === "") {
            if (!allowBlankLines) break;
            explanationLines.push(candidate);
            cursor += 1;
            continue;
          }
          if (isQuestionBoundary(candidate) && !isIndentedCode(candidate)) break;
          if (!allowBlankLines && !isIndentedCode(candidate) && HEADING_OR_RULE_PATTERN.test(candidate)) break;
        }
        explanationLines.push(candidate);
        endLine = cursor;
        cursor += 1;
      }
    }

    let marker: LineMarker | null = parseLineMarker(lines[cursor] ?? "");
    let markerLine: number | null = marker ? cursor : null;
    if (marker) cursor += 1;

    const questionMarkdown = questionLines.join("\n").trim();
    const correctCount = options.filter((option) => option.correct).length;
    const hasValidAnswer = mode === "single" ? correctCount === 1 : correctCount >= 1;
    if (
      questionMarkdown &&
      options.length >= 2 &&
      hasValidAnswer &&
      !hasUnsupportedCompletedMarker
    ) {
      cards.push({
        kind: "choice",
        mode,
        ankiId: marker?.ankiId ?? null,
        legacySyncId: marker?.legacySyncId ?? null,
        deletedInAnki: marker?.deleted ?? false,
        markerLine,
        deckBlock: null,
        questionMarkdown,
        options,
        explanationMarkdown: explanationLines.join("\n").trim(),
        startLine,
        endLine
      });
    }
    index = Math.max(cursor, index + 1);
  }

  return cards;
}

function parseImageOcclusionCardsIn(
  lines: string[],
  from: number,
  to: number,
  allowBlankLines: boolean
): ParsedImageOcclusionCard[] {
  const cards: ParsedImageOcclusionCard[] = [];
  let index = from;
  let inFence = false;
  let inFrontmatter = from === 0 && (lines[0] ?? "").trim() === "---";
  if (inFrontmatter) index = 1;

  while (index < to) {
    const line = lines[index] ?? "";
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      index += 1;
      continue;
    }
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      index += 1;
      continue;
    }
    if (inFence) {
      index += 1;
      continue;
    }
    if (!allowBlankLines && isIndentedCode(line)) {
      index += 1;
      continue;
    }

    const imageMatch = line.match(IMAGE_OCCLUSION_PATTERN);
    if (!imageMatch) {
      index += 1;
      continue;
    }

    const startLine = index;
    const imageMarkdown = (imageMatch[1] ?? "").trim();
    let cursor = index + 1;
    const masks: ImageOcclusionMask[] = [];
    let invalidMask = false;
    let endLine = startLine;

    while (cursor < to) {
      if (allowBlankLines) {
        while (cursor < to && (lines[cursor] ?? "").trim() === "") cursor += 1;
      }
      const maskMatch = (lines[cursor] ?? "").match(IMAGE_OCCLUSION_MASK_PATTERN);
      if (!maskMatch) break;
      const mask = parseImageOcclusionMask(maskMatch[1] ?? "");
      if (!mask) invalidMask = true;
      else masks.push(mask);
      endLine = cursor;
      cursor += 1;
    }

    if (allowBlankLines) {
      while (cursor < to && (lines[cursor] ?? "").trim() === "") cursor += 1;
    }

    if (!imageMarkdown || masks.length === 0 || invalidMask) {
      index += 1;
      continue;
    }

    let marker: LineMarker | null = null;
    let markerLine: number | null = null;
    const answerLines: string[] = [];

    const firstAnswer = (lines[cursor] ?? "").match(IMAGE_OCCLUSION_ANSWER_PATTERN);
    if (firstAnswer) {
      answerLines.push(firstAnswer[1] ?? "");
      endLine = cursor;
      cursor += 1;
      let inAnswerFence = false;
      while (cursor < to) {
        const candidate = lines[cursor] ?? "";
        if (!inAnswerFence) {
          const candidateMarker = parseLineMarker(candidate);
          if (candidateMarker) {
            marker = candidateMarker;
            markerLine = cursor;
            cursor += 1;
            break;
          }
        }
        if (FENCE_PATTERN.test(candidate)) {
          inAnswerFence = !inAnswerFence;
          answerLines.push(candidate);
          endLine = cursor;
          cursor += 1;
          continue;
        }
        if (!inAnswerFence) {
          if (candidate.trim() === "") {
            if (!allowBlankLines) break;
            answerLines.push(candidate);
            cursor += 1;
            continue;
          }
          if (isQuestionBoundary(candidate) && !isIndentedCode(candidate)) break;
          if (!allowBlankLines && !isIndentedCode(candidate) && HEADING_OR_RULE_PATTERN.test(candidate)) break;
          if (IMAGE_OCCLUSION_MASK_PATTERN.test(candidate) && !isIndentedCode(candidate)) break;
        }
        answerLines.push(candidate);
        endLine = cursor;
        cursor += 1;
      }
    } else {
      marker = parseLineMarker(lines[cursor] ?? "");
      if (marker) {
        markerLine = cursor;
        cursor += 1;
      }
    }

    cards.push({
      kind: "image-occlusion",
      ankiId: marker?.ankiId ?? null,
      legacySyncId: marker?.legacySyncId ?? null,
      deletedInAnki: marker?.deleted ?? false,
      markerLine,
      deckBlock: null,
      imageMarkdown,
      masks,
      answerMarkdown: answerLines.join("\n").trim(),
      startLine,
      endLine
    });
    index = Math.max(cursor, index + 1);
  }

  return cards;
}

function parseClozeCardsIn(
  lines: string[],
  from: number,
  to: number,
  allowBlankLines: boolean
): ParsedClozeCard[] {
  if (allowBlankLines) {
    let first = -1;
    let last = -1;
    for (let index = from; index < to; index += 1) {
      if ((lines[index] ?? "").trim() === "") continue;
      if (first < 0) first = index;
      last = index;
    }
    if (first < 0) return [];
    const markdown = lines.slice(first, last + 1).join("\n").trim();
    if (!CLOZE_PATTERN.test(markdown)) return [];
    return [
      {
        kind: "cloze",
        ankiId: null,
        legacySyncId: null,
        deletedInAnki: false,
        markerLine: null,
        deckBlock: null,
        markdown,
        startLine: first,
        endLine: last
      }
    ];
  }

  const cards: ParsedClozeCard[] = [];
  let index = from;
  let inFence = false;
  let inFrontmatter = from === 0 && (lines[0] ?? "").trim() === "---";
  if (inFrontmatter) index = 1;

  while (index < to) {
    const line = lines[index] ?? "";

    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      index += 1;
      continue;
    }

    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      index += 1;
      continue;
    }

    if (
      inFence ||
      line.trim() === "" ||
      HEADING_OR_RULE_PATTERN.test(line) ||
      isIndentedCode(line)
    ) {
      index += 1;
      continue;
    }

    // A marker belongs to the card immediately before it, never to content after it.
    if (parseLineMarker(line)) {
      index += 1;
      continue;
    }

    const startLine = index;
    const contentLines: string[] = [];
    let marker: LineMarker | null = null;
    let markerLine: number | null = null;

    while (index < to) {
      const current = lines[index] ?? "";
      if (
        current.trim() === "" ||
        HEADING_OR_RULE_PATTERN.test(current) ||
        FENCE_PATTERN.test(current)
      ) {
        break;
      }

      const lineMarker = parseLineMarker(current);
      if (lineMarker) {
        marker = lineMarker;
        markerLine = index;
        index += 1;
        break;
      }

      contentLines.push(current);
      index += 1;
    }

    const contentEndLine = markerLine === null ? index - 1 : markerLine - 1;
    const cardMarkdown = contentLines.join("\n").trim();
    if (CLOZE_PATTERN.test(cardMarkdown)) {
      cards.push({
        kind: "cloze",
        ankiId: marker?.ankiId ?? null,
        legacySyncId: marker?.legacySyncId ?? null,
        deletedInAnki: marker?.deleted ?? false,
        markerLine,
        deckBlock: null,
        markdown: cardMarkdown,
        startLine,
        endLine: contentEndLine
      });
    }
  }

  return cards;
}

function overlaps(a: { startLine: number; endLine: number }, b: { startLine: number; endLine: number }): boolean {
  return a.startLine <= b.endLine && b.startLine <= a.endLine;
}

function parseRegion(
  lines: string[],
  from: number,
  to: number,
  allowBlankLines: boolean
): ParsedFlashcard[] {
  const structuredCards: ParsedFlashcard[] = [
    ...parseBasicCardsIn(lines, from, to, allowBlankLines),
    ...parseChoiceCardsIn(lines, from, to, allowBlankLines),
    ...parseImageOcclusionCardsIn(lines, from, to, allowBlankLines)
  ];
  const clozeCards = parseClozeCardsIn(lines, from, to, allowBlankLines).filter(
    (cloze) => !structuredCards.some((card) => overlaps(cloze, card))
  );
  return [...structuredCards, ...clozeCards].sort((a, b) => a.startLine - b.startLine);
}

/** Scans legacy `<!-- anki-sync-file-id: ... -->` markers outside code fences. */
export function findLegacyFileId(
  markdown: string
): { id: string; line: number } | null {
  const lines = markdown.split("\n");
  let fence: FenceState | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const opening = openingFence(line);
    if (opening) {
      fence = opening;
      continue;
    }
    if (isIndentedCode(line)) continue;
    const match = line.match(LEGACY_FILE_ID_PATTERN);
    if (match?.[1]) return { id: match[1], line: index };
  }
  return null;
}

/** All legacy `<!-- anki-sync-id: ... -->` markers outside code fences. */
export function scanLegacySyncIds(markdown: string): string[] {
  const lines = markdown.split("\n");
  const ids: string[] = [];
  let fence: FenceState | null = null;
  for (const line of lines) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const opening = openingFence(line);
    if (opening) {
      fence = opening;
      continue;
    }
    if (/^(?:\t| {4})/.test(line)) continue;
    const match = line.match(LEGACY_SYNC_ID_PATTERN);
    if (match?.[1]) ids.push(match[1]);
  }
  return ids;
}

/** All `<!-- Anki-ID: n -->` markers outside code fences, in document order. */
export function scanAnkiIdMarkers(markdown: string): number[] {
  const lines = markdown.split("\n");
  const noteIds: number[] = [];
  let fence: FenceState | null = null;
  for (const line of lines) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const opening = openingFence(line);
    if (opening) {
      fence = opening;
      continue;
    }
    if (/^(?:\t| {4})/.test(line)) continue;
    const match = line.match(ANKI_ID_PATTERN);
    if (!match) continue;
    const noteId = Number.parseInt(match[1] ?? "", 10);
    if (Number.isSafeInteger(noteId) && noteId > 0) noteIds.push(noteId);
  }
  return noteIds;
}

/** True when the document contains flashcard syntax even if no card parsed. */
export function looksLikeCardContent(markdown: string): boolean {
  const lines = markdown.split("\n");
  let fence: FenceState | null = null;
  let inFrontmatter = (lines[0] ?? "").trim() === "---";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (inFrontmatter) {
      if (index > 0 && line.trim() === "---") inFrontmatter = false;
      continue;
    }
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const opening = openingFence(line);
    if (opening) {
      fence = opening;
      continue;
    }
    if (isIndentedCode(line)) continue;
    if (BLOCK_START_PATTERN.test(line) || BLOCK_END_PATTERN.test(line)) return true;
    if (isQuestionBoundary(line) || IMAGE_OCCLUSION_PATTERN.test(line)) return true;
    if (IMAGE_OCCLUSION_MASK_PATTERN.test(line)) return true;
    if (CLOZE_PATTERN.test(line)) return true;
  }
  return false;
}

/**
 * Parses the whole document. Content inside Anki blocks is parsed with blank
 * lines allowed; everything else keeps the traditional blank-line boundaries.
 */
export function parseDocument(markdown: string): ParsedDocument {
  const lines = markdown.split("\n");
  const scan = scanDeckBlocks(markdown);
  const masked = maskDeckRegions(lines, scan.blocks);
  const cards = parseRegion(masked, 0, masked.length, false);
  const diagnostics = [...scan.diagnostics];

  for (const block of scan.blocks) {
    const regionCards = parseRegion(
      lines,
      block.contentStartLine,
      block.contentEndLine + 1,
      true
    );
    regionCards.forEach((card, index) => {
      card.deckBlock = block;
      const marker = block.markerIds[index];
      card.ankiId = marker?.noteId ?? null;
      card.deletedInAnki = marker?.deleted ?? false;
      card.markerLine = marker?.line ?? null;
      card.legacySyncId = null;
      cards.push(card);
    });
    if (regionCards.length > 0 && block.markerIds.length > regionCards.length) {
      diagnostics.push({
        severity: "error",
        line: block.endLine + 1,
        message: `Anki 区块内有 ${regionCards.length} 张卡片，却有 ${block.markerIds.length} 个标记；已停止同步以避免关联到错误的卡片。`
      });
    }
    const hasContent = lines
      .slice(block.contentStartLine, block.contentEndLine + 1)
      .some((line) => line.trim() !== "");
    if (hasContent && regionCards.length === 0) {
      diagnostics.push({
        severity: "error",
        line: block.startLine + 1,
        message: "Anki 区块内没有检测到有效题目；已停止同步以避免误删现有 Anki 卡片。"
      });
    }
  }

  cards.sort((a, b) => a.startLine - b.startLine);
  const legacyFileId = findLegacyFileId(markdown);

  return {
    cards,
    deckBlocks: scan.blocks,
    legacyFileId: legacyFileId?.id ?? null,
    legacyFileIdLine: legacyFileId?.line ?? null,
    diagnostics
  };
}

export function parseFlashcards(markdown: string): ParsedFlashcard[] {
  return parseDocument(markdown).cards;
}

function signatureHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(36)}-${value.length.toString(36)}`;
}

/**
 * Stable signature of a card's Markdown content. Used to remap Anki-IDs by
 * content when the positional markers inside an Anki block get shifted.
 */
export function cardContentSignature(card: ParsedFlashcard): string {
  let parts: unknown[];
  if (card.kind === "cloze") {
    parts = [card.kind, card.markdown];
  } else if (card.kind === "image-occlusion") {
    parts = [
      card.kind,
      card.imageMarkdown,
      card.masks.map((mask) => [mask.x, mask.y, mask.width, mask.height]),
      card.answerMarkdown
    ];
  } else if (card.kind === "choice") {
    parts = [
      card.kind,
      card.mode,
      card.questionMarkdown,
      card.options.map((option) => [option.correct ? 1 : 0, option.markdown]),
      card.explanationMarkdown
    ];
  } else {
    parts = [card.kind, card.questionMarkdown, card.answerMarkdown];
  }
  return signatureHash(JSON.stringify(parts));
}

export function parseBasicCards(markdown: string): ParsedBasicCard[] {
  return parseDocument(markdown).cards.filter(
    (card): card is ParsedBasicCard => card.kind === "basic" || card.kind === "plain"
  );
}

export function parseChoiceCards(markdown: string): ParsedChoiceCard[] {
  return parseDocument(markdown).cards.filter(
    (card): card is ParsedChoiceCard => card.kind === "choice"
  );
}

export function parseClozeCards(markdown: string): ParsedClozeCard[] {
  return parseDocument(markdown).cards.filter(
    (card): card is ParsedClozeCard => card.kind === "cloze"
  );
}

export function parseImageOcclusionCards(markdown: string): ParsedImageOcclusionCard[] {
  return parseDocument(markdown).cards.filter(
    (card): card is ParsedImageOcclusionCard => card.kind === "image-occlusion"
  );
}

export function parseImageOcclusionMask(value: string): ImageOcclusionMask | null {
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [x, y, width, height] = parts as [number, number, number, number];
  const epsilon = 0.000001;
  if (
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > 100 + epsilon ||
    y + height > 100 + epsilon
  ) {
    return null;
  }
  return { x, y, width, height };
}

export interface AnkiIdAssignment {
  card: ParsedFlashcard;
  noteId: number;
}

export interface MarkerUpdateResult {
  markdown: string;
  changed: boolean;
  added: number;
  removedLegacyFileId: boolean;
}

/**
 * Writes `<!-- Anki-ID: n -->` markers after each synced card and deletes the
 * legacy `anki-sync-file-id` marker. Edits run from the bottom of the document
 * up so line numbers stay valid.
 */
export function applyAnkiIdMarkers(
  markdown: string,
  assignments: ReadonlyArray<AnkiIdAssignment>,
  removeLegacyFileId = true
): MarkerUpdateResult {
  const lines = markdown.split("\n");
  const replacements = new Map<number, string>();
  const insertions = new Map<number, string[]>();
  let added = 0;

  for (const { card, noteId } of assignments) {
    const text = ankiIdMarker(noteId);
    if (card.markerLine !== null) {
      replacements.set(card.markerLine, text);
      continue;
    }
    const insertAt = card.deckBlock ? card.deckBlock.insertLine : card.endLine + 1;
    const list = insertions.get(insertAt) ?? [];
    list.push(text);
    insertions.set(insertAt, list);
    added += 1;
  }

  type Operation =
    | { kind: "replace"; line: number; text: string }
    | { kind: "insert"; line: number; texts: string[] }
    | { kind: "delete"; line: number };

  const operations: Operation[] = [];
  for (const [line, text] of replacements) operations.push({ kind: "replace", line, text });
  for (const [line, texts] of insertions) operations.push({ kind: "insert", line, texts });
  let removedLegacyFileId = false;
  if (removeLegacyFileId) {
    let fence: FenceState | null = null;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if (fence) {
        if (closesFence(line, fence)) fence = null;
        continue;
      }
      const opening = openingFence(line);
      if (opening) {
        fence = opening;
        continue;
      }
      if (LEGACY_FILE_ID_PATTERN.test(line)) {
        operations.push({ kind: "delete", line: index });
        removedLegacyFileId = true;
      }
    }
  }

  operations.sort((a, b) => b.line - a.line);
  for (const operation of operations) {
    if (operation.kind === "replace") {
      lines[operation.line] = operation.text;
    } else if (operation.kind === "insert") {
      lines.splice(operation.line, 0, ...operation.texts);
    } else {
      lines.splice(operation.line, 1);
    }
  }

  const result = lines.join("\n");
  return {
    markdown: result,
    changed: result !== markdown,
    added,
    removedLegacyFileId
  };
}

export interface AnkiDeleteUpdateResult {
  markdown: string;
  changed: boolean;
  count: number;
}

/**
 * Replaces `<!-- Anki-ID: n -->` with `<!-- Anki-Delete -->` for notes that no
 * longer exist in Anki. The card content stays in Obsidian but is not synced
 * again until the marker is removed or replaced by a new Anki-ID.
 */
export function markAnkiDeletedCards(
  markdown: string,
  noteIds: ReadonlySet<number>
): AnkiDeleteUpdateResult {
  if (noteIds.size === 0) return { markdown, changed: false, count: 0 };
  const document = parseDocument(markdown);
  const targets = document.cards.filter(
    (card) =>
      card.ankiId !== null &&
      noteIds.has(card.ankiId) &&
      !card.deletedInAnki &&
      card.markerLine !== null
  );
  if (targets.length === 0) return { markdown, changed: false, count: 0 };
  const lines = markdown.split("\n");
  for (const card of targets) {
    lines[card.markerLine as number] = ankiDeleteMarker();
  }
  const result = lines.join("\n");
  return {
    markdown: result,
    changed: result !== markdown,
    count: targets.length
  };
}

/**
 * Removes cards whose Anki notes were deleted from Markdown, including their
 * markers. When every card of an Anki block is removed, the block markers are
 * removed as well.
 */
export function removeAnkiDeletedCards(
  markdown: string,
  noteIds: ReadonlySet<number>
): AnkiDeleteUpdateResult {
  if (noteIds.size === 0) return { markdown, changed: false, count: 0 };
  const document = parseDocument(markdown);
  const targets = document.cards.filter(
    (card) =>
      card.ankiId !== null &&
      noteIds.has(card.ankiId) &&
      !card.deletedInAnki
  );
  if (targets.length === 0) return { markdown, changed: false, count: 0 };
  const lines = markdown.split("\n");
  const deleteLines = new Set<number>();
  const targetSet = new Set(targets);

  for (const block of document.deckBlocks) {
    const blockCards = document.cards.filter((card) => card.deckBlock === block);
    if (blockCards.length === 0) continue;
    const remaining = blockCards.filter((card) => !targetSet.has(card));
    if (remaining.length > 0) continue;
    const lastMarker = block.markerIds[block.markerIds.length - 1];
    const end = Math.max(block.endLine, lastMarker?.line ?? block.endLine);
    for (let index = block.startLine; index <= end; index += 1) {
      deleteLines.add(index);
    }
  }

  for (const card of targets) {
    for (let index = card.startLine; index <= card.endLine; index += 1) {
      deleteLines.add(index);
    }
    if (card.markerLine !== null) deleteLines.add(card.markerLine);
  }

  const result = lines.filter((_, index) => !deleteLines.has(index)).join("\n");
  return {
    markdown: result,
    changed: result !== markdown,
    count: targets.length
  };
}

export function hasCloze(markdown: string): boolean {
  return CLOZE_PATTERN.test(markdown);
}
