export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type CardBorder = "brown" | "blue" | "green";
export type CardCategory = "action" | "weapon" | "equipment" | "green_delay" | "green_delayed" | "event" | string;

export interface EngineCard {
  id: string;
  seq: number;
  templateId: string;
  pack: string;
  name: string;
  border: CardBorder;
  category: CardCategory;
  weaponRange?: number;
  rank: Rank;
  suit: Suit;
  desc: string;
  image?: string;
  effectIcon?: string;
}

export interface EngineEventCard {
  id: string;
  pack: string;
  name: string;
  isFinalCard: boolean;
  effectCode: string;
  desc: string;
  image?: string;
}

export interface ActiveJudgement {
  id: string;
  card: EngineCard;
  type: "DYNAMITE" | "JAIL";
  attachedSeq: number;
  attachedTimestamp: number;
}

export interface ActiveGreenCard {
  id: string;
  card: EngineCard;
  isDelay: boolean;
  attachedTurnRound: number;
}
