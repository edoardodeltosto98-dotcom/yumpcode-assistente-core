import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

export interface Cliente {
  id: string;
  nome: string;
  email: string;
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
}
