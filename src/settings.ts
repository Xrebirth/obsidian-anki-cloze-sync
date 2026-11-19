import { App, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type AnkiFlashcardSyncPlugin from "./main";
import { normalizeVaultPath } from "./ignore";

export class AnkiSyncSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: AnkiFlashcardSyncPlugin) {
    super(app, plugin);
    this.containerEl.addClass("anki-cloze-sync-settings");
  }

  getSettingDefinitions() {
    // Custom renderers preserve saveSettings(), including registry persistence
    // and cache invalidation, instead of the declarative API's default saveData().
    return [
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
        name: "卡片从 Markdown 移除后",
        desc: "建议先暂停：保留复习记录并暂停 Anki 卡片；永久删除会要求确认。",
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
        name: "忽略的文件路径",
        desc: "填写 Vault 相对路径，一行一个，可拖动排序；填写文件夹路径可忽略整个文件夹。支持 *、** 与 ? 通配符。被忽略的文件不会自动同步、参与整库同步或生成同步预览。",
        render: (setting: Setting) => {
          setting.settingEl.addClass("anki-sync-setting-ignore");
          const container = setting.settingEl.createDiv({ cls: "anki-sync-ignore-container" });
          this.renderIgnorePaths(container);
        }
      }
    ] satisfies SettingDefinitionItem[];
  }

  private renderIgnorePaths(container: HTMLElement): void {
    container.empty();
    const list = container.createDiv({ cls: "anki-sync-ignore-list" });
    const paths = this.plugin.settings.ignorePaths;

    if (paths.length === 0) {
      list.createDiv({ cls: "anki-sync-ignore-empty", text: "尚未添加忽略路径" });
    } else {
      paths.forEach((path, index) => this.renderIgnoreRow(list, path, index));
    }

    const addRow = container.createDiv({ cls: "anki-sync-ignore-add" });
    const input = addRow.createEl("textarea", {
      cls: "anki-sync-ignore-input",
      attr: {
        rows: "2",
        placeholder: "例如：\n模板/\n日记/2026-*.md"
      }
    });
    const addButton = addRow.createEl("button", { text: "添加" });
    const submit = async (): Promise<void> => {
      const additions = input.value
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      if (additions.length === 0) return;
      const known = new Set(paths.map(normalizeVaultPath));
      for (const addition of additions) {
        const normalized = normalizeVaultPath(addition);
        if (!normalized || known.has(normalized)) continue;
        known.add(normalized);
        this.plugin.settings.ignorePaths = [...this.plugin.settings.ignorePaths, addition];
      }
      input.value = "";
      await this.plugin.saveSettings();
      this.renderIgnorePaths(container);
    };
    addButton.addEventListener("click", () => {
      void submit();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void submit();
      }
    });
  }

  private renderIgnoreRow(list: HTMLElement, path: string, index: number): void {
    const row = list.createDiv({ cls: "anki-sync-ignore-row" });
    row.draggable = true;
    row.dataset.path = path;
    row.dataset.index = String(index);
    row.createSpan({ cls: "anki-sync-ignore-handle", text: "⠿", attr: { "aria-hidden": "true" } });
    row.createSpan({ cls: "anki-sync-ignore-path", text: path });
    const remove = row.createEl("button", {
      cls: "anki-sync-ignore-remove",
      text: "✕",
      attr: { type: "button", "aria-label": `移除 ${path}` }
    });
    remove.addEventListener("click", () => {
      this.plugin.settings.ignorePaths = this.plugin.settings.ignorePaths.filter(
        (value) => value !== path
      );
      void this.plugin.saveSettings().then(() => {
        this.renderIgnorePaths(list.parentElement ?? list);
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
      void this.persistIgnoreOrder(list);
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      const dragging = list.querySelector<HTMLElement>(".anki-sync-ignore-row.is-dragging");
      if (!dragging || dragging === row) return;
      const rect = row.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      list.insertBefore(dragging, insertAfter ? row.nextSibling : row);
    });
  }

  private async persistIgnoreOrder(list: HTMLElement): Promise<void> {
    const ordered = Array.from(list.querySelectorAll<HTMLElement>(".anki-sync-ignore-row"))
      .map((row) => row.dataset.path)
      .filter((path): path is string => typeof path === "string" && path.length > 0);
    if (ordered.length === 0) return;
    this.plugin.settings.ignorePaths = ordered;
    await this.plugin.saveSettings();
  }

  // Obsidian < 1.13 uses display(); share definitions to keep both UIs in sync.
  display(): void {
    this.containerEl.empty();
    for (const definition of this.getSettingDefinitions()) {
      const setting = new Setting(this.containerEl)
        .setName(definition.name)
        .setDesc(definition.desc);
      definition.render(setting);
    }
  }
}
