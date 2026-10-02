import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

export interface Cliente {
  id: string;
  nome: string;
  email: string;
  // Interruttore generale (Fase 7): quando false, il motore di trigger
  // deve rifiutare ogni azione per questo cliente, qualunque sia la
  // regola del singolo processo. Si spegne senza cancellare nulla.
  interruttore_attivo: boolean;
  // Id della organizzazione Clerk collegata (multi-tenant). Null per i
  // clienti creati prima della Fase multi-tenant / senza organizzazione.
  org_id: string | null;
  created_at: string;
  updated_at: string;
}

// Repository di esempio sulla tabella "clienti" (Fase 4). Il pattern
// (query dirette via DatabaseService, un metodo per operazione) va
// replicato per le altre tabelle (connessioni, regole, azioni, metriche)
// man mano che servono, invece di scrivere tutto in anticipo.
@Injectable()
export class ClientiRepository {
  constructor(private readonly db: DatabaseService) {}

  async trovaTutti(): Promise<Cliente[]> {
    const { rows } = await this.db.query<Cliente>('select * from clienti order by created_at desc');
    return rows;
  }

  async trovaPerId(id: string): Promise<Cliente | null> {
    const { rows } = await this.db.query<Cliente>('select * from clienti where id = $1', [id]);
    return rows[0] ?? null;
  }

  async crea(nome: string, email: string): Promise<Cliente> {
    const { rows } = await this.db.query<Cliente>(
      'insert into clienti (nome, email) values ($1, $2) returning *',
      [nome, email],
    );
    return rows[0];
  }

  async elimina(id: string): Promise<void> {
    await this.db.query('delete from clienti where id = $1', [id]);
  }

  // Accende/spegne l'interruttore generale del cliente (Fase 7).
  async impostaInterruttore(id: string, attivo: boolean): Promise<Cliente | null> {
    const { rows } = await this.db.query<Cliente>(
      'update clienti set interruttore_attivo = $2, updated_at = now() where id = $1 returning *',
      [id, attivo],
    );
    return rows[0] ?? null;
  }

  async trovaPerOrgId(orgId: string): Promise<Cliente | null> {
    const { rows } = await this.db.query<Cliente>('select * from clienti where org_id = $1', [orgId]);
    return rows[0] ?? null;
  }

  // Webhook Clerk (organizationMembership.created, ruolo admin): crea il
  // cliente al primo membro admin di una nuova organizzazione, oppure
  // aggiorna nome/email se il cliente per quella organizzazione esiste
  // gia' (es. webhook consegnato piu' di una volta, o un secondo admin
  // aggiunto in seguito). Idempotente sull'indice unico parziale
  // "clienti_org_id_key" (migrazione Fase 6 multi-tenant).
  async upsertPerOrgId(orgId: string, nome: string, email: string): Promise<Cliente> {
    const { rows } = await this.db.query<Cliente>(
      `insert into clienti (nome, email, org_id)
       values ($1, $2, $3)
       on conflict (org_id) where org_id is not null
       do update set nome = excluded.nome, updated_at = now()
       returning *`,
      [nome, email, orgId],
    );
    return rows[0];
  }

  // Webhook Clerk (organization.deleted): non cancelliamo i dati del
  // cliente, spegniamo solo l'interruttore generale (stesso effetto di
  // Fase 7: nessuna azione automatica parte piu' per lui).
  async disattivaPerOrgId(orgId: string): Promise<Cliente | null> {
    const { rows } = await this.db.query<Cliente>(
      'update clienti set interruttore_attivo = false, updated_at = now() where org_id = $1 returning *',
      [orgId],
    );
    return rows[0] ?? null;
  }
}
