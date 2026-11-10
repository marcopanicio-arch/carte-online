-- Schema per il gioco online. Da incollare una volta nel SQL Editor di Supabase e premere "Run".
-- Si può rieseguire: crea solo ciò che manca.

-- ============ Profili ============
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));
alter table public.profiles enable row level security;

drop policy if exists "profili visibili" on public.profiles;
create policy "profili visibili" on public.profiles for select to authenticated using (true);

-- Il profilo nasce insieme all'account, col nome scelto in registrazione.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username) values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Controllo del nome prima di registrarsi (chiamabile anche senza account).
create or replace function public.username_available(name text) returns boolean
language sql security definer set search_path = public stable as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ============ Amicizie ============
create table if not exists public.friendships (
  requester uuid not null references public.profiles on delete cascade,
  addressee uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- Una sola relazione per coppia, in qualunque direzione.
create unique index if not exists friendships_pair
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
alter table public.friendships enable row level security;

drop policy if exists "vedi le tue amicizie" on public.friendships;
create policy "vedi le tue amicizie" on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));

drop policy if exists "invia richiesta" on public.friendships;
create policy "invia richiesta" on public.friendships for insert to authenticated
  with check (requester = auth.uid() and status = 'pending');

drop policy if exists "accetta richiesta" on public.friendships;
create policy "accetta richiesta" on public.friendships for update to authenticated
  using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');

drop policy if exists "rimuovi amicizia" on public.friendships;
create policy "rimuovi amicizia" on public.friendships for delete to authenticated
  using (auth.uid() in (requester, addressee));

-- Chi accetta può cambiare solo lo stato, non i nomi.
revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;

-- ============ Partite ============
-- La tabella "matches" contiene solo ciò che entrambi possono vedere.
-- Mazzo e mani stanno in tabelle a parte: il mazzo non lo vede nessuno, ogni mano solo il suo giocatore.
-- Tutte le scritture passano dal server (Vercel), che controlla le mosse.
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  game text not null default 'briscola',
  player0 uuid not null references public.profiles on delete cascade,
  player1 uuid not null references public.profiles on delete cascade,
  status text not null default 'invited'
    check (status in ('invited', 'active', 'finished', 'declined', 'cancelled')),
  public jsonb,
  version int not null default 0,
  winner int,
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists matches_player0 on public.matches (player0, status);
create index if not exists matches_player1 on public.matches (player1, status);
alter table public.matches enable row level security;

drop policy if exists "vedi le tue partite" on public.matches;
create policy "vedi le tue partite" on public.matches for select to authenticated
  using (auth.uid() in (player0, player1));

create table if not exists public.match_secrets (
  match_id uuid primary key references public.matches on delete cascade,
  state jsonb not null
);
alter table public.match_secrets enable row level security; -- nessuna policy: solo il server

create table if not exists public.match_hands (
  match_id uuid not null references public.matches on delete cascade,
  player uuid not null references public.profiles on delete cascade,
  cards jsonb not null,
  primary key (match_id, player)
);
alter table public.match_hands enable row level security;

drop policy if exists "vedi la tua mano" on public.match_hands;
create policy "vedi la tua mano" on public.match_hands for select to authenticated
  using (player = auth.uid());

-- Salvataggio atomico di una mossa: stato pubblico, stato segreto e mani insieme.
-- Fallisce (ritorna false) se nel frattempo qualcun altro ha già mosso.
create or replace function public.save_match(
  p_id uuid, p_expected_version int, p_status text, p_public jsonb, p_state jsonb,
  p_hand0 jsonb, p_hand1 jsonb, p_winner int, p_result text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  m public.matches;
begin
  update public.matches
     set status = p_status, public = p_public, winner = p_winner, result = p_result,
         version = version + 1, updated_at = now()
   where id = p_id and version = p_expected_version
  returning * into m;
  if not found then return false; end if;

  if p_state is not null then
    insert into public.match_secrets (match_id, state) values (p_id, p_state)
    on conflict (match_id) do update set state = excluded.state;
  end if;
  if p_hand0 is not null then
    insert into public.match_hands (match_id, player, cards) values (p_id, m.player0, p_hand0)
    on conflict (match_id, player) do update set cards = excluded.cards;
  end if;
  if p_hand1 is not null then
    insert into public.match_hands (match_id, player, cards) values (p_id, m.player1, p_hand1)
    on conflict (match_id, player) do update set cards = excluded.cards;
  end if;
  return true;
end $$;
revoke execute on function public.save_match from public, anon, authenticated;
grant execute on function public.save_match to service_role;

-- ============ Permessi ============
-- Espliciti, così funziona anche se il progetto non concede i permessi in automatico.
-- Le policy sopra restano comunque il vero filtro, riga per riga.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles, public.friendships, public.matches, public.match_hands to authenticated;
grant insert, delete on public.friendships to authenticated;
grant all on public.profiles, public.friendships, public.matches, public.match_secrets, public.match_hands to service_role;

-- ============ Tempo reale ============
-- Gli utenti ricevono subito i cambiamenti di partite e amicizie (sempre filtrati dalle policy sopra).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'matches') then
    alter publication supabase_realtime add table public.matches;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'friendships') then
    alter publication supabase_realtime add table public.friendships;
  end if;
end $$;
