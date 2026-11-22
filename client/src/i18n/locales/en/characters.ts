import type { CharacterLocalization } from "../../types";

export const CHARACTERS_EN: Record<string, CharacterLocalization> = {
  char_bart_cassidy: {
    name: "Bart Cassidy",
    desc: "Each time he loses 1 life point, he immediately draws 1 card from the deck.",
    symbolDesc: "4 Life Points. Each time he loses 1 life point, he immediately draws 1 card from the deck.",
  },
  char_black_jack: {
    name: "Black Jack",
    desc: "During phase 1, he reveals the second card he draws; if it is Hearts or Diamonds, he draws 1 extra card.",
    symbolDesc: "4 Life Points. In phase 1, reveals his second drawn card: if Hearts or Diamonds, draws 1 extra card.",
  },
  char_calamity_janet: {
    name: "Calamity Janet",
    desc: "She can play BANG! cards as Missed! cards and Missed! cards as BANG! cards.",
    symbolDesc: "4 Life Points. She can play BANG! cards as Missed! and Missed! cards as BANG!.",
  },
  char_el_gringo: {
    name: "El Gringo",
    desc: "Each time he loses 1 life point due to another player's card, he steals 1 random card from their hand.",
    symbolDesc: "3 Life Points. Each time he loses 1 HP from another player's card, steals 1 random card from their hand.",
  },
  char_jesse_jones: {
    name: "Jesse Jones",
    desc: "During phase 1, he may steal his first card from any player's hand instead of drawing from the deck.",
    symbolDesc: "4 Life Points. During phase 1, may steal his first card from any player's hand instead of the deck.",
  },
  char_jourdonnais: {
    name: "Jourdonnais",
    desc: "Whenever he is targeted by a BANG!, he may check the top card: on Hearts, the shot is canceled.",
    symbolDesc: "4 Life Points. Built-in Barrel: check the top card when targeted by BANG!—on Hearts, cancel 1 shot.",
  },
  char_kit_carlson: {
    name: "Kit Carlson",
    desc: "During phase 1, he looks at the top 3 cards, chooses 2 into hand, and returns 1 to the top.",
    symbolDesc: "4 Life Points. During phase 1, looks at top 3 cards, keeps 2, puts 1 back on top.",
  },
  char_lucky_duke: {
    name: "Lucky Duke",
    desc: "Each time he must perform a Check, he checks the top 2 cards and chooses which result to apply.",
    symbolDesc: "4 Life Points. Each time he performs a Check, reveals top 2 cards and picks the result.",
  },
  char_paul_regret: {
    name: "Paul Regret",
    desc: "All other players view him at a distance increased by +1.",
    symbolDesc: "3 Life Points. Built-in Mustang: all other players view him at distance +1.",
  },
  char_pedro_ramirez: {
    name: "Pedro Ramirez",
    desc: "During phase 1, he may draw his first card from the top of the discard pile instead of the deck.",
    symbolDesc: "4 Life Points. During phase 1, may take his first card from the discard pile instead of the deck.",
  },
  char_rose_doolan: {
    name: "Rose Doolan",
    desc: "She views all other players at a distance decreased by -1 (minimum 1).",
    symbolDesc: "4 Life Points. Built-in Scope: views all other players at distance -1 (minimum 1).",
  },
  char_sid_ketchum: {
    name: "Sid Ketchum",
    desc: "At any time, he may discard 2 cards from his hand to regain 1 life point.",
    symbolDesc: "4 Life Points. At any time, may discard 2 hand cards to regain 1 life point.",
  },
  char_slab_the_killer: {
    name: "Slab the Killer",
    desc: "Players targeted by his BANG! must cancel it twice (2 Missed! effects).",
    symbolDesc: "4 Life Points. Targets of his BANG! must play 2 Missed! effects to cancel the shot.",
  },
  char_suzy_lafayette: {
    name: "Suzy Lafayette",
    desc: "As soon as she has no cards left in hand, she immediately draws 1 card from the deck.",
    symbolDesc: "4 Life Points. Whenever her hand becomes empty, immediately draws 1 card from the deck.",
  },
  char_vulture_sam: {
    name: "Vulture Sam",
    desc: "Whenever another player is eliminated, he takes all of their cards (in hand and in play) into his hand.",
    symbolDesc: "4 Life Points. Whenever a player is eliminated, takes all their cards from hand and play.",
  },
  char_willy_the_kid: {
    name: "Willy the Kid",
    desc: "He can play any number of BANG! cards during his turn.",
    symbolDesc: "4 Life Points. Built-in Volcanic: no limit on BANG! cards played per turn.",
  },
  char_apache_kid: {
    name: "Apache Kid",
    desc: "Cards of the Diamonds suit played by other players have no effect on him.",
    symbolDesc: "3 Life Points. Immune to cards of Diamonds played by other players.",
  },
  char_belle_star: {
    name: "Belle Star",
    desc: "During her turn, no cards in play (blue or green) in front of any other player have any effect.",
    symbolDesc: "4 Life Points. During her turn, all blue and green cards in play on others are ignored.",
  },
  char_bill_noface: {
    name: "Bill Noface",
    desc: "During phase 1, he draws 1 card plus 1 extra card for each wound (missing HP) he has.",
    symbolDesc: "4 Life Points. During phase 1, draws 1 card + 1 extra per missing life point.",
  },
  char_chuck_wengam: {
    name: "Chuck Wengam",
    desc: "During his turn, he may lose 1 life point (except his last one) to draw 2 cards.",
    symbolDesc: "4 Life Points. During his turn, may lose 1 HP (except his last) to draw 2 cards.",
  },
  char_doc_holyday: {
    name: "Doc Holyday",
    desc: "Once during his turn, he may discard any 2 cards from hand to shoot a BANG! (does not count toward BANG! limit).",
    symbolDesc: "4 Life Points. Once per turn, discard 2 hand cards to shoot a free BANG!.",
  },
  char_elena_fuente: {
    name: "Elena Fuente",
    desc: "She may play any card from her hand as a Missed! card.",
    symbolDesc: "3 Life Points. Any card in her hand can be played as a Missed! effect.",
  },
  char_greg_digger: {
    name: "Greg Digger",
    desc: "Each time another player is eliminated, he regains 2 life points.",
    symbolDesc: "4 Life Points. Each time another player is eliminated, regains 2 life points.",
  },
  char_herb_hunter: {
    name: "Herb Hunter",
    desc: "Each time another player is eliminated, he draws 2 extra cards from the deck.",
    symbolDesc: "4 Life Points. Each time another player is eliminated, draws 2 extra cards.",
  },
  char_jose_delgado: {
    name: "Jose Delgado",
    desc: "Up to twice during his turn, he may discard a blue card from his hand to draw 2 cards.",
    symbolDesc: "4 Life Points. Up to twice per turn, discard 1 blue card from hand to draw 2 cards.",
  },
  char_molly_stark: {
    name: "Molly Stark",
    desc: "Each time she plays or voluntarily discards a card from her hand out of turn, she draws 1 card.",
    symbolDesc: "4 Life Points. Whenever she uses or discards a hand card outside her turn, draws 1 card.",
  },
  char_pat_brennan: {
    name: "Pat Brennan",
    desc: "During phase 1, instead of drawing 2 cards from the deck, he may steal 1 card in play in front of any player.",
    symbolDesc: "4 Life Points. During phase 1, may steal 1 card in play from any player instead of drawing.",
  },
  char_pixie_pete: {
    name: "Pixie Pete",
    desc: "During phase 1, he draws 3 cards from the deck instead of 2.",
    symbolDesc: "3 Life Points. During phase 1, draws 3 cards instead of 2.",
  },
  char_sean_mallory: {
    name: "Sean Mallory",
    desc: "At the end of his turn (phase 3), he may hold up to 10 cards in hand instead of his life points limit.",
    symbolDesc: "3 Life Points. Hand limit at turn end is 10 cards instead of current HP.",
  },
  char_tequila_joe: {
    name: "Tequila Joe",
    desc: "Each time he plays a Beer card, he regains 2 life points instead of 1.",
    symbolDesc: "4 Life Points. His Beer cards restore 2 life points instead of 1.",
  },
  char_vera_custer: {
    name: "Vera Custer",
    desc: "At the start of her turn (before phase 1), she copies another living character's ability until her next turn.",
    symbolDesc: "3 Life Points. Before phase 1, picks another living character and copies their ability for 1 round.",
  },
};
