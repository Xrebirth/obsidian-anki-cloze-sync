import { Notice, requestUrl } from "obsidian";
import {
  BASE_CARD_CSS,
  BASIC_CODE_BACK,
  BASIC_CODE_CSS,
  BASIC_CODE_FRONT,
  CHOICE_BACK,
  CHOICE_FRONT,
  CLOZE_BACK,
  CLOZE_FRONT,
  IMAGE_OCCLUSION_BACK,
  IMAGE_OCCLUSION_FRONT,
  PLAIN_BASIC_BACK,
  PLAIN_BASIC_FRONT
} from "./anki-templates";

interface AnkiResponse<T> {
  result: T;
  error: string | null;
}

interface AnkiAction {
  action: string;
  params: Record<string, unknown>;
}

interface AddNoteParams {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags?: string[];
  options: { allowDuplicate: boolean };
}

export interface AnkiNoteField {
  value: string;
  order: number;
}

export interface AnkiNoteInfo {
  noteId: number;
  modelName: string;
  tags: string[];
  cards: number[];
  fields?: Record<string, AnkiNoteField | string>;
}

let modelEditorWarningShown = false;

export class AnkiConnectClient {
  constructor(private readonly endpoint: string) {}

  async invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    let response;
    try {
      response = await requestUrl({
        url: this.endpoint,
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({ action, version: 6, params }),
        throw: false
      });
    } catch (error) {
      const detail = error instanceof Error ? `（${error.message}）` : "";
      throw new Error(
        `无法连接到 AnkiConnect（${this.endpoint}）。请确认 Anki 已开启且已安装 AnkiConnect。${detail}`
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`AnkiConnect 返回 HTTP ${response.status}`);
    }

