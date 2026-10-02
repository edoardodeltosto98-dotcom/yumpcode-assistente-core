import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Cliente } from '../database/repositories/clienti.repository.js';

// Contesto di ogni richiesta autenticata: chi chiama, da quale
// organizzazione Clerk, con che ruolo, e il cliente YUMPCODE collegato.
// Il cliente arriva SEMPRE da qui, mai da un parametro della richiesta:
// e' quello che impedisce a un'organizzazione di leggere i dati di
// un'altra cambiando un id nell'URL.
export interface ContestoRichiesta {
  userId: string;
  orgId: string;
  ruolo: string;
  admin: boolean;
  cliente: Cliente;
}

export type RichiestaConContesto = Request & { contesto?: ContestoRichiesta };

export const CHIAVE_PUBBLICO = 'endpointPubblico';
export const CHIAVE_SOLO_ADMIN = 'soloAdmin';

// Endpoint raggiungibile senza login Clerk (webhook, callback Google,
// health check). Ogni endpoint pubblico deve proteggersi da solo in
// altro modo (firma svix, state firmato, ...).
export const Pubblico = () => SetMetadata(CHIAVE_PUBBLICO, true);

// Endpoint di configurazione: solo gli admin dell'organizzazione.
export const SoloAdmin = () => SetMetadata(CHIAVE_SOLO_ADMIN, true);

// Il cliente dell'organizzazione attiva di chi chiama.
export const ClienteCorrente = createParamDecorator((_dati: unknown, ctx: ExecutionContext): Cliente => {
  const req = ctx.switchToHttp().getRequest<RichiestaConContesto>();
  if (!req.contesto) {
    throw new Error('ClienteCorrente usato su un endpoint senza ClerkAuthGuard (endpoint pubblico?).');
  }
  return req.contesto.cliente;
});

export const Contesto = createParamDecorator((_dati: unknown, ctx: ExecutionContext): ContestoRichiesta => {
  const req = ctx.switchToHttp().getRequest<RichiestaConContesto>();
  if (!req.contesto) {
    throw new Error('Contesto usato su un endpoint senza ClerkAuthGuard (endpoint pubblico?).');
  }
  return req.contesto;
});
