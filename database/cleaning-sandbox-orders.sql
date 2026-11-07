-- Sandbox purchase records only. Does not change free early-access permissions.
create table public.cleaning_sandbox_orders (
  session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null check (sku = 'cleaning-toolkit'),
  livemode boolean not null default false check (livemode = false),
  amount integer not null check (amount = 2900),
  currency text not null check (currency = 'cad'),
  payment_intent_id text not null unique,
  state text not null check (state in ('active', 'revoked')),
  created_at timestamptz not null default now()
);
create index cleaning_sandbox_orders_owner_idx on public.cleaning_sandbox_orders(user_id);
alter table public.cleaning_sandbox_orders enable row level security;
revoke all on public.cleaning_sandbox_orders from anon, authenticated;
grant select on public.cleaning_sandbox_orders to authenticated;
grant all on public.cleaning_sandbox_orders to service_role;
create policy "Owners read their sandbox orders" on public.cleaning_sandbox_orders
for select to authenticated using ((select auth.uid()) = user_id);
-- No client INSERT/UPDATE/DELETE policies. Only the verified webhook writes orders.

create table public.cleaning_sandbox_revocations (
  payment_intent_id text primary key,
  created_at timestamptz not null default now()
);
alter table public.cleaning_sandbox_revocations enable row level security;
revoke all on public.cleaning_sandbox_revocations from anon, authenticated;
grant all on public.cleaning_sandbox_revocations to service_role;

create function public.revoke_cleaning_sandbox_order(intent text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(intent, 0));
  insert into public.cleaning_sandbox_revocations(payment_intent_id) values(intent)
    on conflict do nothing;
  update public.cleaning_sandbox_orders set state = 'revoked' where payment_intent_id = intent;
end;
$$;

create function public.record_cleaning_sandbox_order(purchase jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  intent text := purchase->>'payment_intent_id';
  final_state text := purchase->>'state';
begin
  if intent is null or intent = '' then raise exception 'Payment intent required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(intent, 0));
  if final_state = 'revoked' then
    insert into public.cleaning_sandbox_revocations(payment_intent_id) values(intent)
      on conflict do nothing;
  end if;
  if exists(select 1 from public.cleaning_sandbox_revocations where payment_intent_id = intent) then
    final_state := 'revoked';
  end if;
  insert into public.cleaning_sandbox_orders(session_id,user_id,sku,livemode,amount,currency,payment_intent_id,state)
    values(purchase->>'session_id',(purchase->>'user_id')::uuid,purchase->>'sku',
      (purchase->>'livemode')::boolean,(purchase->>'amount')::integer,purchase->>'currency',intent,final_state)
    on conflict(session_id) do nothing;
  if final_state = 'revoked' then
    update public.cleaning_sandbox_orders set state = 'revoked' where payment_intent_id = intent;
  end if;
end;
$$;
revoke all on function public.revoke_cleaning_sandbox_order(text) from public, anon, authenticated;
revoke all on function public.record_cleaning_sandbox_order(jsonb) from public, anon, authenticated;
grant execute on function public.revoke_cleaning_sandbox_order(text) to service_role;
grant execute on function public.record_cleaning_sandbox_order(jsonb) to service_role;
