# Anki Flashcard Sync Pro

<div align="center">

**English** &nbsp;|&nbsp; [简体中文](#简体中文)

[![Version](https://img.shields.io/badge/version-1.7.0-blue?style=flat-square)](https://github.com/Xrebirth/obsidian-anki-cloze-sync/releases)
[![License](https://img.shields.io/github/license/Xrebirth/obsidian-anki-cloze-sync?style=flat-square)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A51.5.7-7C3AED?style=flat-square)](https://obsidian.md)
[![AnkiConnect](https://img.shields.io/badge/AnkiConnect-2055492159-2E7D32?style=flat-square)](https://ankiweb.net/shared/info/2055492159)

</div>

---

## English

> **Source & secondary development:** This project is forked from [joeyyu123/obsidian-anki-cloze-sync](https://github.com/joeyyu123/obsidian-anki-cloze-sync) and has been further developed, refactored, and extended on top of the original with AI assistance.

> [!IMPORTANT]
> **Every card type must be placed between `<!-- Anki_START -->` and `<!-- Anki_END -->`.**
> Cards outside a block are completely ignored: no block is auto-inserted, no Anki-ID is written, and nothing is synced. A card outside a block that already has an Anki note keeps that note and is **not** treated as "removed from Markdown".

### Table of Contents

- [Why Use It](#why-use-it)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Card Formats](#card-formats)
  - [Standard Q&A (Q/A)](#standard-qa-qa)
  - [Code Practice (QC/AC)](#code-practice-qcac)
  - [Single & Multiple Choice (QS/QM)](#single--multiple-choice-qsqm)
  - [Image Occlusion (IO)](#image-occlusion-io)
  - [Cloze](#cloze)
  - [Multi-line Cards](#multi-line-cards)
  - [LaTeX Formulas](#latex-formulas)
  - [Images, Audio & Video](#images-audio--video)
  - [Frontmatter Controls](#frontmatter-controls)
- [Anki-ID & Lifecycle](#anki-id--lifecycle)
- [Sync Behavior & Safety Policies](#sync-behavior--safety-policies)
- [Settings](#settings)
- [Commands](#commands)
- [Path Filtering](#path-filtering)
- [Sync Status](#sync-status)
- [FAQ](#faq)
- [How It Works](#how-it-works)
- [Development](#development)
- [Privacy](#privacy)
- [Contributing](#contributing)
- [Source & Secondary Development](#source--secondary-development)
- [License](#license)

---

### Why Use It

- **Notes as your question bank:** Cards live directly in Obsidian Markdown; no re-entry in Anki.
- **Precise updates:** Each card stores an Anki note ID; edits update the same note instead of creating duplicates.
- **No Anki pollution:** No `obsidian_sync_*` tracking tags are written to Anki; tags come only from your YAML.
- **Block-level safety:** Only cards explicitly placed inside `Anki_START` / `Anki_END` are synced, so ordinary notes are never touched by mistake.
- **Controlled deletion:** Removing a card from Markdown pauses the Anki card by default (review history is kept); permanent deletion requires confirmation.
- **Content alignment:** After removing a card from a block, the remaining cards are re-aligned to their Anki-IDs by content, so one card's content is never written into another's note.

### Features

| Feature | Description |
| --- | --- |
| Five card types | Q/A, QC/AC, QS/QM, IO, and native Cloze |
| Multi-line content | Blank lines, images, lists, and code blocks supported inside a block |
| Precise linking | Uses only the Anki note ID; no plugin tags |
| Incremental sync | Compares Anki fields; unchanged cards are not rewritten |
| Deletion protection | Keep / pause / permanent delete; automatic sync never silently hard-deletes |
| Anki-side deletion detection | When an Anki note is deleted, keep the card and mark `Anki-Delete`, or delete the Obsidian card |
| Content alignment | When positions change inside a block, the original note is recovered by content |
| YAML tags | `tags` / `anki-tags` synced as Anki tags |
| Custom decks | Frontmatter can override the global deck |
| Path filtering | Ignore-paths / only-paths, with wildcards |
| Media sync | Local images, audio, and video imported into Anki media |
| Math formulas | `$...$` and `$$...$$` converted to Anki MathJax |
| Safety diagnostics | Duplicate IDs, unclosed blocks, missing fields, etc. are caught before writing |

### Requirements

- **Obsidian Desktop** `1.5.7` or newer (the plugin is desktop-only).
- **Anki Desktop** with the **AnkiConnect** add-on installed.
- Default AnkiConnect address: `http://127.0.0.1:8765`.
- Anki must stay running; do not close Anki while syncing.

### Installation

#### 1. Install AnkiConnect

1. Open Anki.
2. Go to **Tools → Add-ons → Get Add-ons**.
3. Enter the code `2055492159` to install **AnkiConnect**.
4. Restart Anki and keep it running.

#### 2. Install this plugin

**Method 1: Community plugin store (after it is listed)**

In Obsidian, open **Settings → Community plugins → Browse**, search for **Anki Flashcard Sync Pro**, and install it.

**Method 2: Manual install (recommended)**

1. Download from [GitHub Releases](https://github.com/Xrebirth/obsidian-anki-cloze-sync/releases):
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Create the directory in your Vault:

   ```text
   <Vault>/.obsidian/plugins/anki-cloze-sync/
   ```

3. Put the three files into that directory.
4. Restart Obsidian, or run **Reload app without saving**.
5. Open **Settings → Community plugins** and enable **Anki Flashcard Sync Pro**.

> When upgrading, keep the `data.json` in the same folder — it stores your plugin settings and sync records.

#### 3. Test the connection

Run **Test AnkiConnect connection** from the command palette, or click **Test connection** on the settings page.

The default deck and note types are created automatically:

| Item | Default |
| --- | --- |
| Deck | `Obsidian` |
| Cloze note type | `Obsidian Cloze` |
| Code practice note type | `Obsidian Basic` |
| Standard Q&A note type | `Obsidian Q&A` |
| Choice note type | `Obsidian Choice` |
| Image occlusion note type | `Obsidian Image Occlusion` |
| AnkiConnect address | `http://127.0.0.1:8765` |

All of the above can be changed in settings.

### Quick Start

In Markdown, write:

```markdown
<!-- Anki_START -->
Q: 1 + 1 = ?
A: 2
<!-- Anki_END -->
```

Then run **Sync current note to Anki**.

After a successful sync, the plugin writes the note ID below `Anki_END`:

```markdown
<!-- Anki_START -->
Q: 1 + 1 = ?
A: 2
<!-- Anki_END -->
<!-- Anki-ID: 1735392803234 -->
```

Editing the card again and re-syncing will update the same Anki note.

> [!NOTE]
> Do not copy or freely edit `<!-- Anki-ID: ... -->`. When copying a whole note, delete the IDs in the copy so that independent Anki cards are created.

### Card Formats

#### Standard Q&A (Q/A)

A plain front/back card with no input box:

```markdown
<!-- Anki_START -->
Q: What does the root node of a Heap store?
A: A min-heap stores the minimum value; a max-heap stores the maximum value.
<!-- Anki_END -->
```

- Both half-width `Q:` / `A:` and full-width `Q：` / `A：` are supported.
- Numbered forms like `Q1/A1`, `Q2/A2` are **not** recognized.
- The front shows only the question; the answer appears after you click "Show answer".

#### Code Practice (QC/AC)

A code-practice card with a multi-line draft input box:

````markdown
<!-- Anki_START -->
QC: Implement the push method for a Stack.
AC:
```ts
push(value: T): void {
  this.items.push(value);
}
```
<!-- Anki_END -->
````

- The front shows the prompt and a code input area.
- Press Tab to insert four spaces.
- After "Show answer", the back first shows your draft, then the reference answer.
- The plugin does not auto-grade, and it neither writes your draft back to Markdown nor saves it to Anki.

#### Single & Multiple Choice (QS/QM)

Single-choice uses `QS`; the correct option is marked with `[-]`, and there must be exactly one:

```markdown
<!-- Anki_START -->
QS: What is the default port of HTTP?
- [ ] 21
- [ ] 22
- [-] 80
- [ ] 443
E: HTTP defaults to 80; HTTPS is 443.
<!-- Anki_END -->
```

Multiple-choice uses `QM`; you may mark several correct options:

```markdown
<!-- Anki_START -->
QM: Which of the following are JavaScript primitives?
- [-] string
- [-] bigint
- [ ] Array
- [-] undefined
E: Array is an object.
<!-- Anki_END -->
```

- `[-]` marks a correct option, `[ ]` marks a wrong one.
- `[x]` is not recognized as an option.
- `E:` / `E：` is an optional explanation.
- Each card needs at least two options; `QS` must have exactly one correct option, `QM` at least one.
- When the format is incomplete, the preview reports a diagnostic and that card is not synced.

#### Image Occlusion (IO)

Run **Add or edit image occlusion card** in the Markdown editor:

1. Pick an image from the Vault, or first select an image embed and then run the command.
2. Drag rectangles over the image in reveal order to mask each region.
3. Optionally fill in supplementary answers.
4. Save, then sync the current note.

A newly created occlusion card is automatically wrapped in an Anki block:

```markdown
<!-- Anki_START -->
IO: ![[anatomy/heart.png]]
<!-- MASK: 12.5, 24, 30, 18.25 -->
<!-- MASK: 55, 16, 18, 22 -->
<!-- MASK: 42, 63, 14, 12 -->
A: Key points of heart anatomy
<!-- Anki_END -->
```

- `MASK` coordinates are the image's `x, y, width, height` in percent.
- The order of the comments is the reveal order.
- `A:` may be omitted.
- Each `IO` block is one card and can contain any number of masks.
- Only IO cards inside a block are recognized by the editor; IO cards outside a block are ignored.

#### Cloze

Use Anki's native cloze syntax:

```markdown
<!-- Anki_START -->
The mitochondrion is the {{c1::powerhouse}} of the cell.

The capital of France is {{c1::Paris::city}}, located in {{c2::France::country}}.
<!-- Anki_END -->
```

- Each paragraph containing cloze syntax syncs to one Anki note.
- A single paragraph may have multiple `c1`, `c2`; Anki generates multiple cards by its native rules.
- Editing a cloze and re-syncing updates the same note without affecting review history.

#### Multi-line Cards

Blank lines inside a block do not end a card, which suits images, lists, and long answers:

```markdown
<!-- Anki_START -->
Q:
Based on the diagram, what active and passive units does the STM32F103 have?

![[IMG-C01D1BB7A341E2B29E7A22F3C026C3CC.png]]

A:
![[IMG-C01D1BB7A341E2B29E7A22F3C026C3CC.png]]

- **Active units:** capable of executing instructions or controlling the bus.
    - **Cortex-M3 core:** ICode, DCode, System, and DMA bus interfaces;
    - **DMA1** and **DMA2**;
- **Passive units:** controlled by active units, responding to instruction or data access requests.
    - **Peripherals:** ADC, GPIO, TIM, USART, SPI, I2C, USB, CAN, DAC, etc.
<!-- Anki_END -->
```

Rules:

- `Anki_START` / `Anki_END` are only used for range detection and are never written into the Anki question or answer.
- A block can hold one card or several in sequence.
- With several cards, after a successful sync multiple `Anki-ID`s are written below `Anki_END` in card order.
- A missing `Anki_END` produces a diagnostic and the whole block is skipped, preventing wrong syncs.
- An `Anki_END` inside a code block is not treated as an end marker.

#### LaTeX Formulas

Inline formula:

```markdown
<!-- Anki_START -->
Q: Compute $\frac{1}{2}+\frac{1}{3}$.
A: $\frac{5}{6}$
<!-- Anki_END -->
```

Block formula:

```markdown
<!-- Anki_START -->
Q: What is the sum formula of an arithmetic series?
A:
$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$
<!-- Anki_END -->
```

- On sync, these are converted to Anki-native MathJax; no extra JavaScript is needed.
- Formulas inside fenced code blocks or inline code are kept as-is.
- To show a literal dollar sign, write `\$`.

#### Images, Audio & Video

Local media are imported into Anki media:

```markdown
<!-- Anki_START -->
Q: What does this diagram represent?
![[images/heap.png|600]]
A: Complete binary tree
<!-- Anki_END -->
```

- Markdown images, Obsidian wikilink embeds, audio, and video are supported.
- Media names combine a content hash and the original file name so there are no collisions, making repeated syncs safe.
- HTTP/HTTPS images keep their external URLs and are not downloaded.
- You can turn off **Sync images and attachments** in settings.

#### Frontmatter Controls

Frontmatter must be at the very top of the note. Example:

```yaml
---
anki-sync: true
anki-deck: Computer Science::Data Structures
tags:
  - course/cs
  - exam
---
```

| Field | Purpose | Example values |
| --- | --- | --- |
| `anki-sync` | Whether to sync this note | `true` (default) / `false` (fully excluded) |
| `anki-deck` | The Anki deck the cards go into; multi-level supported | `Computer Science::Data Structures` |
| `tags` | Obsidian-native tags, inherited and synced to Anki by the plugin | `- course/cs` |
| `anki-tags` | Legacy tag field, still merged with `tags` | `- exam` |

`anki-deck` supports any number of `::` levels, e.g.:

```yaml
---
anki-deck: Level1::Level2::Level3
---
```

- With `anki-sync: false`, the note is fully skipped: nothing is added, updated, or removed in Anki.
- A missing `anki-deck` is created automatically; if unset, the global deck from settings is used.
- `tags` supports a YAML list (`- course/cs`) or a space-separated string (`tags: course/cs exam`).
- A leading `#` on tags is stripped; after removing tags from YAML, the next sync removes the corresponding tags from the plugin-managed notes.
- `anki-tags` is the legacy form and is still merged with `tags`; if both are empty, no tags are added.
- Unparseable frontmatter only produces a warning and never blocks the whole-Vault sync.
- Files generated by Templater that start with `<%` are skipped.

### Anki-ID & Lifecycle

After a successful sync, the plugin writes the following below `Anki_END`:

```markdown
<!-- Anki_START -->
Q: 1 + 1 = ?
A: 2
<!-- Anki_END -->
<!-- Anki-ID: 1735392803234 -->
```

Rules:

- The ID is the Anki **note ID**, not a card ID.
- One note may generate multiple Anki cards (e.g., several clozes).
- Keep the `Anki-ID`; it is the key to updating the same note.
- Anki-side does not receive `obsidian_sync_id_*`, `obsidian_file_id_*`, or similar tracking tags.
- If duplicate Anki-IDs appear within one Vault, the plugin stops syncing to prevent notes from overwriting each other.
- Moving a card together with its ID to another note transfers the note's ownership to the new note on the next sync.
- After copying a note, to create independent cards, delete the `Anki-ID` in the copy; the next sync creates new cards.

#### Content Alignment

`Anki-ID`s are listed below `Anki_END` in card order. Removing a card or a marker inside a block shifts positions forward.

The plugin records a content signature for each note and re-aligns by content before syncing:

- After deleting the first card, the remaining cards still recover their original notes;
- One card's content is never written into the previous card's note;
- Chain-style shifts are supported: `A → 11`, `B → 22`, `C → 33`;
- Only notes that are unique, still present, and not occupied by another card are matched.

> After installing a new version, do one full sync first so the plugin records content signatures, then test in-block deletions.

#### `Anki-Delete`

When a note in Anki is deleted and you chose **Keep the card and mark Anki-Delete** in settings:

```markdown
<!-- Anki_START -->
Q: This card was deleted in Anki
A: But it is still kept in Obsidian
<!-- Anki_END -->
<!-- Anki-Delete -->
```

- The card is not synced again and its note is not auto-rebuilt.
- After deleting `<!-- Anki-Delete -->`, the next sync treats it as a new card and rebuilds it.
- If a note has **two or more** Anki-ID cards and all of their notes are missing, automatic sync stops; manual sync asks for confirmation first, to avoid mass-modifying notes when connected to the wrong Anki config.

### Sync Behavior & Safety Policies

#### After a card is removed from Markdown

| Setting | Behavior |
| --- | --- |
| **Pause** (default) | Pause the matching Anki cards; keep review history |
| **Keep, do nothing** | Keep the Anki note; no pause, no delete |
| **Permanent delete** | Delete the Anki note; current-note / whole-Vault manual sync confirms first |

Automatic sync never silently hard-deletes: it pauses first and records **pending-delete**, waiting for your confirmation on the next manual sync.

The plugin remembers the cards it paused; when a card reappears in Markdown, it is restored automatically.

#### After a note is deleted in Anki

| Setting | Behavior |
| --- | --- |
| **Keep the card and mark Anki-Delete** (default) | Change `Anki-ID` to `Anki-Delete`; the card stays in Obsidian |
| **Delete the Obsidian card** | Remove the card and its markers from Markdown |

Deleting a whole Markdown note is handled by the same rules as "after a card is removed from Markdown" for its Anki notes.

#### Safety Diagnostics

Sync stops before writing when any of the following occurs:

- Duplicate Anki-ID;
- Unclosed `Anki_START` / `Anki_END`;
- A block with content but no valid card;
- More markers than cards inside a block;
- An Anki-ID that does not correspond to any card;
- Two notes using the same Anki-ID;
- ID conflicts caused by copied notes;
- All Anki-ID notes are missing in Anki (automatic sync).

### Settings

| Setting | Default | Description |
| --- | --- | --- |
| AnkiConnect address | `http://127.0.0.1:8765` | AnkiConnect API address |
| Anki deck | `Obsidian` | Default target deck |
| Cloze note type | `Obsidian Cloze` | Cloze card model |
| Code practice note type | `Obsidian Basic` | QC/AC card model |
| Standard Q&A note type | `Obsidian Q&A` | Q/A card model |
| Image occlusion note type | `Obsidian Image Occlusion` | IO card model |
| Choice note type | `Obsidian Choice` | QS/QM card model |
| Auto sync | On | Sync automatically after saving |
| Auto sync delay | `1500` ms | Avoid frequent writes |
| After card removed from Markdown | Pause | Pause / keep / permanent delete |
| After note deleted in Anki | Keep & mark | Keep / delete the Obsidian card |
| Sync images and attachments | On | Import local media to Anki |
| Enable ignore paths | On | Notes matching the list are skipped |
| Enable only paths | Off | Only notes matching the list are synced |
| Ignore paths list | Empty | Nothing ignored when empty |
| Only paths list | Empty | Nothing matched when empty |

The top of the settings page shows the last sync and connection status, and offers **Test connection** and **Sync entire Vault** buttons; the status refreshes immediately after each click.

### Commands

| Command | Description |
| --- | --- |
| **Sync current note to Anki** | Sync the current Markdown note |
| **Preview Anki sync of current note** | Read-only preview of added, updated, unchanged, and removed cards with per-card content |
| **Add or edit image occlusion card** | Open the IO editor |
| **Sync entire Vault to Anki** | Sync all notes according to path filtering |
| **Test AnkiConnect connection** | Check whether AnkiConnect is available |

There is also a **Sync entire Vault to Anki** button in the left ribbon.

### Path Filtering

The **Sync scope & path filtering** section in settings offers two mutually exclusive toggles:

- **Enable ignore paths:** notes matching the list are skipped.
- **Enable only paths:** only notes matching the list are synced; when the list is empty, nothing is synced.
- Only one of the two toggles can be on; turning one on automatically turns the other off.
- When both are off, all notes in the Vault are synced.
- Whole-Vault sync, current-note sync, auto sync, preview, and the ID index all apply path filtering first.

List rules:

- Enter one path per line; press Enter or click **Add**.
- Click **Select…** to choose a file/folder from the Vault.
- List items can be dragged to reorder and removed individually.
- A folder path covers all files under it.
- `*`, `**`, `?` wildcards are supported; `*` matches across folder levels.
- Paths are case-insensitive; both `/` and `\` work.

Examples:

```text
KnowledgeBox/Development/Embedded/*
Snippets/*
**/private/**
```

`KnowledgeBox/Development/Embedded/*` matches `KnowledgeBox/Development/Embedded/STM32/00-index1.md`.

### Sync Status

The top-right Notice and the bottom-right status bar show the same set of statistics:

| Field | Meaning |
| --- | --- |
| Added | Newly created Anki notes |
| Updated | Notes whose fields, deck, or tags changed |
| Unchanged | Notes that need no write |
| Paused | Cards paused because the card was removed from Markdown |
| Pending delete | Notes awaiting manual confirmation for permanent deletion |
| Deleted | Confirmed-deleted notes |
| Anki-deleted | Cards handled because the Anki note was deleted |
| Failed | Number of notes that failed to sync (Vault sync) |
| Skipped | Number of notes excluded by path filtering (Vault sync) |

### FAQ

#### No cards were created after syncing

Check that the cards are inside an Anki block:

```markdown
<!-- Anki_START -->
Q: question
A: answer
<!-- Anki_END -->
```

Cards outside a block are ignored; markers are not auto-added.

#### "Close Anki's browser or editor window and sync again"

AnkiConnect refuses to update note-type styling while the model is held by the editor. Close Anki's browser/editor window and sync again. Card sync still proceeds; only the model styling (CSS) update is skipped.

#### "Frontmatter YAML cannot be parsed"

This is a warning; it does not block the whole Vault. Check that the YAML indentation is correct; Templater-generated files are skipped automatically.

#### Anki-ID points to another note

Two notes copied the same `Anki-ID`. Keep one, delete the ID in the other, and re-sync.

#### All notes are missing

You may be connected to the wrong Anki profile, or you truly deleted all notes in Anki. When **two or more** cards are all missing, automatic sync stops; manual sync shows a confirmation dialog.

#### Images do not show in Anki

Confirm:

- **Sync images and attachments** is on;
- The image is a local file inside the Vault;
- Anki is running during the sync;
- No HTTP external link is used (external links keep the URL and are not downloaded).

#### Still present in Anki after deletion

The plugin re-queries `notesInfo` and refreshes the Anki UI after deletion. If it still fails:

1. Confirm Anki is not held by another window;
2. Run **Test AnkiConnect connection**;
3. Re-sync and check the note ID in the error message.

#### `Anki-Delete` never disappears

This marker is intentionally kept. Delete that line and re-sync; the plugin treats it as a new card and rebuilds it.

#### Can I edit Obsidian back from Anki?

No. Obsidian is the content source; after editing fields in Anki, the next sync overwrites with Obsidian as the source of truth. The plugin only detects **deletion** of Anki notes and handles it per your settings.

### How It Works

1. Read Markdown and parse only the cards inside `Anki_START` / `Anki_END` blocks.
2. Generate Anki fields per card type, rendering Markdown, media, and LaTeX.
3. Read existing notes through AnkiConnect.
4. Re-align shifted Anki-IDs inside a block using content signatures.
5. Add, update, or handle removed notes.
6. Write the note IDs back below `Anki_END` and update local sync records.

Anki-IDs are stored in the plugin data; no tracking tags are written to Anki. Decks, tags, and field styling are all maintained by the plugin.

### Development

```bash
git clone https://github.com/Xrebirth/obsidian-anki-cloze-sync.git
cd obsidian-anki-cloze-sync
npm install

npm test          # 87 tests
npm run lint      # ESLint
npm run build     # type check + production build
npm run dev       # esbuild watch
npm run preview:cards
```

`preview:cards` generates a local `card-preview.html` so you can inspect code-practice, Q&A, choice, image-occlusion, light, dark, and cloze cards at once.

#### Directory structure

```text
src/
  main.ts                 plugin lifecycle, commands, sync flow
  parser.ts               block & card-type parsing, Anki-ID writing
  diagnostics.ts          pre-sync safety diagnostics
  anki-connect.ts         AnkiConnect API client
  media.ts                media import & HTML rewriting
  settings.ts             settings page
  image-occlusion*.ts     image occlusion editor & card builder
tests/                    parser, diagnostics, media, sync-utils tests
```

It is recommended to use a test Vault during development so plugin errors never affect your main note collection.

### Privacy

- The plugin contains no telemetry, ads, or user tracking.
- The plugin only sends sync requests to the AnkiConnect address in settings, defaulting to the local `http://127.0.0.1:8765`.
- Synced content includes card text, tags, and media embedded in the Vault. With the default local address, no data is sent off the machine by the plugin.
- If you change the AnkiConnect address to a remote service, the relevant data is sent to that service; verify its security and privacy policy yourself.
- AnkiConnect has no authentication by default; do not expose the port to the public internet.

### Contributing

Issues and pull requests are welcome.

Before submitting, please run:

```bash
npm test
npm run lint
npm run build
```

Please validate changes involving sync, deletion, and media import in a test Vault whenever possible.

### Source & Secondary Development

This project is forked from [joeyyu123/obsidian-anki-cloze-sync](https://github.com/joeyyu123/obsidian-anki-cloze-sync) and has been further developed, refactored, and extended on top of the original with AI assistance.

- This repository is an independently maintained fork with no affiliation to the original author.
- Copyright of the original project belongs to its author; this repository continues to follow the MIT License.
- This repository's code, docs, and tests contain content generated or modified with AI assistance and have been reviewed by the maintainer.

### License

[MIT License](LICENSE) © 2026 Joey

---

*If this plugin helps you, a Star on GitHub is appreciated.*

<div align="center">

[⬆ Back to top](#anki-flashcard-sync-pro) &nbsp;|&nbsp; [切换到简体中文](#简体中文)

</div>

---

## 简体中文

将 Markdown 笔记中的**填空、问答、选择题、代码练习和图像遮挡卡片**同步到 Anki。插件通过 [AnkiConnect](https://ankiweb.net/shared/info/2055492159) 与 Anki 通信，使用 **Anki note ID** 精确关联，不在 Anki 中写入任何插件追踪标签。

> **来源与二次开发：** 本项目 fork 自 [joeyyu123/obsidian-anki-cloze-sync](https://github.com/joeyyu123/obsidian-anki-cloze-sync)，并在原项目基础上使用 AI 辅助进行二次开发、重构与功能扩展。

> [!IMPORTANT]
> **所有题型都必须放在 `<!-- Anki_START -->` 与 `<!-- Anki_END -->` 之间。**
> 区块外的题目会被完全忽略，不会自动补区块、不会写入 Anki-ID，也不会同步。已有 Anki note 的区块外题目会保留原 note，不会被当成"已从 Markdown 移除"。

### 目录

- [为什么使用它](#为什么使用它)
- [功能](#功能)
- [环境要求](#环境要求)
- [安装](#安装)
- [快速开始](#快速开始)
- [题目格式](#题目格式)
  - [标准问答 Q/A](#标准问答-qa)
  - [代码练习 QC/AC](#代码练习-qcac)
  - [单选与多选 QS/QM](#单选与多选-qsqm)
  - [图像遮挡 IO](#图像遮挡-io)
  - [Cloze 填空](#cloze-填空)
  - [多行题目](#多行题目)
  - [LaTeX 公式](#latex-公式)
  - [图片、音频与视频](#图片音频与视频)
  - [Frontmatter 控制](#frontmatter-控制)
- [Anki-ID 与生命周期](#anki-id-与生命周期)
- [同步行为与安全策略](#同步行为与安全策略)
- [设置](#设置)
- [命令](#命令)
- [路径筛选](#路径筛选)
- [同步状态](#同步状态)
- [常见问题](#常见问题)
- [工作原理](#工作原理)
- [开发](#开发)
- [隐私](#隐私)
- [贡献](#贡献)
- [来源与二次开发](#来源与二次开发)
- [许可](#许可)

---

### 为什么使用它

- **笔记即题库**：题目直接写在 Obsidian Markdown 中，不需要在 Anki 里重复录入。
- **精确更新**：每张卡片保存一个 Anki note ID，修改后更新同一则 note，不会重复建卡。
- **不污染 Anki**：Anki 侧不写入 `obsidian_sync_*` 等追踪标签；标签只来自你的 YAML。
- **块级安全**：只同步显式放在 `Anki_START` / `Anki_END` 内的题目，避免误同步普通笔记内容。
- **删除可控**：从 Markdown 移除卡片时默认暂停 Anki cards，保留复习记录；永久删除需要确认。
- **内容对齐**：区块内删除卡片后，剩余题目会按内容重新对齐 Anki-ID，避免把另一张题目的内容写进原来的 note。

### 功能

| 功能 | 说明 |
| --- | --- |
| 五种题型 | Q/A、QC/AC、QS/QM、IO、原生 Cloze |
| 多行内容 | 区块内支持空白行、图片、列表、代码块 |
| 精确关联 | 只使用 Anki note ID，不依赖插件标签 |
| 增量同步 | 比较 Anki 字段，未变更卡片不重复写入 |
| 删除保护 | 保留 / 暂停 / 永久删除；自动同步不会静默硬删除 |
| Anki 删除检测 | Anki note 被删除后，保留题目并标记 `Anki-Delete`，或删除 Obsidian 题目 |
| 内容对齐 | 区块内位置变化时按内容找回原 note |
| YAML 标签 | `tags` / `anki-tags` 同步为 Anki 标签 |
| 自定义牌组 | Frontmatter 可覆盖全局牌组 |
| 路径筛选 | 忽略路径 / 仅检测路径，支持通配符 |
| 媒体同步 | 本机图片、音频、视频导入 Anki media |
| 数学公式 | `$...$` 与 `$$...$$` 转为 Anki MathJax |
| 安全诊断 | 重复 ID、未闭合区块、字段缺失等问题在写入前拦截 |

### 环境要求

- **Obsidian Desktop** `1.5.7` 或更高版本（插件为桌面限定）。
- **Anki Desktop**，并安装 **AnkiConnect** 插件。
- 默认 AnkiConnect 地址：`http://127.0.0.1:8765`。
- Anki 需要保持运行；同步时不要关闭 Anki。

### 安装

#### 1. 安装 AnkiConnect

1. 打开 Anki。
2. 进入 **工具 → 插件 → 获取插件**。
3. 输入代码 `2055492159`，安装 **AnkiConnect**。
4. 重启 Anki，保持 Anki 运行。

#### 2. 安装本插件

**方式一：社区插件市场（上架后）**

在 Obsidian 中打开 **设置 → 第三方插件 → 浏览**，搜索 **Anki Flashcard Sync Pro** 并安装。

**方式二：手动安装（推荐）**

1. 从 [GitHub Releases](https://github.com/Xrebirth/obsidian-anki-cloze-sync/releases) 下载：
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. 在 Vault 中创建目录：

   ```text
   <Vault>/.obsidian/plugins/anki-cloze-sync/
   ```

3. 把三个文件放入该目录。
4. 重启 Obsidian，或执行 **重新加载应用**。
5. 打开 **设置 → 第三方插件**，启用 **Anki Flashcard Sync Pro**。

> 升级时保留同目录下的 `data.json`，其中保存了插件设置和同步记录。

#### 3. 测试连接

在命令面板执行 **测试 AnkiConnect 连接**，或在设置页点击 **测试连接**。

默认牌组和笔记类型会自动创建：

| 项目 | 默认值 |
| --- | --- |
| 牌组 | `Obsidian` |
| Cloze 笔记类型 | `Obsidian Cloze` |
| 代码练习笔记类型 | `Obsidian Basic` |
| 标准问答笔记类型 | `Obsidian Q&A` |
| 选择题笔记类型 | `Obsidian Choice` |
| 图像遮挡笔记类型 | `Obsidian Image Occlusion` |
| AnkiConnect 地址 | `http://127.0.0.1:8765` |

以上均可在设置中修改。

### 快速开始

在 Markdown 中写入：

```markdown
<!-- Anki_START -->
Q: 1 + 1 = ?
A: 2
<!-- Anki_END -->
```

然后执行 **同步当前笔记到 Anki**。

同步成功后，插件会在 `Anki_END` 下方写入 note ID：

```markdown
<!-- Anki_START -->
Q: 1 + 1 = ?
A: 2
<!-- Anki_END -->
<!-- Anki-ID: 1735392803234 -->
```

再次修改题目并同步，会更新同一则 Anki note。

> [!NOTE]
> 不要手动复制或随意修改 `<!-- Anki-ID: ... -->`。复制整份笔记时，请删除副本里的 ID，才能建立独立的 Anki 卡片。

### 题目格式

#### 标准问答 Q/A

没有输入框的普通正反面卡片：

```markdown
<!-- Anki_START -->
Q: Heap 的根节点保存什么？
A: Min Heap 保存最小值；Max Heap 保存最大值。
<!-- Anki_END -->
```

- 支持半角 `Q:` / `A:` 和全角 `Q：` / `A：`。
- `Q1/A1`、`Q2/A2` 等编号格式不会被识别。
- 正面只显示问题，点击"显示答案"后显示答案。

#### 代码练习 QC/AC

带多行草稿输入框的代码练习卡：

````markdown
<!-- Anki_START -->
QC: 请实现 Stack 的 push 方法。
AC:
```ts
push(value: T): void {
  this.items.push(value);
}
```
<!-- Anki_END -->
````

- 正面显示题目和代码输入区。
- 按 Tab 插入四个空格。
- 点击"显示答案"后，背面先显示你的草稿，再显示参考答案。
- 插件不自动判分，也不把草稿写回 Markdown 或保存到 Anki。

#### 单选与多选 QS/QM

单选题使用 `QS`，正确选项用 `[-]` 标记，必须刚好一个：

```markdown
<!-- Anki_START -->
QS: HTTP 的默认端口是？
- [ ] 21
- [ ] 22
- [-] 80
- [ ] 443
E: HTTP 默认使用 80；HTTPS 才是 443。
<!-- Anki_END -->
```

多选题使用 `QM`，可以标记多个正确选项：

```markdown
<!-- Anki_START -->
QM：下列哪些是 JavaScript 的 primitive？
- [-] string
- [-] bigint
- [ ] Array
- [-] undefined
E：Array 属于 object。
<!-- Anki_END -->
```

- `[-]` 表示正确选项，`[ ]` 表示错误选项。
- `[x]` 不会被识别为选项。
- `E:` / `E：` 为可选解析。
- 每题至少两个选项；`QS` 必须刚好一个正确项，`QM` 至少一个。
- 格式不完整时，预览会给出诊断，并且不会同步该题。

#### 图像遮挡 IO

在 Markdown 编辑器中执行 **新增或编辑图像遮挡卡片**：

1. 选择 Vault 内的图片，或先选中一个图片嵌入再执行命令。
2. 在图片上连续拖拽矩形，按揭示顺序框住各个部位。
3. 可填写补充答案。
4. 保存后同步当前笔记。

新建的图像遮挡卡会自动包在 Anki 区块中：

```markdown
<!-- Anki_START -->
IO: ![[anatomy/heart.png]]
<!-- MASK: 12.5, 24, 30, 18.25 -->
<!-- MASK: 55, 16, 18, 22 -->
<!-- MASK: 42, 63, 14, 12 -->
A: 心脏构造重点
<!-- Anki_END -->
```

- `MASK` 坐标为图片的 `x, y, 宽, 高`，单位是百分比。
- 注释顺序就是揭示顺序。
- `A:` 可省略。
- 每个 `IO` 区块代表一张卡，可以包含任意数量的遮罩。
- 只有区块内的 IO 卡片会被编辑器识别；区块外 IO 会被忽略。

#### Cloze 填空

使用 Anki 原生 cloze 语法：

```markdown
<!-- Anki_START -->
粒线体是细胞的 {{c1::能量工厂}}。

法国首都是 {{c1::巴黎::城市}}，位于 {{c2::法国::国家}}。
<!-- Anki_END -->
```

- 每个包含 cloze 语法的段落会同步成一则 Anki note。
- 同一段落可以有多个 `c1`、`c2`，Anki 会按原生规则生成多张 card。
- 修改 cloze 后同步，会更新同一则 note，不影响复习记录。

#### 多行题目

区块内的空白行不会结束题目，适合图片、列表和长答案：

```markdown
<!-- Anki_START -->
Q:
根据图片，STM32F103 的主动被动单元都有哪些？

![[IMG-C01D1BB7A341E2B29E7A22F3C026C3CC.png]]

A:
![[IMG-C01D1BB7A341E2B29E7A22F3C026C3CC.png]]

- **主动单元：** 具备指令执行或总线控制能力。
    - **Cortex-M3 内核：** ICode、DCode、System 和 DMA 总线接口；
    - **DMA1** 和 **DMA2**；
- **被动单元：** 受主动单元控制，响应指令或数据访问请求。
    - **外设类：** ADC、GPIO、TIM、USART、SPI、I2C、USB、CAN、DAC 等。
<!-- Anki_END -->
```

规则：

- `Anki_START` / `Anki_END` 只用于范围检测，不会写进 Anki 题目或答案。
- 一个区块可以放一张卡，也可以连续放多张。
- 多张卡时，同步成功后按卡片顺序在 `Anki_END` 下方写入多个 `Anki-ID`。
- 缺少 `Anki_END` 会产生诊断并跳过整个区块，避免误同步。
- `Anki_END` 出现在代码块内时不会被当作结束标记。

#### LaTeX 公式

行内公式：

```markdown
<!-- Anki_START -->
Q: 计算 $\frac{1}{2}+\frac{1}{3}$。
A: $\frac{5}{6}$
<!-- Anki_END -->
```

区块公式：

```markdown
<!-- Anki_START -->
Q: 等差级数的总和公式是什么？
A:
$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$
<!-- Anki_END -->
```

- 同步时转换为 Anki 原生 MathJax，不需要额外 JavaScript。
- fenced code block 或行内 code 中的公式保持原样。
- 显示普通美元符号请写成 `\$`。

#### 图片、音频与视频

本机媒体会导入 Anki media：

```markdown
<!-- Anki_START -->
Q: 这张图代表什么？
![[images/heap.png|600]]
A: Complete binary tree
<!-- Anki_END -->
```

- 支持 Markdown 图片、Obsidian wikilink 嵌入、音频与视频。
- 媒体使用内容哈希和原文件名组成不冲突的名称，可安全重复同步。
- HTTP/HTTPS 图片保持外部网址，不会下载。
- 可在设置中关闭 **同步图片与附件**。

#### Frontmatter 控制

Frontmatter 必须位于笔记顶部。示例：

```yaml
---
anki-sync: true
anki-deck: Computer Science::Data Structures
tags:
  - course/cs
  - exam
---
```

| 字段 | 作用 | 取值示例 |
| --- | --- | --- |
| `anki-sync` | 是否同步此笔记 | `true`（默认）/ `false`（完全排除） |
| `anki-deck` | 指定卡片进入的 Anki 牌组；支持多层级 | `Computer Science::Data Structures` |
| `tags` | Obsidian 原生标签，会被插件继承并同步到 Anki | `- course/cs` |
| `anki-tags` | 旧版标签字段，仍会与 `tags` 合并 | `- exam` |

`anki-deck` 支持任意层级的 `::`，例如：

```yaml
---
anki-deck: 层级一::层级二::层级三
---
```

- `anki-sync: false` 时完全跳过这份笔记：不新增、不更新、也不移除其 Anki 卡片。
- `anki-deck` 不存在时会自动创建；不写时使用设置中的全局牌组。
- `tags` 支持 YAML 列表（`- course/cs`）或空格分隔字符串（`tags: course/cs exam`）。
- 标签开头的 `#` 会被移除；从 YAML 移除标签后，下次同步会从插件管理的 notes 中移除对应标签。
- `anki-tags` 为旧版写法，仍会与 `tags` 合并；两者都为空时不添加任何标签。
- 无法解析的 Frontmatter 只产生警告，不会阻断整个 Vault 同步。
- 以 `<%` 开头的 Templater 模板文件会被跳过。

### Anki-ID 与生命周期

同步成功后，插件在 `Anki_END` 下方写入：

```markdown
<!-- Anki_START -->
Q: 1 + 1 = ?
A: 2
<!-- Anki_END -->
<!-- Anki-ID: 1735392803234 -->
```

规则：

- ID 是 Anki 的 **note ID**，不是 card ID。
- 一则 note 可能生成多张 Anki card（例如多个 cloze）。
- 请保留 `Anki-ID`；它是更新同一则 note 的关键。
- Anki 侧不写入 `obsidian_sync_id_*`、`obsidian_file_id_*` 等追踪标签。
- 同一 Vault 内出现重复 Anki-ID 时，插件会停止同步，避免不同笔记互相覆盖。
- 把卡片连同 ID 移到另一份笔记后，下次同步会把 note 所有权转移到新笔记。
- 复制笔记后若要建立独立卡片，请删除副本中的 `Anki-ID`，下次同步会重新建卡。

#### 内容对齐

`Anki-ID` 在 `Anki_END` 下方按卡片顺序排列。删除区块中的某张卡片或某个标记后，位置会前移。

插件会记录每则 note 的内容签名，并在同步前按内容重新对齐：

- 删除第一张卡后，剩余卡片仍会找回各自原来的 note；
- 不会把下一张题目的内容写进上一张的 note；
- 支持链条式错位：`A → 11`、`B → 22`、`C → 33`；
- 只匹配唯一、仍然存在、未被其他卡片占用的 note。

> 安装新版本后，建议先完整同步一次，让插件记录内容签名，再测试区块内删除。

#### `Anki-Delete`

当 Anki 中的某则 note 被删除，而你在设置中选择 **保留题目并标记 Anki-Delete**：

```markdown
<!-- Anki_START -->
Q: 这道题在 Anki 中已被删除
A: 但题目仍保留在 Obsidian
<!-- Anki_END -->
<!-- Anki-Delete -->
```

- 该题目不会再次同步，也不会自动重建 note。
- 删除 `<!-- Anki-Delete -->` 后，下次同步会把它当作新卡片重新建立。
- 如果某份笔记有**两张以上**带 Anki-ID 的卡片，且所有 note 都不存在，自动同步会停止；手动同步会先确认，避免连接错 Anki 配置时批量修改笔记。

### 同步行为与安全策略

#### 卡片从 Markdown 移除后

| 设置 | 行为 |
| --- | --- |
| **暂停**（默认） | 暂停对应的 Anki cards，保留复习记录 |
| **保留不处理** | 保留 Anki note，不暂停、不删除 |
| **永久删除** | 删除 Anki note；当前笔记/整库手动同步会先确认 |

自动同步不会静默硬删除：它会先暂停并记录为 **待删除**，等你下次手动同步时确认。

插件会记录自己暂停过的卡片；卡片重新出现在 Markdown 中时，会自动恢复。

#### Anki 中删除 note 后

| 设置 | 行为 |
| --- | --- |
| **保留题目并标记 Anki-Delete**（默认） | 把 `Anki-ID` 改成 `Anki-Delete`，题目留在 Obsidian |
| **删除 Obsidian 题目** | 从 Markdown 中移除该题目及其标记 |

删除整个 Markdown 笔记时，也会按"卡片从 Markdown 移除后"的设置处理其 Anki notes。

#### 安全诊断

以下情况会在写入前停止同步：

- 重复 Anki-ID；
- 未闭合的 `Anki_START` / `Anki_END`；
- 区块内有内容但没有有效题目；
- 区块内标记数量多于卡片数量；
- 存在未对应题目的 Anki-ID；
- 两份笔记使用同一个 Anki-ID；
- 复制笔记导致的 ID 冲突；
- 所有带 Anki-ID 的 note 在 Anki 中都不存在（自动同步）。

### 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| AnkiConnect 地址 | `http://127.0.0.1:8765` | AnkiConnect API 地址 |
| Anki 牌组 | `Obsidian` | 默认目标牌组 |
| Cloze 笔记类型 | `Obsidian Cloze` | 填空卡片模型 |
| 代码练习笔记类型 | `Obsidian Basic` | QC/AC 卡片模型 |
| 标准问答笔记类型 | `Obsidian Q&A` | Q/A 卡片模型 |
| 图像遮挡笔记类型 | `Obsidian Image Occlusion` | IO 卡片模型 |
| 选择题笔记类型 | `Obsidian Choice` | QS/QM 卡片模型 |
| 自动同步 | 开启 | 保存笔记后自动同步 |
| 自动同步延迟 | `1500` 毫秒 | 避免频繁写入 |
| 卡片从 Markdown 移除后 | 暂停 | 暂停 / 保留 / 永久删除 |
| Anki 中删除 note 后 | 保留题目并标记 | 保留 / 删除 Obsidian 题目 |
| 同步图片与附件 | 开启 | 导入本机媒体到 Anki |
| 启用忽略路径 | 开启 | 匹配列表的笔记跳过同步 |
| 启用仅检测路径 | 关闭 | 只同步匹配列表的笔记 |
| 忽略路径列表 | 空 | 为空时不忽略任何笔记 |
| 仅检测路径列表 | 空 | 为空时不匹配任何笔记 |

设置页顶部显示上次同步与连接状态，并提供 **测试连接**、**同步整个 Vault** 按钮；状态会在点击后立即更新。

### 命令

| 命令 | 说明 |
| --- | --- |
| **同步当前笔记到 Anki** | 同步当前 Markdown 笔记 |
| **预览当前笔记的 Anki 同步** | 只读预览新增、更新、不变、移除及逐卡内容 |
| **新增或编辑图像遮挡卡片** | 打开 IO 编辑器 |
| **同步整个 Vault 到 Anki** | 按路径筛选同步全部笔记 |
| **测试 AnkiConnect 连接** | 检查 AnkiConnect 是否可用 |

左侧功能区也有一个 **同步整个 Vault 到 Anki** 按钮。

### 路径筛选

设置中的 **同步范围与路径筛选** 提供两个互斥开关：

- **启用忽略路径**：匹配列表的笔记跳过同步。
- **启用仅检测路径**：只同步匹配列表的笔记；列表为空时不同步任何笔记。
- 两个开关只能开启一个；开启其中一个会自动关闭另一个。
- 两个都关闭时同步 Vault 中的全部笔记。
- 整库同步、当前笔记同步、自动同步、预览与 ID 索引都会先应用路径筛选。

列表规则：

- 单行输入一条路径，按 Enter 或点击 **添加**。
- 点击 **选择…** 从 Vault 的文件/文件夹中选择。
- 列表项可拖动排序、逐项移除。
- 文件夹路径覆盖其下所有文件。
- 支持 `*`、`**`、`?` 通配符；`*` 会跨文件夹层级匹配。
- 路径不区分大小写，`/` 与 `\` 均可。

示例：

```text
知识箱/Development/Embedded/*
Snippets/*
**/private/**
```

`知识箱/Development/Embedded/*` 会匹配 `知识箱/Development/Embedded/STM32/00-索引1.md`。

### 同步状态

右上角 Notice 与右下角状态栏显示同一组统计：

| 字段 | 含义 |
| --- | --- |
| 新增 | 新建的 Anki notes |
| 更新 | 字段、牌组或标签发生变化的 notes |
| 不变 | 无需写入的 notes |
| 暂停 | 因卡片从 Markdown 移除而暂停的 cards |
| 待删除 | 等待手动确认永久删除的 notes |
| 删除 | 已确认删除的 notes |
| Anki删除 | 因 Anki note 被删除而处理的题目 |
| 失败 | 同步失败的笔记数（Vault 同步） |
| 跳过 | 被路径筛选排除的笔记数（Vault 同步） |

### 常见问题

#### 同步后没有生成卡片

检查题目是否在 Anki 区块内：

```markdown
<!-- Anki_START -->
Q: 题目
A: 答案
<!-- Anki_END -->
```

区块外题目会被忽略，不会自动补标记。

#### 提示"请先关闭 Anki 的浏览或编辑窗口，再重新同步"

AnkiConnect 拒绝在模型被编辑器占用时更新模板。关闭 Anki 的浏览/编辑窗口后重新同步即可。卡片同步会继续进行，只是模板/CSS 更新被跳过。

#### 提示"Frontmatter YAML 无法解析"

这是警告，不会阻断整个 Vault。检查 YAML 是否缩进正确；Templater 模板文件会被自动跳过。

#### 提示 Anki-ID 指向另一份笔记

两份笔记复制了同一个 `Anki-ID`。保留其中一份，删除另一份的 ID 后重新同步。

#### 所有 note 都不存在

可能是连接到了错误的 Anki 配置，或你确实在 Anki 中删除了全部 notes。**两张以上**卡片全部不存在时，自动同步会停止；手动同步会弹确认框。

#### 图片在 Anki 中不显示

确认：

- **同步图片与附件** 已开启；
- 图片是 Vault 内本机文件；
- 同步时 Anki 正在运行；
- 没有使用 HTTP 外链（外链会保留网址，不下载）。

#### 删除后 Anki 里还在

插件会在删除后回查 `notesInfo` 并刷新 Anki 界面。若仍失败，请：

1. 确认 Anki 没有被其他窗口占用；
2. 执行 **测试 AnkiConnect 连接**；
3. 重新同步并查看错误中的 note ID。

#### `Anki-Delete` 一直不消失

这是有意保留的标记。删除这一行后重新同步，插件会把它当作新卡片重新建立。

#### 能否从 Anki 反向修改 Obsidian？

不能。Obsidian 是内容源；在 Anki 中修改字段后，下次同步会以 Obsidian 为准覆盖。插件只检测 Anki note 的**删除**，并按设置处理。

### 工作原理

1. 读取 Markdown，只解析 `Anki_START` / `Anki_END` 区块内的题目。
2. 按题型生成 Anki 字段并渲染 Markdown、媒体与 LaTeX。
3. 通过 AnkiConnect 读取现有 notes。
4. 使用内容签名重新对齐区块内位置变化的 Anki-ID。
5. 新增、更新或处理移除的 notes。
6. 把 note ID 写回 `Anki_END` 下方，更新本地同步记录。

Anki-ID 记录在插件数据中，Anki 侧不写追踪标签。牌组、标签、字段模板都由插件统一维护。

### 开发

```bash
git clone https://github.com/Xrebirth/obsidian-anki-cloze-sync.git
cd obsidian-anki-cloze-sync
npm install

npm test          # 87 项测试
npm run lint      # ESLint
npm run build     # 类型检查 + 生产构建
npm run dev       # esbuild watch
npm run preview:cards
```

`preview:cards` 会生成本机 `card-preview.html`，可同时检查代码练习、问答、选择题、图像遮挡、亮色、深色与 cloze 卡片。

#### 目录结构

```text
src/
  main.ts                 插件生命周期、命令、同步流程
  parser.ts               区块与题型解析、Anki-ID 写入
  diagnostics.ts          同步前安全诊断
  anki-connect.ts         AnkiConnect API 客户端
  media.ts                媒体导入与 HTML 重写
  settings.ts             设置页
  image-occlusion*.ts     图像遮挡编辑器与卡片构建
tests/                    解析、诊断、媒体、同步工具测试
```

开发时建议使用测试 Vault，避免插件错误影响主要笔记库。

### 隐私

- 插件不包含遥测、广告或用户追踪。
- 插件只向设置中的 AnkiConnect 地址发送同步请求，默认是本机 `http://127.0.0.1:8765`。
- 同步内容包括卡片文字、标签和 Vault 内嵌媒体。使用默认本机地址时，数据不会由插件发送到外部网络。
- 如果你把 AnkiConnect 地址改成远端服务，相关数据会发送到该服务，请自行确认安全与隐私政策。
- AnkiConnect 默认没有认证，请勿把端口暴露到公网。

### 贡献

欢迎提交 Issue 和 Pull Request。

提交前请运行：

```bash
npm test
npm run lint
npm run build
```

请尽量在测试 Vault 中验证涉及同步、删除和媒体导入的改动。

### 来源与二次开发

本项目 fork 自 [joeyyu123/obsidian-anki-cloze-sync](https://github.com/joeyyu123/obsidian-anki-cloze-sync)，并在原项目基础上使用 AI 辅助进行二次开发、重构和功能扩展。

- 本仓库是独立维护的 fork，与原作者无隶属关系。
- 原项目的版权归原作者所有；本仓库继续遵循 MIT License。
- 本仓库的代码、文档和测试包含 AI 辅助生成或修改的内容，已由维护者审核。

### 许可

[MIT License](LICENSE) © 2026 Joey

---

如果这个插件对你有帮助，欢迎在 GitHub 上点一个 Star。

<div align="center">

[⬆ 回到顶部](#anki-flashcard-sync-pro) &nbsp;|&nbsp; [Switch to English](#english)

</div>
