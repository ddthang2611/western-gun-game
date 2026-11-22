import { EN_LOCALE_BUNDLE } from "./locales/en";
import { VI_LOCALE_BUNDLE } from "./locales/vi";
import {
  interpolate,
  translateCard,
  translateCharacter,
  translateEvent,
  translateOutcome,
  translateRoleName,
  translateSuitSymbol,
  translateUi,
} from "./resolvers";
import type { Locale, StructuredLogEntry, TranslationParams } from "./types";

interface CardParam {
  name?: string;
  rank?: string;
  suit?: string;
  templateId?: string;
}

function fmtCardLabel(locale: Locale, card?: CardParam): string {
  if (!card?.name) return locale === "vi" ? "lá bài" : "card";
  const resolvedName = translateCard(locale, {
    templateId: card.templateId,
    name: card.name,
  }).primary.name;
  const sym = translateSuitSymbol(card.suit);
  return card.rank && sym ? `${resolvedName}[${sym}${card.rank}]` : resolvedName;
}

function resolveLogTemplate(locale: Locale, key: string, params: TranslationParams): string {
  const dict = locale === "vi" ? VI_LOCALE_BUNDLE.logs : EN_LOCALE_BUNDLE.logs;
  const tpl = dict[key] ?? EN_LOCALE_BUNDLE.logs[key];
  return tpl ? interpolate(tpl, params) : "";
}

