import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

export type StatoAzione = 'in_attesa' | 'approvata' | 'rifiutata' | 'eseguita' | 'fallita';
export const STATI_AZIONE: StatoAzione[] = ['in_attesa', 'approvata', 'rifiutata', 'eseguita', 'fallita'];

export interface Azione {
  id: string;
  cliente_id: string;
  regola_id: string | null;
  processo: string;
  record_riferimento: string;
  chiave_idempotenza: string;
  tipo: string;
  // stati ammessi dal CHECK sulla tabella (migrazione-fase8-approvazioni.sql)
  stato: StatoAzione;
  dettagli: Record<string, unknown> | null;
  created_at: string;
  eseguita_il: string | null;
  updated_at: string;
  // Fase 8: chi ha approvato/rifiutato, quando, perche', e l'eventuale
  // errore dell'esecuzione.
  decisa_da: string | null;
  decisa_il: string | null;
  motivo: string | null;
  errore: string | null;
}

export interface EventoAzione {
  id: string;
  azione_id: string;
  cliente_id: string;
  da_stato: StatoAzione | null;
  a_stato: StatoAzione;
  attore: string;
  nota: string | null;
  created_at: string;
}

// Campi aggiornabili insieme al cambio di stato.
export interface CampiCambioStato {
  decisaDa?: string;
  motivo?: string | null;
  errore?: string | null;
  eseguita?: boolean;
}

// Registro delle azioni (tabella creata in Fase 4, usata in Fase 7 dal
// motore di trigger, in Fase 8 da approvazioni ed esecuzione).
//
// Multi-tenant: ogni lettura e ogni modifica filtra SEMPRE per cliente_id,
// anche quando c'e' gia' l'id dell'azione. Il backend bypassa la RLS, quindi
// e' questo filtro che impedisce di toccare l'azione di un altro cliente.
@Injectable()
export class AzioniRepository {
  constructor(private readonly db: DatabaseService) {}

  // Inserisce l'azione solo se la chiave di idempotenza non esiste
  // ancora (indice unico parziale su chiave_idempotenza). Ritorna null
  // se era un duplicato: nessun errore, nessuna riga nuova.
  async creaSeNuova(azione: {
    clienteId: string;
    processo: string;
    recordRiferimento: string;
    chiaveIdempotenza: string;
    tipo: string;
    testo?: string | null;
    dettagli?: Record<string, unknown>;
  }): Promise<Azione | null> {
    const { rows } = await this.db.query<Azione>(
      `insert into azioni (
         cliente_id, processo, record_riferimento, chiave_idempotenza, tipo, dettagli
       )
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (chiave_idempotenza) where chiave_idempotenza is not null do nothing
       returning *`,
      [
        azione.clienteId,
        azione.processo,
        azione.recordRiferimento,
        azione.chiaveIdempotenza,
        azione.tipo,
        JSON.stringify({ ...azione.dettagli, testo: azione.testo ?? null }),
      ],
    );
    const creata = rows[0] ?? null;
    if (creata) await this.registraEvento(creata.id, creata.cliente_id, null, 'in_attesa', 'sistema', 'Creata dal motore di trigger.');
    return creata;
  }

  // Conta le azioni gia' create oggi per cliente+processo (tetto
  // "maxAzioniGiorno" della regola). "Oggi" e' il giorno italiano, calcolato
  // lato database: si riparte a mezzanotte in Italia, qualunque sia il fuso
  // del server o del database.
  async contaOggi(clienteId: string, processo: string): Promise<number> {
    const { rows } = await this.db.query<{ totale: string }>(
      `select count(*)::text as totale from azioni
       where cliente_id = $1 and processo = $2
         and created_at >= date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome'`,
      [clienteId, processo],
    );
    return Number(rows[0]?.totale ?? '0');
  }

  // Conteggi per mese di creazione (nel fuso indicato), processo e stato
  // attuale: la base dei "numeri del mese" del cruscotto.
  async contaPerMese(
    clienteId: string,
    mesi: string[],
    fuso: string,
  ): Promise<Array<{ mese: string; processo: string; stato: StatoAzione; totale: number }>> {
    const { rows } = await this.db.query<{ mese: string; processo: string; stato: StatoAzione; totale: number }>(
      `select to_char(created_at at time zone $3, 'YYYY-MM') as mese, processo, stato, count(*)::int as totale
       from azioni
       where cliente_id = $1 and to_char(created_at at time zone $3, 'YYYY-MM') = any($2::text[])
       group by 1, 2, 3`,
      [clienteId, mesi, fuso],
    );
    return rows;
  }

