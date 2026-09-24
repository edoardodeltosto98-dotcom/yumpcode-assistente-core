import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';

// Wrapper minimo su un connection pool Postgres (Supabase). Niente ORM:
// query SQL dirette, cosi' restano leggibili e vicine allo schema creato
// a mano nell'SQL Editor di Supabase (vedi README, Fase 4).
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  onModuleInit() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL mancante. Vedi assistente-core/.env.example (connessione Supabase, Fase 4).',
      );
    }
    this.pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

    // Non blocchiamo l'avvio se Supabase e' momentaneamente irraggiungibile
    // (stesso approccio usato per Redis/BullMQ): logga soltanto.
    this.pool
      .query('select 1')
      .then(() => this.logger.log('Connessione a Supabase riuscita'))
      .catch((err) => this.logger.error(`Connessione a Supabase fallita: ${err.message}`));
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
    return this.pool.query<T>(text, params);
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
