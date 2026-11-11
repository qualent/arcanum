-- Arcanum AI-DM foundation
-- Applied directly to the Supabase project on 2026-11-11.
-- This migration records the schema so it can be reproduced in another environment.

begin;

create table if not exists public.campaign_memories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    campaign_id uuid not null references public.campaigns(id) on delete cascade,
    character_id uuid references public.characters(id) on delete cascade,
    scope text not null default 'world' check (scope in ('world','character','session')),
    memory_type text not null default 'fact' check (memory_type in ('fact','event','secret','relationship','quest','promise','rule','summary')),
    title text not null,
    content text not null,
    importance smallint not null default 5 check (importance between 1 and 10),
    tags text[] not null default '{}',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.campaign_entities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    campaign_id uuid not null references public.campaigns(id) on delete cascade,
    entity_type text not null,
    name text not null,
    description text not null default '',
    public_state jsonb not null default '{}'::jsonb,
    private_state jsonb not null default '{}'::jsonb,
    status text not null default 'active',
    last_seen_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.game_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    campaign_id uuid not null references public.campaigns(id) on delete cascade,
    character_id uuid references public.characters(id) on delete set null,
    event_type text not null,
    summary text not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.campaign_ai_settings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
    provider text not null default 'groq' check (provider in ('groq','gemini','openrouter','cloudflare','custom')),
    model text not null default '',
    temperature numeric(3,2) not null default 0.7 check (temperature between 0 and 1.5),
    response_style text not null default 'immersive' check (response_style in ('concise','immersive','detailed')),
    rules_profile text not null default 'dnd5e_2014',
    enabled boolean not null default true,
    custom_instructions text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.campaign_rules (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    campaign_id uuid not null references public.campaigns(id) on delete cascade,
    category text not null,
    title text not null,
    rule_text text not null,
    source_name text not null default 'Homebrew',
    source_reference text not null default '',
    ruleset text not null default 'dnd5e_2014',
    structured_data jsonb not null default '{}'::jsonb,
    enabled boolean not null default true,
    priority smallint not null default 5 check (priority between 1 and 10),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.inventory
    add column if not exists item_type text not null default 'misc',
    add column if not exists rarity text not null default 'common',
    add column if not exists properties jsonb not null default '{}'::jsonb,
    add column if not exists equipped boolean not null default false,
    add column if not exists weight numeric(8,2) not null default 0,
    add column if not exists requires_attunement boolean not null default false,
    add column if not exists attuned boolean not null default false;

create index if not exists campaign_memories_campaign_idx on public.campaign_memories(campaign_id, scope, importance desc);
create index if not exists campaign_memories_character_idx on public.campaign_memories(character_id) where character_id is not null;
create index if not exists campaign_memories_tags_idx on public.campaign_memories using gin(tags);
create index if not exists campaign_entities_campaign_type_idx on public.campaign_entities(campaign_id, entity_type, status);
create index if not exists campaign_entities_name_idx on public.campaign_entities(campaign_id, lower(name));
create index if not exists game_events_campaign_time_idx on public.game_events(campaign_id, created_at desc);
create index if not exists game_events_character_time_idx on public.game_events(character_id, created_at desc);
create index if not exists campaign_rules_lookup_idx on public.campaign_rules(campaign_id, enabled, category, priority desc);

alter table public.campaign_memories enable row level security;
alter table public.campaign_entities enable row level security;
alter table public.game_events enable row level security;
alter table public.campaign_ai_settings enable row level security;
alter table public.campaign_rules enable row level security;

grant select, insert, update, delete on public.campaign_memories, public.campaign_entities,
    public.game_events, public.campaign_ai_settings, public.campaign_rules to authenticated;

create policy "campaign_memories_owner_select" on public.campaign_memories for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "campaign_memories_owner_insert" on public.campaign_memories for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid()))
and (character_id is null or exists (select 1 from public.characters ch where ch.id = character_id and ch.campaign_id = campaign_id and ch.user_id = (select auth.uid()))));
create policy "campaign_memories_owner_update" on public.campaign_memories for update to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())))
with check (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "campaign_memories_owner_delete" on public.campaign_memories for delete to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));

create policy "campaign_entities_owner_select" on public.campaign_entities for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "campaign_entities_owner_insert" on public.campaign_entities for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "campaign_entities_owner_update" on public.campaign_entities for update to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())))
with check (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "campaign_entities_owner_delete" on public.campaign_entities for delete to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));

create policy "game_events_owner_select" on public.game_events for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "game_events_owner_insert" on public.game_events for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid()))
and (character_id is null or exists (select 1 from public.characters ch where ch.id = character_id and ch.campaign_id = campaign_id and ch.user_id = (select auth.uid()))));
create policy "game_events_owner_update" on public.game_events for update to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())))
with check (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "game_events_owner_delete" on public.game_events for delete to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));

create policy "campaign_ai_settings_owner_select" on public.campaign_ai_settings for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "campaign_ai_settings_owner_insert" on public.campaign_ai_settings for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "campaign_ai_settings_owner_update" on public.campaign_ai_settings for update to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())))
with check (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "campaign_ai_settings_owner_delete" on public.campaign_ai_settings for delete to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));

create policy "campaign_rules_owner_select" on public.campaign_rules for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "campaign_rules_owner_insert" on public.campaign_rules for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "campaign_rules_owner_update" on public.campaign_rules for update to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())))
with check (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));
create policy "campaign_rules_owner_delete" on public.campaign_rules for delete to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = (select auth.uid())));

commit;
