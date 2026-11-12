-- ═══════════════════════════════════════════════════════════════════════════
-- PRIVÉ — esquema inicial (PostgreSQL / Supabase)
-- Segurança: RLS habilitada em TODAS as tabelas. Nada é acessível sem política.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ─────────────────────────── Tipos ───────────────────────────
create type public.user_role         as enum ('client', 'professional', 'partner', 'admin');
create type public.account_status    as enum ('active', 'suspended');
create type public.verification      as enum ('none', 'pending', 'verified', 'rejected');
create type public.profile_status    as enum ('draft', 'pending', 'published', 'suspended');
create type public.media_status      as enum ('pending', 'approved', 'rejected');
create type public.place_status      as enum ('pending', 'approved', 'suspended');
create type public.booking_status    as enum ('requested', 'accepted', 'declined', 'cancelled', 'completed');
create type public.report_target     as enum ('professional', 'user', 'message', 'establishment');
create type public.report_status     as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.report_priority   as enum ('normal', 'urgent');
create type public.admin_permission  as enum (
  'users.manage', 'verifications.review', 'reports.moderate',
  'establishments.manage', 'reports.view', 'permissions.manage'
);

-- ─────────────────────────── Contas ───────────────────────────
-- Dados públicos mínimos. auth.users guarda e-mail e senha (hash bcrypt do Supabase Auth).
create table public.accounts (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text not null check (char_length(display_name) between 1 and 60),
  role             public.user_role not null default 'client',
  status           public.account_status not null default 'active',
  avatar_path      text,
  discreet_mode    boolean not null default false,
  created_at       timestamptz not null default now()
);

-- Dados pessoais sensíveis: só o titular e a equipe de verificação leem.
create table public.account_private (
  account_id        uuid primary key references public.accounts (id) on delete cascade,
  birthdate         date not null,
  age_confirmed_at  timestamptz not null default now(),
  constraint adults_only check (birthdate <= (current_date - interval '18 years'))
);

create table public.consents (
  account_id   uuid primary key references public.accounts (id) on delete cascade,
  terms        boolean not null,
  privacy      boolean not null,
  adults_only  boolean not null,
  analytics    boolean not null default false,
  marketing    boolean not null default false,
  updated_at   timestamptz not null default now(),
  constraint required_consents check (terms and privacy and adults_only)
);

create table public.admin_permissions (
  account_id  uuid references public.accounts (id) on delete cascade,
  permission  public.admin_permission not null,
  primary key (account_id, permission)
);

-- ─────────────────────────── Funções auxiliares (SECURITY DEFINER) ───────────────────────────
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from accounts where id = auth.uid() and status = 'active'
$$;

create or replace function public.has_perm(p public.admin_permission) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_permissions ap join accounts a on a.id = ap.account_id
    where ap.account_id = auth.uid() and ap.permission = p and a.role = 'admin' and a.status = 'active'
  )
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from accounts where id = auth.uid() and status = 'active')
$$;

-- ─────────────────────────── Profissionais ───────────────────────────
create table public.professionals (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null unique references public.accounts (id) on delete cascade,
  display_name   text not null check (char_length(display_name) between 1 and 40),
  headline       text not null default '' check (char_length(headline) <= 60),
  bio            text not null default '' check (char_length(bio) <= 800),
  city           text not null,
  region         text not null,
  categories     text[] not null default '{}',
  languages      text[] not null default '{Português}',
  price_from     integer check (price_from is null or price_from between 0 and 100000), -- apenas informativo
  verification   public.verification not null default 'none',
  status         public.profile_status not null default 'draft',
  slot_minutes   integer not null default 60 check (slot_minutes in (30, 60, 90, 120)),
  created_at     timestamptz not null default now(),
  -- Regra de ouro: nenhum perfil é publicado sem identidade verificada.
  constraint publish_requires_verification check (status <> 'published' or verification = 'verified')
);
create index on public.professionals (city, region) where status = 'published';

