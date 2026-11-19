import assert from "node:assert/strict";
import test from "node:test";
import {
  buildImageOcclusionCardMarkdown,
  findImageOcclusionCardAtLine,
  moveImageOcclusionMask,
  resizeImageOcclusionMask
} from "../src/image-occlusion-utils";
import { parseImageOcclusionCards } from "../src/parser";

test("finds an existing image occlusion card from its content lines", () => {
  const source = [
    "Introduction",
    "<!-- Anki_START -->",
    "IO: ![[heart.png]]",
    "<!-- MASK: 10, 20, 30, 15 -->",
    "A: 左心室",
    "<!-- Anki_END -->",
    "<!-- Anki-ID: 4242 -->",
    ""
  ].join("\n");

  for (const line of [2, 3, 4]) {
    assert.equal(findImageOcclusionCardAtLine(source, line)?.ankiId, 4242);
  }
  assert.equal(findImageOcclusionCardAtLine(source, 1), null);
  assert.equal(findImageOcclusionCardAtLine(source, 5), null);
});

test("rebuilds an edited card while preserving the image source and note id", () => {
  const markdown = buildImageOcclusionCardMarkdown(
    "![[anatomy/heart.png|600]]",
    [
      { x: 12.345, y: 20, width: 30, height: 15 },
      { x: 55, y: 42, width: 18, height: 12 }
    ],
    "左心室\n负责将血液送往全身",
    { ankiId: 4242 }
  );
  const [card] = parseImageOcclusionCards(markdown);

  assert.match(markdown, /MASK: 12\.35, 20, 30, 15/);
  assert.equal(card?.imageMarkdown, "![[anatomy/heart.png|600]]");
  assert.equal(card?.answerMarkdown, "左心室\n负责将血液送往全身");
  assert.equal(card?.ankiId, 4242);
  assert.equal(card?.masks.length, 2);
});

test("builds a new image occlusion card inside Anki block markers", () => {
  const markdown = buildImageOcclusionCardMarkdown(
    "![[heart.png]]",
    [{ x: 10, y: 20, width: 30, height: 15 }],
    "第一段\n\n第二段",
    { block: true, preserveAnswerBlankLines: true }
  );

  assert.match(markdown, /^<!-- Anki_START -->/);
  assert.match(markdown, /<!-- Anki_END -->$/);
  assert.ok(!markdown.includes("Anki-ID"));
  const [card] = parseImageOcclusionCards(markdown);
  assert.equal(card?.answerMarkdown, "第一段\n\n第二段");
  assert.equal(card?.deckBlock?.startLine, 0);
  assert.equal(card?.deckBlock?.endLine, markdown.split("\n").length - 1);
});

test("finds a block image occlusion card from its content lines", () => {
  const markdown = buildImageOcclusionCardMarkdown(
    "![[heart.png]]",
    [{ x: 10, y: 20, width: 30, height: 15 }],
    "答案",
    { block: true }
  );
  const lines = markdown.split("\n");

  assert.equal(findImageOcclusionCardAtLine(markdown, 1)?.imageMarkdown, "![[heart.png]]");
  assert.equal(
    findImageOcclusionCardAtLine(markdown, lines.length - 2)?.imageMarkdown,
    "![[heart.png]]"
  );
  assert.equal(findImageOcclusionCardAtLine(markdown, 0), null);
});

test("moves masks without allowing them outside the image", () => {
  const mask = { x: 10, y: 20, width: 30, height: 40 };

  assert.deepEqual(moveImageOcclusionMask(mask, -50, 80), {
    x: 0,
    y: 60,
    width: 30,
    height: 40
  });
});

test("resizes masks from every corner with a one-percent minimum size", () => {
  const mask = { x: 20, y: 20, width: 30, height: 30 };

  assert.deepEqual(resizeImageOcclusionMask(mask, -10, -5, "resize-nw"), {
    x: 10,
    y: 15,
    width: 40,
    height: 35
  });
  assert.deepEqual(resizeImageOcclusionMask(mask, -50, -50, "resize-se"), {
    x: 20,
    y: 20,
    width: 1,
    height: 1
  });
  assert.deepEqual(resizeImageOcclusionMask(mask, 80, 80, "resize-se"), {
    x: 20,
    y: 20,
    width: 80,
    height: 80
  });
});
