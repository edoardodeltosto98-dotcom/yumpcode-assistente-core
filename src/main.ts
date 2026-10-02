import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

// Le chiavi di servizio (Fase 3) vivono in .env.local, MAI committato
// (vedi .gitignore). Node carica il file nativamente: nessuna
// dipendenza extra necessaria. I token OAuth dei clienti non passano
// mai da qui: quelli vanno cifrati nel database (EncryptionService).
// Nota: .env.local viene letto solo all'avvio. Dopo averlo modificato va
// riavviato il backend (chiudere e rilanciare avvia-backend.cmd).
if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}

async function bootstrap() {
  // rawBody: true mette a disposizione req.rawBody (Buffer) su ogni
  // richiesta: serve al webhook Clerk (src/webhooks) per verificare la
  // firma svix, che va calcolata sul corpo esatto ricevuto, non sul
  // JSON ri-serializzato da Nest.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Il cruscotto (altro dominio/porta) chiama il backend dal browser con
  // il token Clerk nell'header Authorization: va permesso esplicitamente.
  // Solo le origini elencate, mai "*".
  const origini = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origini, allowedHeaders: ['Authorization', 'Content-Type'] });

  const porta = process.env.PORT ?? 3001;
  await app.listen(porta);
  Logger.log(`Backend in ascolto su http://localhost:${porta}`, 'Bootstrap');
}
await bootstrap();
