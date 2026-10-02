import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClerkAuthGuard } from './clerk-auth.guard.js';
import { ClerkJwtVerifier } from './clerk-jwt.verifier.js';

// Registra ClerkAuthGuard come guard globale: tutti gli endpoint sono
// protetti per default, e per renderne uno raggiungibile senza login va
// marcato esplicitamente con @Pubblico(). Cosi' un endpoint nuovo non
// puo' restare aperto per dimenticanza.
@Global()
@Module({
  providers: [ClerkJwtVerifier, { provide: APP_GUARD, useClass: ClerkAuthGuard }],
  exports: [ClerkJwtVerifier],
})
export class AuthClerkModule {}
