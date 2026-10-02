-- Fase 6 (nuova guida): multi-tenant con Clerk Organizations + Row Level Security
--
-- Un'organizzazione Clerk = una riga nella tabella `clienti` (org_id = id
-- organizzazione Clerk, es. "org_3K0NHi356hQWhyPmaslau97klz0").
--
-- IMPORTANTE sul claim JWT: Clerk Core 3 non emette piu' i claim piatti
-- "org_id" / "org_role" / "org_slug" nel session token di default. Le
-- informazioni sull'organizzazione attiva sono ora nel claim compatto "o":
--   { "o": { "id": "org_...", "rol": "admin", "slg": "..." } }
-- Le policy sotto leggono quindi auth.jwt() -> 'o' ->> 'id', non
-- auth.jwt() ->> 'org_id'. Verificato decodificando un token reale emesso
-- da Clerk per questo progetto (Core 3 / @clerk/nextjs 7.9.7).
--
-- Prerequisito: Clerk configurato come provider "Third-Party Auth" su
-- Supabase (Authentication > Sign In / Providers > Third-Party Auth),
-- dominio: https://alive-owl-9191.clerk.accounts.dev

alter table clienti add column if not exists org_id text;

create unique index if not exists clienti_org_id_key on clienti (org_id) where org_id is not null;

drop policy if exists clienti_org_isolamento on clienti;
create policy clienti_org_isolamento on clienti
  for all
  using (org_id = (auth.jwt() -> 'o' ->> 'id'))
  with check (org_id = (auth.jwt() -> 'o' ->> 'id'));

drop policy if exists connessioni_org_isolamento on connessioni;
create policy connessioni_org_isolamento on connessioni
  for all
  using (exists (select 1 from clienti c where c.id = connessioni.cliente_id and c.org_id = (auth.jwt() -> 'o' ->> 'id')))
  with check (exists (select 1 from clienti c where c.id = connessioni.cliente_id and c.org_id = (auth.jwt() -> 'o' ->> 'id')));

drop policy if exists regole_org_isolamento on regole;
create policy regole_org_isolamento on regole
  for all
  using (exists (select 1 from clienti c where c.id = regole.cliente_id and c.org_id = (auth.jwt() -> 'o' ->> 'id')))
  with check (exists (select 1 from clienti c where c.id = regole.cliente_id and c.org_id = (auth.jwt() -> 'o' ->> 'id')));

drop policy if exists azioni_org_isolamento on azioni;
create policy azioni_org_isolamento on azioni
  for all
  using (exists (select 1 from clienti c where c.id = azioni.cliente_id and c.org_id = (auth.jwt() -> 'o' ->> 'id')))
  with check (exists (select 1 from clienti c where c.id = azioni.cliente_id and c.org_id = (auth.jwt() -> 'o' ->> 'id')));

drop policy if exists metriche_org_isolamento on metriche;
create policy metriche_org_isolamento on metriche
  for all
  using (exists (select 1 from clienti c where c.id = metriche.cliente_id and c.org_id = (auth.jwt() -> 'o' ->> 'id')))
  with check (exists (select 1 from clienti c where c.id = metriche.cliente_id and c.org_id = (auth.jwt() -> 'o' ->> 'id')));

-- Estensione per la memoria degli agenti IA (Fase 5 della nuova guida)
create extension if not exists vector;
