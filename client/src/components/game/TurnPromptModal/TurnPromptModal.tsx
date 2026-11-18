import React from "react";
import type {
  Card,
  GameActionPayload,
  PendingPhase1ChoiceInfo,
  PendingTurnStartChoiceInfo,
  Player,
} from "../../../types/game";
import { TurnStartPrompts } from "./TurnStartPrompts";
import { Phase1Prompts } from "./Phase1Prompts";
import "./TurnPromptModal.scss";

export interface TurnPromptModalProps {
  turnStartChoice?: PendingTurnStartChoiceInfo | null;
  phase1Choice?: PendingPhase1ChoiceInfo | null;
  players: Player[];
  myHand: Card[];
  myPlayerId: string;
  topDiscard?: Card;
  disabled?: boolean;
  isPickerOpen?: boolean;
  onResolveTurnStart: (payload: GameActionPayload) => void;
  onResolvePhase1: (payload: GameActionPayload) => void;
  onOpenStealPicker?: (
    mode: "JESSE_STEAL_AND_DECK" | "PAT_BRENNAN_STEAL",
    targetPlayer: Player
  ) => void;
}

export const TurnPromptModal: React.FC<TurnPromptModalProps> = ({
  turnStartChoice,
  phase1Choice,
  players,
  myHand,
  myPlayerId,
  topDiscard,
  disabled = false,
  isPickerOpen = false,
  onResolveTurnStart,
  onResolvePhase1,
  onOpenStealPicker,
}) => {
  if (isPickerOpen) {
    return null;
  }

  if (turnStartChoice && turnStartChoice.playerId === myPlayerId) {
    return (
      <TurnStartPrompts
        key={`${turnStartChoice.type}:${turnStartChoice.playerId}`}
        choice={turnStartChoice}
        players={players}
        disabled={disabled}
        onResolveTurnStart={onResolveTurnStart}
      />
    );
  }

  if (!phase1Choice || phase1Choice.playerId !== myPlayerId) {
    return null;
  }

  return (
    <Phase1Prompts
      key={`${phase1Choice.mode}:${phase1Choice.playerId}`}
      phase1Choice={phase1Choice}
      players={players}
      myHand={myHand}
      myPlayerId={myPlayerId}
      topDiscard={topDiscard}
      disabled={disabled}
      onResolvePhase1={onResolvePhase1}
      onOpenStealPicker={onOpenStealPicker}
    />
  );
};
