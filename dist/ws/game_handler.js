"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameSessionManager = void 0;
const ws_1 = require("ws");
const game_engine_1 = require("../engine/game_engine");
const interact_manager_1 = require("../engine/interact/interact_manager");
const skill_hooks_1 = require("../engine/interact/skill_hooks");
const inventory_1 = require("../engine/utils/inventory");
const catalog_repository_1 = require("../db/catalog_repository");
const session_repository_1 = require("../db/session_repository");
const database_1 = require("../db/database");
const expansion_config_1 = require("../engine/events/expansion_config");
const combat_log_formatter_1 = require("./combat_log_formatter");
const table_state_presenter_1 = require("./table_state_presenter");
class GameSessionManager {
    static instance;
    static INACTIVITY_TIMEOUT_MS = 60_000;
    static MAX_RESTORED_EVENTS = 100;
    engines = new Map();
    combatLogs = new Map();
    matchEventSeqs = new Map();
    inactivityTimers = new Map();
    static getInstance() {
        if (!GameSessionManager.instance) {
            GameSessionManager.instance = new GameSessionManager();
        }
        return GameSessionManager.instance;
    }
    hasActiveSession(roomId) {
        return this.engines.has(roomId);
    }
    getSession(roomId) {
        return this.engines.get(roomId);
    }
    // Clear room inactivity timer
    clearInactivityTimer(roomId) {
        const existing = this.inactivityTimers.get(roomId);
        if (existing) {
            clearTimeout(existing);
            this.inactivityTimers.delete(roomId);
        }
    }
    // Schedule room inactivity timer when active
    refreshInactivityTimer(roomId, engine, lobbyManager) {
        this.clearInactivityTimer(roomId);
        if (!lobbyManager)
            return;
        const simState = engine.getState();
        if (simState.gameOver || simState.matchPhase === "FINISHED") {
            return;
        }
        if (this.isMatchPaused(engine, lobbyManager)) {
            return;
        }
        const timer = setTimeout(() => {
            this.handleInactivityTimeout(roomId, engine, lobbyManager);
        }, GameSessionManager.INACTIVITY_TIMEOUT_MS);
        timer.unref?.();
        this.inactivityTimers.set(roomId, timer);
    }
    // Auto-pass or auto-skip on inactivity
    handleInactivityTimeout(roomId, engine, lobbyManager) {
        this.inactivityTimers.delete(roomId);
        if (this.engines.get(roomId) !== engine)
            return;
        const simState = engine.getState();
        if (simState.gameOver || simState.matchPhase === "FINISHED")
            return;
        if (this.isMatchPaused(engine, lobbyManager))
            return;
        const collectedEvents = [];
        let mutated = false;
        if (simState.matchPhase === "CHARACTER_SELECT") {
            const pendingEntries = Array.from(simState.pendingCharacterSelect.values());
            for (const entry of pendingEntries) {
                if (entry.selectedCharacterIds?.length)
                    continue;
                const autoIds = entry.candidates
                    .slice(0, entry.requiredCount)
                    .map((c) => c.id);
                const res = engine.handleCommand({
                    playerId: entry.playerId,
                    type: "SELECT_CHARACTERS",
                    characterIds: autoIds,
                });
                if (res.success) {
                    mutated = true;
                    if (res.events?.length)
                        collectedEvents.push(...res.events);
                }
            }
        }
        else {
            interact_manager_1.InteractManager.pruneStaleReactions(simState);
            if (simState.pendingReactions.length > 0) {
                const head = simState.pendingReactions[0];
                let cmd;
                if (head.type === "EVENT_DALTONS_DISCARD") {
                    const target = simState.players.get(head.targetPlayerId);
                    const firstBlueId = (target ? (0, inventory_1.getAllEquippedCards)(target)[0]?.id : undefined) ??
                        target?.judgements.find((j) => j.card.border === "blue")?.card.id;
                    cmd = {
                        playerId: head.targetPlayerId,
                        type: "RESOLVE_REACTION",
                        targetCardId: firstBlueId,
                        payload: { cardId: firstBlueId },
                    };
                }
                else {
                    cmd = {
                        playerId: head.targetPlayerId,
                        type: "RESOLVE_REACTION",
                        payload: { action: "TAKE_DAMAGE" },
                    };
                }
                const res = engine.handleCommand(cmd);
                if (res.success) {
                    mutated = true;
                    if (res.events?.length)
                        collectedEvents.push(...res.events);
                }
            }
            else if (simState.activeChain.length > 0) {
                const draft = simState.activeChain[0];
                const pickerId = draft?.draftOrder?.[draft.currentPickerIndex];
                const cardId = draft?.storePool?.[0]?.id;
                if (pickerId && cardId) {
                    const res = engine.handleCommand({
                        playerId: pickerId,
                        type: "SELECT_STOLEN_CARD",
                        cardId,
                    });
                    if (res.success) {
                        mutated = true;
                        if (res.events?.length)
                            collectedEvents.push(...res.events);
                    }
                }
            }
            else if (simState.pendingTurnStartChoice) {
                const choice = simState.pendingTurnStartChoice;
                if (choice.type === "VERA_CUSTER_COPY") {
                    const firstCharId = choice.availableCharacters?.[0]?.character.id;
                    if (firstCharId) {
                        const res = engine.handleCommand({
                            playerId: choice.playerId,
                            type: "RESOLVE_TURN_START",
                            characterIds: [firstCharId],
                        });
                        if (res.success) {
                            mutated = true;
                            if (res.events?.length)
                                collectedEvents.push(...res.events);
                        }
                    }
                }
                else {
                    const res = engine.handleCommand({
                        playerId: choice.playerId,
                        type: "RESOLVE_TURN_START",
                        payload: { skip: true },
                    });
                    if (res.success) {
                        mutated = true;
                        if (res.events?.length)
                            collectedEvents.push(...res.events);
                    }
                }
            }
            else if (simState.pendingPhase1Choice) {
                const p1 = simState.pendingPhase1Choice;
                let cmd = null;
                if (p1.mode === "KIT_CARLSON_PICK") {
                    const keepCount = Math.min(Number(p1.neededCount || 2), (p1.previewCards || []).length);
                    const cardIds = (p1.previewCards || [])
                        .slice(0, keepCount)
                        .map((c) => c.id);
                    cmd = {
                        playerId: p1.playerId,
                        type: "RESOLVE_PHASE_1",
                        payload: { cardIds },
                    };
                }
                else if (p1.mode === "CHOOSE_DRAW_OPTION") {
                    const preferred = p1.options.find((o) => o === "NORMAL_DECK" ||
                        o === "NORMAL_DRAW" ||
                        o === "BILL_NOFACE" ||
                        o === "PIXIE_PETE" ||
                        o === "KIT_CARLSON" ||
                        o === "SKIP_DRAW_HEAL" ||
                        o === "PEDRO_DISCARD_AND_DECK") || p1.options[0];
                    cmd = {
                        playerId: p1.playerId,
                        type: "RESOLVE_PHASE_1",
                        payload: { choice: preferred },
                    };
                }
                else if (p1.mode === "PEYOTE_GUESS") {
                    cmd = {
                        playerId: p1.playerId,
                        type: "RESOLVE_PHASE_1",
                        payload: { choice: "RED" },
                    };
                }
                else if (p1.mode === "RANCH_EXCHANGE") {
                    cmd = {
                        playerId: p1.playerId,
                        type: "RESOLVE_PHASE_1",
                        payload: { skip: true },
                    };
                }
                if (cmd) {
                    const res = engine.handleCommand(cmd);
                    if (res.success) {
                        mutated = true;
                        if (res.events?.length)
                            collectedEvents.push(...res.events);
                    }
                }
            }
            else {
                const turnPlayer = simState.players.get(simState.turnPlayerId);
                if (turnPlayer && !turnPlayer.isDead) {
                    if (turnPlayer.forcedPlayCardId) {
                        turnPlayer.forcedPlayCardId = null;
                    }
                    const handLimit = skill_hooks_1.SkillHooks.getPhase3HandLimit(turnPlayer, simState);
                    const excess = Math.max(0, turnPlayer.handCards.length - handLimit);
                    const discardIds = !turnPlayer.isGhost && excess > 0
                        ? turnPlayer.handCards.slice(0, excess).map((c) => c.id)
                        : undefined;
                    const res = engine.handleCommand({
                        playerId: turnPlayer.id,
                        type: "END_TURN",
                        discardCardIds: discardIds,
                    });
                    if (res.success) {
                        mutated = true;
                        if (res.events?.length)
                            collectedEvents.push(...res.events);
                    }
                }
            }
        }
        if (mutated) {
            this.persistEventsAndState(roomId, collectedEvents, engine);
            if (collectedEvents.length > 0) {
                this.emitDomainEvents(roomId, collectedEvents, engine, lobbyManager);
            }
            this.broadcastGameSnapshot(roomId, engine, lobbyManager);
        }
    }
    endSession(roomId) {
        this.clearInactivityTimer(roomId);
        this.engines.delete(roomId);
        this.combatLogs.delete(roomId);
        this.matchEventSeqs.delete(roomId);
        try {
            const repo = session_repository_1.SessionRepository.getInstance();
            repo.deleteGameState(roomId);
            repo.deleteMatchEvents(roomId);
        }
        catch (err) {
            console.error("[GameSessionManager] Failed to clean up session:", err);
        }
    }
    // Load catalog definitions for engine
    loadCatalogData() {
        if (!(0, database_1.isDatabaseUnlocked)())
            return null;
        const catalog = catalog_repository_1.CatalogRepository.getInstance();
        if (!catalog.isInitialized()) {
            catalog.initialize();
        }
        const catalogCards = catalog.getAllCards();
        if (catalogCards.length === 0)
            return null;
        const engineCards = catalogCards.map((c) => ({
            id: c.card_id,
            seq: c.seq,
            templateId: c.template_id,
            pack: c.pack,
            name: c.name_en,
            border: c.border,
            category: c.category,
            weaponRange: c.weapon_range || undefined,
            rank: c.rank,
            suit: c.suit,
            desc: c.desc_en,
            image: this.toAssetUrl(c.image_path),
            effectIcon: this.toAssetUrl(c.effect_icon_path),
        }));
        const allCharacters = catalog.getAllCharacters().map((c) => ({
            id: c.character_id,
            name: c.name,
            baseHp: c.base_hp,
            desc: c.desc_en,
            image: this.toAssetUrl(c.image_path),
            isActiveSkill: c.ability_trigger === "active_in_turn",
            skillName: c.ability_code,
            pack: c.pack,
        }));
        const engineEvents = catalog.getAllEvents().map((ev) => ({
            id: ev.event_id,
            pack: ev.pack,
            name: ev.name,
            isFinalCard: Boolean(ev.is_final_card),
            effectCode: ev.effect_code,
            desc: ev.desc_en,
            image: this.toAssetUrl(ev.image_path),
        }));
        return { engineCards, allCharacters, engineEvents };
    }
    // Load bounded recent match events descending
    loadRecentMatchEvents(roomId) {
        try {
            const db = (0, database_1.getRuntimeDatabase)();
            return db
                .prepare("SELECT * FROM match_events WHERE match_id = ? ORDER BY seq DESC LIMIT ?")
                .all(roomId, GameSessionManager.MAX_RESTORED_EVENTS);
        }
        catch (err) {
            console.error("[GameSessionManager] Failed bounded event restore query:", err);
            const all = session_repository_1.SessionRepository.getInstance().getMatchEvents(roomId);
            return all.slice(-GameSessionManager.MAX_RESTORED_EVENTS).reverse();
        }
    }
    // Restore saved match from runtime DB
    restoreSessionFromDb(roomId) {
        if (!(0, database_1.isDatabaseUnlocked)())
            return null;
        if (this.engines.has(roomId)) {
            return this.engines.get(roomId) || null;
        }
        const repo = session_repository_1.SessionRepository.getInstance();
        const saved = repo.getGameState(roomId);
        if (!saved || !saved.roomId)
            return null;
        const catalogData = this.loadCatalogData();
        if (!catalogData)
            return null;
        const engine = game_engine_1.GameEngine.restoreState(saved, catalogData.engineCards, catalogData.engineEvents, {
            defaultEnableCharacterSelect: true,
            defaultEnable3PlayerVariant: saved.is3PlayerVariant,
            expansions: saved.expansions,
        });
        this.engines.set(roomId, engine);
        const recentEvents = this.loadRecentMatchEvents(roomId);
        const maxSeq = recentEvents.reduce((max, row) => Math.max(max, row.seq), 0);
        this.matchEventSeqs.set(roomId, maxSeq);
        const restoredLogs = [];
        for (const row of recentEvents) {
            let payload = {};
            try {
                payload = JSON.parse(row.payload_json);
            }
            catch (err) {
                console.error("[GameSessionManager] Failed to parse match event JSON:", err);
                payload = {};
            }
            const entry = (0, combat_log_formatter_1.formatEventToLog)({
                type: row.event_type,
                payload,
                timestamp: Date.parse(row.created_at) || Date.now(),
            }, engine.getState().players);
            if (entry)
                restoredLogs.push(entry);
        }
        this.combatLogs.set(roomId, restoredLogs.slice(0, GameSessionManager.MAX_RESTORED_EVENTS));
        return engine;
    }
    // Check if any living player offline
    isMatchPaused(engine, lobbyManager) {
        if (!lobbyManager)
            return false;
        const simState = engine.getState();
        if (simState.gameOver || simState.matchPhase === "FINISHED") {
            return false;
        }
        for (const player of simState.players.values()) {
            if ((!player.isDead || player.isGhost) &&
                !lobbyManager.isPlayerOnline(player.id)) {
                return true;
            }
        }
        return false;
    }
    // Persist event batch and snapshot atomically
    persistEventsAndState(roomId, events, engine) {
        const startSeq = this.matchEventSeqs.get(roomId) || 0;
        let seq = startSeq;
        try {
            const repo = session_repository_1.SessionRepository.getInstance();
            const db = (0, database_1.getRuntimeDatabase)();
            const serialized = engine.serializeState();
            db.transaction(() => {
                for (const ev of events) {
                    seq += 1;
                    repo.logMatchEvent(roomId, seq, ev.type, ev.payload || {});
                }
                repo.saveGameState(roomId, serialized);
            })();
            this.matchEventSeqs.set(roomId, seq);
        }
        catch (err) {
            this.matchEventSeqs.set(roomId, startSeq);
            console.error("[GameSessionManager] Failed to persist match state:", err);
        }
    }
    // Initialize and start game session
    startGame(roomId, players, settings, lobbyManager) {
        const catalogData = this.loadCatalogData();
        if (!catalogData) {
            return {
                success: false,
                message: (0, database_1.isDatabaseUnlocked)()
                    ? "No cards loaded in catalog database."
                    : "Catalog database is locked. Please unlock it first.",
            };
        }
        const { engineCards, allCharacters, engineEvents } = catalogData;
        const expansions = (0, expansion_config_1.filterActiveExpansions)(settings.expansions);
        const is3PVariant = players.length === 3;
        const playerList = players.map((p) => ({ id: p.id, name: p.name }));
        try {
            this.clearInactivityTimer(roomId);
            const repo = session_repository_1.SessionRepository.getInstance();
            repo.deleteMatchEvents(roomId);
            this.matchEventSeqs.set(roomId, 0);
            const engine = new game_engine_1.GameEngine(roomId, engineCards, engineEvents, {
                defaultEnableCharacterSelect: true,
                defaultEnable3PlayerVariant: is3PVariant,
                expansions,
            });
            const matchResult = engine.startMatch(playerList, allCharacters, settings.dualCharacterEnabled, settings.dualCharacterHpRule, {
                enableCharacterSelect: true,
                expansions,
                enable3PlayerVariant: is3PVariant,
            });
            this.engines.set(roomId, engine);
            this.combatLogs.set(roomId, [
                {
                    publicText: "---------- Match initialized. Waiting for character selection. ----------",
                },
            ]);
            const initialEvents = matchResult.events || [];
            this.persistEventsAndState(roomId, initialEvents, engine);
            if (initialEvents.length > 0) {
                this.emitDomainEvents(roomId, initialEvents, engine, lobbyManager);
            }
            this.broadcastGameSnapshot(roomId, engine, lobbyManager);
            return { success: true };
        }
        catch (err) {
            return {
                success: false,
                message: err.message || "Failed to start match in GameEngine.",
            };
        }
    }
    // Handle normalized client game command
    handlePlayerCommand(playerId, command, roomId, ws, lobbyManager) {
        const engine = this.engines.get(roomId);
        if (!engine) {
            this.sendSocket(ws, "ERROR", {
                message: "No active game session found for this room.",
            });
            return;
        }
        if (this.isMatchPaused(engine, lobbyManager)) {
            this.sendSocket(ws, "ERROR", {
                message: "Match is paused while waiting for a disconnected player to reconnect.",
            });
            return;
        }
        const rawCmd = (command && typeof command === "object" ? command : {});
        const nestedPayload = rawCmd.payload && typeof rawCmd.payload === "object"
            ? rawCmd.payload
            : rawCmd;
        const normalizedCommand = {
            ...nestedPayload,
            ...rawCmd,
            playerId,
            commandId: typeof rawCmd.commandId === "string"
                ? rawCmd.commandId
                : typeof nestedPayload.commandId === "string"
                    ? nestedPayload.commandId
                    : undefined,
            expectedStateSeq: typeof rawCmd.expectedStateSeq === "number"
                ? rawCmd.expectedStateSeq
                : typeof nestedPayload.expectedStateSeq === "number"
                    ? nestedPayload.expectedStateSeq
                    : undefined,
            greenCardId: rawCmd.greenCardId ??
                nestedPayload.greenCardId ??
                (rawCmd.type === "ACTIVATE_GREEN_CARD"
                    ? rawCmd.cardId ?? nestedPayload.cardId
                    : undefined),
            payload: nestedPayload,
        };
        const result = engine.handleCommand(normalizedCommand);
        if (!result.success) {
            this.sendSocket(ws, "ERROR", { message: result.message || "Action failed." });
            if (normalizedCommand.expectedStateSeq !== undefined &&
                normalizedCommand.expectedStateSeq !== engine.getState().stateSeq) {
                this.sendPlayerSnapshot(engine, playerId, roomId, lobbyManager);
            }
            return;
        }
        this.clearInactivityTimer(roomId);
        this.sendSocket(ws, "GAME_ACTION_SUCCESS", {
            action: normalizedCommand.type,
            stateSeq: engine.getState().stateSeq,
            ...(result.deduplicated ? { deduplicated: true } : {}),
        });
        if (result.deduplicated) {
            this.sendPlayerSnapshot(engine, playerId, roomId, lobbyManager);
            return;
        }
        const events = result.events || [];
        this.persistEventsAndState(roomId, events, engine);
        if (events.length > 0) {
            this.emitDomainEvents(roomId, events, engine, lobbyManager);
        }
        this.broadcastGameSnapshot(roomId, engine, lobbyManager);
    }
    // Emit TABLE_STATE only to participant
    emitPlayerSnapshot(engine, playerId, roomId, lobbyManager) {
        if (!engine.getState().players.has(playerId))
            return;
        const snapshot = engine.getFilteredSnapshot(playerId);
        const logs = (0, combat_log_formatter_1.getLogsForPlayer)(this.combatLogs.get(roomId) || [], playerId, 100);
        const tableState = (0, table_state_presenter_1.buildTableState)(snapshot, playerId, engine, logs, this.isMatchPaused(engine, lobbyManager), (pId) => lobbyManager.isPlayerOnline(pId));
        lobbyManager.sendToPlayer(playerId, "TABLE_STATE", tableState);
    }
    // Send private snapshot to player
    sendPlayerSnapshot(engine, playerId, roomId, lobbyManager) {
        this.emitPlayerSnapshot(engine, playerId, roomId, lobbyManager);
        this.refreshInactivityTimer(roomId, engine, lobbyManager);
    }
    // Broadcast snapshots strictly to participants
    broadcastGameSnapshot(roomId, engine, lobbyManager) {
        for (const playerId of engine.getState().players.keys()) {
            this.emitPlayerSnapshot(engine, playerId, roomId, lobbyManager);
        }
        this.refreshInactivityTimer(roomId, engine, lobbyManager);
    }
    // Broadcast domain events and logs
    emitDomainEvents(roomId, events, engine, lobbyManager) {
        const logs = this.combatLogs.get(roomId) || [];
        const players = engine.getState().players;
        const participantIds = Array.from(players.keys());
        for (const ev of events) {
            const logEntry = (0, combat_log_formatter_1.formatEventToLog)(ev, players);
            if (logEntry) {
                logs.unshift(logEntry);
            }
            for (const pId of participantIds) {
                const outgoing = ev.visibleTo && ev.visibleTo.length > 0
                    ? engine.filterEventForPlayer(ev, pId)
                    : ev;
                lobbyManager.sendToPlayer(pId, "GAME_EVENT", outgoing);
            }
            if (ev.type === "GAME_OVER") {
                for (const pId of participantIds) {
                    lobbyManager.sendToPlayer(pId, "GAME_OVER", ev.payload);
                }
            }
        }
        if (logs.length > GameSessionManager.MAX_RESTORED_EVENTS) {
            logs.length = GameSessionManager.MAX_RESTORED_EVENTS;
        }
        this.combatLogs.set(roomId, logs);
        if (events.length > 0) {
            for (const pId of participantIds) {
                lobbyManager.sendToPlayer(pId, "COMBAT_LOG_UPDATE", {
                    combatLog: (0, combat_log_formatter_1.getLogsForPlayer)(logs, pId, 50),
                });
            }
        }
    }
    // Normalize DB asset paths
    toAssetUrl(rawPath) {
        if (!rawPath)
            return undefined;
        if (rawPath.startsWith("/"))
            return rawPath;
        return rawPath.startsWith("assets/") ? `/${rawPath}` : `/assets/${rawPath}`;
    }
    sendSocket(ws, type, payload) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, payload }));
        }
    }
}
exports.GameSessionManager = GameSessionManager;
