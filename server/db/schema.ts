export interface DbMetaRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface SymbolLexiconRow {
  symbol_code: string;
  meaning_en: string;
}

export interface UiComponentRow {
  component_id: string;
  kind: string;
  code: string;
  image_path: string;
  width: number;
  height: number;
}

export interface CardTemplateRow {
  template_id: string;
  pack: string;
  name_it: string;
  name_en: string;
  border: string;
  category: string;
  weapon_range: number | null;
  target_type: string;
  max_distance: number | null;
  requires_weapon_range: number;
  counts_as_bang: number;
  extra_card_discard_cost: number;
  draw_cards_count: number;
  heal_amount: number;
  damage_amount: number;
  missed_required: number;
  requires_draw_check: number;
  draw_check_suit: string | null;
  draw_check_ranks: string | null;
  slot_type: string;
  playable_out_of_turn: number;
  effect_handler: string;
  desc_type: string;
  symbol_formula: string;
  symbol_desc_en: string;
  desc_en: string;
  effect_icon_path: string | null;
  clean_template_path: string;
  image_width: number;
  image_height: number;
  total_copies: number;
}

export interface CardRow {
  card_id: string;
  seq: number;
  template_id: string;
  pack: string;
  name_it: string;
  name_en: string;
  border: string;
  category: string;
  weapon_range: number | null;
  rank: string;
  rank_value: number;
  suit: string;
  suit_color: string;
  target_type: string;
  max_distance: number | null;
  requires_weapon_range: number;
  counts_as_bang: number;
  extra_card_discard_cost: number;
  draw_cards_count: number;
  heal_amount: number;
  damage_amount: number;
  missed_required: number;
  requires_draw_check: number;
  draw_check_suit: string | null;
  draw_check_ranks: string | null;
  slot_type: string;
  playable_out_of_turn: number;
  effect_handler: string;
  desc_type: string;
  symbol_formula: string;
  symbol_desc_en: string;
  desc_en: string;
  effect_icon_path: string | null;
  image_path: string;
  image_width: number;
  image_height: number;
}

export interface CharacterRow {
  character_id: string;
  pack: string;
  name: string;
  base_hp: number;
  ability_code: string;
  ability_trigger: string;
  bullet_symbol_formula: string;
  symbol_desc_en: string;
  desc_en: string;
  image_path: string;
  image_width: number;
  image_height: number;
}

export interface RoleRow {
  role_id: string;
  name: string;
  hp_bonus: number;
  win_condition_code: string;
  desc_en: string;
  image_path: string;
  image_width: number;
  image_height: number;
}

export interface EventRow {
  event_id: string;
  pack: string;
  name: string;
  is_final_card: number;
  effect_code: string;
  desc_en: string;
  image_path: string;
  image_width: number;
  image_height: number;
}

export interface GameSettingRow {
  setting_key: string;
  setting_value: string;
  description: string;
}

export interface PlayerSessionRow {
  session_token: string;
  player_id: string;
  player_name: string;
  pin_hash: string;
  pin_salt: string;
  ip_address: string | null;
  is_online: number;
  last_seen: string;
  created_at: string;
}

export interface ActiveRoomRow {
  room_id: string;
  host_id: string;
  status: string;
  settings_json: string;
  updated_at: string;
}

export interface MatchEventRow {
  event_id: number;
  match_id: string;
  seq: number;
  event_type: string;
  payload_json: string;
  created_at: string;
}

export interface ActiveSessionRow {
  match_id: string;
  state_json: string;
  updated_at: string;
}
