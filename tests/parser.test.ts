import assert from "node:assert/strict";
import test from "node:test";
import {
  ANKI_ID_PATTERN,
  applyAnkiIdMarkers,
  parseBasicCards,
  parseChoiceCards,
  parseClozeCards,
  parseDocument,
  parseFlashcards,
  parseImageOcclusionCards,
  parseImageOcclusionMask,
  parseLineMarker,
  scanAnkiIdMarkers
} from "../src/parser";
import {
  collectMarkdownSyncIds,
  diagnoseMarkdown,
  findCrossFileIdConflicts
} from "../src/diagnostics";
import {
  classifyNoteOwnership,
  findStaleNoteIds,
  noteMatchesFields,
  obsoletePluginTags
} from "../src/sync-utils";
import { isIgnoredPath, normalizeVaultPath } from "../src/ignore";
import { resolveNoteFileConfigFromData } from "../src/note-config";
import { DEFAULT_SETTINGS } from "../src/types";
import {
  extractEmbeddedLinks,
  isExactMediaSourceMatch,
  rewriteEmbeddedMediaForAnki
} from "../src/media";

const noteInfo = (fields: Record<string, string>, noteId = 1) => ({
  noteId,
  modelName: "Obsidian Q&A",
  tags: [] as string[],
  cards: [noteId],
  fields: Object.fromEntries(
    Object.entries(fields).map(([name, value], order) => [name, { value, order }])
  )
});

test("parses an Anki-ID marker after a cloze paragraph", () => {
  const source = [
    "The powerhouse is {{c1::the mitochondrion}}.",
    "<!-- Anki-ID: 123456789 -->"
  ].join("\n");
  const [card] = parseClozeCards(source);

  assert.equal(card?.ankiId, 123456789);
  assert.equal(card?.legacySyncId, null);
  assert.equal(card?.markerLine, 1);
  assert.equal(card?.markdown, "The powerhouse is {{c1::the mitochondrion}}.");
});

test("accepts Anki-ID spelling variants", () => {
  assert.equal(parseLineMarker("<!-- Anki-ID: 42 -->")?.ankiId, 42);
  assert.equal(parseLineMarker("<!--anki-id:42-->")?.ankiId, 42);
  assert.equal(parseLineMarker("<!-- ANKI ID ： 42 -->")?.ankiId, 42);
  assert.equal(parseLineMarker("<!-- Anki-ID: 0 -->"), null);
  assert.equal(parseLineMarker("<!-- Anki-ID: abc -->"), null);
});

test("parses legacy sync markers for migration", () => {
  const source = [
    "<!-- anki-sync-file-id: old-file -->",
    "",
    "Q: One?",
    "A: First",
    "<!-- anki-sync-id: old-card -->"
  ].join("\n");
  const document = parseDocument(source);

  assert.equal(document.legacyFileId, "old-file");
  assert.equal(document.legacyFileIdLine, 0);
  assert.equal(document.cards.length, 1);
  assert.equal(document.cards[0]?.legacySyncId, "old-card");
  assert.equal(document.cards[0]?.ankiId, null);
});

test("supports multiple clozes and hints in one note", () => {
  const cards = parseClozeCards("{{c1::Paris::city}} is in {{c2::France::country}}.");
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.ankiId, null);
});

test("ignores cloze syntax in frontmatter and fenced code", () => {
  const source = [
    "---",
    "example: '{{c1::ignored}}'",
    "---",
    "",
    "```md",
    "{{c1::ignored too}}",
    "```"
  ].join("\n");
  assert.deepEqual(parseClozeCards(source), []);
});

test("does not treat Anki-ID examples inside code as markers", () => {
  const source = [
    "```md",
    "<!-- Anki-ID: 12 -->",
    "<!-- anki-sync-file-id: example-file -->",
    "```",
    "",
    "    <!-- Anki-ID: 13 -->",
    "",
    "Q: Real card?",
    "A: Yes"
  ].join("\n");

  assert.deepEqual(scanAnkiIdMarkers(source), []);
  assert.equal(parseDocument(source).legacyFileId, null);
});

