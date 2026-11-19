import { parseImageOcclusionCards } from "./parser";
import type { ImageOcclusionMask, ParsedImageOcclusionCard } from "./types";

export type ImageOcclusionResizeMode =
  | "resize-nw"
  | "resize-ne"
  | "resize-sw"
  | "resize-se";

export const roundImageOcclusionCoordinate = (value: number): number =>
  Math.round(value * 100) / 100;

export function serializeImageOcclusionMask(mask: ImageOcclusionMask): string {
  return [mask.x, mask.y, mask.width, mask.height]
    .map(roundImageOcclusionCoordinate)
    .join(", ");
}

export interface ImageOcclusionCardOptions {
  /** Note ID appended under a plain (non-block) card. */
  ankiId?: number | null;
  /** Wrap the card in `<!-- Anki_START -->` / `<!-- Anki_END -->`. */
  block?: boolean;
  /** Keep blank lines inside a multi-line answer (only safe inside a block). */
  preserveAnswerBlankLines?: boolean;
}

export function buildImageOcclusionCardMarkdown(
  imageMarkdown: string,
  masks: ImageOcclusionMask[],
  answer: string,
  options: ImageOcclusionCardOptions = {}
): string {
  const lines: string[] = [];
  if (options.block) lines.push("<!-- Anki_START -->");
  lines.push(
    `IO: ${imageMarkdown}`,
    ...masks.map((mask) => `<!-- MASK: ${serializeImageOcclusionMask(mask)} -->`)
  );
  const trimmedAnswer = answer.trim();
  if (trimmedAnswer) {
    const answerLines = trimmedAnswer.split("\n");
    const contentLines = options.preserveAnswerBlankLines
      ? answerLines
      : answerLines.filter((line) => line.trim() !== "");
    const [firstLine = "", ...remainingLines] = contentLines;
    lines.push(`A: ${firstLine}`, ...remainingLines);
  }
  if (options.block) {
    lines.push("<!-- Anki_END -->");
  } else if (options.ankiId) {
    lines.push(`<!-- Anki-ID: ${options.ankiId} -->`);
  }
  return lines.join("\n");
}

export function findImageOcclusionCardAtLine(
  markdown: string,
  line: number
): ParsedImageOcclusionCard | null {
  return parseImageOcclusionCards(markdown).find((card) => {
    if (card.deckBlock === null) return false;
    const firstLine = card.startLine;
    const lastLine = card.endLine;
    return line >= firstLine && line <= lastLine;
  }) ?? null;
}

export function moveImageOcclusionMask(
  mask: ImageOcclusionMask,
  deltaX: number,
  deltaY: number
): ImageOcclusionMask {
  return {
    ...mask,
    x: Math.min(100 - mask.width, Math.max(0, mask.x + deltaX)),
    y: Math.min(100 - mask.height, Math.max(0, mask.y + deltaY))
  };
}

export function resizeImageOcclusionMask(
  mask: ImageOcclusionMask,
  deltaX: number,
  deltaY: number,
  mode: ImageOcclusionResizeMode
): ImageOcclusionMask {
  const minimumSize = 1;
  let left = mask.x;
  let top = mask.y;
  let right = mask.x + mask.width;
  let bottom = mask.y + mask.height;

  if (mode.endsWith("w")) left = Math.min(right - minimumSize, Math.max(0, left + deltaX));
  if (mode.endsWith("e")) right = Math.max(left + minimumSize, Math.min(100, right + deltaX));
  if (mode.includes("-n")) top = Math.min(bottom - minimumSize, Math.max(0, top + deltaY));
  if (mode.includes("-s")) bottom = Math.max(top + minimumSize, Math.min(100, bottom + deltaY));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}