    const payload = response.json as AnkiResponse<T>;
    if (payload.error) throw new Error(`AnkiConnect：${payload.error}`);
    return payload.result;
  }

  async ensureDeck(deckName: string): Promise<void> {
    await this.invoke<number>("createDeck", { deck: deckName });
  }

  async ensureClozeModel(modelName: string): Promise<void> {
    await this.ensureModel(
      modelName,
      ["Text", "Back Extra"],
      [
        {
          Name: "Cloze",
          Front: CLOZE_FRONT,
          Back: CLOZE_BACK
        }
      ],
      true
    );

    await this.syncModelTemplate(
      modelName,
      "Cloze",
      CLOZE_FRONT,
      CLOZE_BACK,
      BASE_CARD_CSS
    );
  }

  async ensureBasicModel(modelName: string): Promise<void> {
    await this.ensureModel(
      modelName,
      ["Front", "Back"],
      [
        {
          Name: "Card 1",
          Front: BASIC_CODE_FRONT,
          Back: BASIC_CODE_BACK
        }
      ],
      false,
      BASIC_CODE_CSS
    );

    await this.syncModelTemplate(
      modelName,
      "Card 1",
      BASIC_CODE_FRONT,
      BASIC_CODE_BACK,
      BASIC_CODE_CSS
    );
  }

  async ensurePlainBasicModel(modelName: string): Promise<void> {
    await this.ensureModel(
      modelName,
      ["Front", "Back"],
      [
        {
          Name: "Card 1",
          Front: PLAIN_BASIC_FRONT,
          Back: PLAIN_BASIC_BACK
        }
      ],
      false,
      BASE_CARD_CSS
    );

    await this.syncModelTemplate(
      modelName,
      "Card 1",
      PLAIN_BASIC_FRONT,
      PLAIN_BASIC_BACK,
      BASE_CARD_CSS
    );
  }

  async ensureImageOcclusionModel(modelName: string): Promise<void> {
    await this.ensureModel(
      modelName,
      ["Image", "Mask", "Answer", "Back Extra"],
      [
        {
          Name: "Card 1",
          Front: IMAGE_OCCLUSION_FRONT,
          Back: IMAGE_OCCLUSION_BACK
        }
      ],
      false,
      BASE_CARD_CSS
    );

    await this.syncModelTemplate(
      modelName,
      "Card 1",
      IMAGE_OCCLUSION_FRONT,
      IMAGE_OCCLUSION_BACK,
      BASE_CARD_CSS
    );
  }

  async ensureChoiceModel(modelName: string): Promise<void> {
    await this.ensureModel(
      modelName,
      ["Question", "Options", "Explanation", "Mode", "Back Extra"],
      [
        {
          Name: "Card 1",
          Front: CHOICE_FRONT,
          Back: CHOICE_BACK
        }
      ],
      false,
      BASE_CARD_CSS
    );

    await this.syncModelTemplate(
      modelName,
      "Card 1",
      CHOICE_FRONT,
      CHOICE_BACK,
      BASE_CARD_CSS
    );
  }

  /**
   * Updates templates/CSS only when they differ. Anki refuses model writes
   * while a card editor has the model open ("Close the affected editor...");
   * in that case the existing model is kept and syncing can continue.
   */
  private async syncModelTemplate(
    modelName: string,
    preferredTemplateName: string,
    front: string,
    back: string,
    css: string
  ): Promise<void> {
    const templates = await this.invoke<Record<string, { Front: string; Back: string }>>(
      "modelTemplates",
      { modelName }
    );
    const templateName = Object.prototype.hasOwnProperty.call(
      templates,
      preferredTemplateName
    )
      ? preferredTemplateName
      : Object.keys(templates)[0];
    if (!templateName) {
      throw new Error(`Anki 笔记类型「${modelName}」没有可更新的卡片模板。`);
    }
    const current = templates[templateName];
    if (current?.Front !== front || current?.Back !== back) {
      await this.tryModelWrite("updateModelTemplates", {
        model: {
          name: modelName,
          templates: { [templateName]: { Front: front, Back: back } }
        }
      });
    }

    let currentCss: string | null = null;
    try {
      const styling = await this.invoke<{ css: string }>("modelStyling", { modelName });
      currentCss = styling.css;
    } catch {
      // Older AnkiConnect builds may not expose modelStyling.
    }
    if (currentCss !== null && currentCss !== css) {
      await this.tryModelWrite("updateModelStyling", {
        model: { name: modelName, css }
      });
    }
  }

  private async tryModelWrite(
    action: string,
    params: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.invoke(action, params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Close the affected editor/i.test(message)) {
        if (!modelEditorWarningShown) {
          modelEditorWarningShown = true;
          new Notice("请先关闭 Anki 的浏览或编辑窗口，再重新同步。", 8000);
        }
        console.warn(`Anki model is open in an editor; skipped ${action}.`);
        return;
      }
      throw error;
    }
  }

  private async ensureModel(
    modelName: string,
    fields: string[],
    cardTemplates: Array<{ Name: string; Front: string; Back: string }>,
    isCloze: boolean,
    css = BASE_CARD_CSS
  ): Promise<void> {
    const models = await this.invoke<string[]>("modelNames");

    if (!models.includes(modelName)) {
      await this.invoke("createModel", {
        modelName,
        inOrderFields: fields,
        css,
        isCloze,
        cardTemplates
      });
      return;
    }

    const existingFields = await this.invoke<string[]>("modelFieldNames", { modelName });
    const missingFields = fields.filter((field) => !existingFields.includes(field));
    if (missingFields.length > 0) {
      throw new Error(
        `Anki 笔记类型「${modelName}」缺少必要字段：${missingFields.join("、")}。`
      );
    }
  }

  async findBySyncIds(syncIds: string[]): Promise<Map<string, number[]>> {
    const uniqueIds = [...new Set(syncIds)];
    const result = new Map<string, number[]>();
    if (uniqueIds.length === 0) return result;
    const actions: AnkiAction[] = uniqueIds.map((syncId) => ({
      action: "findNotes",
      params: { query: `tag:obsidian_sync_id_${syncId}` }
    }));
    const responses = await this.invoke<Array<AnkiResponse<number[]>>>("multi", { actions });
    if (responses.length !== uniqueIds.length) {
      throw new Error("AnkiConnect multi 返回的结果数量不正确。");
    }
    for (let index = 0; index < uniqueIds.length; index += 1) {
      const response = responses[index];
      if (!response) throw new Error("AnkiConnect multi 缺少查询结果。");
      if (response.error) throw new Error(`AnkiConnect：${response.error}`);
      result.set(uniqueIds[index] as string, response.result);
    }
    return result;
  }

  findByFileId(fileId: string): Promise<number[]> {
    return this.invoke<number[]>("findNotes", { query: `tag:obsidian_file_id_${fileId}` });
  }

  findByLegacyFileTag(fileTag: string): Promise<number[]> {
    return this.invoke<number[]>("findNotes", { query: `tag:${fileTag}` });
  }

  addNote(note: AddNoteParams): Promise<number> {
    return this.invoke<number>("addNote", { note });
  }

  updateNote(noteId: number, fields: Record<string, string>): Promise<void> {
    return this.invoke<void>("updateNoteFields", { note: { id: noteId, fields } });
  }

  notesInfo(noteIds: number[]): Promise<AnkiNoteInfo[]> {
    if (noteIds.length === 0) return Promise.resolve([]);
    return this.invoke<AnkiNoteInfo[]>("notesInfo", { notes: noteIds });
  }

  addTags(noteIds: number[], tags: string[]): Promise<void> {
    if (noteIds.length === 0 || tags.length === 0) return Promise.resolve();
    return this.invoke<void>("addTags", { notes: noteIds, tags: tags.join(" ") });
  }

  removeTags(noteIds: number[], tags: string[]): Promise<void> {
    if (noteIds.length === 0 || tags.length === 0) return Promise.resolve();
    return this.invoke<void>("removeTags", { notes: noteIds, tags: tags.join(" ") });
  }

  changeDeck(cardIds: number[], deckName: string): Promise<void> {
    if (cardIds.length === 0) return Promise.resolve();
    return this.invoke<void>("changeDeck", { cards: cardIds, deck: deckName });
  }

  suspendCards(cardIds: number[]): Promise<void> {
    if (cardIds.length === 0) return Promise.resolve();
    return this.invoke<void>("suspend", { cards: cardIds });
  }

  unsuspendCards(cardIds: number[]): Promise<void> {
    if (cardIds.length === 0) return Promise.resolve();
    return this.invoke<void>("unsuspend", { cards: cardIds });
  }

  storeMediaFile(filename: string, base64Data: string): Promise<string> {
    return this.invoke<string>("storeMediaFile", { filename, data: base64Data });
  }

  async deleteNotes(noteIds: number[]): Promise<void> {
    if (noteIds.length === 0) return;
    await this.invoke<void>("deleteNotes", { notes: noteIds });
    let remaining = await this.existingNoteIds(noteIds);
    if (remaining.length === 0) return;

    // Some AnkiConnect/Anki combinations occasionally ignore a batch delete.
    // Retry one note at a time before reporting a failure.
    for (const noteId of remaining) {
      await this.invoke<void>("deleteNotes", { notes: [noteId] });
    }
    remaining = await this.existingNoteIds(remaining);
    if (remaining.length === 0) return;

    // Suspended notes should still be deletable, but unsuspending first is a
    // safe fallback for AnkiConnect builds that refuse to remove them.
    const infos = await this.notesInfo(remaining);
    const cards = infos.flatMap((info) => info.cards ?? []);
    if (cards.length > 0) {
      try {
        await this.unsuspendCards(cards);
      } catch {
        // Ignore: the note may already be gone or the cards may be invalid.
      }
      await this.invoke<void>("deleteNotes", { notes: remaining });
      remaining = await this.existingNoteIds(remaining);
    }
    if (remaining.length > 0) {
      throw new Error(
        `AnkiConnect 返回删除成功，但以下 Anki note 仍然存在：${remaining.join("、")}`
      );
    }
  }

  private async existingNoteIds(noteIds: number[]): Promise<number[]> {
    if (noteIds.length === 0) return [];
    const infos = await this.invoke<Array<{ noteId?: number }>>("notesInfo", {
      notes: noteIds
    });
    return infos
      .filter(
        (info) => info && typeof info.noteId === "number" && info.noteId > 0
      )
      .map((info) => info.noteId as number);
  }
}
