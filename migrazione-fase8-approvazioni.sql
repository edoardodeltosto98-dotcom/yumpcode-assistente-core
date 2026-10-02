-- Fase 8: approvazioni e registro azioni (solo additiva sui dati).
--
-- 1. Nuovo stato "fallita" (l'esecuzione ha esaurito i tentativi).
-- 2. Chi ha deciso e quando, motivo del rifiuto, errore dell'esecuzione.
-- 3. Tabella azioni_eventi: storico di ogni cambio di stato (chi, quando,
--    da quale stato a quale), consultabile dal cruscotto.
-- 4. RLS "il browser legge, solo il backend scrive": prima le policy erano
--    "for all", quindi un membro qualsiasi poteva cambiare dal browser lo
--    stato di un'azione, una regola o l'interruttore, aggirando i controlli
--    del backend (solo admin, storico). Il backend usa il ruolo postgres e
--    non e' toccato dalla RLS.

alter table azioni drop constraint if exists azioni_stato_check;
alter table azioni add constraint azioni_stato_check
  check (stato in ('in_attesa', 'approvata', 'rifiutata', 'eseguita', 'fallita'));

alter table azioni
  add column if not exists decisa_da text,
  add column if not exists decisa_il timestamptz,
  add column if not exists motivo text,
  add column if not exists errore text;

create index if not exists azioni_cliente_stato_idx on azioni (cliente_id, stato, created_at desc);

create table if not exists azioni_eventi (
  id uuid primary key default gen_random_uuid(),
  azione_id uuid not null references azioni (id) on delete cascade,
  cliente_id uuid not null references clienti (id) on delete cascade,
  da_stato text,
  a_stato text not null,
  -- id utente Clerk di chi ha agito, oppure "sistema" per il worker.
  attore text not null,
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists azioni_eventi_azione_idx on azioni_eventi (azione_id, created_at);
create index if not exists azioni_eventi_cliente_idx on azioni_eventi (cliente_id, created_at desc);
alter table azioni_eventi enable row level security;

-- Policy di sola lettura per organizzazione (claim Clerk Core 3: o.id).
drop policy if exists clienti_org_isolamento on clienti;
create policy clienti_org_isolamento on clienti for select
  using (org_id = (auth.jwt() -> 'o' ->> 'id'));

drop policy if exists regole_org_isolamento on regole;
create policy regole_org_isolamento on regole for select
  using (exists (select 1 from clienti c where c.id = regole.cliente_id and c.org_id = (auth.jwt() -> 'o' ->> 'id')));

drop policy if exists azioni_org_isolamento on azioni;
create policy azioni_org_isolamento on azioni for select
  using (exists (select 1 from clienti c where c.id = azioni.cliente_id and c.org_id = (auth.jwt() -> 'o' ->> 'id')));

drop policy if exists metriche_org_isolamento on metriche;
create policy metriche_org_isolamento on metriche for select
  using (exists (select 1 from clienti c where c.id = metriche.cliente_id and c.org_id = (auth.jwt() -> 'o' ->> 'id')));

drop policy if exists azioni_eventi_org_isolamento on azioni_eventi;
create policy azioni_eventi_org_isolamento on azioni_eventi for select
  using (exists (select 1 from clienti c where c.id = azioni_eventi.cliente_id and c.org_id = (auth.jwt() -> 'o' ->> 'id')));

-- connessioni contiene i token OAuth (cifrati): dal browser nessun accesso,
-- nemmeno in lettura. RLS attiva senza policy = tutto negato.
drop policy if exists connessioni_org_isolamento on connessioni;