test("parses a Q/A card with its Anki-ID", () => {
  const source = "Q: question\nA: answer\n<!-- Anki-ID: 7 -->";
  const [card] = parseBasicCards(source);

  assert.equal(card?.kind, "plain");
  assert.equal(card?.ankiId, 7);
  assert.equal(card?.endLine, 1);
  assert.equal(card?.markerLine, 2);
});

test("keeps an Anki-ID marker across blank lines after the answer", () => {
  const source = "Q: question\nA: answer\n\n<!-- Anki-ID: 77 -->";
  const [card] = parseBasicCards(source);

  assert.equal(card?.ankiId, 77);
  assert.equal(card?.answerMarkdown, "answer");
});

test("supports full-width colons and unnumbered Q/A cards", () => {
  const cards = parseBasicCards("Q：台湾的首都是？\nA：台北");
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.kind, "plain");
  assert.equal(cards[0]?.questionMarkdown, "台湾的首都是？");
});

test("parses unnumbered QC/AC as a code-practice card", () => {
  const cards = parseBasicCards("QC: Implement pop.\nAC: Use array.pop().");

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.kind, "basic");
});

test("does not parse removed numbered Q1/A1 cards", () => {
  const source = "Q1: 1+1 = ?\nA1: 2\n<!-- Anki-ID: 5 -->";
  assert.deepEqual(parseBasicCards(source), []);
});

test("parses adjacent Q/A pairs without requiring blank lines", () => {
  const source = "Q: One?\nA: First\nQ: Two?\nA: Second";
  const cards = parseBasicCards(source);
  assert.equal(cards.length, 2);
  assert.equal(cards[1]?.answerMarkdown, "Second");
});

test("keeps blank lines and restarted lists inside Q/A answers", () => {
  const answers = [
    "First paragraph.\n\nSecond paragraph.",
    "First paragraph.\n\n\nSecond paragraph.",
    "1. first\n2. second\n\n1. another first\n2. another second"
  ];

  for (const answer of answers) {
    const cards = parseBasicCards(`Q: Why?\nA:\n${answer}`);
    assert.equal(cards.length, 1);
    assert.equal(cards[0]?.answerMarkdown, answer);
  }
});

test("keeps a following standalone cloze separate from a Q/A answer", () => {
  const source = [
    "Q: question",
    "A: answer",
    "",
    "This is {{c1::cloze}}"
  ].join("\n");

  const cards = parseFlashcards(source);

  assert.deepEqual(cards.map((card) => card.kind), ["plain", "cloze"]);
  assert.equal(cards[0]?.kind === "plain" ? cards[0].answerMarkdown : null, "answer");
});

test("a deck block parses multi-line Q/A content with blank lines", () => {
  const source = [
    "<!-- Deck_START -->",
    "Q: 这是问答题目（支持多行）",
    "题目的第二行",
    "",
    "A: 这是答案（支持多行）",
    "答案第二段",
    "",
    "答案第三段",
    "<!-- Deck_END -->",
    "<!-- Anki-ID: 987 -->"
  ].join("\n");
  const document = parseDocument(source);

  assert.equal(document.cards.length, 1);
  const card = document.cards[0];
  assert.equal(card?.kind, "plain");
  assert.equal(card?.questionMarkdown, "这是问答题目（支持多行）\n题目的第二行");
  assert.equal(card?.answerMarkdown, "这是答案（支持多行）\n答案第二段\n\n答案第三段");
  assert.equal(card?.ankiId, 987);
  assert.equal(card?.markerLine, 9);
  assert.equal(card?.deckBlock?.startLine, 0);
  assert.equal(card?.deckBlock?.endLine, 8);
  if (card?.kind === "plain") {
    assert.ok(!card.answerMarkdown.includes("Deck_END"));
    assert.ok(!card.questionMarkdown.includes("Deck_START"));
  }
});