export function formatStructuredLog(entry: StructuredLogEntry, locale: Locale): string {
  const p = entry.params || {};
  const str = (key: string, fallback = ""): string =>
    typeof p[key] === "string" || typeof p[key] === "number" ? String(p[key]) : fallback;

  const formattedCard = p.card ? fmtCardLabel(locale, p.card as CardParam) : str("cardName");

  switch (entry.eventType) {
    case "CHARACTER_SELECT_STARTED":
      return resolveLogTemplate(locale, "CHARACTER_SELECT_STARTED", {
        playerCount: str("playerCount", "0"),
      });
    case "CHARACTERS_SELECTED": {
      const names = Array.isArray(p.characterNames)
        ? (p.characterNames as string[])
            .map((n) => translateCharacter(locale, { name: n }).primary.name)
            .join(" & ")
        : "";
      if (names) {
        return resolveLogTemplate(locale, "CHARACTERS_SELECTED_PRIVATE", {
          actor: str("actor"),
          characters: names,
          maxHp: str("maxHp"),
        });
      }
      return resolveLogTemplate(locale, "CHARACTERS_SELECTED_PUBLIC", {
        actor: str("actor"),
      });
    }
    case "MATCH_STARTED": {
      const variant = p.is3PlayerVariant
        ? locale === "vi"
          ? " (3 người đối đầu)"
          : " (3P Quarry)"
        : "";
      return resolveLogTemplate(locale, "MATCH_STARTED", { variant });
    }
    case "EVENT_REVEALED": {
      const ev = p.event as { id?: string; name?: string } | undefined;
      const evLoc = translateEvent(locale, { id: ev?.id, name: ev?.name || str("eventName") }).primary;
      const label =
        locale === "vi" && evLoc.subtitleVi ? `${evLoc.name} (${evLoc.subtitleVi})` : evLoc.name;
      return resolveLogTemplate(locale, "EVENT_REVEALED", {
        roundNumber: str("roundNumber"),
        eventName: label || "Event",
      });
    }
    case "EVENT_PEYOTE_GUESS": {
      const guessRaw = str("guess", "?");
      const guess =
        guessRaw === "RED"
          ? translateUi(locale, "modals.prompt.guessRed")
          : guessRaw === "BLACK"
          ? translateUi(locale, "modals.prompt.guessBlack")
          : guessRaw;
      const result = p.matched
        ? translateOutcome(locale, "CORRECT")
        : translateOutcome(locale, "WRONG");
      return resolveLogTemplate(locale, "EVENT_PEYOTE_GUESS", {
        actor: str("actor"),
        guess,
        card: formattedCard,
        result,
      });
    }
    case "VERA_CUSTER_COPIED": {
      const cName = translateCharacter(locale, { name: str("characterName") }).primary.name;
      return resolveLogTemplate(locale, "VERA_CUSTER_COPIED", {
        actor: str("actor"),
        characterName: cName || "hero",
        sourceOwnerName: str("sourceOwnerName"),
      });
    }
    case "PHASE_CHANGED_DRAW": {
      const cards = Array.isArray(p.drawnCards)
        ? (p.drawnCards as CardParam[]).map((c) => fmtCardLabel(locale, c)).join(", ")
        : "";
      if (cards) {
        return resolveLogTemplate(locale, "PHASE_CHANGED_DRAW_PRIVATE", {
          actor: str("actor"),
          count: str("count", "0"),
          cards,
        });
      }
      return resolveLogTemplate(locale, "PHASE_CHANGED_DRAW_PUBLIC", {
        actor: str("actor"),
        count: str("count", "0"),
      });
    }
    case "DRAW_CHECK_RESULT": {
      if (p.emptyDeck) {
        return resolveLogTemplate(locale, "DRAW_CHECK_EMPTY", {
          actor: str("actor"),
          reason: str("reason", "Check"),
        });
      }
      const outcome = translateOutcome(locale, p.success ? "PASSED" : "FAILED");
      return resolveLogTemplate(locale, "DRAW_CHECK_RESULT", {
        actor: str("actor"),
        skillTag: str("skillTag", "[Check]"),
        card: formattedCard,
        result: outcome,
      });
    }
    case "JUDGEMENT_RESOLVED": {
      const outcome = translateOutcome(locale, str("result"));
      return resolveLogTemplate(locale, "JUDGEMENT_RESOLVED", {
        actor: str("actor"),
        judgementType: str("judgementType"),
        card: formattedCard,
        result: outcome,
      });
    }
    case "PLAYER_ELIMINATED":
      return resolveLogTemplate(locale, "PLAYER_ELIMINATED", {
        playerName: str("playerName"),
        role: translateRoleName(locale, str("role")),
      });
    case "GAME_OVER": {
      const winnerKey = `modals.gameOver.winner.${str("winner", "DRAW")}`;
      const winnerLabel = translateUi(locale, winnerKey, undefined, str("winner"));
      return resolveLogTemplate(locale, "GAME_OVER", {
        winner: winnerLabel,
        message: str("message"),
      });
    }
    case "CARD_STOLEN_FROM_HAND":
      return p.card
        ? resolveLogTemplate(locale, "CARD_STOLEN_FROM_HAND_PRIVATE", {
            actor: str("actor"),
            victim: str("victim"),
            card: formattedCard,
          })
        : resolveLogTemplate(locale, "CARD_STOLEN_FROM_HAND_PUBLIC", {
            actor: str("actor"),
            victim: str("victim"),
          });
    case "CARD_DESTROYED_FROM_HAND":
      return p.card
        ? resolveLogTemplate(locale, "CARD_DESTROYED_FROM_HAND_PRIVATE", {
            actor: str("actor"),
            victim: str("victim"),
            card: formattedCard,
          })
        : resolveLogTemplate(locale, "CARD_DESTROYED_FROM_HAND_PUBLIC", {
            actor: str("actor"),
            victim: str("victim"),
          });
    case "EL_GRINGO_STOLEN":
      return p.card
        ? resolveLogTemplate(locale, "EL_GRINGO_STOLEN_PRIVATE", {
            victim: str("victim"),
            attacker: str("attacker"),
            card: formattedCard,
          })
        : resolveLogTemplate(locale, "EL_GRINGO_STOLEN_PUBLIC", {
            victim: str("victim"),
            attacker: str("attacker"),
          });
    case "BLACK_JACK_REVEAL": {
      const bonus = p.bonusDrawn
        ? locale === "vi"
          ? " và rút thêm 1 lá"
          : " and drew 1 bonus card"
        : "";
      return resolveLogTemplate(locale, "BLACK_JACK_REVEAL", {
        actor: str("actor"),
        card: formattedCard,
        bonus,
      });
    }
    case "VULTURE_SAM_SCAVENGED": {
      const victimName = str("victim");
      const fromPart = victimName
        ? locale === "vi"
          ? ` từ ${victimName}`
          : ` from ${victimName}`
        : "";
      return resolveLogTemplate(locale, "VULTURE_SAM_SCAVENGED", {
        actor: str("actor"),
        count: str("count", "0"),
        fromPart,
      });
    }
    case "ACTIVE_SKILL_USED": {
      const detail = str("detail") ? `: ${str("detail")}` : "";
      return resolveLogTemplate(locale, "ACTIVE_SKILL_USED", {
        actor: str("actor"),
        skill: str("skill"),
        detail,
      });
    }
    default: {
      const generic = resolveLogTemplate(locale, entry.eventType, {
        ...(p as TranslationParams),
        card: formattedCard,
      });
      return generic || entry.fallbackText;
    }
  }
}
