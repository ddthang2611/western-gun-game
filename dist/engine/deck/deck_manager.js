"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeckManager = void 0;
const crypto_1 = __importDefault(require("crypto"));
class DeckManager {
    drawDeck = [];
    discardPile = [];
    constructor(initialCards = []) {
        if (initialCards.length > 0) {
            this.drawDeck = this.shuffle(initialCards);
        }
    }
    // Fisher-Yates shuffle with CSPRNG
    static shuffleCards(cards) {
        const list = [...cards];
        for (let i = list.length - 1; i > 0; i--) {
            const j = crypto_1.default.randomInt(0, i + 1);
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }
    // Reshuffle discard pile under deck
    static reshuffleDiscardIntoDeck(state) {
        if (state.discardPile.length === 0)
            return null;
        const existing = [...state.drawDeck];
        const shuffled = this.shuffleCards(state.discardPile);
        state.discardPile.length = 0;
        state.drawDeck.length = 0;
        state.drawDeck.push(...shuffled, ...existing);
        return {
            type: "DECK_RESHUFFLED",
            payload: {
                newDeckCount: state.drawDeck.length,
                message: "Draw deck exhausted. Discard pile shuffled into new draw deck.",
            },
            timestamp: Date.now(),
        };
    }
    // Draw cards from state deck
    static drawCards(state, count) {
        const cards = [];
        const events = [];
        let reshuffled = false;
        for (let i = 0; i < count; i++) {
            if (state.drawDeck.length === 0) {
                const reshuffleEvent = this.reshuffleDiscardIntoDeck(state);
                if (!reshuffleEvent)
                    break;
                events.push(reshuffleEvent);
                reshuffled = true;
            }
            const card = state.drawDeck.pop();
            if (card)
                cards.push(card);
        }
        return { cards, events, reshuffled };
    }
    // Move card to state discard
    static discardCard(state, card) {
        state.discardPile.push(card);
    }
    // Move cards to state discard
    static discardCards(state, cards) {
        state.discardPile.push(...cards);
    }
    // Pop top card from discard
    static drawTopDiscard(state) {
        return state.discardPile.pop();
    }
    // Place card on deck top
    static placeOnTopOfDeck(state, card) {
        state.drawDeck.push(card);
    }
    // Alias for placing card back
    static putBackOnTop(state, card) {
        this.placeOnTopOfDeck(state, card);
    }
    // Peek top cards without removing
    static peekTop(state, count) {
        if (count <= 0)
            return { cards: [], reshuffled: false, events: [] };
        let reshuffled = false;
        const events = [];
        if (state.drawDeck.length < count && state.discardPile.length > 0) {
            const ev = this.reshuffleDiscardIntoDeck(state);
            if (ev) {
                events.push(ev);
                reshuffled = true;
            }
        }
        const available = Math.min(count, state.drawDeck.length);
        const cards = [];
        for (let i = 0; i < available; i++) {
            cards.push(state.drawDeck[state.drawDeck.length - 1 - i]);
        }
        return { cards, reshuffled, events };
    }
    // Instance shuffle helper
    shuffle(cards) {
        return DeckManager.shuffleCards(cards);
    }
    getDrawDeckCount() {
        return this.drawDeck.length;
    }
    getDiscardPileCount() {
        return this.discardPile.length;
    }
    getTopDiscard() {
        return this.discardPile[this.discardPile.length - 1];
    }
    getRawDrawDeck() {
        return this.drawDeck;
    }
    getRawDiscardPile() {
        return this.discardPile;
    }
    // Instance draw preserving array references
    draw(count) {
        const drawn = [];
        const events = [];
        for (let i = 0; i < count; i++) {
            if (this.drawDeck.length === 0) {
                if (this.discardPile.length === 0)
                    break;
                const shuffled = this.shuffle(this.discardPile);
                this.discardPile.length = 0;
                this.drawDeck.push(...shuffled);
                events.push({
                    type: "DECK_RESHUFFLED",
                    payload: {
                        newDeckCount: this.drawDeck.length,
                        message: "Draw deck exhausted. Discard pile shuffled into new draw deck.",
                    },
                    timestamp: Date.now(),
                });
            }
            const card = this.drawDeck.pop();
            if (card)
                drawn.push(card);
        }
        return { cards: drawn, events };
    }
    discard(card) {
        this.discardPile.push(card);
    }
    discardMultiple(cards) {
        this.discardPile.push(...cards);
    }
    drawTopDiscard() {
        return this.discardPile.pop();
    }
    placeOnTopOfDeck(card) {
        this.drawDeck.push(card);
    }
    putBackOnTop(card) {
        this.placeOnTopOfDeck(card);
    }
    peekTop(count) {
        if (count <= 0)
            return { cards: [], reshuffled: false };
        let reshuffled = false;
        if (this.drawDeck.length < count && this.discardPile.length > 0) {
            const existing = [...this.drawDeck];
            const shuffled = this.shuffle(this.discardPile);
            this.discardPile.length = 0;
            this.drawDeck.length = 0;
            this.drawDeck.push(...shuffled, ...existing);
            reshuffled = true;
        }
        const available = Math.min(count, this.drawDeck.length);
        const cards = [];
        for (let i = 0; i < available; i++) {
            cards.push(this.drawDeck[this.drawDeck.length - 1 - i]);
        }
        return { cards, reshuffled };
    }
}
exports.DeckManager = DeckManager;