test("a deck block can hold several cards mapped to markers after Deck_END", () => {
  const source = [
    "<!-- Deck_START -->",
    "Q: one",
    "A: first",
    "Q: two",
    "A: second",
    "<!-- Deck_END -->",
    "<!-- Anki-ID: 11 -->",
    "<!-- Anki-ID: 22 -->"
  ].join("\n");
  const cards = parseFlashcards(source);

  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((card) => card.ankiId), [11, 22]);
  assert.deepEqual(
    cards.map((card) => (card.kind === "plain" ? card.answerMarkdown : null)),
    ["first", "second"]
  );
});

test("cloze content inside a deck block spans blank lines", () => {
  const source = [
    "<!-- Deck_START -->",
    "First {{c1::one}} line.",
    "",
    "Second line with {{c2::two}}.",
    "<!-- Deck_END -->",
    "<!-- Anki-ID: 33 -->"
  ].join("\n");
  const cards = parseClozeCards(source);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.ankiId, 33);
  assert.equal(cards[0]?.markdown, "First {{c1::one}} line.\n\nSecond line with {{c2::two}}.");
});

test("cards outside a deck block keep blank-line boundaries", () => {
  const source = [
    "One {{c1::a}}.",
    "",
    "<!-- Deck_START -->",
    "Q: inside",
    "A: block",
    "<!-- Deck_END -->",
    "",
    "Two {{c1::b}}."
  ].join("\n");
  const cards = parseFlashcards(source);

  assert.deepEqual(cards.map((card) => card.kind), ["cloze", "plain", "cloze"]);
  assert.deepEqual(
    cards.map((card) => (card.ankiId === null ? null : card.ankiId)),
    [null, null, null]
  );
});

test("adds a marker directly after Deck_END when a card was just synced", () => {
  const source = [
    "<!-- Deck_START -->",
    "Q: 这是问答题目（支持多行）",
    "A: 这是答案（支持多行）",
    "<!-- Deck_END -->"
  ].join("\n");
  const document = parseDocument(source);
  const result = applyAnkiIdMarkers(source, [
    { card: document.cards[0]!, noteId: 555 }
  ]);

  assert.equal(
    result.markdown,
    [
      "<!-- Deck_START -->",
      "Q: 这是问答题目（支持多行）",
      "A: 这是答案（支持多行）",
      "<!-- Deck_END -->",
      "<!-- Anki-ID: 555 -->"
    ].join("\n")
  );
  assert.equal(result.added, 1);
  assert.equal(parseDocument(result.markdown).cards[0]?.ankiId, 555);
});

test("adds markers below regular cards and replaces legacy markers", () => {
  const source = [
    "<!-- anki-sync-file-id: old-file -->",
    "",
    "Q: One?",
    "A: First",
    "<!-- anki-sync-id: old-card -->",
    "",
    "Water is {{c1::H2O}}."
  ].join("\n");
  const document = parseDocument(source);
  const basic = document.cards.find((card) => card.kind === "plain");
  const cloze = document.cards.find((card) => card.kind === "cloze");

  const result = applyAnkiIdMarkers(source, [
    { card: basic!, noteId: 41 },
    { card: cloze!, noteId: 42 }
  ]);

  assert.equal(result.removedLegacyFileId, true);
  assert.ok(!result.markdown.includes("anki-sync-file-id"));
  assert.ok(!result.markdown.includes("anki-sync-id"));
  assert.equal(result.added, 1);
  const reparsed = parseDocument(result.markdown);
  assert.deepEqual(reparsed.cards.map((card) => card.ankiId), [41, 42]);
});

test("adds markers for several new cards after Deck_END in order", () => {
  const source = [
    "<!-- Deck_START -->",
    "Q: one",
    "A: first",
    "Q: two",
    "A: second",
    "<!-- Deck_END -->"
  ].join("\n");
  const document = parseDocument(source);
  const result = applyAnkiIdMarkers(
    source,
    document.cards.map((card, index) => ({ card, noteId: 100 + index }))
  );

  assert.equal(
    result.markdown,
    [
      "<!-- Deck_START -->",
      "Q: one",
      "A: first",
      "Q: two",
      "A: second",
      "<!-- Deck_END -->",
      "<!-- Anki-ID: 100 -->",
      "<!-- Anki-ID: 101 -->"
    ].join("\n")
  );
  assert.deepEqual(
    parseDocument(result.markdown).cards.map((card) => card.ankiId),
    [100, 101]
  );
});

