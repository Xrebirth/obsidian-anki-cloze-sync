# Anki Flashcard Sync

## English overview

Anki Flashcard Sync sends flashcards written in your Markdown notes to Anki
through AnkiConnect. It supports native cloze deletions, standard Q/A cards,
interactive single- and multiple-choice cards, code-practice cards with a
multiline scratch editor, and interactive image occlusion cards.

Every synced card stores the Anki **note ID** in a single Obsidian comment
(`<!-- Anki-ID: 12345 -->`), so later syncs update the same note without any
Anki tags. Multi-line cards may be wrapped in `<!-- Deck_START -->` /
`<!-- Deck_END -->` blocks, which lets blank lines stay inside a question or
answer.

The plugin can sync the current note, the entire vault, or automatically after
a note is saved. An ignore list accepts Vault-relative paths and drag-to-sort
entries. Anki Desktop, the AnkiConnect add-on, and Obsidian Desktop 1.5.7 or
later are required.

For installation, install AnkiConnect with add-on code `2055492159`, keep Anki
running, install **Anki Flashcard Sync** from the community plugin directory,
and run **同步当前笔记到 Anki** from the command palette.

## 中文说明

将 Obsidian Markdown 内的填空、问答、代码练习、单选／多选与图像遮挡卡片同步到 Anki。同步使用 [AnkiConnect](https://git.sr.ht/~foosoft/anki-connect)。

每张卡片只在 Obsidian 中保存一个 Anki note ID（`<!-- Anki-ID: 12345 -->`），再次同步时会更新同一则 Anki note，不会建立重复卡片。Anki 侧不再写入任何插件标签，卡片与笔记的关联完全依靠这个 ID。

## 功能

- 支持 Anki 原生 Cloze（填空）语法。
- 支持不编号的 `Q:`／`A:` 格式，作为没有输入框的标准正反面问答卡。
- 支持不编号的 `QC:`／`AC:` 格式，作为代码练习卡。
- 支持 `QS:` 单选与 `QM:` 多选；作答结果会在背面标出答对、选错与漏选。
- 支持互动式图像遮挡编辑器：新增或重新打开已有卡片，移动、缩放与排序遮罩，并以 `<!-- MASK: ... -->` 注释保存。
- 支持 `$...$` 行内 LaTeX 与 `$$...$$` 区块 LaTeX，并转成 Anki 原生 MathJax。
- 支持 `<!-- Deck_START -->` / `<!-- Deck_END -->` 题目区块：区块内可以跨越多行，空白行不会被当成题目结束。
- 同步后只在卡片下方（或 `Deck_END` 下方）写入一个 `<!-- Anki-ID: n -->` 注释。
- Anki 侧的卡片不带插件标签；旧版本写入的同步标签会在第一次同步时自动移除。
- 卡片从 Markdown 移除后，可保留、暂停或确认后永久删除对应的 Anki note。
- 支持当前笔记、整个 Vault，以及保存后自动同步。
- 支持忽略列表：按 Vault 相对路径跳过文件或文件夹，可粘贴多行并用拖动调整顺序，支持 `*`、`**`、`?` 通配符。
- 自动建立指定的 Anki 牌组，以及 Cloze、代码练习、Q&A、选择题与图像遮挡笔记类型。
- 同步前可预览新增、更新、不变与移除数量，并逐张检查正反面内容。
- 未变更的卡片直接比较 Anki 字段，不会重复写入。
- 删除整个 Markdown 笔记时，也能保留、暂停或确认后删除其 Anki notes。
- 检测复制笔记造成的 Anki-ID 冲突，避免不同笔记覆盖同一张卡片。
- 支持以 Frontmatter 指定牌组或排除同步。
- 将本机图片、音频与视频导入 Anki media，卡片可离线显示。

## 题目格式

### 标准正反面问答卡（无输入框）

使用 `Q`（Question）与 `A`（Answer）。正面只显示问题，点击 Anki 的“显示答案”后才显示答案：

```markdown
Q: 1+1 = ?
A: 2

Q：Heap 的根节点保存什么？
A：Min Heap 保存最小值；Max Heap 保存最大值。
```

此卡型不会显示文字或代码输入框，适合一般知识问答，并支持半角或全角冒号。`Q1/A1` 等编号格式不会被识别。

### 代码练习卡（有输入框）

代码问题使用 `QC`，参考答案使用 `AC`：

```markdown
QC: 请实现二分搜索。
AC: 使用左右边界逐步缩小搜索范围。

QC: 请实现 Stack 的 pop。
AC: 移除并返回数组尾端元素。
```

`QC` 代表 Code Question，`AC` 代表 Answer Code。支持半角或全角冒号，但不支持 `QC1/AC1` 等编号格式。同一份笔记内可连续写多组问答，也可和 `Q/A`、cloze 混用。

若参考答案是代码，可以直接使用 Markdown fenced code block：

````markdown
QC: 请实现 Stack 的 push 方法。
AC:
```ts
push(value: T): void {
  this.items.push(value);
}
```
````

在 Anki 复习 `QC/AC` 代码练习卡时：

1. 正面显示题目与多行代码输入区。
2. 输入区使用等宽字体，按 Tab 会插入四个空格。
3. 点击 Anki 的“显示答案”。
4. 背面先显示你的代码草稿，再显示 `AC:` 的参考答案。
5. 插件不比较文字、不标示答对或答错；由你自行选择 Again、Hard、Good 或 Easy。

### 单选与多选题

单选题使用 `QS`（Question Single）。正确选项用 `[-]` 标记，而且必须刚好一个；这可以避免 Obsidian 将正解视为已完成待办并加上删除线：

```markdown
QS: HTTP 的默认端口是？
- [ ] 21
- [ ] 22
- [-] 80
- [ ] 443
E: HTTP 默认使用 80；HTTPS 才是 443。
```

多选题使用 `QM`（Question Multiple），可以标记一个以上的正确选项：

```markdown
QM：下列哪些是 JavaScript 的 primitive？
- [-] string
- [-] bigint
- [ ] Array
- [-] undefined
E：Array 属于 object。
```

`QS/QM/E` 支持半角或全角冒号，`E`（Explanation）详解可以省略。`[ ]` 表示错误选项、`[-]` 表示正确选项；`[x]` 不会被识别为选择题选项，并会产生诊断提示。每题至少要有两个非空白选项；格式不完整、`QS` 没有刚好一个答案，或 `QM` 没有任何答案时，预览诊断会指出问题且不会同步该题。

### 图像遮挡题

在 Markdown 编辑画面打开命令面板，执行“新增或编辑图像遮挡卡片”：

1. 选择 Vault 内的图片；也可以先选中一个图片嵌入，再执行命令。
2. 在图片上连续拖拽多个矩形，按想要的揭示顺序框住各个部位。
3. 按需填写补充答案，例如构造名称或解释。
4. 点击“新增遮挡卡”，再同步当前笔记。

若要修改已有遮挡卡，先把光标放在该卡的 `IO`、`MASK`、答案或 Anki-ID 任一行，再执行同一个命令。编辑器会加载原本的图片、遮罩、揭示顺序与补充答案：

- 拖动遮罩本体以移动位置。
- 拖动遮罩四角的控制点以调整大小。
- 使用遮罩列表的上下箭头调整揭示顺序，或移除不需要的遮罩。
- 保存时会就地更新卡片并保留既有 `<!-- Anki-ID: -->`，不会建立新的 Anki note。

插件会在同一张卡插入多行 `MASK` HTML 注释；遮罩坐标依次为图片的 `x, y, 宽, 高`，单位都是百分比，注释的顺序就是揭示顺序：

```markdown
IO: ![[anatomy/heart.png]]
<!-- MASK: 12.5, 24, 30, 18.25 -->
<!-- MASK: 55, 16, 18, 22 -->
<!-- MASK: 42, 63, 14, 12 -->
A: 心脏构造重点
```

`A:` 可省略。每个 `IO` 区块代表一张卡，可以包含任意数量的遮罩。百分比坐标会随图片等比例缩放，在 Anki 桌面版与移动版都能保持对齐。

### Cloze 填空题

每个包含 cloze 语法的段落会同步成一则 Anki note：

```markdown
粒线体是细胞的 {{c1::能量工厂}}。

法国首都是 {{c1::巴黎::城市}}，位于 {{c2::法国::国家}}。
```

### 多行题目与 Deck 区块

普通 `Q/A` 在空白行之后仍会继续读取答案，但答案与下一张卡片之间的边界依赖题目开头与标题。若希望题目与答案明确跨越多行（包含空白行），用两个标记包住内容：

```markdown
<!-- Deck_START -->
Q: 这是问答题目（支持多行）
答案里可以有空白行

也可以有列表：
- 第一项
- 第二项

A: 这是答案（支持多行）
也可以有空白行。
<!-- Deck_END -->
```

规则：

- `<!-- Deck_START -->` 与 `<!-- Deck_END -->` 只用于检测范围，**不会**写进 Anki 题目或答案。
- 区块内的空白行属于题目或答案，不会结束卡片。
- 一个区块可以只放一张卡，也可以连续放多张；区块结束后按顺序写入对应的 `<!-- Anki-ID: n -->`。
- 区块内同样可以使用 `Q/A`、`QC/AC`、`QS/QM`、`IO/MASK` 与 cloze 语法。
- 缺少 `Deck_END` 会产生诊断并跳过整个区块，避免误同步。

### LaTeX 数学公式

题目、答案、选项／详解与 cloze 都能使用 Obsidian 熟悉的 LaTeX 写法。行内公式使用单一 `$`：

```markdown
Q: 计算 $\frac{1}{2}+\frac{1}{3}$。
A: $\frac{5}{6}$
```

区块公式使用 `$$`：

```markdown
Q: 等差级数的总和公式是什么？
A:
$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$
```

同步时会自动转成 Anki 原生 MathJax，因此不需在卡片模板加载外部 JavaScript。公式位于 fenced code block 或行内 code 时会保持原样；若要显示一般货币符号，请写成 `\$`。

### Frontmatter 控制

每份笔记可以覆盖全局牌组，或完全排除同步：

```yaml
---
anki-sync: true
anki-deck: Computer Science::Data Structures
---
```

- `anki-sync: false`：不新增、更新或移除这份笔记的 Anki 卡片。
- `anki-deck`：指定这份笔记的牌组，支持 Anki 的 `父牌组::子牌组` 语法。
- Frontmatter 的 `tags` 与 `anki-tags` 不再写入 Anki；插件不会为卡片添加标签。

### 图片、音频与视频

本机 Markdown 图片与 Obsidian wikilink 嵌入都会导入 Anki media：

```markdown
Q: 这张图代表什么？
![[images/heap.png|600]]
A: Complete binary tree

Q: 听写这段内容。
![[audio/example.mp3]]
A: Example sentence
```

媒体档会使用内容哈希与原始文件名组成不冲突的名称；同一个文件可以安全重复同步。HTTP/HTTPS 图片会维持外部网址，不会下载。可在设置中关闭“同步图片与附件”。

## Anki-ID 关联

同步成功后，插件会在卡片内容下方写入 Anki note ID：

```markdown
粒线体是细胞的 {{c1::能量工厂}}。
<!-- Anki-ID: 1735392801234 -->
```

问答卡、选择题、图像遮挡卡与 Deck 区块也使用相同机制：

```markdown
Q: 1+1 = ?
A: 2
<!-- Anki-ID: 1735392802234 -->

<!-- Deck_START -->
Q: 这是问答题目（支持多行）

A: 这是答案（支持多行）
<!-- Deck_END -->
<!-- Anki-ID: 1735392803234 -->
```

- ID 使用 Anki 的 **note ID**（不是 card ID），一则以 note 为单位的卡片对应一个 ID。
- 请保留这行注释；它是修改后能更新同一张 Anki 卡片的关键。
- Anki 侧不会写入 `obsidian_sync_id_*`、`obsidian_file_id_*`、`obsidian_content_*` 等标签。
- 若整个 Vault 中两份笔记使用同一个 Anki-ID，插件会报错并停止同步，避免覆盖。
- 把卡片连同 `Anki-ID` 移到另一份笔记后，下一次同步会把该 note 的所有权转移到新笔记并更新来源链接；原笔记不会再暂停它。
- 复制笔记后若要建立独立的 Anki 卡片，请删除副本中的 `<!-- Anki-ID: ... -->` 行，下次同步会重新建立并写入新的 ID。
- 在 Anki 中删除某则 note 后，下次同步会重新建立它并在 Obsidian 中更新 ID。

### 从旧版本升级

旧版本会在笔记顶部写入 `<!-- anki-sync-file-id: ... -->`，并在卡片下方写入 `<!-- anki-sync-id: ... -->`。升级后第一次同步时：

1. 插件用旧版同步标签找到原本的 Anki note；
2. 把卡片下方的旧标记替换成 `<!-- Anki-ID: n -->`；
3. 移除 Anki note 上的所有旧版插件标签；
4. 删除笔记顶部的 `anki-sync-file-id` 标记。

因此原有复习记录会保留，不会重复建立卡片。

## 同步预览与诊断

命令面板执行“预览当前笔记的 Anki 同步”会以只读方式显示：

- 预计新增、更新、不变及移除的卡片数。
- 实际使用的牌组。
- 每张卡片的正面、背面、来源行号及同步状态。
- 重复 Anki-ID、不完整 Q/A、未关闭 Deck 区块、未关闭 code fence 或 Frontmatter 等问题。

预览不会写入 Markdown、Anki notes 或 Anki media。状态列会在整库同步时显示当前文件与卡片进度。

## 忽略列表

设置中的“忽略的文件路径”可以填写 Vault 相对路径：

- 一行一个路径，可一次粘贴多行；列表项可以用鼠标拖动排序。
- 填写文件夹路径会忽略该文件夹下的所有文件。
- 支持 `*`、`**` 与 `?` 通配符，例如 `日记/2026-*.md` 或 `附件/**`。
- 路径不区分大小写，`/` 与 `\` 都可以。
- 被忽略的文件不会自动同步、不会参与整库同步，也不会生成同步预览。

## 安装与使用

1. 在 Anki 安装 AnkiConnect（AnkiWeb add-on code：`2055492159`），并保持 Anki 运行。
2. 正式收录后，从 Obsidian 的“设置 → 第三方插件 → 浏览”搜索 **Anki Flashcard Sync** 并安装。
3. 在 Obsidian 的“设置 → 第三方插件”启用 **Anki Flashcard Sync**。
4. 建立填空、问答、选择题或图像遮挡卡后，从命令面板执行“同步当前笔记到 Anki”，或使用左侧功能区的按钮同步整个 Vault。

若要在正式收录前手动安装，请从 GitHub Releases 下载 `main.js`、`manifest.json` 与 `styles.css`，放入 Vault 的 `.obsidian/plugins/anki-cloze-sync/` 后重新加载 Obsidian。

默认会建立：

- 牌组：`Obsidian`
- Cloze 笔记类型：`Obsidian Cloze`
- 代码练习笔记类型：`Obsidian Basic`
- 标准问答笔记类型：`Obsidian Q&A`
- 选择题笔记类型：`Obsidian Choice`
- 图像遮挡笔记类型：`Obsidian Image Occlusion`
- AnkiConnect URL：`http://127.0.0.1:8765`

以上都能在插件设置修改。可先执行“测试 AnkiConnect 连接”确认环境正常。

## 同步规则与限制

- 修改题目或答案后，保存文件即可自动更新 Anki；也可手动同步。
- 标准问答卡的正面只显示问题，背面显示答案及返回 Obsidian 的链接。
- 代码练习卡的正面显示问题与草稿输入框，背面显示草稿与参考答案。
- 选择题正面可点选答案，背面标示答对、选错与漏选；选择只保留于当次复习。
- 代码草稿只用于当次复习时的正反面显示，不会写回 Markdown 或保存成 Anki note 字段。
- 图像遮挡卡正面以编号实色区块遮住多个部位；背面每按一次“揭示下一个”才依框选顺序移除一个遮罩，最后显示选填的补充答案。
- 同一段落可以有 `c1`、`c2` 等多个 cloze，Anki 会依原生规则产生多张 card。
- LaTeX 区块公式在窄屏幕超出卡片宽度时可以横向滚动。
- 删除完整的 `Q/A`、`QC/AC`、`QS/QM`、`IO/MASK` 题组、Deck 区块或 cloze 段落并移除其 `Anki-ID` 后，下次同步会依“卡片从 Markdown 移除后”设置处理。
- 移除卡片后默认会暂停对应的 Anki cards，不会破坏复习记录；插件会记录自己暂停过的卡片，卡片重新出现时自动恢复。
- 设置可改为“保留不处理”或“永久删除”；永久删除只会在手动同步确认后执行。自动同步与整库同步不会在后台硬删除。
- 未变更卡片会显示为“不变”并跳过 Anki 字段更新；修改内容或牌组都会重新同步。
- 插件不再为 Anki 卡片添加任何标签，也不管理 Frontmatter 中的标签。
- 此插件依赖桌面版 Anki 与本机 AnkiConnect，因此是 Obsidian 桌面限定插件。

## 网络与隐私

- 插件不含遥测、广告或用户追踪。
- 插件只会向设置中的 AnkiConnect URL 发送同步请求；默认为本机地址 `http://127.0.0.1:8765`。
- 同步内容包含要建立或更新的卡片文字与 Vault 内嵌媒体。使用默认本机地址时，数据不会由插件发送到外部网络。
- 若你把 AnkiConnect URL 改成远端服务，相关同步数据会发送到该服务；请自行确认连接安全与隐私政策。

## 开发

```bash
npm install
npm test
npm run lint
npm run build
npm run preview:cards
```

`preview:cards` 会产生本机 `card-preview.html`，方便在浏览器同时检查代码练习、标准问答、选择题、图像遮挡、亮色、深色与 cloze 卡片。建议在测试 Vault 开发，避免插件错误影响主要笔记库。