create table public.professional_photos (
  id               uuid primary key default gen_random_uuid(),
  professional_id  uuid not null references public.professionals (id) on delete cascade,
  storage_path     text not null,          -- bucket privado "profile-photos"
  caption          text not null default '',
  status           public.media_status not null default 'pending',
  position         smallint not null default 0,
  created_at       timestamptz not null default now()
);

create table public.availability (
  id               uuid primary key default gen_random_uuid(),
  professional_id  uuid references public.professionals (id) on delete cascade,
  establishment_id uuid,  -- FK adicionada abaixo
  weekday          smallint not null check (weekday between 0 and 6),
  starts           time not null,
  ends             time not null,
  check (starts < ends),
  check ((professional_id is null) <> (establishment_id is null))
);

create table public.blocked_dates (
  professional_id uuid references public.professionals (id) on delete cascade,
  day             date not null,
  primary key (professional_id, day)
);

-- Documentos de verificação: bucket "verification-docs" (privado, sem leitura pública).
create table public.verification_requests (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete cascade,
  professional_id  uuid not null references public.professionals (id) on delete cascade,
  legal_name       text not null,
  birthdate        date not null,
  document_type    text not null check (document_type in ('RG', 'CNH', 'Passaporte')),
  document_path    text not null,
  selfie_path      text not null,
  status           public.media_status not null default 'pending',
  notes            text not null default '',
  reviewed_by      uuid references public.accounts (id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  constraint verification_adults_only check (status <> 'approved' or birthdate <= (current_date - interval '18 years'))
);

-- ─────────────────────────── Estabelecimentos ───────────────────────────
create table public.establishments (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.accounts (id) on delete cascade,
  name            text not null,
  kind            text not null,
  city            text not null,
  region          text not null,
  address         text not null,
  description     text not null default '',
  amenities       text[] not null default '{}',
  license_number  text not null,
  cnpj            text,
  status          public.place_status not null default 'pending',
  created_at      timestamptz not null default now()
);
alter table public.availability
  add constraint availability_establishment_fk foreign key (establishment_id) references public.establishments (id) on delete cascade;

create table public.establishment_photos (
  id               uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  storage_path     text not null,
  caption          text not null default '',
  status           public.media_status not null default 'pending',
  created_at       timestamptz not null default now()
);

-- ─────────────────────────── Interação ───────────────────────────
create table public.favorites (
  account_id      uuid references public.accounts (id) on delete cascade,
  professional_id uuid references public.professionals (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (account_id, professional_id)
);

create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.accounts (id) on delete cascade,
  professional_id  uuid references public.professionals (id) on delete set null,
  establishment_id uuid references public.establishments (id) on delete set null,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  duration_min     integer not null check (duration_min between 30 and 480),
  note             text not null default '' check (char_length(note) <= 500),
  status           public.booking_status not null default 'requested',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((professional_id is null) <> (establishment_id is null)),
  check (starts_at > created_at)
);
-- Impede duas reservas ativas no mesmo horário para o mesmo perfil.
create or replace function public.set_booking_end() returns trigger language plpgsql as $$
begin
  new.ends_at := new.starts_at + make_interval(mins => new.duration_min);
  return new;
end $$;
create trigger bookings_set_end before insert or update of starts_at, duration_min on public.bookings
  for each row execute function public.set_booking_end();
alter table public.bookings add constraint no_double_booking exclude using gist (
  professional_id with =,
  tstzrange(starts_at, ends_at) with &&
) where (status in ('requested', 'accepted') and professional_id is not null);

create table public.reviews (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null unique references public.bookings (id) on delete cascade,
  author_id        uuid not null references public.accounts (id) on delete cascade,
  professional_id  uuid not null references public.professionals (id) on delete cascade,
  rating           smallint not null check (rating between 1 and 5),
  body             text not null default '' check (char_length(body) <= 600),
  status           text not null default 'published' check (status in ('published', 'hidden')),
  created_at       timestamptz not null default now()
);

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.accounts (id) on delete cascade,
  professional_id  uuid not null references public.professionals (id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (client_id, professional_id)
);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid references public.accounts (id) on delete set null,
  body             text not null check (char_length(body) between 1 and 1000),
  masked           boolean not null default false,
  flagged          boolean not null default false,
  created_at       timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

create table public.blocks (
  account_id  uuid references public.accounts (id) on delete cascade,
  blocked_id  uuid references public.accounts (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (account_id, blocked_id),
  check (account_id <> blocked_id)
);

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references public.accounts (id) on delete set null, -- null = automática
  target_type  public.report_target not null,
  target_id    uuid not null,
  reason       text not null,
  details      text not null default '' check (char_length(details) <= 1000),
  priority     public.report_priority not null default 'normal',
  status       public.report_status not null default 'open',
  automatic    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on public.reports (status, priority, created_at desc);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  title       text not null,
  body        text not null,
  href        text not null default '/',
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Auditoria administrativa: somente inserção (sem UPDATE/DELETE para ninguém).
create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.accounts (id) on delete set null,
  action       text not null,
  target_type  text not null,
  target_id    text not null,
  details      text not null default '',
  created_at   timestamptz not null default now()
);

-- ─────────────────────────── Funções de visibilidade ───────────────────────────
create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (account_id = a and blocked_id = b) or (account_id = b and blocked_id = a))
$$;