test("re-applying identical markers is a no-op", () => {
  const source = "Q: One?\nA: First\n<!-- Anki-ID: 41 -->";
  const document = parseDocument(source);
  const result = applyAnkiIdMarkers(source, [
    { card: document.cards[0]!, noteId: 41 }
  ]);

  assert.equal(result.changed, false);
  assert.equal(result.markdown, source);
});

test("parses QS as a single-choice card with an optional explanation", () => {
  const source = [
    "QS: HTTP 的默认端口是？",
    "- [ ] 21",
    "- [ ] 22",
    "- [-] **80**",
    "- [ ] 443",
    "E: HTTPS 才默认使用 443。",
    "<!-- Anki-ID: 88 -->"
  ].join("\n");
  const cards = parseChoiceCards(source);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.mode, "single");
  assert.equal(cards[0]?.questionMarkdown, "HTTP 的默认端口是？");
  assert.deepEqual(cards[0]?.options, [
    { markdown: "21", correct: false },
    { markdown: "22", correct: false },
    { markdown: "**80**", correct: true },
    { markdown: "443", correct: false }
  ]);
  assert.equal(cards[0]?.explanationMarkdown, "HTTPS 才默认使用 443。");
  assert.equal(cards[0]?.ankiId, 88);
});

test("parses QM with multiple correct answers and full-width punctuation", () => {
  const cards = parseChoiceCards([
    "QM：下列哪些是 JavaScript primitive？",
    "- [-] string",
    "- [-] bigint",
    "- [ ] Array",
    "- [-] undefined"
  ].join("\n"));

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.mode, "multiple");
  assert.deepEqual(cards[0]?.options.map((option) => option.correct), [true, true, false, true]);
});

test("rejects choice cards with invalid answer counts", () => {
  assert.deepEqual(parseChoiceCards("QS: Pick one\n- [-] A\n- [-] B"), []);
  assert.deepEqual(parseChoiceCards("QM: Pick many\n- [ ] A\n- [ ] B"), []);
  assert.deepEqual(parseChoiceCards("QS: Too few\n- [-] A"), []);
});

test("keeps a preceding Q/A answer separate from an adjacent choice card", () => {
  const source = "Q: One?\nA: First\nQS: Two?\n- [ ] A\n- [-] B";
  const cards = parseFlashcards(source);
  assert.deepEqual(cards.map((card) => card.kind), ["plain", "choice"]);
  assert.equal(cards[0]?.kind === "plain" ? cards[0].answerMarkdown : null, "First");
});

test("parses an image occlusion card with multiple masks in reveal order", () => {
  const source = [
    "IO: ![[anatomy/heart.png]]",
    "<!-- MASK: 12.5, 24, 30, 18.25 -->",
    "<!-- MASK: 55, 16, 18, 22 -->",
    "<!-- MASK: 42, 63, 14, 12 -->",
    "A: 左心室",
    "<!-- Anki-ID: 314 -->"
  ].join("\n");
  const cards = parseImageOcclusionCards(source);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.kind, "image-occlusion");
  assert.equal(cards[0]?.imageMarkdown, "![[anatomy/heart.png]]");
  assert.deepEqual(cards[0]?.masks, [
    { x: 12.5, y: 24, width: 30, height: 18.25 },
    { x: 55, y: 16, width: 18, height: 22 },
    { x: 42, y: 63, width: 14, height: 12 }
  ]);
  assert.equal(cards[0]?.answerMarkdown, "左心室");
  assert.equal(cards[0]?.ankiId, 314);
});

