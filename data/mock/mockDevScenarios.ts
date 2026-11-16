import type {
  GameOverInfo,
  GeneralStoreInfo,
  PendingReactionInfo,
} from "../../client/src/types/game";

export const mockPendingReaction: PendingReactionInfo = {
  id: "mock_reaction_bang_01",
  type: "BANG_DEFENSE",
  sourcePlayerId: "opp_2",
  sourcePlayerName: "Jesse Jones",
  targetPlayerId: "me",
  sourceCard: {
    id: "mock_src_bang",
    name: "BANG!",
    border: "brown",
    rank: "A",
    suit: "spades",
    desc: "Shoot a target within weapon range. Requires Missed! to evade.",
    image: "/assets/images/cards/001_base_bang_A_spades.png",
  },
  requiredCard: "MISSED",
  requiredCount: 1,
  currentCount: 0,
  canUseBarrel: true,
  canUseJourdonnais: true,
  barrelChecked: false,
  jourdonnaisChecked: false,
};

export const mockGeneralStore: GeneralStoreInfo = {
  originPlayerId: "opp_2",
  originPlayerName: "Jesse Jones",
  currentPickerId: "me",
  currentPickerName: "Sheriff You",
  draftOrder: ["me", "opp_2", "opp_3", "opp_4"],
  currentPickerIndex: 0,
  pool: [
    {
      id: "gs_bang",
      name: "BANG!",
      border: "brown",
      rank: "K",
      suit: "hearts",
      desc: "Standard shot within weapon range.",
      image: "/assets/images/cards/024_base_bang_K_hearts.png",
    },
    {
      id: "gs_beer",
      name: "BEER",
      border: "brown",
      rank: "6",
      suit: "hearts",
      desc: "Recover 1 life point.",
      image: "/assets/images/cards/038_base_beer_6_hearts.png",
    },
    {
      id: "gs_panic",
      name: "PANIC!",
      border: "brown",
      rank: "Q",
      suit: "hearts",
      desc: "Steal 1 card from a player at distance 1.",
      image: "/assets/images/cards/049_base_panic_Q_hearts.png",
    },
    {
      id: "gs_cat_balou",
      name: "CAT BALOU",
      border: "brown",
      rank: "K",
      suit: "hearts",
      desc: "Force any player to discard 1 card.",
      image: "/assets/images/cards/044_base_cat_balou_K_hearts.png",
    },
  ],
};

export const mockGameOver: GameOverInfo = {
  winner: "SHERIFF_AND_DEPUTIES",
  message: "All Outlaws and Renegades have been eliminated. Law returns to Tombstone.",
};
