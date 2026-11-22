import type { EventLocalization } from "../../types";

export const EVENTS_EN: Record<string, EventLocalization> = {
  hn_blessing: { name: "Blessing", desc: "The suit of all cards is Hearts." },
  hn_curse: { name: "Curse", desc: "The suit of all cards is Spades." },
  hn_ghost_town: {
    name: "Ghost Town",
    desc: "During their turn, eliminated players return as ghosts: they draw 3 cards, cannot die, and leave play at turn end.",
  },
  hn_gold_rush: {
    name: "Gold Rush",
    desc: "Turn order reverses counterclockwise, starting from the Sheriff.",
  },
  hn_hangover: { name: "Hangover", desc: "All characters lose their special abilities." },
  hn_high_noon: {
    name: "High Noon",
    desc: "Each player loses 1 life point at the start of their turn.",
  },
  hn_shootout: {
    name: "Shootout",
    desc: "Each player may play a second BANG! card during their turn.",
  },
  hn_the_daltons: {
    name: "The Daltons",
    desc: "When this enters play, each player with blue cards in play must remove 1 of their choice.",
  },
  hn_the_doctor: {
    name: "The Doctor",
    desc: "When this enters play, the player(s) with the fewest current life points regain 1 life point.",
  },
  hn_the_reverend: { name: "The Reverend", desc: "Players cannot play Beer cards." },
  hn_the_sermon: {
    name: "The Sermon",
    desc: "Players cannot play BANG! cards during their turn.",
  },
  hn_thirst: {
    name: "Thirst",
    desc: "Each player draws only 1 card instead of 2 during phase 1 of their turn.",
  },
  hn_train_arrival: {
    name: "Train Arrival",
    desc: "Each player draws 1 extra card at the end of phase 1 of their turn.",
  },
  foc_ambush: {
    name: "Ambush",
    desc: "Base distance between any two players is 1 (modified only by cards in play).",
  },
  foc_sniper: {
    name: "Sniper",
    desc: "During their turn, a player may spend 2 BANG! cards together against 1 target within range: counts as 1 BANG! requiring 2 Missed! effects to cancel.",
  },
  foc_dead_man: {
    name: "Dead Man",
    desc: "During their turn, the first eliminated player returns to play with 2 life points and draws 2 cards.",
  },
  foc_blood_brothers: {
    name: "Blood Brothers",
    desc: "At turn start, each player may lose 1 life point (except their last) to give 1 life point to any chosen player.",
  },
  foc_the_judge: {
    name: "The Judge",
    desc: "Players cannot place cards in front of themselves or any other player.",
  },
  foc_lasso: { name: "Lasso", desc: "Cards in play in front of players have no effect." },
  foc_law_of_the_west: {
    name: "Law of the West",
    desc: "During phase 1, each player reveals the second card drawn: if playable, they must play it during phase 2.",
  },
  foc_hard_liquor: {
    name: "Hard Liquor",
    desc: "Each player may skip phase 1 to regain 1 life point.",
  },
  foc_abandoned_mine: {
    name: "Abandoned Mine",
    desc: "During phase 1, each player draws from the discard pile and discards face up onto the deck.",
  },
  foc_fistful_of_cards: {
    name: "A Fistful of Cards",
    desc: "At the start of their turn, each player becomes the target of as many BANG! shots as cards in their hand.",
  },
  foc_peyote: {
    name: "Peyote",
    desc: "Instead of drawing in phase 1, guess red or black for the top deck card, draw and reveal it; repeat while correct.",
  },
  foc_ranch: {
    name: "Ranch",
    desc: "At the end of phase 1, each player may once discard any number of hand cards to draw that many from the deck.",
  },
  foc_ricochet: {
    name: "Ricochet",
    desc: "Players may shoot BANG! cards at cards in play in front of any player: the card is removed unless its owner cancels with Missed!.",
  },
  foc_russian_roulette: {
    name: "Russian Roulette",
    desc: "Starting from the Sheriff, each player plays a Missed! effect until one fails; that player loses 2 life points.",
  },
  foc_vendetta: {
    name: "Vendetta",
    desc: "At the end of their turn, each player checks the top card: on Hearts, they play another turn (without triggering Vendetta again).",
  },
};