test("image occlusion answer is optional and full-width colons are accepted", () => {
  const cards = parseImageOcclusionCards("IO：![[brain.png]]\n<!-- MASK：0, 0, 20, 10 -->");
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.masks.length, 1);
  assert.equal(cards[0]?.answerMarkdown, "");
});

test("rejects an image occlusion block when any mask is invalid", () => {
  const source = [
    "IO: ![[brain.png]]",
    "<!-- MASK: 10, 10, 20, 20 -->",
    "<!-- MASK: 90, 90, 20, 20 -->"
  ].join("\n");
  assert.deepEqual(parseImageOcclusionCards(source), []);
});

test("rejects image occlusion masks outside the image", () => {
  assert.equal(parseImageOcclusionMask("90, 10, 20, 10"), null);
  assert.equal(parseImageOcclusionMask("10, 95, 10, 10"), null);
  assert.equal(parseImageOcclusionMask("10, 10, 0, 5"), null);
  assert.deepEqual(parseImageOcclusionMask("0, 0, 100, 100"), {
    x: 0,
    y: 0,
    width: 100,
    height: 100
  });
});

test("diagnoses unclosed and stray deck markers", () => {
  const unclosed = diagnoseMarkdown("<!-- Deck_START -->\nQ: a\nA: b");
  assert.ok(unclosed.some((item) => item.severity === "error" && item.message.includes("Deck_END")));

  const stray = diagnoseMarkdown("<!-- Deck_END -->");
  assert.ok(stray.some((item) => item.severity === "warning" && item.message.includes("Deck_START")));
});

test("diagnoses duplicate Anki-IDs and incomplete questions", () => {
  const source = [
    "Q: Missing answer",
    "",
    "First {{c1::one}}.",
    "<!-- Anki-ID: 5 -->",
    "",
    "Second {{c1::two}}.",
    "<!-- Anki-ID: 5 -->"
  ].join("\n");
  const diagnostics = diagnoseMarkdown(source);

  assert.ok(diagnostics.some((item) => item.severity === "error" && item.message.includes("重复")));
  assert.ok(diagnostics.some((item) => item.line === 1 && item.message.includes("缺少")));
});

test("accepts consecutive masks without orphan diagnostics", () => {
  const source = [
    "IO: ![[heart.png]]",
    "<!-- MASK: 10, 10, 20, 20 -->",
    "<!-- MASK: 45, 30, 15, 15 -->",
    "A: 心脏构造"
  ].join("\n");
  const diagnostics = diagnoseMarkdown(source);
  assert.equal(diagnostics.filter((item) => item.message.includes("MASK 前没有")).length, 0);
  assert.equal(diagnostics.filter((item) => item.message.includes("答案前没有")).length, 0);
});

test("detects copied Anki note ids across notes", () => {
  const current = collectMarkdownSyncIds("Q: a\nA: b\n<!-- Anki-ID: 9 -->");
  const diagnostics = findCrossFileIdConflicts("copy.md", current, [{
    path: "original.md",
    ids: current
  }]);

  assert.equal(diagnostics.filter((item) => item.severity === "error").length, 1);
  assert.ok(diagnostics[0]?.message.includes("9"));
});

test("finds notes removed from the current Markdown file", () => {
  assert.deepEqual(findStaleNoteIds([10, 20, 20, 30], [10, 30]), [20]);
});

test("ignores paths by exact name, folder and wildcard", () => {
  assert.equal(normalizeVaultPath("./Templates\\Daily.md/"), "templates/daily.md");
  assert.equal(isIgnoredPath("Templates/Daily.md", ["templates/daily.md"]), true);
  assert.equal(isIgnoredPath("Templates/sub/Note.md", ["Templates"]), true);
  assert.equal(isIgnoredPath("Journal/2026-11-19.md", ["journal/2026-*"]), true);
  assert.equal(isIgnoredPath("Journal/2026/11-19.md", ["journal/**"]), true);
  assert.equal(isIgnoredPath("Root.md", ["**/*.md"]), true);
  assert.equal(isIgnoredPath("a/b/c.md", ["**/*.md"]), true);
  assert.equal(isIgnoredPath("a/b", ["a/**/b"]), true);
  assert.equal(isIgnoredPath("a/x/y/b", ["a/**/b"]), true);
  assert.equal(isIgnoredPath("Notes/Journal.md", ["Templates"]), false);
  assert.equal(isIgnoredPath("Notes/Journal.md", ["*.md"]), false);
});

