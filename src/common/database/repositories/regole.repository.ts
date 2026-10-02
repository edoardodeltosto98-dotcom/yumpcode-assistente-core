import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

// Le condizioni di una regola (Fase 7): tutto cio' che il motore di
// trigger controlla PRIMA di lasciar passare un'azione. Vive dentro la
// colonna jsonb "condizione_trigger", gia' creata in Fase 4.
export interface CondizioneTrigger {
  giorniAttesa: number;
  fasciaOrariaInizio: string; // "HH:MM"
  fasciaOrariaFine: string;
  maxAzioniGiorno: number;
  contattiEsclusi: string[];
}

const CONDIZIONE_DEFAULT: CondizioneTrigger = {
  giorniAttesa: 10,
  fasciaOrariaInizio: '09:00',
  fasciaOrariaFine: '18:00',
  maxAzioniGiorno: 20,
  contattiEsclusi: [],
};

export interface Regola {
  id: string;
  cliente_id: string;
  // "nome" e' il nome del processo (es. "solleciti-fatture",
  // "preventivi-fermi"): la tabella e' stata creata in Fase 4 con
  // questo nome di colonna, non "processo".
  nome: string;
  condizione_trigger: CondizioneTrigger;
  // Cosa fa l'azione quando scatta (testo del prompt, template, ecc.):
  // fuori dallo scope della Fase 7, per ora un oggetto vuoto.
  azione_da_eseguire: Record<string, unknown>;
  attiva: boolean;
  created_at: string;
  updated_at: string;
}

export interface DatiRegola {
  giorniAttesa?: number;
  fasciaOrariaInizio?: string;
  fasciaOrariaFine?: string;
  maxAzioniGiorno?: number;
  contattiEsclusi?: string[];
  attiva?: boolean;
}

// Repository sulla tabella "regole" (creata in Fase 4, usata per la
// prima volta in Fase 7). Una riga per cliente+processo (vincolo unico
// su cliente_id+nome), con i filtri del motore di trigger dentro
// "condizione_trigger".
@Injectable()
export class RegoleRepository {
  constructor(private readonly db: DatabaseService) {}

  async trova(clienteId: string, processo: string): Promise<Regola | null> {
    const { rows } = await this.db.query<Regola>(
      'select * from regole where cliente_id = $1 and nome = $2',
      [clienteId, processo],
    );
    return rows[0] ?? null;
  }

  async trovaPerCliente(clienteId: string): Promise<Regola[]> {
    const { rows } = await this.db.query<Regola>(
      'select * from regole where cliente_id = $1 order by nome',
      [clienteId],
    );
    return rows;
  }

  // Upsert su cliente+processo: se la regola non esiste la crea con i
  // default, altrimenti aggiorna solo i campi passati dentro
  // "condizione_trigger" (merge, non sovrascrittura totale).
  async salva(clienteId: string, processo: string, dati: DatiRegola): Promise<Regola> {
    const esistente = await this.trova(clienteId, processo);
    const condizione: CondizioneTrigger = {
      ...(esistente?.condizione_trigger ?? CONDIZIONE_DEFAULT),
      ...(dati.giorniAttesa !== undefined ? { giorniAttesa: dati.giorniAttesa } : {}),
      ...(dati.fasciaOrariaInizio !== undefined ? { fasciaOrariaInizio: dati.fasciaOrariaInizio } : {}),
      ...(dati.fasciaOrariaFine !== undefined ? { fasciaOrariaFine: dati.fasciaOrariaFine } : {}),
      ...(dati.maxAzioniGiorno !== undefined ? { maxAzioniGiorno: dati.maxAzioniGiorno } : {}),
      ...(dati.contattiEsclusi !== undefined ? { contattiEsclusi: dati.contattiEsclusi } : {}),
    };
    const attiva = dati.attiva ?? esistente?.attiva ?? true;

    const { rows } = await this.db.query<Regola>(
      `insert into regole (cliente_id, nome, condizione_trigger, azione_da_eseguire, attiva)
       values ($1, $2, $3::jsonb, '{}'::jsonb, $4)
       on conflict (cliente_id, nome) do update set
         condizione_trigger = $3::jsonb,
         attiva = $4,
         updated_at = now()
       returning *`,
      [clienteId, processo, JSON.stringify(condizione), attiva],
    );
    return rows[0];
  }
}
