import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Webhook } from 'svix';
import { ClientiRepository } from '../common/database/repositories/clienti.repository.js';
import { Pubblico } from '../common/auth/decorators.js';

// Ruoli Clerk che identificano un amministratore della organizzazione
// (il creatore diventa admin automaticamente alla creazione).
const RUOLI_ADMIN = new Set(['org:admin', 'admin']);

// Riceve gli eventi Clerk (Authentication > Webhooks su clerk.com) e
// tiene sincronizzata la tabella "clienti" con le organizzazioni:
//
// - organizationMembership.created (ruolo admin): crea/aggiorna il
//   cliente. Non usiamo organization.created perche' non porta una
//   email (clienti.email e' NOT NULL) — la prendiamo dal primo membro
//   admin, cioe' da chi ha creato l'organizzazione.
// - organization.deleted: spegne l'interruttore generale del cliente
//   (Fase 7), non cancella nulla.
//
// La firma va verificata con CLERK_WEBHOOK_SECRET (libreria "svix",
// la stessa che usa Clerk per firmare); senza una firma valida la
// richiesta viene rifiutata prima di toccare il database.
@Controller('webhooks/clerk')
export class ClerkWebhookController {
  constructor(private readonly clienti: ClientiRepository) {}

  // Pubblico: lo chiama Clerk, non un utente. La protezione e' la firma
  // svix verificata in verificaFirma().
  @Post()
  @Pubblico()
  async gestisci(@Req() req: RawBodyRequest<Request>, @Headers() headers: Record<string, string>) {
    const evento = this.verificaFirma(req, headers);

    if (evento.type === 'organizationMembership.created') {
      await this.gestisciMembroCreato(evento.data);
    }

    if (evento.type === 'organization.deleted') {
      const orgId = evento.data?.id;
      if (orgId) await this.clienti.disattivaPerOrgId(orgId);
    }

    // Clerk considera consegnato ogni webhook che risponde 2xx: tipi di
    // evento non gestiti (es. organization.updated) ricevono comunque
    // { ok: true } senza fare nulla, cosi' Clerk non riprova all'infinito.
    return { ok: true };
  }

  private verificaFirma(req: RawBodyRequest<Request>, headers: Record<string, string>): any {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('CLERK_WEBHOOK_SECRET mancante: impostala in .env.local (dashboard Clerk > Webhooks).');
    }
    if (!req.rawBody) {
      throw new BadRequestException('Corpo della richiesta mancante.');
    }

    try {
      // Nella libreria "svix" (v2.x) verify() valida SOLO la firma e
      // ritorna undefined: non restituisce piu' il payload come nella
      // v1.x. Il corpo dell'evento va quindi fatto il parse a parte,
      // solo dopo che la firma e' stata confermata valida.
      new Webhook(secret).verify(req.rawBody, {
        'svix-id': headers['svix-id'],
        'svix-timestamp': headers['svix-timestamp'],
        'svix-signature': headers['svix-signature'],
      });
      return JSON.parse(req.rawBody.toString('utf-8'));
    } catch {
      throw new BadRequestException('Firma webhook non valida.');
    }
  }

  private async gestisciMembroCreato(dati: any): Promise<void> {
    const ruolo = dati?.role;
    if (!RUOLI_ADMIN.has(ruolo)) return;

    const orgId: string | undefined = dati?.organization?.id;
    const nome: string | undefined = dati?.organization?.name;
    const email: string | undefined = dati?.public_user_data?.identifier;

    if (!orgId || !nome || !email) return;

    await this.clienti.upsertPerOrgId(orgId, nome, email);
  }
}
