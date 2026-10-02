-- Fase 7: motore di trigger e regole
--
-- Le tabelle "clienti", "regole" e "azioni" esistevano gia' (create in Fase 4)
-- con uno schema diverso da quello inizialmente ipotizzato per la Fase 7:
--   regole: id, cliente_id, nome, condizione_trigger (jsonb), azione_da_eseguire (jsonb), attiva, created_at, updated_at
--   azioni: id, cliente_id, regola_id, tipo, stato, dettagli (jsonb), created_at, eseguita_il, updated_at
--
-- Questa migrazione e' quindi puramente ADDITIVA: aggiunge solo cio' che
-- mancava, senza toccare le colonne gia' esistenti. E' la versione
-- effettivamente eseguita in produzione (via Supabase SQL Editor).

-- Interruttore generale per cliente (kill switch): se spento, nessuna
-- azione automatica parte per quel cliente, qualunque regola dica.
alter table clienti
  add column if not exists interruttore_attivo boolean not null default true;

-- Una sola regola per cliente+processo (es. cliente-1 + "solleciti").
alter table regole
  add constraint regole_cliente_nome_unique unique (cliente_id, nome);

-- Colonne usate dal motore di trigger per l'idempotenza e i conteggi
-- giornalieri. Le colonne gia' esistenti (regola_id, dettagli, stato,
-- eseguita_il) restano invariate e verranno usate dalla Fase 8.
alter table azioni
  add column if not exists processo text,
  add column if not exists record_riferimento text,
  add column if not exists chiave_idempotenza text;

-- Impedisce di creare due volte la stessa azione lo stesso giorno per lo
-- stesso cliente/record/tipo (chiave: clienteId:recordRiferimento:tipo:YYYY-MM-DD).
-- Indice parziale: non si applica alle righe vecchie senza chiave.
create unique index if not exists azioni_chiave_idempotenza_key
  on azioni (chiave_idempotenza)
  where chiave_idempotenza is not null;

-- Velocizza il conteggio "azioni create oggi per cliente+processo" usato
-- dal tetto giornaliero (maxAzioniGiorno).
create index if not exists azioni_cliente_processo_idx
  on azioni (cliente_id, processo, created_at);
