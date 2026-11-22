import type { Card, EquipmentSlot, EquipmentSlotKey } from "../types/game";

export interface FixedEquipmentSlotEntry {
  slotKey: EquipmentSlotKey;
  label: string;
  card?: Card;
}

export function normalizeEquipmentName(name?: string): string {
  const upper = String(name || "").trim().toUpperCase();
  return upper === "BINOCULARS" ? "BINOCULAR" : upper;
}

// Map any blue equipment card to its fixed 6-slot position
export function resolveEquipmentSlotKey(
  card?: Pick<Card, "name" | "range"> | null
): EquipmentSlotKey {
  if (!card) return "weapon";
  const upper = normalizeEquipmentName(card.name);
  if (card.range) return "weapon";
  if (upper === "BARREL") return "barrel";
  if (upper === "MUSTANG") return "horseDef";
  if (upper === "SCOPE") return "horseOff";
  if (upper === "HIDEOUT") return "hideout";
  if (upper === "BINOCULAR") return "binocular";
  if (
    upper === "VOLCANIC" ||
    upper === "SCHOFIELD" ||
    upper === "REMINGTON" ||
    upper === "REV. CARABINE" ||
    upper === "CARABINE" ||
    upper === "WINCHESTER"
  ) {
    return "weapon";
  }
  return "hideout";
}

// Deduplicate extra equipment slots
export function getExtraEquipments(eq?: EquipmentSlot | null): Card[] {
  if (!eq) return [];
  const result: Card[] = [];
  const seen = new Set<string>();

  if (Array.isArray(eq.extras)) {
    for (const card of eq.extras) {
      if (card && !seen.has(card.id)) {
        seen.add(card.id);
        result.push(card);
      }
    }
  }

  if (eq.extra && !seen.has(eq.extra.id)) {
    result.push(eq.extra);
  }

  return result;
}

// Return fixed 6 equipment slots:
// 1 (left): Weapon, 2 (right): Barrel,
// 3 (left): Mustang, 4 (right): Scope,
// 5 (left): Hideout, 6 (right): Binocular
export function getFixedEquipmentSlots(
  eq?: EquipmentSlot | null,
  concealedIds?: ReadonlySet<string>
): FixedEquipmentSlotEntry[] {
  const isHidden = (c?: Card) => Boolean(c && concealedIds?.has(c.id));
  const extras = getExtraEquipments(eq);

  const hideoutCard = extras.find(
    (c) => normalizeEquipmentName(c.name) === "HIDEOUT"
  );
  const binocularCard = extras.find(
    (c) => normalizeEquipmentName(c.name) === "BINOCULAR"
  );
  const otherExtras = extras.filter(
    (c) =>
      c.id !== hideoutCard?.id &&
      c.id !== binocularCard?.id
  );

  const slot5Card = hideoutCard || otherExtras[0];
  const slot6Card =
    binocularCard || (hideoutCard ? otherExtras[0] : otherExtras[1]);

  return [
    {
      slotKey: "weapon",
      label: "Weapon",
      card: isHidden(eq?.weapon) ? undefined : eq?.weapon,
    },
    {
      slotKey: "barrel",
      label: "Barrel",
      card: isHidden(eq?.barrel) ? undefined : eq?.barrel,
    },
    {
      slotKey: "horseDef",
      label: "Mustang",
      card: isHidden(eq?.horseDef) ? undefined : eq?.horseDef,
    },
    {
      slotKey: "horseOff",
      label: "Scope",
      card: isHidden(eq?.horseOff) ? undefined : eq?.horseOff,
    },
    {
      slotKey: "hideout",
      label: "Hideout",
      card: isHidden(slot5Card) ? undefined : slot5Card,
    },
    {
      slotKey: "binocular",
      label: "Binocular",
      card: isHidden(slot6Card) ? undefined : slot6Card,
    },
  ];
}

// Collect all equipped blue cards in fixed slot order
export function getAllEquipments(eq?: EquipmentSlot | null): Card[] {
  if (!eq) return [];
  const fixed = getFixedEquipmentSlots(eq)
    .map((s) => s.card)
    .filter((c): c is Card => Boolean(c));
  const seen = new Set(fixed.map((c) => c.id));
  const extras = getExtraEquipments(eq).filter((c) => !seen.has(c.id));
  return [...fixed, ...extras];
}
