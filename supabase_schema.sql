-- TapTale online database setup for Supabase
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  age integer,
  relation text default 'Child',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;

-- Owners can manage only their own profiles.
drop policy if exists "owners can read profiles" on public.profiles;
drop policy if exists "owners can insert profiles" on public.profiles;
drop policy if exists "owners can update profiles" on public.profiles;
drop policy if exists "owners can delete profiles" on public.profiles;
create policy "owners can read profiles" on public.profiles for select to authenticated using (owner_id = auth.uid());
create policy "owners can insert profiles" on public.profiles for insert to authenticated with check (owner_id = auth.uid());
create policy "owners can update profiles" on public.profiles for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners can delete profiles" on public.profiles for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "owners can manage contacts" on public.contacts;
create policy "owners can manage contacts" on public.contacts for all to authenticated using (exists(select 1 from public.profiles p where p.id=profile_id and p.owner_id=auth.uid())) with check (exists(select 1 from public.profiles p where p.id=profile_id and p.owner_id=auth.uid()));

-- Public profile lookup: returns only one requested profile and its contacts.
create or replace function public.get_public_profile(p_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'age', p.age,
    'relation', p.relation,
    'note', p.note,
    'contacts', coalesce((select jsonb_agg(jsonb_build_object('name',c.name,'phone',c.phone) order by c.created_at) from public.contacts c where c.profile_id=p.id), '[]'::jsonb)
  ), '{}'::jsonb)
  from public.profiles p
  where p.id = p_id;
$$;
revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;

-- Keep updated_at fresh.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