create or replace function public.owns_professional(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from professionals where id = pid and account_id = auth.uid())
$$;

create or replace function public.owns_establishment(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from establishments where id = eid and owner_id = auth.uid())
$$;

create or replace function public.is_visible_professional(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from professionals p join accounts a on a.id = p.account_id
    where p.id = pid and p.status = 'published' and p.verification = 'verified' and a.status = 'active'
      and not public.is_blocked(auth.uid(), p.account_id)
  )
$$;

-- ═══════════════════════════ RLS ═══════════════════════════
alter table public.accounts               enable row level security;
alter table public.account_private        enable row level security;
alter table public.consents               enable row level security;
alter table public.admin_permissions      enable row level security;
alter table public.professionals          enable row level security;
alter table public.professional_photos    enable row level security;
alter table public.availability           enable row level security;
alter table public.blocked_dates          enable row level security;
alter table public.verification_requests  enable row level security;
alter table public.establishments         enable row level security;
alter table public.establishment_photos   enable row level security;
alter table public.favorites              enable row level security;
alter table public.bookings               enable row level security;
alter table public.reviews                enable row level security;
alter table public.conversations          enable row level security;
alter table public.messages               enable row level security;
alter table public.blocks                 enable row level security;
alter table public.reports                enable row level security;
alter table public.notifications          enable row level security;
alter table public.audit_log              enable row level security;

-- Contas: cada um vê/edita a própria; admins com users.manage veem todas.
create policy accounts_self_read   on public.accounts for select using (id = auth.uid() or public.has_perm('users.manage'));
create policy accounts_self_update on public.accounts for update using (id = auth.uid())
  with check (id = auth.uid() and role = public.my_role() and status = 'active');
create policy accounts_admin_update on public.accounts for update using (public.has_perm('users.manage'));

create policy private_self on public.account_private for select using (account_id = auth.uid() or public.has_perm('verifications.review'));
create policy consents_self on public.consents for all using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy perms_read  on public.admin_permissions for select using (account_id = auth.uid() or public.has_perm('permissions.manage'));
create policy perms_write on public.admin_permissions for all using (public.has_perm('permissions.manage')) with check (public.has_perm('permissions.manage'));

-- Profissionais: público autenticado só vê publicados + verificados; dono vê o seu; moderação vê tudo.
create policy pro_public_read on public.professionals for select
  using (public.is_visible_professional(id) or account_id = auth.uid() or public.has_perm('reports.moderate') or public.has_perm('verifications.review'));
create policy pro_owner_insert on public.professionals for insert
  with check (account_id = auth.uid() and public.my_role() = 'professional' and status = 'draft' and verification = 'none');
-- O dono edita textos/agenda, mas NÃO pode alterar status nem verificação (trigger abaixo).
create policy pro_owner_update on public.professionals for update using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy pro_mod_update   on public.professionals for update using (public.has_perm('reports.moderate') or public.has_perm('verifications.review'));

