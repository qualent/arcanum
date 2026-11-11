-- Arcanum: index foreign keys and remove duplicate owner policies.
-- These indexes keep world selection, joins and cascading world deletion efficient.
create index if not exists campaign_ai_settings_user_id_idx on public.campaign_ai_settings(user_id);
create index if not exists campaign_entities_user_id_idx on public.campaign_entities(user_id);
create index if not exists campaign_memories_user_id_idx on public.campaign_memories(user_id);
create index if not exists campaign_rules_user_id_idx on public.campaign_rules(user_id);
create index if not exists campaigns_user_id_idx on public.campaigns(user_id);
create index if not exists characters_campaign_id_idx on public.characters(campaign_id);
create index if not exists characters_user_id_idx on public.characters(user_id);
create index if not exists game_events_user_id_idx on public.game_events(user_id);
create index if not exists game_messages_campaign_id_idx on public.game_messages(campaign_id);
create index if not exists game_messages_character_id_idx on public.game_messages(character_id);
create index if not exists game_messages_user_id_idx on public.game_messages(user_id);
create index if not exists game_states_campaign_id_idx on public.game_states(campaign_id);
create index if not exists game_states_user_id_idx on public.game_states(user_id);
create index if not exists inventory_campaign_id_idx on public.inventory(campaign_id);
create index if not exists inventory_character_id_idx on public.inventory(character_id);
create index if not exists inventory_user_id_idx on public.inventory(user_id);
create index if not exists messages_campaign_id_idx on public.messages(campaign_id);

-- The "own" policies are retained; these "their" policies duplicated the same access rules.
drop policy if exists "Users can delete their campaigns" on public.campaigns;
drop policy if exists "Users can create their campaigns" on public.campaigns;
drop policy if exists "Users can view their campaigns" on public.campaigns;
drop policy if exists "Users can update their campaigns" on public.campaigns;
drop policy if exists "Users can delete their characters" on public.characters;
drop policy if exists "Users can create their characters" on public.characters;
drop policy if exists "Users can view their characters" on public.characters;
drop policy if exists "Users can update their characters" on public.characters;
