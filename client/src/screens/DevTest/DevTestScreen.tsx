import React, { useState } from "react";
import type { Character } from "../../types/game";
import { BulletMeter } from "../../components/game";
import { allMockCharacters } from "@data/mock/mockCharacters";
import { initialMyHeroes } from "@data/mock/mockGameTable";
import {
  mockPendingReaction,
  mockGeneralStore,
  mockGameOver,
} from "@data/mock/mockDevScenarios";
import {
  GameTableScreen,
  type DevForcedModalType,
} from "../GameTable/GameTableScreen";
import "../Lobby/LobbyScreen.scss";
import "./DevTestScreen.scss";

type DevTab = "table" | "characters" | "lobby";
type PackFilter = "all" | "base" | "dodge_city";

interface MockLobbySeat {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
}

const INITIAL_MOCK_LOBBY: MockLobbySeat[] = [
  { id: "p1", name: "Sheriff Host", isHost: true, isReady: true },
  { id: "p2", name: "Calamity Janet", isHost: false, isReady: true },
  { id: "p3", name: "Billy The Kid", isHost: false, isReady: false },
  { id: "p4", name: "El Gringo", isHost: false, isReady: true },
  { id: "p5", name: "Slab Killer", isHost: false, isReady: false },
];

export const DevTestScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DevTab>("table");
  const [packFilter, setPackFilter] = useState<PackFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [equippedHeroes, setEquippedHeroes] = useState<Character[]>(initialMyHeroes);
  const [forcedModal, setForcedModal] = useState<DevForcedModalType>(null);
  const [mockLobbyPlayers, setMockLobbyPlayers] = useState<MockLobbySeat[]>(INITIAL_MOCK_LOBBY);
  const [kickFeedback, setKickFeedback] = useState<string>(
    "Ready. Use Host Kick buttons below to verify removal state."
  );

  const filteredChars = allMockCharacters.filter((ch) => {
    const matchesPack = packFilter === "all" || ch.pack === packFilter;
    const matchesQuery =
      !searchQuery.trim() ||
      ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ch.desc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPack && matchesQuery;
  });

  const assignHeroSlot = (slotIndex: 0 | 1, character: Character) => {
    setEquippedHeroes((prev) => {
      const next = [...prev];
      next[slotIndex] = character;
      return next.slice(0, 2);
    });
    setActiveTab("table");
  };

  const handleMockKick = (player: MockLobbySeat) => {
    setMockLobbyPlayers((prev) => prev.filter((p) => p.id !== player.id));
    setKickFeedback(`Host kicked "${player.name}" from waiting room.`);
  };

  return (
    <div className="dev-test">
      <div className="dev-test__toolbar">
        <div className="dev-test__brand-row">
          <span className="dev-test__badge">DEV UI SANDBOX</span>
          <span className="dev-test__title">
            /dev-test ({allMockCharacters.length} Characters + Mock Game Data)
          </span>
        </div>

        <div className="dev-test__controls">
          <button
            type="button"
            onClick={() => setActiveTab("table")}
            className={`dev-test__tab-btn ${
              activeTab === "table" ? "dev-test__tab-btn--active" : ""
            }`.trim()}
          >
            Mock Game Table
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("characters")}
            className={`dev-test__tab-btn ${
              activeTab === "characters" ? "dev-test__tab-btn--active" : ""
            }`.trim()}
          >
            All Characters ({allMockCharacters.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("lobby")}
            className={`dev-test__tab-btn ${
              activeTab === "lobby" ? "dev-test__tab-btn--active" : ""
            }`.trim()}
          >
            Lobby Kick Preview
          </button>

          {activeTab === "table" && (
            <>
              <button
                type="button"
                onClick={() => setForcedModal("char_select")}
                className="dev-test__modal-btn"
              >
                Hero Select (31)
              </button>
              <button
                type="button"
                onClick={() => setForcedModal("defense")}
                className="dev-test__modal-btn"
              >
                Defense Modal
              </button>
              <button
                type="button"
                onClick={() => setForcedModal("card_picker")}
                className="dev-test__modal-btn"
              >
                Card Picker
              </button>
              <button
                type="button"
                onClick={() => setForcedModal("general_store")}
                className="dev-test__modal-btn"
              >
                General Store
              </button>
              <button
                type="button"
                onClick={() => setForcedModal("game_over")}
                className="dev-test__modal-btn"
              >
                Game Over
              </button>
            </>
          )}

          <a href="/" className="dev-test__home-link">
            Normal Auth (/)
          </a>
        </div>
      </div>

      {activeTab === "table" && (
        <div className="dev-test__table-wrap">
          <GameTableScreen
            key={equippedHeroes.map((h) => h.id).join("_")}
            isMock={true}
            externalHeroes={equippedHeroes}
            candidateHeroesOverride={allMockCharacters}
            forcedModal={forcedModal}
            onCloseForcedModal={() => setForcedModal(null)}
            mockScenarioReaction={mockPendingReaction}
            mockScenarioGeneralStore={mockGeneralStore}
            mockScenarioGameOver={mockGameOver}
            onBackToLobby={() => setActiveTab("lobby")}
          />
        </div>
      )}

      {activeTab === "characters" && (
        <section className="dev-test__catalog">
          <div className="dev-test__filter-bar">
            <div className="dev-test__controls">
              <button
                type="button"
                onClick={() => setPackFilter("all")}
                className={`dev-test__tab-btn ${
                  packFilter === "all" ? "dev-test__tab-btn--active" : ""
                }`.trim()}
              >
                All ({allMockCharacters.length})
              </button>
              <button
                type="button"
                onClick={() => setPackFilter("base")}
                className={`dev-test__tab-btn ${
                  packFilter === "base" ? "dev-test__tab-btn--active" : ""
                }`.trim()}
              >
                Base Game (16)
              </button>
              <button
                type="button"
                onClick={() => setPackFilter("dodge_city")}
                className={`dev-test__tab-btn ${
                  packFilter === "dodge_city" ? "dev-test__tab-btn--active" : ""
                }`.trim()}
              >
                Dodge City (15)
              </button>
            </div>

            <input
              type="search"
              aria-label="Filter characters by name or skill"
              placeholder="Search character or ability..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="dev-test__search-input"
            />
          </div>

          <div className="dev-test__grid">
            {filteredChars.map((ch) => (
              <article key={ch.id} className="dev-test__char-card">
                <div className="dev-test__char-top">
                  <img
                    src={ch.image}
                    alt={ch.name}
                    className="dev-test__char-img"
                  />
                  <div className="dev-test__char-info">
                    <h2 className="dev-test__char-name">{ch.name}</h2>
                    <span className="dev-test__char-pack">{ch.pack.replace("_", " ")}</span>
                    <BulletMeter currentHp={ch.baseHp} maxHp={ch.baseHp} size="small" />
                    {ch.isActiveSkill && (
                      <span className="dev-test__char-skill-tag">
                        {ch.skillName || "Active Skill"}
                      </span>
                    )}
                  </div>
                </div>
                <p className="dev-test__char-desc">{ch.desc}</p>
                <div className="dev-test__char-actions">
                  <button
                    type="button"
                    onClick={() => assignHeroSlot(0, ch)}
                    className="dev-test__equip-btn"
                  >
                    Equip Hero 1
                  </button>
                  <button
                    type="button"
                    onClick={() => assignHeroSlot(1, ch)}
                    className="dev-test__equip-btn"
                  >
                    Equip Hero 2
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "lobby" && (
        <section className="dev-test__lobby-preview">
          <div className="dev-test__lobby-header">
            <h2 className="lobby-screen__panel-title">
              Mock Lobby Room (Host Kick Preview - {mockLobbyPlayers.length}/8)
            </h2>
            <button
              type="button"
              onClick={() => {
                setMockLobbyPlayers(INITIAL_MOCK_LOBBY);
                setKickFeedback("Mock lobby reset to initial 5 players.");
              }}
              className="dev-test__tab-btn dev-test__tab-btn--active"
            >
              Reset Room Players
            </button>
          </div>

          <div role="status" className="dev-test__kick-log">
            {kickFeedback}
          </div>

          <div className="lobby-screen__player-list">
            {mockLobbyPlayers.map((p) => (
              <div
                key={p.id}
                className={`lobby-screen__player-item ${
                  p.isHost ? "lobby-screen__player-item--me" : ""
                }`}
              >
                <div className="lobby-screen__player-meta">
                  <span className="lobby-screen__player-name">{p.name}</span>
                  {p.isHost && <span className="lobby-screen__host-badge">HOST</span>}
                </div>
                <div className="lobby-screen__player-actions">
                  <span
                    className={`lobby-screen__status-tag ${
                      p.isHost || p.isReady
                        ? "lobby-screen__status-tag--ready"
                        : "lobby-screen__status-tag--not-ready"
                    }`}
                  >
                    {p.isHost ? "HOST" : p.isReady ? "READY" : "NOT READY"}
                  </span>
                  {!p.isHost && (
                    <button
                      type="button"
                      onClick={() => handleMockKick(p)}
                      aria-label={`Kick ${p.name} from room`}
                      className="lobby-screen__kick-btn"
                    >
                      Kick
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