create policy photos_read on public.professional_photos for select
  using ((status = 'approved' and public.is_visible_professional(professional_id)) or public.owns_professional(professional_id) or public.has_perm('reports.moderate'));
create policy photos_owner_insert on public.professional_photos for insert with check (public.owns_professional(professional_id) and status = 'pending');
create policy photos_owner_delete on public.professional_photos for delete using (public.owns_professional(professional_id));
create policy photos_mod_update   on public.professional_photos for update using (public.has_perm('reports.moderate'));

create policy avail_read on public.availability for select using (
  (professional_id is not null and (public.is_visible_professional(professional_id) or public.owns_professional(professional_id)))
  or (establishment_id is not null and (exists (select 1 from public.establishments e where e.id = establishment_id and e.status = 'approved') or public.owns_establishment(establishment_id)))
);
create policy avail_write on public.availability for all
  using (public.owns_professional(professional_id) or public.owns_establishment(establishment_id))
  with check (public.owns_professional(professional_id) or public.owns_establishment(establishment_id));

create policy blocked_dates_owner on public.blocked_dates for all using (public.owns_professional(professional_id)) with check (public.owns_professional(professional_id));
create policy blocked_dates_read  on public.blocked_dates for select using (public.is_visible_professional(professional_id));

create policy verif_owner_insert on public.verification_requests for insert
  with check (account_id = auth.uid() and public.owns_professional(professional_id) and status = 'pending');
create policy verif_read   on public.verification_requests for select using (account_id = auth.uid() or public.has_perm('verifications.review'));
create policy verif_review on public.verification_requests for update using (public.has_perm('verifications.review'));

create policy est_read on public.establishments for select using (status = 'approved' or owner_id = auth.uid() or public.has_perm('establishments.manage'));
create policy est_owner_insert on public.establishments for insert with check (owner_id = auth.uid() and public.my_role() = 'partner' and status = 'pending');
create policy est_owner_update on public.establishments for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy est_admin_update on public.establishments for update using (public.has_perm('establishments.manage'));

create policy est_photos_read on public.establishment_photos for select using (status = 'approved' or public.owns_establishment(establishment_id) or public.has_perm('establishments.manage'));
create policy est_photos_owner on public.establishment_photos for insert with check (public.owns_establishment(establishment_id) and status = 'pending');

create policy fav_self on public.favorites for all using (account_id = auth.uid()) with check (account_id = auth.uid() and public.is_visible_professional(professional_id));

-- Reservas: cliente cria para perfil visível; partes envolvidas leem; transições validadas no trigger.
create policy bookings_read on public.bookings for select using (
  client_id = auth.uid() or public.owns_professional(professional_id) or public.owns_establishment(establishment_id) or public.has_perm('reports.moderate')
);
create policy bookings_insert on public.bookings for insert with check (
  client_id = auth.uid() and public.my_role() = 'client' and status = 'requested'
  and (professional_id is null or public.is_visible_professional(professional_id))
  and (establishment_id is null or exists (select 1 from public.establishments e where e.id = establishment_id and e.status = 'approved'))
);
create policy bookings_update on public.bookings for update using (
  client_id = auth.uid() or public.owns_professional(professional_id) or public.owns_establishment(establishment_id)
);

-- Avaliações: apenas após reserva concluída do próprio autor.
create policy reviews_read on public.reviews for select using (status = 'published' or author_id = auth.uid() or public.has_perm('reports.moderate'));
create policy reviews_insert on public.reviews for insert with check (
  author_id = auth.uid() and exists (
    select 1 from public.bookings b where b.id = booking_id and b.client_id = auth.uid() and b.status = 'completed' and b.professional_id = reviews.professional_id
  )
);
create policy reviews_mod on public.reviews for update using (public.has_perm('reports.moderate'));

create policy conv_read on public.conversations for select using (client_id = auth.uid() or public.owns_professional(professional_id));
create policy conv_insert on public.conversations for insert with check (client_id = auth.uid() and public.is_visible_professional(professional_id));

