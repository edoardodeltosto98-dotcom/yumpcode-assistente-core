import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { ClientiRepository } from './repositories/clienti.repository.js';
import { ConnessioniRepository } from './repositories/connessioni.repository.js';
import { RegoleRepository } from './repositories/regole.repository.js';
import { AzioniRepository } from './repositories/azioni.repository.js';

@Global()
@Module({
  providers: [DatabaseService, ClientiRepository, ConnessioniRepository, RegoleRepository, AzioniRepository],
  exports: [DatabaseService, ClientiRepository, ConnessioniRepository, RegoleRepository, AzioniRepository],
})
export class DatabaseModule {}
