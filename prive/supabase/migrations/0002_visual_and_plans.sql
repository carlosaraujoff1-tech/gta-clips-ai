-- PRIVÉ — tipo de perfil, etiquetas, locais de atendimento, local na reserva e planos.

create type public.profile_kind as enum ('Mulheres', 'Homens', 'Casais');

alter table public.professionals
  add column kind              public.profile_kind not null default 'Mulheres',
  add column tags              text[] not null default '{}' check (cardinality(tags) <= 4),
  add column service_locations text[] not null default '{A combinar}';
create index on public.professionals (city, kind) where status = 'published';

-- Local informado pelo perfil (texto livre limitado); a plataforma não reserva locais para encontros.
alter table public.bookings add column location text not null default 'A combinar' check (char_length(location) <= 80);

-- Planos: receita por assinatura/visibilidade. NÃO existe tabela de pagamento de encontros.
create type public.plan_tier as enum ('free', 'premium');
alter table public.accounts
  add column plan       public.plan_tier not null default 'free',
  add column plan_until timestamptz;

create table public.subscription_payments (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  plan_id       text not null check (plan_id in ('cliente-premium', 'pro-premium', 'pro-destaque-7d')),
  amount_cents  integer not null check (amount_cents > 0),
  method        text not null check (method in ('pix', 'credit', 'debit')),
  provider_ref  text,              -- id da cobrança no gateway (gravado só pelo webhook)
  status        text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  created_at    timestamptz not null default now()
);
alter table public.subscription_payments enable row level security;
create policy subpay_self_read on public.subscription_payments for select using (account_id = auth.uid() or public.has_perm('reports.view'));
-- Sem INSERT/UPDATE pelo cliente: quem grava é a Edge Function do webhook do gateway (service role).

-- O titular não pode se autopromover a premium.
create or replace function public.guard_account_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.plan is distinct from old.plan or new.plan_until is distinct from old.plan_until)
     and auth.uid() is not null and not public.has_perm('users.manage') then
    raise exception 'plano só pode ser alterado pelo sistema de pagamento';
  end if;
  return new;
end $$;
create trigger accounts_plan_guard before update on public.accounts for each row execute function public.guard_account_plan();
