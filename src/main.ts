import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

// Le chiavi di servizio (Fase 3) vivono in .env.local, MAI committato
// (vedi .gitignore). Node carica il file nativamente: nessuna
// dipendenza extra necessaria. I token OAuth dei clienti non passano
// mai da qui: quelli vanno cifrati nel database (EncryptionService).
if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
