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

-- ---------- Table : statut staff mis en cache ----------
-- Rempli par le Worker à chaque connexion (vérification faite avec
-- le token Discord de l'utilisateur, scope guilds.members.read).
-- Les routes sensibles (sanction, duty) relisent cette table pour
-- savoir si l'auteur de la requête a bien le rôle staff, sans avoir
-- besoin de redemander un token Discord à chaque action.
create table if not exists staff_status (
  discord_id text primary key,
  is_staff boolean not null default false,
  checked_at timestamptz not null default now()
);

-- =========================================================
-- Row Level Security
-- =========================================================
-- Principe : la clé "anon" utilisée par le site est publique.
-- On autorise la LECTURE publique de reports/sanctions/staff_duty
-- (nécessaire pour afficher logs / staff en service côté dashboard).
-- staff_status n'est PAS lisible publiquement : seul le Worker
-- (clé service_role) y accède, pour éviter qu'un visiteur ne
-- découvre qui est staff en lisant directement la table.
-- On INTERDIT l'écriture directe depuis le client sur toutes les
-- tables : toutes les créations passent par le Worker Cloudflare.
-- =========================================================

alter table reports enable row level security;
alter table sanctions enable row level security;
alter table staff_duty enable row level security;
alter table staff_status enable row level security;

-- Lecture publique (le dashboard affiche logs + staff en service)
create policy "reports_select_public" on reports
  for select using (true);

create policy "sanctions_select_public" on sanctions
  for select using (true);

create policy "staff_duty_select_public" on staff_duty
  for select using (true);

-- staff_status : aucune policy = aucun accès pour la clé anon
-- (ni lecture ni écriture). Seul service_role (Worker) y accède.

-- Aucune policy d'INSERT/UPDATE/DELETE pour le rôle "anon" sur les
-- autres tables non plus : par défaut avec RLS activé, ces
-- opérations sont donc refusées pour la clé anon. Seul le Worker
-- (clé service_role, qui contourne RLS) peut écrire.
