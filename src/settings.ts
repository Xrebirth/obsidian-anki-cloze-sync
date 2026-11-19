import { App, FuzzySuggestModal, PluginSettingTab, Setting, TFolder } from "obsidian";
import type { SettingDefinitionItem, ToggleComponent } from "obsidian";
import type AnkiFlashcardSyncPlugin from "./main";
import { normalizeVaultPath } from "./ignore";

type PathListKind = "ignore" | "include";

class VaultPathSuggestModal extends FuzzySuggestModal<string> {
  constructor(
    app: App,
    private readonly onChoosePath: (path: string) => void
  ) {
    super(app);
    this.setPlaceholder("选择文件或文件夹…");
  }

  getItems(): string[] {
    const folders = this.app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder)
      .map((folder) => folder.path)
      .filter((path) => path.length > 0 && path !== "/");
    const files = this.app.vault.getMarkdownFiles().map((file) => file.path);
    return [...new Set([...folders, ...files])].sort((a, b) => a.localeCompare(b));
  }

  getItemText(item: string): string {
    return item;
  }

  onChooseItem(item: string): void {
    this.onChoosePath(item);
  }
}

export class AnkiSyncSettingTab extends PluginSettingTab {
  private ignoreToggle?: ToggleComponent;
  private includeToggle?: ToggleComponent;

  constructor(app: App, private readonly plugin: AnkiFlashcardSyncPlugin) {
    super(app, plugin);
    this.containerEl.addClass("anki-cloze-sync-settings");
  }

  private section(name: string) {
    return {
      name,
      desc: "",
      render: (setting: Setting) => {
        setting.setName(name);
        setting.setHeading();
      }
    };
  }