  async trovaPerCliente(clienteId: string, limite = 50, stato?: StatoAzione, tipo?: string): Promise<Azione[]> {
    const { rows } = await this.db.query<Azione>(
      `select * from azioni
       where cliente_id = $1 and ($3::text is null or stato = $3) and ($4::text is null or tipo = $4)
       order by created_at desc limit $2`,
      [clienteId, limite, stato ?? null, tipo ?? null],
    );
    return rows;
  }

  async trovaPerId(clienteId: string, id: string): Promise<Azione | null> {
    const { rows } = await this.db.query<Azione>('select * from azioni where id = $1 and cliente_id = $2', [
      id,
      clienteId,
    ]);
    return rows[0] ?? null;
  }

  async eventi(clienteId: string, azioneId: string): Promise<EventoAzione[]> {
    const { rows } = await this.db.query<EventoAzione>(
      'select * from azioni_eventi where azione_id = $1 and cliente_id = $2 order by created_at',
      [azioneId, clienteId],
    );
    return rows;
  }

  // Cambio di stato atomico e condizionato: avviene solo se l'azione e' del
  // cliente E si trova in uno degli stati di partenza ammessi. Due admin che
  // approvano nello stesso istante: uno solo vince, l'altro riceve null.
  // Lo storico viene scritto nella stessa istruzione SQL.
  async cambiaStato(
    clienteId: string,
    id: string,
    daStati: StatoAzione[],
    aStato: StatoAzione,
    attore: string,
    campi: CampiCambioStato = {},
    nota?: string,
  ): Promise<Azione | null> {
    const { rows } = await this.db.query<Azione & { stato_precedente: StatoAzione }>(
      `with precedente as (
         select id, stato from azioni
         where id = $1 and cliente_id = $2 and stato = any($3::text[])
         for update
       ),
       aggiornata as (
         update azioni a set
           stato = $4,
           decisa_da = coalesce($5, a.decisa_da),
           decisa_il = case when $5::text is not null then now() else a.decisa_il end,
           motivo = case when $6::boolean then $7 else a.motivo end,
           errore = case when $8::boolean then $9 else a.errore end,
           eseguita_il = case when $10::boolean then now() else a.eseguita_il end,
           updated_at = now()
         from precedente p
         where a.id = p.id
         returning a.*, p.stato as stato_precedente
       ),
       evento as (
         insert into azioni_eventi (azione_id, cliente_id, da_stato, a_stato, attore, nota)
         select id, cliente_id, stato_precedente, $4, $11, $12 from aggiornata
       )
       select * from aggiornata`,
      [
        id,
        clienteId,
        daStati,
        aStato,
        campi.decisaDa ?? null,
        campi.motivo !== undefined,
        campi.motivo ?? null,
        campi.errore !== undefined,
        campi.errore ?? null,
        campi.eseguita === true,
        attore,
        nota ?? null,
      ],
    );
    if (!rows[0]) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { stato_precedente, ...azione } = rows[0];
    return azione;
  }

  // Salva cio' che l'esecutore ha prodotto (es. link dell'evento creato)
  // dentro dettagli.risultato, senza toccare il resto dei dettagli.
  async salvaRisultato(clienteId: string, id: string, risultato: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `update azioni set dettagli = coalesce(dettagli, '{}'::jsonb) || jsonb_build_object('risultato', $3::jsonb)
       where id = $1 and cliente_id = $2`,
      [id, clienteId, JSON.stringify(risultato)],
    );
  }

  private async registraEvento(
    azioneId: string,
    clienteId: string,
    daStato: StatoAzione | null,
    aStato: StatoAzione,
    attore: string,
    nota?: string,
  ) {
    await this.db.query(
      `insert into azioni_eventi (azione_id, cliente_id, da_stato, a_stato, attore, nota)
       values ($1, $2, $3, $4, $5, $6)`,
      [azioneId, clienteId, daStato, aStato, attore, nota ?? null],
    );
  }
}
