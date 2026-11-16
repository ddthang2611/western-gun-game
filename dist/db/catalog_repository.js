"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogRepository = void 0;
const database_1 = require("./database");
class CatalogRepository {
    static instance;
    cards = new Map();
    templates = new Map();
    characters = new Map();
    roles = new Map();
    events = new Map();
    symbols = new Map();
    uiComponents = new Map();
    settings = new Map();
    meta = new Map();
    initialized = false;
    static getInstance() {
        if (!CatalogRepository.instance) {
            CatalogRepository.instance = new CatalogRepository();
        }
        return CatalogRepository.instance;
    }
    initialize() {
        if (this.initialized) {
            return this.getSummary();
        }
        const db = (0, database_1.getCatalogDatabase)();
        const metaRows = db.prepare("SELECT * FROM db_meta").all();
        this.meta.clear();
        for (const row of metaRows) {
            this.meta.set(row.key, row.value);
        }
        const symbolRows = db.prepare("SELECT * FROM symbol_lexicon").all();
        this.symbols.clear();
        for (const row of symbolRows) {
            this.symbols.set(row.symbol_code, row.meaning_en);
        }
        const templateRows = db.prepare("SELECT * FROM card_templates").all();
        this.templates.clear();
        for (const row of templateRows) {
            this.templates.set(row.template_id, row);
        }
        const cardRows = db.prepare("SELECT * FROM cards ORDER BY seq ASC").all();
        this.cards.clear();
        for (const row of cardRows) {
            this.cards.set(row.card_id, row);
        }
        const charRows = db.prepare("SELECT * FROM characters").all();
        this.characters.clear();
        for (const row of charRows) {
            this.characters.set(row.character_id, row);
        }
        const roleRows = db.prepare("SELECT * FROM roles").all();
        this.roles.clear();
        for (const row of roleRows) {
            this.roles.set(row.role_id, row);
        }
        const eventRows = db.prepare("SELECT * FROM events").all();
        this.events.clear();
        for (const row of eventRows) {
            this.events.set(row.event_id, row);
        }
        const uiRows = db.prepare("SELECT * FROM ui_components").all();
        this.uiComponents.clear();
        for (const row of uiRows) {
            this.uiComponents.set(row.component_id, row);
        }
        const settingRows = db.prepare("SELECT * FROM game_settings").all();
        this.settings.clear();
        for (const row of settingRows) {
            this.settings.set(row.setting_key, row.setting_value);
        }
        this.initialized = true;
        return this.getSummary();
    }
    isInitialized() {
        return this.initialized;
    }
    getSummary() {
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
    getAllCards() {
        return Array.from(this.cards.values());
    }
    getCard(cardId) {
        return this.cards.get(cardId);
    }
    getCardsByTemplate(templateId) {
        const results = [];
        for (const card of this.cards.values()) {
            if (card.template_id === templateId) {
                results.push(card);
            }
        }
        return results;
    }
    getCardsByPack(pack) {
        const results = [];
        for (const card of this.cards.values()) {
            if (card.pack === pack) {
                results.push(card);
            }
        }
        return results;
    }
    // Card Templates
    getAllTemplates() {
        return Array.from(this.templates.values());
    }
    getTemplate(templateId) {
        return this.templates.get(templateId);
    }
    // Characters
    getAllCharacters() {
        return Array.from(this.characters.values());
    }
    getCharacter(characterId) {
        return this.characters.get(characterId);
    }
    getCharactersByPack(pack) {
        const results = [];
        for (const char of this.characters.values()) {
            if (char.pack === pack) {
                results.push(char);
            }
        }
        return results;
    }
    // Roles
    getAllRoles() {
        return Array.from(this.roles.values());
    }
    getRole(roleId) {
        return this.roles.get(roleId);
    }
    // Events
    getAllEvents() {
        return Array.from(this.events.values());
    }
    getEvent(eventId) {
        return this.events.get(eventId);
    }
    getEventsByPack(pack) {
        const results = [];
        for (const ev of this.events.values()) {
            if (ev.pack === pack) {
                results.push(ev);
            }
        }
        return results;
    }
    // Symbols
    getSymbolMeaning(code) {
        return this.symbols.get(code);
    }
    getAllSymbols() {
        const obj = {};
        for (const [k, v] of this.symbols.entries()) {
            obj[k] = v;
        }
        return obj;
    }
    // UI Components
    getAllUiComponents() {
        return Array.from(this.uiComponents.values());
    }
    getUiComponent(componentId) {
        return this.uiComponents.get(componentId);
    }
    // Meta & Settings
    getMeta(key) {
        return this.meta.get(key);
    }
    getSetting(key) {
        return this.settings.get(key);
    }
}
exports.CatalogRepository = CatalogRepository;