  getSettingDefinitions() {
    // Custom renderers preserve saveSettings(), including registry persistence
    // and cache invalidation, instead of the declarative API's default saveData().
    return [
      this.section("同步状态"),
      {
        name: "上次同步与连接状态",
        desc: "查看最近一次同步与连接结果，并可直接测试连接或同步整个 Vault。",
        render: (setting: Setting) => {
          const status = setting.infoEl.createDiv({ cls: "anki-sync-status-line" });
          const refresh = (): void => {
            status.setText(
              `${this.plugin.lastSyncSummary} ｜ ${this.plugin.lastConnectionSummary}`
            );
          };
          refresh();
          setting
            .addButton((button) => {
              button
                .setButtonText("测试连接")
                .setTooltip("向 AnkiConnect 发送 version 请求")
                .onClick(async () => {
                  this.plugin.lastConnectionSummary = "正在测试连接…";
                  refresh();
                  button.setDisabled(true).setButtonText("测试中…");
                  try {
                    await this.plugin.testConnection();
                  } finally {
                    button.setDisabled(false).setButtonText("测试连接");
                    refresh();
                  }
                });
            })
            .addButton((button) => {
              button
                .setButtonText("同步整个 Vault")
                .setCta()
                .onClick(async () => {
                  this.plugin.lastSyncSummary = "正在同步整个 Vault…";
                  refresh();
                  button.setDisabled(true).setButtonText("同步中…");
                  try {
                    await this.plugin.syncVault();
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    this.plugin.lastSyncSummary = `同步失败：${message}`;
                  } finally {
                    button.setDisabled(false).setButtonText("同步整个 Vault");
                    refresh();
                  }
                });
            });
        }
      },

      this.section("牌组与连接"),
      {
        name: "AnkiConnect 地址",
        desc: "通常不需要修改。Anki 必须保持运行。",
        render: (setting: Setting) => {
          setting.addText((text) =>
            text
              .setPlaceholder("http://127.0.0.1:8765")
              .setValue(this.plugin.settings.ankiConnectUrl)
              .onChange(async (value) => {
                this.plugin.settings.ankiConnectUrl = value.trim();
                await this.plugin.saveSettings();
              })
          );
        }
      },
      {
        name: "Anki 牌组",
        desc: "不存在时会自动创建。",
        render: (setting: Setting) => {
          setting.addText((text) =>
            text.setValue(this.plugin.settings.deckName).onChange(async (value) => {
              this.plugin.settings.deckName = value.trim() || "Obsidian";
              await this.plugin.saveSettings();
            })
          );
        }
      },

      this.section("笔记类型"),
      {
        name: "Cloze 笔记类型",
        desc: "不存在时会自动创建；已有类型必须有 Text 与 Back Extra 字段。",
        render: (setting: Setting) => {
          setting.addText((text) =>
            text.setValue(this.plugin.settings.modelName).onChange(async (value) => {
              this.plugin.settings.modelName = value.trim() || "Obsidian Cloze";
              await this.plugin.saveSettings();
            })
          );
        }
      },
      {
        name: "代码练习笔记类型",
        desc: "不存在时会自动创建；已有类型必须有 Front 与 Back 字段，其卡片模板由插件管理为代码练习模式。",
        render: (setting: Setting) => {
          setting.addText((text) =>
            text.setValue(this.plugin.settings.basicModelName).onChange(async (value) => {
              this.plugin.settings.basicModelName = value.trim() || "Obsidian Basic";
              await this.plugin.saveSettings();
            })
          );
        }
      },
      {
        name: "标准问答笔记类型",
        desc: "用于 Q/A 卡片，不含文字输入框；不存在时会自动创建。",
        render: (setting: Setting) => {
          setting.addText((text) =>
            text.setValue(this.plugin.settings.plainBasicModelName).onChange(async (value) => {
              this.plugin.settings.plainBasicModelName = value.trim() || "Obsidian Q&A";
              await this.plugin.saveSettings();
            })
          );
        }
      },
      {
        name: "图像遮挡笔记类型",
        desc: "用于 IO/MASK 卡片；支持同图多遮罩依次揭示，且遮罩会随图片等比例缩放。",
        render: (setting: Setting) => {
          setting.addText((text) =>
            text.setValue(this.plugin.settings.imageOcclusionModelName).onChange(async (value) => {
              this.plugin.settings.imageOcclusionModelName = value.trim() || "Obsidian Image Occlusion";
              await this.plugin.saveSettings();
            })
          );
        }
      },
      {
        name: "选择题笔记类型",
        desc: "用于 QS/QM 卡片；单选与多选共用此类型，已有类型必须有 Question、Options、Explanation、Mode 与 Back Extra 字段。",
        render: (setting: Setting) => {
          setting.addText((text) =>
            text.setValue(this.plugin.settings.choiceModelName).onChange(async (value) => {
              this.plugin.settings.choiceModelName = value.trim() || "Obsidian Choice";
              await this.plugin.saveSettings();
            })
          );
        }
      },

      this.section("同步行为"),
      {
        name: "自动同步",
        desc: "Markdown 文件保存后，自动同步其中的填空、问答、选择题与图像遮挡卡。",
        render: (setting: Setting) => {
          setting.addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.autoSync).onChange(async (value) => {
              this.plugin.settings.autoSync = value;
              await this.plugin.saveSettings();
            })
          );
        }
      },
      {
        name: "自动同步延迟（毫秒）",
        desc: "避免连续输入时过度调用 AnkiConnect，最小值为 500。",
        render: (setting: Setting) => {
          setting.addText((text) =>
            text.setValue(String(this.plugin.settings.autoSyncDelayMs)).onChange(async (value) => {
              const parsed = Number.parseInt(value, 10);
              if (Number.isFinite(parsed)) {
                this.plugin.settings.autoSyncDelayMs = Math.max(500, parsed);
                await this.plugin.saveSettings();
              }
            })
          );
        }
      },
      {
        name: "卡片从 Markdown 移除后",
        desc: "暂停会保留复习记录，可回头恢复；永久删除不可恢复。当前笔记与整库同步会先弹出确认；自动同步会先暂停并保留为待删除，等你下次手动同步时再确认删除。",
        render: (setting: Setting) => {
          setting.addDropdown((dropdown) =>
            dropdown
              .addOption("keep", "保留不处理")
              .addOption("suspend", "暂停（建议）")
              .addOption("delete", "永久删除")
              .setValue(this.plugin.settings.removedCardAction)
              .onChange(async (value) => {
                this.plugin.settings.removedCardAction = value as "keep" | "suspend" | "delete";
                await this.plugin.saveSettings();
              })
          );
        }
      },
      {
        name: "Anki 中删除 note 后",
        desc: "保留：把该题目的 Anki-ID 改成 Anki-Delete，题目留在 Obsidian 但不参与同步（删除该标记可重新同步）；删除：直接从 Obsidian 中删除该题目。",
        render: (setting: Setting) => {
          setting.addDropdown((dropdown) =>
            dropdown
              .addOption("keep", "保留题目并标记 Anki-Delete")
              .addOption("delete", "删除 Obsidian 题目")
              .setValue(this.plugin.settings.ankiDeleteAction)
              .onChange(async (value) => {
                this.plugin.settings.ankiDeleteAction = value as "keep" | "delete";
                await this.plugin.saveSettings();
              })
          );
        }
      },
      {
        name: "同步图片与附件",
        desc: "将笔记内嵌的图片、音频与视频复制到 Anki media，并改写卡片路径。",
        render: (setting: Setting) => {
          setting.addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.syncMedia).onChange(async (value) => {
              this.plugin.settings.syncMedia = value;
              await this.plugin.saveSettings();
            })
          );
        }
      },

      this.section("同步范围与路径筛选"),
      {
        name: "路径筛选说明",
        desc: "忽略路径与仅检测路径共用同一套路径规则。两个开关互斥：开启其中一个会自动关闭另一个；两个都关闭时会同步 Vault 中的全部笔记。",
        render: () => {
          // Informational row only.
        }
      },
      {
        name: "启用忽略路径",
        desc: "开启后，匹配下方任一规则的笔记会被跳过；列表为空时不排除任何笔记。",
        render: (setting: Setting) => {
          setting.addToggle((toggle) => {
            this.ignoreToggle = toggle;
            toggle.setValue(this.plugin.settings.useIgnorePaths).onChange(async (value) => {
              this.plugin.settings.useIgnorePaths = value;
              if (value) {
                this.plugin.settings.useIncludePaths = false;
                this.includeToggle?.setValue(false);
              }
              await this.plugin.saveSettings();
            });
          });
        }
      },
      {
        name: "忽略路径列表",
        desc: "单行输入一条路径，支持文件夹、文件与 *（可跨文件夹）、**、? 通配符；可拖动排序或从 Vault 选择。",
        render: (setting: Setting) => {
          setting.settingEl.addClass("anki-sync-setting-paths");
          const container = setting.settingEl.createDiv({ cls: "anki-sync-path-container" });
          this.renderPathList(container, "ignore");
        }
      },
      {
        name: "启用仅检测路径",
        desc: "开启后，只同步匹配下方任一规则的笔记；列表为空时不会同步任何笔记。",
        render: (setting: Setting) => {
          setting.addToggle((toggle) => {
            this.includeToggle = toggle;
            toggle.setValue(this.plugin.settings.useIncludePaths).onChange(async (value) => {
              this.plugin.settings.useIncludePaths = value;
              if (value) {
                this.plugin.settings.useIgnorePaths = false;
                this.ignoreToggle?.setValue(false);
              }
              await this.plugin.saveSettings();
            });
          });
        }
      },
      {
        name: "仅检测路径列表",
        desc: "单行输入一条路径，支持文件夹、文件与 *（可跨文件夹）、**、? 通配符；可拖动排序或从 Vault 选择。",
        render: (setting: Setting) => {
          setting.settingEl.addClass("anki-sync-setting-paths");
          const container = setting.settingEl.createDiv({ cls: "anki-sync-path-container" });
          this.renderPathList(container, "include");
        }
      }
    ] satisfies SettingDefinitionItem[];
  }

  private pathsFor(kind: PathListKind): string[] {
    return kind === "ignore"
      ? this.plugin.settings.ignorePaths
      : this.plugin.settings.includePaths;
  }

  private setPaths(kind: PathListKind, paths: string[]): void {
    if (kind === "ignore") {
      this.plugin.settings.ignorePaths = paths;
    } else {
      this.plugin.settings.includePaths = paths;
    }
  }

  private renderPathList(container: HTMLElement, kind: PathListKind): void {
    container.empty();
    const list = container.createDiv({ cls: "anki-sync-path-list" });
    const paths = this.pathsFor(kind);

    if (paths.length === 0) {
      list.createDiv({
        cls: "anki-sync-path-empty",
        text: kind === "ignore" ? "尚未添加忽略路径" : "尚未添加仅检测路径"
      });
    } else {
      paths.forEach((path, index) => this.renderPathRow(list, kind, path, index));
    }

    const addRow = container.createDiv({ cls: "anki-sync-path-add" });
    const input = addRow.createEl("input", {
      cls: "anki-sync-path-input",
      attr: {
        type: "text",
        placeholder: kind === "ignore"
          ? "例如：模板/ 或 日记/2026-*.md"
          : "例如：学习/ 或 卡片/*.md"
      }
    });
    const buttons = addRow.createDiv({ cls: "anki-sync-path-buttons" });
    const addButton = buttons.createEl("button", {
      text: "添加",
      attr: { type: "button" }
    });
    addButton.addClass("mod-cta");
    const browseButton = buttons.createEl("button", {
      text: "选择…",
      attr: { type: "button", "aria-label": "从 Vault 中选择文件或文件夹" }
    });
    browseButton.addEventListener("click", () => {
      new VaultPathSuggestModal(this.app, (path) => {
        void this.addPaths(kind, [path], container);
      }).open();
    });
    const submit = async (): Promise<void> => {
      const value = input.value.trim();
      if (!value) return;
      input.value = "";
      await this.addPaths(kind, [value], container);
    };
    addButton.addEventListener("click", () => {
      void submit();
    });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    });
  }

  private async addPaths(
    kind: PathListKind,
    additions: string[],
    container: HTMLElement
  ): Promise<void> {
    const current = [...this.pathsFor(kind)];
    const known = new Set(current.map(normalizeVaultPath));
    for (const addition of additions) {
      const normalized = normalizeVaultPath(addition);
      if (!normalized || known.has(normalized)) continue;
      known.add(normalized);
      current.push(addition);
    }
    this.setPaths(kind, current);
    await this.plugin.saveSettings();
    this.renderPathList(container, kind);
  }

  private renderPathRow(
    list: HTMLElement,
    kind: PathListKind,
    path: string,
    index: number
  ): void {
    const row = list.createDiv({ cls: "anki-sync-path-row" });
    row.draggable = true;
    row.dataset.path = path;
    row.dataset.index = String(index);
    row.createSpan({ cls: "anki-sync-path-handle", text: "⠿", attr: { "aria-hidden": "true" } });
    row.createSpan({ cls: "anki-sync-path-value", text: path });
    const remove = row.createEl("button", {
      cls: "anki-sync-path-remove",
      text: "✕",
      attr: { type: "button", "aria-label": `移除 ${path}` }
    });
    remove.addEventListener("click", () => {
      this.setPaths(
        kind,
        this.pathsFor(kind).filter((value) => value !== path)
      );
      void this.plugin.saveSettings().then(() => {
        this.renderPathList(list.parentElement ?? list, kind);
      });
    });

    row.addEventListener("dragstart", (event) => {
      row.addClass("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", path);
      }
    });
    row.addEventListener("dragend", () => {
      row.removeClass("is-dragging");
      void this.persistPathOrder(list, kind);
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      const dragging = list.querySelector<HTMLElement>(".anki-sync-path-row.is-dragging");
      if (!dragging || dragging === row) return;
      const rect = row.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      list.insertBefore(dragging, insertAfter ? row.nextSibling : row);
    });
  }

  private async persistPathOrder(list: HTMLElement, kind: PathListKind): Promise<void> {
    const ordered = Array.from(list.querySelectorAll<HTMLElement>(".anki-sync-path-row"))
      .map((row) => row.dataset.path)
      .filter((path): path is string => typeof path === "string" && path.length > 0);
    if (ordered.length === 0) return;
    this.setPaths(kind, ordered);
    await this.plugin.saveSettings();
  }

  // Obsidian < 1.13 uses display(); share definitions to keep both UIs in sync.
  display(): void {
    this.containerEl.empty();
    for (const definition of this.getSettingDefinitions()) {
      const setting = new Setting(this.containerEl).setName(definition.name);
      if (definition.desc) setting.setDesc(definition.desc);
      definition.render(setting);
    }
  }
}
