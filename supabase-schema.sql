-- =========================================================
-- HORIZON RP — Schéma Supabase
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run
-- =========================================================

-- ---------- Table : signalements de joueurs ----------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  roblox_username text not null,
  roblox_id text not null,
  proof_url text not null,
  reason text not null,
  reported_by_discord_id text not null,
  reported_by_username text not null,
  created_at timestamptz not null default now()
);

-- ---------- Table : sanctions (logs ban/kick/warn) ----------
create table if not exists sanctions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('ban', 'kick', 'warn')),
  roblox_username text not null,
  roblox_id text not null,
  duration text not null,        -- ex: "7 jours", "Permanent", "24h"
  reason text not null,
  staff_discord_id text not null,
  staff_username text not null,
  created_at timestamptz not null default now()
);

-- ---------- Table : service en cours du staff ----------
create table if not exists staff_duty (
  discord_id text primary key,
  username text not null,
  avatar_url text not null,
  started_at timestamptz not null default now()
);

-- ---------- Table : statut staff / admin mis en cache ----------
-- Rempli par le Worker à chaque connexion (vérification faite avec
-- le token Discord de l'utilisateur, scope guilds.members.read).
-- Les routes sensibles (sanction, duty, settings) relisent cette
-- table pour savoir si l'auteur de la requête a bien le rôle
-- requis, sans avoir besoin de redemander un token à chaque action.
create table if not exists staff_status (
  discord_id text primary key,
  is_staff boolean not null default false,
  is_admin boolean not null default false,
  checked_at timestamptz not null default now()
);

-- ---------- Table : candidatures staff ----------
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  discord_id text not null,
  discord_username text not null,
  answers jsonb not null,        -- les 15 réponses, voir format dans GUIDE-INSTALLATION.md
  sent_to_discord boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Table : paramètres du site (une seule ligne, id = 1) ----------
create table if not exists settings (
  id int primary key default 1,
  recrutement_ouvert boolean not null default true,
  maintenance boolean not null default false,
  preview_game text not null default 'Emergency Hamburg',
  preview_roles_count text not null default '8 rôles',
  preview_language text not null default 'Francophone',
  preview_availability text not null default '24/7',
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

-- Crée la ligne unique de paramètres si elle n'existe pas déjà
insert into settings (id) values (1) on conflict (id) do nothing;

-- =========================================================
-- Row Level Security
-- =========================================================
-- Principe : la clé "anon" utilisée par le site est publique.
-- On autorise la LECTURE publique de reports/sanctions/staff_duty/
-- settings (nécessaire pour afficher logs / staff en service /
-- bandeau maintenance / aperçu serveur côté site).
-- staff_status et applications ne sont PAS lisibles publiquement :
-- seul le Worker (clé service_role) y accède.
-- On INTERDIT l'écriture directe depuis le client sur TOUTES les
-- tables : toutes les créations/modifications passent par le
-- Worker Cloudflare.
-- =========================================================

alter table reports enable row level security;
alter table sanctions enable row level security;
alter table staff_duty enable row level security;
alter table staff_status enable row level security;
alter table applications enable row level security;
alter table settings enable row level security;

-- Lecture publique (le dashboard affiche logs + staff en service,
-- la home et le dashboard lisent settings pour maintenance/aperçu)
create policy "reports_select_public" on reports
  for select using (true);

create policy "sanctions_select_public" on sanctions
  for select using (true);

create policy "staff_duty_select_public" on staff_duty
  for select using (true);

create policy "settings_select_public" on settings
  for select using (true);

-- staff_status et applications : aucune policy = aucun accès pour
-- la clé anon (ni lecture ni écriture). Seul service_role (Worker)
-- y accède.

-- Aucune policy d'INSERT/UPDATE/DELETE pour le rôle "anon" sur les
-- autres tables non plus : par défaut avec RLS activé, ces
-- opérations sont donc refusées pour la clé anon. Seul le Worker
-- (clé service_role, qui contourne RLS) peut écrire.
