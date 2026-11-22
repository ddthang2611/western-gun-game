import { getCatalogDatabase } from "./database";
import {
  CardRow,
  CardTemplateRow,
  CharacterRow,
  RoleRow,
  EventRow,
  SymbolLexiconRow,
  UiComponentRow,
  GameSettingRow,
  DbMetaRow,
} from "./schema";

export interface CatalogSummary {
  cardsCount: number;
  templatesCount: number;
  charactersCount: number;
  rolesCount: number;
  eventsCount: number;
  symbolsCount: number;
  schemaVersion: string;
}

export class CatalogRepository {
  private static instance: CatalogRepository;

  private cards: Map<string, CardRow> = new Map();
  private templates: Map<string, CardTemplateRow> = new Map();
  private characters: Map<string, CharacterRow> = new Map();
  private roles: Map<string, RoleRow> = new Map();
  private events: Map<string, EventRow> = new Map();
  private symbols: Map<string, string> = new Map();
  private symbolsVi: Map<string, string> = new Map();
  private uiComponents: Map<string, UiComponentRow> = new Map();
  private settings: Map<string, string> = new Map();
  private meta: Map<string, string> = new Map();

  private initialized = false;

  public static getInstance(): CatalogRepository {
    if (!CatalogRepository.instance) {
      CatalogRepository.instance = new CatalogRepository();
    }
    return CatalogRepository.instance;
  }

  public initialize(): CatalogSummary {
    if (this.initialized) {
      return this.getSummary();
    }

    const db = getCatalogDatabase();

    const metaRows = db.prepare("SELECT * FROM db_meta").all() as DbMetaRow[];
    this.meta.clear();
    for (const row of metaRows) {
      this.meta.set(row.key, row.value);
    }

    const symbolRows = db.prepare("SELECT * FROM symbol_lexicon").all() as SymbolLexiconRow[];
    this.symbols.clear();
    this.symbolsVi.clear();
    for (const row of symbolRows) {
      this.symbols.set(row.symbol_code, row.meaning_en);
      if (row.meaning_vi) {
        this.symbolsVi.set(row.symbol_code, row.meaning_vi);
      }
    }

    const templateRows = db.prepare("SELECT * FROM card_templates").all() as CardTemplateRow[];
    this.templates.clear();
    for (const row of templateRows) {
      this.templates.set(row.template_id, row);
    }

    const cardRows = db.prepare("SELECT * FROM cards ORDER BY seq ASC").all() as CardRow[];
    this.cards.clear();
    for (const row of cardRows) {
      this.cards.set(row.card_id, row);
    }

    const charRows = db.prepare("SELECT * FROM characters").all() as CharacterRow[];
    this.characters.clear();
    for (const row of charRows) {
      this.characters.set(row.character_id, row);
    }

    const roleRows = db.prepare("SELECT * FROM roles").all() as RoleRow[];
    this.roles.clear();
    for (const row of roleRows) {
      this.roles.set(row.role_id, row);
    }

    const eventRows = db.prepare("SELECT * FROM events").all() as EventRow[];
    this.events.clear();
    for (const row of eventRows) {
      this.events.set(row.event_id, row);
    }

    const uiRows = db.prepare("SELECT * FROM ui_components").all() as UiComponentRow[];
    this.uiComponents.clear();
    for (const row of uiRows) {
      this.uiComponents.set(row.component_id, row);
    }

    const settingRows = db.prepare("SELECT * FROM game_settings").all() as GameSettingRow[];
    this.settings.clear();
    for (const row of settingRows) {
      this.settings.set(row.setting_key, row.setting_value);
    }

    this.initialized = true;
    return this.getSummary();
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getSummary(): CatalogSummary {
    return {
      cardsCount: this.cards.size,
      templatesCount: this.templates.size,
      charactersCount: this.characters.size,
      rolesCount: this.roles.size,
      eventsCount: this.events.size,
      symbolsCount: this.symbols.size,
      schemaVersion: this.meta.get("schema_version") || "unknown",
    };
  }

  // Cards
  public getAllCards(): CardRow[] {
    return Array.from(this.cards.values());
  }

  public getCard(cardId: string): CardRow | undefined {
    return this.cards.get(cardId);
  }

  public getCardsByTemplate(templateId: string): CardRow[] {
    const results: CardRow[] = [];
    for (const card of this.cards.values()) {
      if (card.template_id === templateId) {
        results.push(card);
      }
    }
    return results;
  }

  public getCardsByPack(pack: string): CardRow[] {
    const results: CardRow[] = [];
    for (const card of this.cards.values()) {
      if (card.pack === pack) {
        results.push(card);
      }
    }
    return results;
  }

  // Card Templates
  public getAllTemplates(): CardTemplateRow[] {
    return Array.from(this.templates.values());
  }

  public getTemplate(templateId: string): CardTemplateRow | undefined {
    return this.templates.get(templateId);
  }

  // Characters
  public getAllCharacters(): CharacterRow[] {
    return Array.from(this.characters.values());
  }

  public getCharacter(characterId: string): CharacterRow | undefined {
    return this.characters.get(characterId);
  }

  public getCharactersByPack(pack: string): CharacterRow[] {
    const results: CharacterRow[] = [];
    for (const char of this.characters.values()) {
      if (char.pack === pack) {
        results.push(char);
      }
    }
    return results;
  }

  // Roles
  public getAllRoles(): RoleRow[] {
    return Array.from(this.roles.values());
  }

  public getRole(roleId: string): RoleRow | undefined {
    return this.roles.get(roleId);
  }

  // Events
  public getAllEvents(): EventRow[] {
    return Array.from(this.events.values());
  }

  public getEvent(eventId: string): EventRow | undefined {
    return this.events.get(eventId);
  }

  public getEventsByPack(pack: string): EventRow[] {
    const results: EventRow[] = [];
    for (const ev of this.events.values()) {
      if (ev.pack === pack) {
        results.push(ev);
      }
    }
    return results;
  }

  // Symbols
  public getSymbolMeaning(code: string): string | undefined {
    return this.symbols.get(code);
  }

  public getSymbolMeaningVi(code: string): string | undefined {
    return this.symbolsVi.get(code);
  }

  public getAllSymbols(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [k, v] of this.symbols.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  public getAllSymbolsVi(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [k, v] of this.symbolsVi.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  // UI Components
  public getAllUiComponents(): UiComponentRow[] {
    return Array.from(this.uiComponents.values());
  }

  public getUiComponent(componentId: string): UiComponentRow | undefined {
    return this.uiComponents.get(componentId);
  }

  // Meta & Settings
  public getMeta(key: string): string | undefined {
    return this.meta.get(key);
  }

  public getSetting(key: string): string | undefined {
    return this.settings.get(key);
  }
}
