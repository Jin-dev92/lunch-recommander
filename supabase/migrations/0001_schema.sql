create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80)
);
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade
);
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  primary key (group_id, user_id)
);
create table public.restaurants (
  place_id text primary key,
  name text not null,
  category text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  google_rating numeric(2,1) check (google_rating between 0 and 5),
  google_ratings_total integer not null default 0 check (google_ratings_total >= 0),
  fetched_at timestamptz not null default now()
);
create table public.ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null references public.restaurants(place_id) on delete cascade,
  score smallint not null check (score between 0 and 5),
  snoozed_until timestamptz null,
  primary key (user_id, place_id)
);
create table public.category_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  weight numeric(4,2) not null check (weight > 0),
  primary key (user_id, category)
);
create table public.api_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  ip inet not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, ip, window_start)
);