create policy msg_read on public.messages for select using (
  exists (select 1 from public.conversations c where c.id = conversation_id and (c.client_id = auth.uid() or public.owns_professional(c.professional_id)))
  or (flagged and public.has_perm('reports.moderate'))
);
create policy msg_insert on public.messages for insert with check (
  sender_id = auth.uid() and public.is_active() and exists (
    select 1 from public.conversations c join public.professionals p on p.id = c.professional_id
    where c.id = conversation_id and (c.client_id = auth.uid() or p.account_id = auth.uid())
      and not public.is_blocked(c.client_id, p.account_id)
  )
);

create policy blocks_self on public.blocks for all using (account_id = auth.uid()) with check (account_id = auth.uid());

create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid() and automatic = false);
create policy reports_own_read on public.reports for select using (reporter_id = auth.uid() or public.has_perm('reports.moderate'));
create policy reports_mod on public.reports for update using (public.has_perm('reports.moderate'));

create policy notif_self on public.notifications for select using (account_id = auth.uid());
create policy notif_self_update on public.notifications for update using (account_id = auth.uid()) with check (account_id = auth.uid());

create policy audit_read on public.audit_log for select using (public.has_perm('reports.view') or public.has_perm('permissions.manage'));
-- Sem políticas de INSERT/UPDATE/DELETE: só funções SECURITY DEFINER escrevem na auditoria.

-- ═══════════════════════════ Triggers de integridade ═══════════════════════════

-- Dono do perfil não pode autopublicar nem mexer na verificação.
create or replace function public.guard_professional_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_perm('reports.moderate') or public.has_perm('verifications.review')) then
    if new.status is distinct from old.status and not (old.status = 'draft' and new.status = 'pending') then
      raise exception 'status só pode ser alterado pela moderação';
    end if;
    if new.verification is distinct from old.verification and not (new.verification = 'pending' and old.verification in ('none', 'rejected')) then
      raise exception 'verificação só pode ser alterada pela equipe';
    end if;
  end if;
  return new;
end $$;
create trigger professionals_guard before update on public.professionals for each row execute function public.guard_professional_update();

-- Máquina de estados das reservas + quem pode fazer cada transição.
create or replace function public.guard_booking_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_client boolean := old.client_id = auth.uid();
begin
  if new.client_id <> old.client_id or new.professional_id is distinct from old.professional_id
     or new.establishment_id is distinct from old.establishment_id or new.starts_at <> old.starts_at then
    raise exception 'campos imutáveis';
  end if;
  if not (
    (old.status = 'requested' and new.status in ('accepted', 'declined', 'cancelled')) or
    (old.status = 'accepted'  and new.status in ('completed', 'cancelled')) or
    old.status = new.status
  ) then
    raise exception 'transição inválida % → %', old.status, new.status;
  end if;
  if is_client and new.status not in ('cancelled', old.status) then
    raise exception 'cliente só pode cancelar';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger bookings_guard before update on public.bookings for each row execute function public.guard_booking_update();

-- Mensagens: mascarar contatos/pagamentos e sinalizar termos de risco (espelha src/lib/safety.ts).
create or replace function public.scan_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare original text := new.body;
begin
  if new.body ~* '\m(menor(es)?|novinh[ao]s?|colegial|adolescente)\M' or new.body ~* '\m(1[0-7]|[1-9])\s*anos\M' then
    new.flagged := true;
  end if;
  new.body := regexp_replace(new.body, '[\w.+-]+@[\w-]+\.[\w.-]+', '•••• oculto ••••', 'g');
  new.body := regexp_replace(new.body, 'https?://\S+', '•••• oculto ••••', 'gi');
  new.body := regexp_replace(new.body, '(\+?55\s?)?(\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}', '•••• oculto ••••', 'g');
  new.body := regexp_replace(new.body, '\m(chave pix|pix)\M[^\n]*', '•••• oculto ••••', 'gi');
  new.masked := new.body <> original;
  return new;
end $$;
create trigger messages_scan before insert on public.messages for each row execute function public.scan_message();