test("classifies Anki note ownership from the source link", () => {
  const sourceLink = (vault: string, file: string) =>
    noteInfo({
      Back: `<div class="obsidian-source"><a href="obsidian://open?vault=${vault}&file=${encodeURIComponent(file)}">open</a></div>`
    });

  assert.equal(classifyNoteOwnership(sourceLink("Vault", "Notes/A.md"), "Notes/A.md", "Vault"), "owned");
  assert.equal(classifyNoteOwnership(sourceLink("Vault", "Notes/B.md"), "Notes/A.md", "Vault"), "foreign");
  assert.equal(classifyNoteOwnership(sourceLink("Other", "Notes/A.md"), "Notes/A.md", "Vault"), "foreign");
  assert.equal(classifyNoteOwnership(noteInfo({ Back: "answer" }), "Notes/A.md", "Vault"), "unknown");
});

test("compares note fields for incremental sync", () => {
  const info = noteInfo({ Front: "<p>Q</p>", Back: "<p>A</p>" });
  assert.equal(noteMatchesFields(info, { Front: "<p>Q</p>", Back: "<p>A</p>" }), true);
  assert.equal(noteMatchesFields(info, { Front: "<p>Q</p>", Back: "<p>B</p>" }), false);
});

test("strips every tag added by older plugin versions", () => {
  assert.deepEqual(
    obsoletePluginTags(
      [
        "obsidian_file_old_md",
        "obsidian_file_id_file-123",
        "obsidian_sync_id_card-1",
        "obsidian_content_abc",
        "obsidian_sync_removed",
        "my-own-tag",
        "obsidian"
      ],
      ["obsidian"]
    ),
    [
      "obsidian_file_old_md",
      "obsidian_file_id_file-123",
      "obsidian_sync_id_card-1",
      "obsidian_content_abc",
      "obsidian_sync_removed",
      "obsidian"
    ]
  );
});

test("extracts Obsidian and Markdown media embeds", () => {
  const links = extractEmbeddedLinks(
    "![[diagram.png|600]]\n![recording](media/voice.mp3)\n![remote](https://example.com/a.png)"
  );
  assert.deepEqual(links, ["diagram.png", "media/voice.mp3"]);
});

test("matches same-named media by full resource path", () => {
  assert.equal(
    isExactMediaSourceMatch(
      "app://vault/folder-a/image.png",
      "",
      "app://vault/folder-a/image.png",
      "folder-a/image.png"
    ),
    true
  );
  assert.equal(
    isExactMediaSourceMatch(
      "app://vault/folder-b/image.png",
      "",
      "app://vault/folder-a/image.png",
      "folder-a/image.png"
    ),
    false
  );
});

test("preview mode preserves rendered media paths", async () => {
  const container = { innerHTML: '<img src="app://vault/image.png">' } as HTMLElement;
  const result = await rewriteEmbeddedMediaForAnki(
    {} as never,
    {} as never,
    "![[image.png]]",
    container,
    null
  );
  assert.equal(result.html, container.innerHTML);
  assert.equal(result.mediaCount, 0);
});

test("frontmatter overrides the deck and can disable syncing", () => {
  const config = resolveNoteFileConfigFromData({
    "anki-sync": false,
    "anki-deck": "CS::Algorithms"
  }, DEFAULT_SETTINGS);

  assert.equal(config.enabled, false);
  assert.equal(config.deckName, "CS::Algorithms");
});

test("default settings keep an empty ignore list", () => {
  assert.deepEqual(DEFAULT_SETTINGS.ignorePaths, []);
  assert.equal(ANKI_ID_PATTERN.test("<!-- Anki-ID: 1 -->"), true);
});
