-- SmartSpend initial schema. Run the entire file in Supabase SQL Editor.
-- Auth identities are individual; household transactions/budgets sync across family members.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  currency text not null default 'INR' check (char_length(currency) = 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My family' check (char_length(name) between 1 and 80),
  currency text not null default 'INR' check (char_length(currency) = 3),
  created_by uuid references public.profiles(id) on delete set null,
  weekly_start_day smallint not null default 1 check (weekly_start_day between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.households add column if not exists currency text not null default 'INR' check (char_length(currency) = 3);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  -- One active family per account; family members use their own individual logins.
  unique (user_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50),
  parent_id uuid references public.categories(id) on delete restrict,
  icon text not null default 'wallet',
  color text not null default '#24b47e' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  category_id uuid not null,
  subcategory_id uuid,
  amount numeric(12,2) not null check (amount > 0 and amount <= 9999999999.99),
  type text not null check (type in ('expense', 'income')),
  description text not null default '' check (char_length(description) <= 500),
  payment_method text not null default 'upi' check (payment_method in ('cash', 'upi', 'card', 'bank_transfer', 'other')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_category_household_fk foreign key (category_id, household_id)
    references public.categories(id, household_id) on delete restrict,
  constraint transactions_subcategory_household_fk foreign key (subcategory_id, household_id)
    references public.categories(id, household_id) on delete restrict
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  period_type text not null check (period_type in ('daily', 'weekly', 'monthly')),
  amount numeric(12,2) not null check (amount > 0 and amount <= 9999999999.99),
  category_id uuid,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_category_household_fk foreign key (category_id, household_id)
    references public.categories(id, household_id) on delete restrict,
  unique (id, household_id)
);

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses integer not null default 10 check (max_uses between 1 and 50),
  use_count integer not null default 0 check (use_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists household_members_user_idx on public.household_members(user_id);
create index if not exists categories_household_order_idx on public.categories(household_id, archived, sort_order);
create index if not exists categories_parent_idx on public.categories(parent_id);
create unique index if not exists categories_unique_root_name_idx
  on public.categories(household_id, lower(name)) where parent_id is null;
create unique index if not exists categories_unique_child_name_idx
  on public.categories(household_id, parent_id, lower(name)) where parent_id is not null;
create index if not exists transactions_household_occurred_idx on public.transactions(household_id, occurred_at desc);
create index if not exists transactions_household_category_idx on public.transactions(household_id, category_id, occurred_at desc);
create index if not exists transactions_user_idx on public.transactions(user_id, occurred_at desc);
create index if not exists budgets_household_period_idx on public.budgets(household_id, period_type, active);
create unique index if not exists budgets_unique_overall_period_idx
  on public.budgets(household_id, period_type) where category_id is null;
create unique index if not exists budgets_unique_category_period_idx
  on public.budgets(household_id, period_type, category_id) where category_id is not null;
create index if not exists household_invites_household_idx on public.household_invites(household_id, expires_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists households_set_updated_at on public.households;
create trigger households_set_updated_at before update on public.households for each row execute function public.set_updated_at();
drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at before update on public.transactions for each row execute function public.set_updated_at();
drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at before update on public.budgets for each row execute function public.set_updated_at();

create or replace function public.is_household_member(p_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id and hm.user_id = auth.uid()
  );
$$;

create or replace function public.is_household_admin(p_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id and hm.user_id = auth.uid() and hm.role = 'admin'
  );
$$;

create or replace function public.validate_category_parent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null and exists (select 1 from public.categories child where child.parent_id = new.id) then
    raise exception 'A category with subcategories must remain top-level.' using errcode = '23514';
  end if;
  if new.parent_id is not null and not exists (
    select 1 from public.categories p
    where p.id = new.parent_id and p.household_id = new.household_id and p.parent_id is null and p.id <> new.id
  ) then
    raise exception 'A subcategory parent must be a top-level category in this family.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists categories_validate_parent on public.categories;
create trigger categories_validate_parent before insert or update of parent_id, household_id
on public.categories for each row execute function public.validate_category_parent();

create or replace function public.prevent_transaction_owner_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'The transaction author cannot be changed.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists transactions_prevent_owner_change on public.transactions;
create trigger transactions_prevent_owner_change before update of user_id on public.transactions
for each row execute function public.prevent_transaction_owner_change();

create or replace function public.validate_transaction_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.household_id = new.household_id and c.parent_id is null
  ) then
    raise exception 'Primary category must be a top-level category in this family.' using errcode = '23503';
  end if;
  if new.subcategory_id is not null and not exists (
    select 1 from public.categories s
    where s.id = new.subcategory_id and s.household_id = new.household_id and s.parent_id = new.category_id
  ) then
    raise exception 'Subcategory must belong to the selected category.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists transactions_validate_categories on public.transactions;
create trigger transactions_validate_categories before insert or update of category_id, subcategory_id, household_id
on public.transactions for each row execute function public.validate_transaction_categories();

create or replace function public.validate_budget_category()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.household_id = new.household_id and c.parent_id is null
  ) then
    raise exception 'Budget category must be a top-level category in this family.' using errcode = '23503';
  end if;
  return new;
end;
$$;
drop trigger if exists budgets_validate_category on public.budgets;
create trigger budgets_validate_category before insert or update of category_id, household_id
on public.budgets for each row execute function public.validate_budget_category();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_household_id uuid;
  v_name text;
  v_category text;
  v_order integer := 0;
begin
  v_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, 'My'), '@', 1));
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), v_name)
  on conflict (id) do update set email = excluded.email;

  insert into public.households (name, created_by)
  values (left(v_name, 60) || '''s family', new.id)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, new.id, 'admin')
  on conflict (household_id, user_id) do nothing;

  foreach v_category in array array[
    'Mobile', 'Snacks', 'Brunch', 'Lunch', 'Evening Snacks', 'Dinner',
    'Travel', 'Petrol', 'Car', 'Bike', 'Gifts', 'Needs', 'Wants'
  ] loop
    insert into public.categories (household_id, name, icon, color, sort_order, created_by)
    values (
      v_household_id, v_category,
      case v_category
        when 'Mobile' then 'smartphone'
        when 'Snacks' then 'cookie'
        when 'Brunch' then 'coffee'
        when 'Lunch' then 'utensils'
        when 'Evening Snacks' then 'coffee'
        when 'Dinner' then 'utensils'
        when 'Travel' then 'train-front'
        when 'Petrol' then 'fuel'
        when 'Car' then 'car-front'
        when 'Bike' then 'bike'
        when 'Gifts' then 'gift'
        when 'Needs' then 'shopping-basket'
        else 'sparkles'
      end,
      case v_category
        when 'Mobile' then '#6788ee'
        when 'Snacks' then '#f59e0b'
        when 'Brunch' then '#f59e0b'
        when 'Lunch' then '#ec8064'
        when 'Evening Snacks' then '#ee9b57'
        when 'Dinner' then '#a78bfa'
        when 'Travel' then '#38bdf8'
        when 'Petrol' then '#64748b'
        when 'Car' then '#4f7dce'
        when 'Bike' then '#22a06b'
        when 'Gifts' then '#ec6d9b'
        when 'Needs' then '#14b8a6'
        else '#9b83e8'
      end,
      v_order, new.id
    );
    v_order := v_order + 1;
  end loop;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_smartspend on auth.users;
create trigger on_auth_user_created_smartspend
  after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.create_household_invite()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_household_id uuid;
  v_code text;
begin
  select hm.household_id into v_household_id
  from public.household_members hm
  where hm.user_id = auth.uid() and hm.role = 'admin'
  limit 1;
  if v_household_id is null then
    raise exception 'Only a family administrator can create invites.' using errcode = '42501';
  end if;
  v_code := upper(encode(extensions.gen_random_bytes(6), 'hex'));
  insert into public.household_invites (household_id, code_hash, created_by, expires_at, max_uses)
  values (v_household_id, encode(extensions.digest(lower(v_code), 'sha256'), 'hex'), auth.uid(), now() + interval '7 days', 10);
  return v_code;
end;
$$;

create or replace function public.join_household_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_household_id uuid;
  v_current_household_id uuid;
  v_current_member_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  -- A fresh signup receives an empty starter household. Permit joining an invited family
  -- by replacing that starter household only when it contains no financial history.
  select household_id into v_current_household_id
  from public.household_members where user_id = auth.uid() limit 1;
  if v_current_household_id is not null then
    if exists (select 1 from public.transactions where household_id = v_current_household_id)
       or exists (select 1 from public.budgets where household_id = v_current_household_id) then
      raise exception 'This account already has financial data. Export it before joining another family.' using errcode = '23505';
    end if;
    select count(*) into v_current_member_count from public.household_members where household_id = v_current_household_id;
    if v_current_member_count <> 1 or not exists (
      select 1 from public.households where id = v_current_household_id and created_by = auth.uid()
    ) then
      raise exception 'This account already belongs to a family.' using errcode = '23505';
    end if;
  end if;
  select hi.household_id into v_household_id
  from public.household_invites hi
  where hi.code_hash = encode(extensions.digest(lower(trim(coalesce(p_code, ''))), 'sha256'), 'hex')
    and hi.expires_at > now() and hi.use_count < hi.max_uses
  order by hi.created_at desc limit 1
  for update;
  if v_household_id is null then
    raise exception 'Invite code is invalid, expired, or fully used.' using errcode = '22023';
  end if;
  if v_current_household_id is not null then
    delete from public.households where id = v_current_household_id;
  end if;
  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, auth.uid(), 'member');
  update public.household_invites set use_count = use_count + 1
  where code_hash = encode(extensions.digest(lower(trim(coalesce(p_code, ''))), 'sha256'), 'hex');
  return v_household_id;
end;
$$;

revoke all on function public.create_household_invite() from public, anon;
revoke all on function public.join_household_by_code(text) from public, anon;
revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.is_household_admin(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_admin(uuid) to authenticated;
grant execute on function public.create_household_invite() to authenticated;
grant execute on function public.join_household_by_code(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.household_invites enable row level security;

-- SQL-created tables need explicit API role grants in addition to RLS policies.
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists households_select_member on public.households;
create policy households_select_member on public.households for select to authenticated using (public.is_household_member(id));
drop policy if exists households_update_admin on public.households;
create policy households_update_admin on public.households for update to authenticated using (public.is_household_admin(id)) with check (public.is_household_admin(id));

drop policy if exists household_members_select_family on public.household_members;
create policy household_members_select_family on public.household_members for select to authenticated using (public.is_household_member(household_id));

drop policy if exists categories_select_family on public.categories;
create policy categories_select_family on public.categories for select to authenticated using (public.is_household_member(household_id));
drop policy if exists categories_insert_family on public.categories;
create policy categories_insert_family on public.categories for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
drop policy if exists categories_update_family on public.categories;
create policy categories_update_family on public.categories for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists categories_delete_family on public.categories;
create policy categories_delete_family on public.categories for delete to authenticated using (public.is_household_member(household_id));

drop policy if exists transactions_select_family on public.transactions;
create policy transactions_select_family on public.transactions for select to authenticated using (public.is_household_member(household_id));
drop policy if exists transactions_insert_family on public.transactions;
create policy transactions_insert_family on public.transactions for insert to authenticated with check (public.is_household_member(household_id) and user_id = auth.uid());
drop policy if exists transactions_update_family on public.transactions;
create policy transactions_update_family on public.transactions for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists transactions_delete_family on public.transactions;
create policy transactions_delete_family on public.transactions for delete to authenticated using (public.is_household_member(household_id));

drop policy if exists budgets_select_family on public.budgets;
create policy budgets_select_family on public.budgets for select to authenticated using (public.is_household_member(household_id));
drop policy if exists budgets_insert_family on public.budgets;
create policy budgets_insert_family on public.budgets for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid());
drop policy if exists budgets_update_family on public.budgets;
create policy budgets_update_family on public.budgets for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists budgets_delete_family on public.budgets;
create policy budgets_delete_family on public.budgets for delete to authenticated using (public.is_household_member(household_id));

-- Invite rows are intentionally not directly selectable. Creating/joining is done by SECURITY DEFINER RPCs.
drop policy if exists household_invites_admin_insert on public.household_invites;
create policy household_invites_admin_insert on public.household_invites for insert to authenticated with check (public.is_household_admin(household_id) and created_by = auth.uid());

-- Enable Realtime delivery for synchronized dashboards when the publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions') then
      alter publication supabase_realtime add table public.transactions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories') then
      alter publication supabase_realtime add table public.categories;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'budgets') then
      alter publication supabase_realtime add table public.budgets;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'household_members') then
      alter publication supabase_realtime add table public.household_members;
    end if;
  end if;
end;
$$;
