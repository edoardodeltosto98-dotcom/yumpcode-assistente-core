import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { ClientiRepository } from './repositories/clienti.repository.js';

@Global()
@Module({
  providers: [DatabaseService, ClientiRepository],
  exports: [DatabaseService, ClientiRepository],
})
export class DatabaseModule {}
