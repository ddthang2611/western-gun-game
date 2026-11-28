"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameEngine = void 0;
const deck_manager_1 = require("./deck/deck_manager");
const setup_dealer_1 = require("./deck/setup_dealer");
const turn_manager_1 = require("./phases/turn_manager");
const event_engine_1 = require("./events/event_engine");
const expansion_config_1 = require("./events/expansion_config");
const fog_of_war_1 = require("./state/fog_of_war");
const win_condition_1 = require("./elimination/win_condition");
const interact_manager_1 = require("./interact/interact_manager");
const arena_chain_manager_1 = require("./arena/arena_chain_manager");
class GameEngine {
    static MAX_PROCESSED_COMMANDS = 200;
    state;
    allRawCards;
    allEventCards;
    defaultEnableCharSelect;
    defaultEnable3PVariant;
    enableArenaPacing;
    processedCommandIds = [];
    processedCommandSet = new Set();
    constructor(roomId, initialCards = [], eventCards = [], options) {
        this.allRawCards = [...initialCards];
        this.allEventCards = [...eventCards];
        this.defaultEnableCharSelect = Boolean(options?.defaultEnableCharacterSelect);
        this.defaultEnable3PVariant = options?.defaultEnable3PlayerVariant;
        this.enableArenaPacing = Boolean(options?.enableArenaPacing);
        this.state = {
            roomId,
            stateSeq: 0,
            matchPhase: "PLAYING",
            roundNumber: 1,
            turnPlayerId: "",
            sheriffId: "",
            direction: 1,
            currentPhase: 0,
            bangCountThisTurn: 0,
            docHolydayUsedThisTurn: 0,
            joseDelgadoCountThisTurn: 0,
            attachedSeqCounter: 0,
            dualCharacterMode: false,
            hpRule: "strict",
            is3PlayerVariant: false,
            expansions: options?.expansions
                ? [...options.expansions]
                : eventCards.length > 0
                    ? ["base", "dodge_city", "high_noon", "fistful_of_cards"]
                    : (0, expansion_config_1.filterActiveExpansions)(["base", "dodge_city", "high_noon", "fistful_of_cards"]),
            players: new Map(),
            drawDeck: deck_manager_1.DeckManager.shuffleCards(this.allRawCards),
            discardPile: [],
            eventDeck: [],
            eventDiscardPile: [],
            activeEvent: null,
            firstEliminatedPlayerId: null,
            vendettaExtraTurnUsed: false,
            pendingCharacterSelect: new Map(),
            pendingTurnStartChoice: null,
            pendingPhase1Choice: null,
            activeChain: [],
            pendingReactions: [],
            arenaChain: arena_chain_manager_1.ArenaChainManager.createIdleChain(),
            arenaChainCounter: 0,
        };
    }
    // Initialize match state and start
    startMatch(playerList, allCharacters, dualCharacterMode = false, hpRule = "strict", options) {
        const expansions = options?.expansions
            ? [...options.expansions]
            : [...this.state.expansions];
        const enableCharSelect = options?.enableCharacterSelect ?? this.defaultEnableCharSelect;
        const enable3PVariant = playerList.length === 3 &&
            (options?.enable3PlayerVariant ?? this.defaultEnable3PVariant ?? true);
        this.state.expansions = expansions;
        this.state.stateSeq = 0;
        this.processedCommandIds = [];
        this.processedCommandSet.clear();
        this.state.dualCharacterMode = dualCharacterMode;
        this.state.hpRule = hpRule;
        this.state.is3PlayerVariant = enable3PVariant;
        this.state.roundNumber = 1;
        this.state.turnPlayerId = "";
        this.state.sheriffId = "";
        this.state.direction = 1;
        this.state.currentPhase = 0;
        this.state.bangCountThisTurn = 0;
        this.state.docHolydayUsedThisTurn = 0;
        this.state.joseDelgadoCountThisTurn = 0;
        this.state.attachedSeqCounter = 0;
        this.state.activeEvent = null;
        this.state.firstEliminatedPlayerId = null;
        this.state.vendettaExtraTurnUsed = false;
        this.state.pendingCharacterSelect.clear();
        this.state.pendingTurnStartChoice = null;
        this.state.pendingPhase1Choice = null;
        this.state.activeChain = [];
        this.state.pendingReactions = [];
        this.state.arenaChain = arena_chain_manager_1.ArenaChainManager.createIdleChain();
        this.state.arenaChainCounter = 0;
        this.state.gameOver = undefined;
        this.state.discardPile = [];
        this.state.eventDiscardPile = [];
        this.state.drawDeck = setup_dealer_1.SetupDealer.buildDeck(this.allRawCards, expansions);
        this.state.eventDeck = event_engine_1.EventEngine.setupEventDeck(this.allEventCards, expansions);
        const { players, sheriffId } = setup_dealer_1.SetupDealer.initializePlayers(this.state, playerList, allCharacters, dualCharacterMode, hpRule, {
            enableCharacterSelect: enableCharSelect,
            expansions,
            is3PlayerVariant: enable3PVariant,
            recentCharacterIdsByPlayer: options?.recentCharacterIdsByPlayer,
            remainingCharacterIds: options?.remainingCharacterIds,
        });
        this.state.players = players;
        this.state.sheriffId = sheriffId;
        const initialEvents = [];
        if (enableCharSelect) {
            initialEvents.push({
                type: "CHARACTER_SELECT_STARTED",
                payload: {
                    roomId: this.state.roomId,
                    playerCount: playerList.length,
                    sheriffId,
                    dualCharacterMode,
                    hpRule,
                    is3PlayerVariant: enable3PVariant,
                },
                timestamp: Date.now(),
            });
        }
        else {
            initialEvents.push({
                type: "MATCH_STARTED",
                payload: {
                    roomId: this.state.roomId,
                    playerCount: playerList.length,
                    sheriffId,
                    is3PlayerVariant: enable3PVariant,
                },
                timestamp: Date.now(),
            });
            const sheriff = players.get(sheriffId);
            if (sheriff) {
                turn_manager_1.TurnManager.startTurn(this.state, sheriff, initialEvents);
            }
            this.appendWinEventIfNeeded(initialEvents);
            arena_chain_manager_1.ArenaChainManager.finalizeAfterCommand(this.state, 0, this.enableArenaPacing);
        }
        return {
            success: true,
            events: initialEvents,
            initialSnapshot: sheriffId ? this.getFilteredSnapshot(sheriffId) : undefined,
        };
    }
    // Backward compatible command dispatcher
    executeCommand(command) {
        return this.handleCommand(command);
    }
    // Record processed command ID
    recordCommandId(commandKey) {
        if (!commandKey || this.processedCommandSet.has(commandKey))
            return;
        if (this.processedCommandIds.length >= GameEngine.MAX_PROCESSED_COMMANDS) {
            const oldest = this.processedCommandIds.shift();
            if (oldest) {
                this.processedCommandSet.delete(oldest);
            }
        }
        this.processedCommandIds.push(commandKey);
        this.processedCommandSet.add(commandKey);
    }
    // Authoritative command router
    handleCommand(command) {
        const player = this.state.players.get(command.playerId);
        if (!player)
            return { success: false, message: "Player not found." };
        const rawCmdId = typeof command.commandId === "string" ? command.commandId.trim() : "";
        const commandKey = rawCmdId ? `${command.playerId}:${rawCmdId}` : null;
        if (commandKey && this.processedCommandSet.has(commandKey)) {
            return { success: true, events: [], deduplicated: true };
        }
        if (this.state.gameOver || this.state.matchPhase === "FINISHED") {
            return { success: false, message: "Match has already ended." };
        }
        if (command.type !== "SELECT_CHARACTERS" &&
            command.expectedStateSeq !== undefined &&
            command.expectedStateSeq !== this.state.stateSeq) {
            return {
                success: false,
                message: `Stale state sequence: expected ${command.expectedStateSeq}, current ${this.state.stateSeq}.`,
            };
        }
        const arenaGuard = arena_chain_manager_1.ArenaChainManager.checkCommandAllowed(this.state, command, this.enableArenaPacing);
        if (!arenaGuard.allowed) {
            return {
                success: false,
                message: arenaGuard.message || "Wait for Card Arena to finish resolving.",
            };
        }
        const entriesBeforeCount = arena_chain_manager_1.ArenaChainManager.ensureChain(this.state).entries.length;
        const events = [];
        const result = this.routeCommand(player, command, events);
        if (!result.success) {
            return result;
        }
        this.appendWinEventIfNeeded(events);
        if (command.type === "RESOLVE_REACTION" ||
            command.type === "SELECT_STOLEN_CARD" ||
            command.type === "RESOLVE_TURN_START") {
            this.resumePhase0IfReady(events);
        }
        if (this.state.matchPhase === "PLAYING" &&
            !this.state.gameOver &&
            this.state.pendingReactions.length === 0 &&
            this.state.activeChain.length === 0) {
            const turnPlayer = this.state.players.get(this.state.turnPlayerId);
            if (turnPlayer?.isDead) {
                turn_manager_1.TurnManager.advanceToNextTurn(this.state, turnPlayer.id, events);
                this.appendWinEventIfNeeded(events);
            }
        }
        arena_chain_manager_1.ArenaChainManager.finalizeAfterCommand(this.state, entriesBeforeCount, this.enableArenaPacing);
        this.state.stateSeq = (this.state.stateSeq ?? 0) + 1;
        this.recordCommandId(commandKey);
        return { success: true, events };
    }
    // Clear Card Arena once settling timer expires
    completeArenaSettling() {
        const changed = arena_chain_manager_1.ArenaChainManager.completeSettling(this.state);
        if (changed) {
            this.state.stateSeq = (this.state.stateSeq ?? 0) + 1;
        }
        return { changed, stateSeq: this.state.stateSeq };
    }
    isArenaPacingEnabled() {
        return this.enableArenaPacing;
    }
    // Route validated command to handler
    routeCommand(player, command, events) {
        if (command.type === "SELECT_CHARACTERS") {
            const rawIds = command.characterIds ?? command.payload?.characterIds ?? [];
            const selectRes = setup_dealer_1.SetupDealer.resolveCharacterSelection(this.state, command.playerId, rawIds, events);
            if (!selectRes.success) {
                return { success: false, message: selectRes.message, events };
            }
            this.mergeResultEvents(events, selectRes.events);
            if (this.state.matchPhase === "PLAYING" && !this.state.turnPlayerId) {
                const sheriff = this.state.players.get(this.state.sheriffId);
                if (sheriff) {
                    turn_manager_1.TurnManager.startTurn(this.state, sheriff, events);
                }
            }
            return { success: true, events };
        }
        if (this.state.matchPhase !== "PLAYING") {
            return {
                success: false,
                message: "Match is still in character selection phase.",
            };
        }
        if (player.isDead) {
            return {
                success: false,
                message: "Eliminated players cannot execute commands.",
            };
        }
        if (command.type === "RESOLVE_REACTION") {
            const res = interact_manager_1.InteractManager.resolveReaction(this.state, command);
            this.mergeResultEvents(events, res.events);
            if (!res.success) {
                return { success: false, message: res.message, events };
            }
            return { success: true, events };
        }
        if (command.type === "SELECT_STOLEN_CARD") {
            const res = interact_manager_1.InteractManager.resolveDraftSelection(this.state, command);
            this.mergeResultEvents(events, res.events);
            if (!res.success) {
                return { success: false, message: res.message, events };
            }
            return { success: true, events };
        }
        interact_manager_1.InteractManager.pruneStaleReactions(this.state);
        if (this.state.pendingReactions.length > 0 || this.state.activeChain.length > 0) {
            return {
                success: false,
                message: "Resolve pending reactions or active draft first.",
            };
        }
        if (command.type === "RESOLVE_TURN_START") {
            const res = event_engine_1.EventEngine.resolveTurnStartChoice(this.state, command, events);
            this.mergeResultEvents(events, res.events);
            if (!res.success) {
                return { success: false, message: res.message, events };
            }
            return { success: true, events };
        }
        if (this.state.pendingTurnStartChoice) {
            return {
                success: false,
                message: "Resolve pending turn start choice first.",
            };
        }
        if (command.type === "RESOLVE_PHASE_1") {
            const res = turn_manager_1.TurnManager.resolvePhase1Choice(this.state, command, events);
            this.mergeResultEvents(events, res.events);
            if (!res.success) {
                return { success: false, message: res.message, events };
            }
            return { success: true, events };
        }
        if (this.state.pendingPhase1Choice) {
            return {
                success: false,
                message: "Resolve pending Phase 1 choice first.",
            };
        }
        if (command.type === "END_TURN") {
            const res = turn_manager_1.TurnManager.endTurn(this.state, command, events);
            this.mergeResultEvents(events, res.events);
            if (!res.success) {
                return { success: false, message: res.message, events };
            }
            return { success: true, events };
        }
        if (command.type === "DISCARD_CARD") {
            if (this.state.turnPlayerId !== player.id || this.state.currentPhase !== 3) {
                return {
                    success: false,
                    message: "Can only discard excess cards in Phase 3.",
                };
            }
            const rawBatch = command.discardCardIds ?? command.payload?.discardCardIds;
            const singleCardId = command.cardId ?? command.payload?.cardId;
            const targetIds = Array.isArray(rawBatch) && rawBatch.length > 0
                ? rawBatch.map(String)
                : singleCardId
                    ? [String(singleCardId)]
                    : [];
            return turn_manager_1.TurnManager.discardExcessPhase3Cards(this.state, player, targetIds, events, { requireExactToLimit: false });
        }
        if (command.type === "PLAY_CARD") {
            if (this.state.turnPlayerId !== player.id || this.state.currentPhase !== 2) {
                return {
                    success: false,
                    message: "Can only play cards during your Action Phase (Phase 2).",
                };
            }
            const res = interact_manager_1.InteractManager.resolveCardPlay(this.state, command);
            this.mergeResultEvents(events, res.events);
            if (!res.success) {
                return { success: false, message: res.message, events };
            }
            return { success: true, events };
        }
        if (command.type === "ACTIVATE_GREEN_CARD") {
            if (this.state.turnPlayerId !== player.id || this.state.currentPhase !== 2) {
                return {
                    success: false,
                    message: "Can only activate green cards during your Action Phase (Phase 2).",
                };
            }
            const res = interact_manager_1.InteractManager.resolveActivateGreenCard(this.state, command);
            this.mergeResultEvents(events, res.events);
            if (!res.success) {
                return { success: false, message: res.message, events };
            }
            return { success: true, events };
        }
        // Allow Sid Ketchum anytime heal
        if (command.type === "USE_ACTIVE_SKILL") {
            const rawSkill = String(command.payload?.skillType ?? command.payload?.skill ?? "")
                .trim()
                .toUpperCase();
            const isAnytimeSid = rawSkill === "SID_KETCHUM_HEAL";
            if (!isAnytimeSid && (this.state.turnPlayerId !== player.id || this.state.currentPhase !== 2)) {
                return {
                    success: false,
                    message: "Can only use active skills during Phase 2 of your turn.",
                };
            }
            const res = interact_manager_1.InteractManager.executeActiveSkill(this.state, command);
            this.mergeResultEvents(events, res.events);
            if (!res.success) {
                return { success: false, message: res.message, events };
            }
            return { success: true, events };
        }
        return {
            success: false,
            message: `Unsupported command type: ${command.type}`,
        };
    }
    // Merge non-duplicate event arrays
    mergeResultEvents(target, source) {
        if (source && source !== target && source.length > 0) {
            target.push(...source);
        }
    }
    // Resume Phase 0 after pauses
    resumePhase0IfReady(events) {
        if (this.state.gameOver || this.state.matchPhase !== "PLAYING")
            return;
        interact_manager_1.InteractManager.pruneStaleReactions(this.state);
        if (this.state.pendingReactions.length > 0 || this.state.activeChain.length > 0)
            return;
        const turnPlayer = this.state.players.get(this.state.turnPlayerId);
        if (!turnPlayer)
            return;
        if (this.state.pendingTurnStartChoice) {
            const choice = this.state.pendingTurnStartChoice;
            const choiceOwner = this.state.players.get(choice.playerId);
            const invalidBlood = choice.type === "BLOOD_BROTHERS" &&
                (!choiceOwner ||
                    choiceOwner.isDead ||
                    choiceOwner.isGhost ||
                    choiceOwner.hp <= 1);
            const invalidOwner = !choiceOwner || choiceOwner.isDead;
            if (invalidBlood || invalidOwner) {
                this.state.pendingTurnStartChoice = null;
                if (!turnPlayer.isDead) {
                    event_engine_1.EventEngine.maybeQueueVeraOrBloodBrothers(this.state, turnPlayer, false);
                }
            }
        }
        if (this.state.currentPhase === 0 &&
            !this.state.pendingTurnStartChoice &&
            !this.state.pendingPhase1Choice) {
            turn_manager_1.TurnManager.continueTurnAfterTurnStart(this.state, turnPlayer, events);
            this.appendWinEventIfNeeded(events);
        }
    }
    // Record victory condition when met
    appendWinEventIfNeeded(events) {
        const winCheck = win_condition_1.WinConditionEvaluator.evaluate(this.state);
        if (!winCheck.gameOver)
            return;
        this.state.gameOver = {
            winner: winCheck.winner,
            message: winCheck.message || "",
        };
        this.state.matchPhase = "FINISHED";
        this.state.pendingReactions = [];
        this.state.activeChain = [];
        this.state.pendingTurnStartChoice = null;
        this.state.pendingPhase1Choice = null;
        if (!events.some((e) => e.type === "GAME_OVER")) {
            events.push({
                type: "GAME_OVER",
                payload: {
                    winner: winCheck.winner,
                    message: winCheck.message,
                },
                timestamp: Date.now(),
            });
        }
    }
    // Project Fog of War snapshot
    getFilteredSnapshot(playerId) {
        return fog_of_war_1.FogOfWarFilter.projectStateForPlayer(this.state, playerId);
    }
    // Filter domain event by visibility
    filterEventForPlayer(event, targetPlayerId) {
        return fog_of_war_1.FogOfWarFilter.filterEventForPlayer(event, targetPlayerId);
    }
    getState() {
        return this.state;
    }
    // Serialize state with Map entries
    serializeState() {
        const raw = {
            ...this.state,
            players: Array.from(this.state.players.entries()),
            pendingCharacterSelect: Array.from(this.state.pendingCharacterSelect.entries()),
        };
        return JSON.parse(JSON.stringify(raw));
    }
    // Restore engine from serialized snapshot
    static restoreState(saved, initialCards = [], eventCards = [], options) {
        const cloned = JSON.parse(JSON.stringify(saved));
        const engine = new GameEngine(cloned.roomId, initialCards, eventCards, {
            defaultEnableCharacterSelect: options?.defaultEnableCharacterSelect ?? true,
            defaultEnable3PlayerVariant: options?.defaultEnable3PlayerVariant ?? cloned.is3PlayerVariant,
            expansions: options?.expansions ?? cloned.expansions,
            enableArenaPacing: options?.enableArenaPacing ?? false,
        });
        const restoredArena = cloned.arenaChain && Array.isArray(cloned.arenaChain.entries)
            ? cloned.arenaChain
            : arena_chain_manager_1.ArenaChainManager.createIdleChain();
        engine.state = {
            ...cloned,
            stateSeq: typeof cloned.stateSeq === "number" ? cloned.stateSeq : 0,
            players: new Map(Array.isArray(cloned.players) ? cloned.players : []),
            pendingCharacterSelect: new Map(Array.isArray(cloned.pendingCharacterSelect) ? cloned.pendingCharacterSelect : []),
            drawDeck: Array.isArray(cloned.drawDeck) ? cloned.drawDeck : [],
            discardPile: Array.isArray(cloned.discardPile) ? cloned.discardPile : [],
            eventDeck: Array.isArray(cloned.eventDeck) ? cloned.eventDeck : [],
            eventDiscardPile: Array.isArray(cloned.eventDiscardPile) ? cloned.eventDiscardPile : [],
            activeChain: Array.isArray(cloned.activeChain) ? cloned.activeChain : [],
            pendingReactions: Array.isArray(cloned.pendingReactions) ? cloned.pendingReactions : [],
            arenaChain: restoredArena,
            arenaChainCounter: typeof cloned.arenaChainCounter === "number" ? cloned.arenaChainCounter : 0,
            expansions: Array.isArray(cloned.expansions) ? cloned.expansions : ["base"],
            activeEvent: cloned.activeEvent ?? null,
            firstEliminatedPlayerId: cloned.firstEliminatedPlayerId ?? null,
            pendingTurnStartChoice: cloned.pendingTurnStartChoice ?? null,
            pendingPhase1Choice: cloned.pendingPhase1Choice ?? null,
        };
        return engine;
    }
}
exports.GameEngine = GameEngine;
