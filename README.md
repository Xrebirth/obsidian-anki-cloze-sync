# Anki Flashcard Sync Pro

将 Markdown 笔记中的**填空、问答、选择题、代码练习和图像遮挡卡片**同步到 Anki。插件通过 [AnkiConnect](https://ankiweb.net/shared/info/2055492159) 与 Anki 通信，使用 **Anki note ID** 精确关联，不在 Anki 中写入任何插件追踪标签。

[![Version](https://img.shields.io/badge/version-1.6.0-blue?style=flat-square)](https://github.com/Xrebirth/obsidian-anki-cloze-sync/releases)
[![License](https://img.shields.io/github/license/Xrebirth/obsidian-anki-cloze-sync?style=flat-square)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-%E2%89%A51.5.7-7C3AED?style=flat-square)](https://obsidian.md)
[![AnkiConnect](https://img.shields.io/badge/AnkiConnect-2055492159-2E7D32?style=flat-square)](https://ankiweb.net/shared/info/2055492159)

> **来源与二次开发：** 本项目 fork 自 [joeyyu123/obsidian-anki-cloze-sync](https://github.com/joeyyu123/obsidian-anki-cloze-sync)，并在原项目基础上使用 AI 辅助进行二次开发、重构与功能扩展。

> [!IMPORTANT]
> **所有题型都必须放在 `<!-- Anki_START -->` 与 `<!-- Anki_END -->` 之间。**
> 区块外的题目会被完全忽略，不会自动补区块、不会写入 Anki-ID，也不会同步。已有 Anki note 的区块外题目会保留原 note，不会被当成“已从 Markdown 移除”。

---

## 目录

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

## 为什么使用它

- **笔记即题库**：题目直接写在 Obsidian Markdown 中，不需要在 Anki 里重复录入。
- **精确更新**：每张卡片保存一个 Anki note ID，修改后更新同一则 note，不会重复建卡。
- **不污染 Anki**：Anki 侧不写入 `obsidian_sync_*` 等追踪标签；标签只来自你的 YAML。
- **块级安全**：只同步显式放在 `Anki_START` / `Anki_END` 内的题目，避免误同步普通笔记内容。
- **删除可控**：从 Markdown 移除卡片时默认暂停 Anki cards，保留复习记录；永久删除需要确认。
- **内容对齐**：区块内删除卡片后，剩余题目会按内容重新对齐 Anki-ID，避免把另一张题目的内容写进原来的 note。

## 功能

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

## 环境要求

- **Obsidian Desktop** `1.5.7` 或更高版本（插件为桌面限定）。
- **Anki Desktop**，并安装 **AnkiConnect** 插件。
- 默认 AnkiConnect 地址：`http://127.0.0.1:8765`。
- Anki 需要保持运行；同步时不要关闭 Anki。

## 安装

### 1. 安装 AnkiConnect

1. 打开 Anki。
2. 进入 **工具 → 插件 → 获取插件**。
3. 输入代码 `2055492159`，安装 **AnkiConnect**。
4. 重启 Anki，保持 Anki 运行。

### 2. 安装本插件

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

### 3. 测试连接

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

## 快速开始

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

## 题目格式

### 标准问答 Q/A

没有输入框的普通正反面卡片：

```markdown
<!-- Anki_START -->
Q: Heap 的根节点保存什么？
A: Min Heap 保存最小值；Max Heap 保存最大值。
<!-- Anki_END -->
```

- 支持半角 `Q:` / `A:` 和全角 `Q：` / `A：`。
- `Q1/A1`、`Q2/A2` 等编号格式不会被识别。
- 正面只显示问题，点击“显示答案”后显示答案。

### 代码练习 QC/AC

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
- 点击“显示答案”后，背面先显示你的草稿，再显示参考答案。
- 插件不自动判分，也不把草稿写回 Markdown 或保存到 Anki。

### 单选与多选 QS/QM

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

### 图像遮挡 IO

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

### Cloze 填空

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

### 多行题目

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

### LaTeX 公式

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

### 图片、音频与视频

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

### Frontmatter 控制

```yaml
---
anki-sync: true
anki-deck: Computer Science::Data Structures
tags:
  - course/cs
  - exam
---
```

| 字段 | 说明 |
| --- | --- |
| `anki-sync` | `false` 时完全跳过这份笔记的同步 |
| `anki-deck` | 覆盖全局牌组，支持 `父牌组::子牌组` |
| `tags` | 写入 YAML 的标签会添加到每则 Anki note |
| `anki-tags` | 旧版写法，仍会与 `tags` 合并 |

- 支持 YAML 列表或空格分隔字符串。
- 开头的 `#` 会被移除。
- 从 YAML 移除标签后，下次同步会从插件管理的 notes 中移除对应标签。
- 无法解析的 Frontmatter 只产生警告，不会阻断整个 Vault 同步。
- 以 `<%` 开头的 Templater 模板文件会被跳过。

## Anki-ID 与生命周期

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

### 内容对齐

`Anki-ID` 在 `Anki_END` 下方按卡片顺序排列。删除区块中的某张卡片或某个标记后，位置会前移。

插件会记录每则 note 的内容签名，并在同步前按内容重新对齐：

- 删除第一张卡后，剩余卡片仍会找回各自原来的 note；
- 不会把下一张题目的内容写进上一张的 note；
- 支持链条式错位：`A → 11`、`B → 22`、`C → 33`；
- 只匹配唯一、仍然存在、未被其他卡片占用的 note。

> 安装新版本后，建议先完整同步一次，让插件记录内容签名，再测试区块内删除。

### `Anki-Delete`

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

## 同步行为与安全策略

### 卡片从 Markdown 移除后

| 设置 | 行为 |
| --- | --- |
| **暂停**（默认） | 暂停对应的 Anki cards，保留复习记录 |
| **保留不处理** | 保留 Anki note，不暂停、不删除 |
| **永久删除** | 删除 Anki note；当前笔记/整库手动同步会先确认 |

自动同步不会静默硬删除：它会先暂停并记录为 **待删除**，等你下次手动同步时确认。

插件会记录自己暂停过的卡片；卡片重新出现在 Markdown 中时，会自动恢复。

### Anki 中删除 note 后

| 设置 | 行为 |
| --- | --- |
| **保留题目并标记 Anki-Delete**（默认） | 把 `Anki-ID` 改成 `Anki-Delete`，题目留在 Obsidian |
| **删除 Obsidian 题目** | 从 Markdown 中移除该题目及其标记 |

删除整个 Markdown 笔记时，也会按“卡片从 Markdown 移除后”的设置处理其 Anki notes。

### 安全诊断

以下情况会在写入前停止同步：

- 重复 Anki-ID；
- 未闭合的 `Anki_START` / `Anki_END`；
- 区块内有内容但没有有效题目；
- 区块内标记数量多于卡片数量；
- 存在未对应题目的 Anki-ID；
- 两份笔记使用同一个 Anki-ID；
- 复制笔记导致的 ID 冲突；
- 所有带 Anki-ID 的 note 在 Anki 中都不存在（自动同步）。

## 设置

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

## 命令

| 命令 | 说明 |
| --- | --- |
| **同步当前笔记到 Anki** | 同步当前 Markdown 笔记 |
| **预览当前笔记的 Anki 同步** | 只读预览新增、更新、不变、移除及逐卡内容 |
| **新增或编辑图像遮挡卡片** | 打开 IO 编辑器 |
| **同步整个 Vault 到 Anki** | 按路径筛选同步全部笔记 |
| **测试 AnkiConnect 连接** | 检查 AnkiConnect 是否可用 |

左侧功能区也有一个 **同步整个 Vault 到 Anki** 按钮。

## 路径筛选

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
Templates/*
**/private/**
```

`知识箱/Development/Embedded/*` 会匹配 `知识箱/Development/Embedded/STM32/00-索引1.md`。

## 同步状态

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

## 常见问题

### 同步后没有生成卡片

检查题目是否在 Anki 区块内：

```markdown
<!-- Anki_START -->
Q: 题目
A: 答案
<!-- Anki_END -->
```

区块外题目会被忽略，不会自动补标记。

### 提示“请先关闭 Anki 的浏览或编辑窗口，再重新同步”

AnkiConnect 拒绝在模型被编辑器占用时更新模板。关闭 Anki 的浏览/编辑窗口后重新同步即可。卡片同步会继续进行，只是模板/CSS 更新被跳过。

### 提示“Frontmatter YAML 无法解析”

这是警告，不会阻断整个 Vault。检查 YAML 是否缩进正确；Templater 模板文件会被自动跳过。

### 提示 Anki-ID 指向另一份笔记

两份笔记复制了同一个 `Anki-ID`。保留其中一份，删除另一份的 ID 后重新同步。

### 所有 note 都不存在

可能是连接到了错误的 Anki 配置，或你确实在 Anki 中删除了全部 notes。**两张以上**卡片全部不存在时，自动同步会停止；手动同步会弹确认框。

### 图片在 Anki 中不显示

确认：

- **同步图片与附件** 已开启；
- 图片是 Vault 内本机文件；
- 同步时 Anki 正在运行；
- 没有使用 HTTP 外链（外链会保留网址，不下载）。

### 删除后 Anki 里还在

插件会在删除后回查 `notesInfo` 并刷新 Anki 界面。若仍失败，请：

1. 确认 Anki 没有被其他窗口占用；
2. 执行 **测试 AnkiConnect 连接**；
3. 重新同步并查看错误中的 note ID。

### `Anki-Delete` 一直不消失

这是有意保留的标记。删除这一行后重新同步，插件会把它当作新卡片重新建立。

### 能否从 Anki 反向修改 Obsidian？

不能。Obsidian 是内容源；在 Anki 中修改字段后，下次同步会以 Obsidian 为准覆盖。插件只检测 Anki note 的**删除**，并按设置处理。

## 工作原理

1. 读取 Markdown，只解析 `Anki_START` / `Anki_END` 区块内的题目。
2. 按题型生成 Anki 字段并渲染 Markdown、媒体与 LaTeX。
3. 通过 AnkiConnect 读取现有 notes。
4. 使用内容签名重新对齐区块内位置变化的 Anki-ID。
5. 新增、更新或处理移除的 notes。
6. 把 note ID 写回 `Anki_END` 下方，更新本地同步记录。

Anki-ID 记录在插件数据中，Anki 侧不写追踪标签。牌组、标签、字段模板都由插件统一维护。

## 开发

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

### 目录结构

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

## 隐私

- 插件不包含遥测、广告或用户追踪。
- 插件只向设置中的 AnkiConnect 地址发送同步请求，默认是本机 `http://127.0.0.1:8765`。
- 同步内容包括卡片文字、标签和 Vault 内嵌媒体。使用默认本机地址时，数据不会由插件发送到外部网络。
- 如果你把 AnkiConnect 地址改成远端服务，相关数据会发送到该服务，请自行确认安全与隐私政策。
- AnkiConnect 默认没有认证，请勿把端口暴露到公网。

## 贡献

欢迎提交 Issue 和 Pull Request。

提交前请运行：

```bash
npm test
npm run lint
npm run build
```

请尽量在测试 Vault 中验证涉及同步、删除和媒体导入的改动。

## 来源与二次开发

本项目 fork 自 [joeyyu123/obsidian-anki-cloze-sync](https://github.com/joeyyu123/obsidian-anki-cloze-sync)，并在原项目基础上使用 AI 辅助进行二次开发、重构和功能扩展。

- 本仓库是独立维护的 fork，与原作者无隶属关系。
- 原项目的版权归原作者所有；本仓库继续遵循 MIT License。
- 本仓库的代码、文档和测试包含 AI 辅助生成或修改的内容，已由维护者审核。

## 许可

[MIT License](LICENSE) © 2026 Joey

---

如果这个插件对你有帮助，欢迎在 GitHub 上点一个 Star。
