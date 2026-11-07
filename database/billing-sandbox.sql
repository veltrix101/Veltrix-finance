-- Isolated test billing. These records never change existing beta permissions.
create table public.billing_sandbox_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 customer_id text unique,
 trial_used boolean not null default false,
 risk_blocked boolean not null default false,
 lease_id uuid,
 lease_until timestamptz,
 created_at timestamptz not null default now()
);
create table public.billing_sandbox_subscriptions (
 subscription_id text primary key,
 user_id uuid not null references public.billing_sandbox_accounts(user_id) on delete cascade,
 customer_id text not null,
 price_id text not null,
 status text not null,
 access_until timestamptz,
 cancel_at_period_end boolean not null default false,
 event_created bigint not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.billing_sandbox_accounts enable row level security;
alter table public.billing_sandbox_subscriptions enable row level security;
revoke all on public.billing_sandbox_accounts,public.billing_sandbox_subscriptions from anon,authenticated;
grant all on public.billing_sandbox_accounts,public.billing_sandbox_subscriptions to service_role;
create function public.claim_billing_sandbox_lease(owner_id uuid, request_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare acquired integer;
begin
 insert into public.billing_sandbox_accounts(user_id) values(owner_id) on conflict do nothing;
 update public.billing_sandbox_accounts set lease_id=request_id,lease_until=now()+interval '90 seconds'
 where user_id=owner_id and (lease_until is null or lease_until<now());
 get diagnostics acquired = row_count;
 return acquired=1;
end; $$;
revoke all on function public.claim_billing_sandbox_lease(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_billing_sandbox_lease(uuid,uuid) to service_role;
create function public.sync_billing_sandbox_subscription(snapshot jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare owner_id uuid;
begin
 select user_id into owner_id from public.billing_sandbox_accounts where customer_id=snapshot->>'customer_id';
 if owner_id is null then return; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(snapshot->>'subscription_id',0));
 insert into public.billing_sandbox_subscriptions(subscription_id,user_id,customer_id,price_id,status,access_until,cancel_at_period_end,event_created)
 values(snapshot->>'subscription_id',owner_id,snapshot->>'customer_id',snapshot->>'price_id',snapshot->>'status',nullif(snapshot->>'access_until','')::timestamptz,(snapshot->>'cancel_at_period_end')::boolean,(snapshot->>'event_created')::bigint)
 on conflict(subscription_id) do update set status=excluded.status,price_id=excluded.price_id,access_until=excluded.access_until,cancel_at_period_end=excluded.cancel_at_period_end,event_created=excluded.event_created,updated_at=now()
 where excluded.event_created>=public.billing_sandbox_subscriptions.event_created
 and (public.billing_sandbox_subscriptions.status<>'canceled' or excluded.status='canceled');
 update public.billing_sandbox_accounts set trial_used=true where user_id=owner_id;
end; $$;
revoke all on function public.sync_billing_sandbox_subscription(jsonb) from public,anon,authenticated;
grant execute on function public.sync_billing_sandbox_subscription(jsonb) to service_role;
