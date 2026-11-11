-- Arcanum: make campaign progress changes server-authoritative.
-- The Cloudflare Worker validates the signed-in owner and uses its server-only
-- SUPABASE_SERVICE_ROLE_KEY for AI-produced state, inventory, event and memory writes.

drop policy if exists "Users can update own game states" on public.game_states;
drop policy if exists "Users can delete own game states" on public.game_states;
drop policy if exists "Users can create own game states" on public.game_states;

create policy "Users can create initial own game states"
on public.game_states
for insert
to authenticated
with check (
    auth.uid() = user_id
    and current_hp = max_hp
    and experience = 0
    and gold = 0
);

drop policy if exists "Users can create own inventory" on public.inventory;
drop policy if exists "Users can update own inventory" on public.inventory;
drop policy if exists "Users can delete own inventory" on public.inventory;

drop policy if exists "campaign_memories_owner_insert" on public.campaign_memories;
drop policy if exists "campaign_memories_owner_update" on public.campaign_memories;
drop policy if exists "campaign_memories_owner_delete" on public.campaign_memories;

drop policy if exists "game_events_owner_insert" on public.game_events;
drop policy if exists "game_events_owner_update" on public.game_events;
drop policy if exists "game_events_owner_delete" on public.game_events;

drop policy if exists "Users can create own messages" on public.game_messages;
drop policy if exists "Users can delete own messages" on public.game_messages;
drop policy if exists "Players can only submit player or system messages" on public.game_messages;

create policy "Players can only submit player or system messages"
on public.game_messages
for insert
to authenticated
with check (
    auth.uid() = user_id
    and role in ('player', 'system')
);