create or replace function public.auto_report_flagged() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.flagged then
    insert into reports (reporter_id, target_type, target_id, reason, details, priority, automatic)
    values (null, 'message', new.id, 'Suspeita de menor de idade', 'Denúncia automática: termo de risco detectado no chat.', 'urgent', true);
  end if;
  return new;
end $$;
create trigger messages_auto_report after insert on public.messages for each row execute function public.auto_report_flagged();

-- Prioridade automática para denúncias graves.
create or replace function public.report_priority() returns trigger language plpgsql as $$
begin
  if new.reason in ('Suspeita de menor de idade', 'Suspeita de exploração, coerção ou tráfico') then new.priority := 'urgent'; end if;
  return new;
end $$;
create trigger reports_priority before insert on public.reports for each row execute function public.report_priority();

-- Auditoria automática de ações administrativas relevantes.
create or replace function public.audit_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() = 'admin' then
    insert into audit_log (actor_id, action, target_type, target_id, details)
    values (auth.uid(), tg_table_name || '.' || lower(tg_op), tg_table_name, coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'), '?'),
            coalesce((to_jsonb(new) ->> 'status'), ''));
  end if;
  return coalesce(new, old);
end $$;
create trigger audit_accounts        after update on public.accounts              for each row execute function public.audit_admin();
create trigger audit_professionals   after update on public.professionals         for each row execute function public.audit_admin();
create trigger audit_verifications   after update on public.verification_requests for each row execute function public.audit_admin();
create trigger audit_establishments  after update on public.establishments        for each row execute function public.audit_admin();
create trigger audit_reports         after update on public.reports               for each row execute function public.audit_admin();
create trigger audit_photos          after update on public.professional_photos   for each row execute function public.audit_admin();
create trigger audit_perms           after insert or delete on public.admin_permissions for each row execute function public.audit_admin();

-- Cadastro: cria a conta a partir dos metadados do Supabase Auth e BLOQUEIA menores.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  bd date := (new.raw_user_meta_data ->> 'birthdate')::date;
  r  public.user_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'client')::public.user_role;
begin
  if bd is null or bd > (current_date - interval '18 years') then
    raise exception 'PRIVÉ é exclusivo para maiores de 18 anos';
  end if;
  if r = 'admin' then r := 'client'; end if;  -- admin só é concedido manualmente
  insert into accounts (id, display_name, role) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', 'Usuário'), r);
  insert into account_private (account_id, birthdate) values (new.id, bd);
  insert into consents (account_id, terms, privacy, adults_only) values (new.id, true, true, true);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Exclusão de conta (LGPD art. 18, VI): apaga o usuário do Auth; o CASCADE remove o resto.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into audit_log (actor_id, action, target_type, target_id, details) values (null, 'account.delete', 'account', auth.uid()::text, 'solicitado pelo titular');
  update bookings set status = 'cancelled' where client_id = auth.uid() and status in ('requested', 'accepted');
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ═══════════════════════════ Storage (imagens com acesso controlado) ═══════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('profile-photos', 'profile-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('establishment-photos', 'establishment-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Caminho padrão: <bucket>/<auth.uid()>/<arquivo>. Leitura sempre por URL assinada de curta duração.
create policy "fotos: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id in ('profile-photos', 'establishment-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id in ('profile-photos', 'establishment-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos: leitura de aprovadas" on storage.objects for select to authenticated using (
  (bucket_id = 'profile-photos' and (
     (storage.foldername(name))[1] = auth.uid()::text
     or exists (select 1 from public.professional_photos ph where ph.storage_path = name and ph.status = 'approved' and public.is_visible_professional(ph.professional_id))
     or public.has_perm('reports.moderate')))
  or (bucket_id = 'establishment-photos' and (
     (storage.foldername(name))[1] = auth.uid()::text
     or exists (select 1 from public.establishment_photos ep where ep.storage_path = name and ep.status = 'approved')
     or public.has_perm('establishments.manage')))
);
create policy "docs: titular envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs: só verificação lê" on storage.objects for select to authenticated
  using (bucket_id = 'verification-docs' and public.has_perm('verifications.review'));
