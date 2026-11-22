import crypto from "crypto";
import { EngineCard } from "../types/cards";
import { SimulationState } from "../types/state";
import { DomainEvent } from "../types/actions";

export class DeckManager {
  private drawDeck: EngineCard[] = [];
  private discardPile: EngineCard[] = [];

  constructor(initialCards: EngineCard[] = []) {
    if (initialCards.length > 0) {
      this.drawDeck = this.shuffle(initialCards);
    }
  }

  // Fisher-Yates shuffle with CSPRNG
  public static shuffleCards<T>(cards: T[]): T[] {
    const list = [...cards];
    for (let i = list.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // Reshuffle discard pile under deck
  public static reshuffleDiscardIntoDeck(state: SimulationState): DomainEvent | null {
    if (state.discardPile.length === 0) return null;

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
  public static drawCards(
    state: SimulationState,
    count: number
  ): { cards: EngineCard[]; events: DomainEvent[]; reshuffled: boolean } {
    const cards: EngineCard[] = [];
    const events: DomainEvent[] = [];
    let reshuffled = false;

    for (let i = 0; i < count; i++) {
      if (state.drawDeck.length === 0) {
        const reshuffleEvent = this.reshuffleDiscardIntoDeck(state);
        if (!reshuffleEvent) break;
        events.push(reshuffleEvent);
        reshuffled = true;
      }

      const card = state.drawDeck.pop();
      if (card) cards.push(card);
    }

    return { cards, events, reshuffled };
  }

  // Move card to state discard
  public static discardCard(state: SimulationState, card: EngineCard): void {
    state.discardPile.push(card);
  }

  // Move cards to state discard
  public static discardCards(state: SimulationState, cards: EngineCard[]): void {
    state.discardPile.push(...cards);
  }

  // Discard card respecting Abandoned Mine
  public static discardCardRespectingMine(
    state: SimulationState,
    card: EngineCard,
    deckManager?: DeckManager,
    isPhase3Excess: boolean = false
  ): void {
    if (
      state.activeEvent?.effectCode === "EVENT_FOC_ABANDONED_MINE" &&
      isPhase3Excess
    ) {
      if (deckManager) {
        deckManager.placeOnTopOfDeck(card);
      } else {
        this.placeOnTopOfDeck(state, card);
      }
      return;
    }

    if (deckManager) {
      deckManager.discard(card);
    } else {
      this.discardCard(state, card);
    }
  }

  // Discard cards respecting Abandoned Mine
  public static discardCardsRespectingMine(
    state: SimulationState,
    cards: EngineCard[],
    deckManager?: DeckManager,
    isPhase3Excess: boolean = false
  ): void {
    for (const card of cards) {
      this.discardCardRespectingMine(state, card, deckManager, isPhase3Excess);
    }
  }

  // Pop top card from discard
  public static drawTopDiscard(state: SimulationState): EngineCard | undefined {
    return state.discardPile.pop();
  }

  // Place card on deck top
  public static placeOnTopOfDeck(state: SimulationState, card: EngineCard): void {
    state.drawDeck.push(card);
  }

  // Alias for placing card back
  public static putBackOnTop(state: SimulationState, card: EngineCard): void {
    this.placeOnTopOfDeck(state, card);
  }

  // Instance shuffle helper
  public shuffle(cards: EngineCard[]): EngineCard[] {
    return DeckManager.shuffleCards(cards);
  }

  public getDrawDeckCount(): number {
    return this.drawDeck.length;
  }

  public getDiscardPileCount(): number {
    return this.discardPile.length;
  }

  public getTopDiscard(): EngineCard | undefined {
    return this.discardPile[this.discardPile.length - 1];
  }

  public getRawDrawDeck(): EngineCard[] {
    return this.drawDeck;
  }

  public getRawDiscardPile(): EngineCard[] {
    return this.discardPile;
  }

  // Instance draw preserving array references
  public draw(count: number): { cards: EngineCard[]; events: DomainEvent[] } {
    const drawn: EngineCard[] = [];
    const events: DomainEvent[] = [];

    for (let i = 0; i < count; i++) {
      if (this.drawDeck.length === 0) {
        if (this.discardPile.length === 0) break;

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
      if (card) drawn.push(card);
    }

    return { cards: drawn, events };
  }

  public discard(card: EngineCard): void {
    this.discardPile.push(card);
  }

  public discardMultiple(cards: EngineCard[]): void {
    this.discardPile.push(...cards);
  }

  public drawTopDiscard(): EngineCard | undefined {
    return this.discardPile.pop();
  }

  public placeOnTopOfDeck(card: EngineCard): void {
    this.drawDeck.push(card);
  }

  public putBackOnTop(card: EngineCard): void {
    this.placeOnTopOfDeck(card);
  }

  public peekTop(count: number): { cards: EngineCard[]; reshuffled: boolean } {
    if (count <= 0) return { cards: [], reshuffled: false };

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
    const cards: EngineCard[] = [];
    for (let i = 0; i < available; i++) {
      cards.push(this.drawDeck[this.drawDeck.length - 1 - i]);
    }

    return { cards, reshuffled };
  }
}
