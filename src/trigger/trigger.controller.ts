import { BadRequestException, Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ClienteCorrente, SoloAdmin } from '../common/auth/decorators.js';
import { ClientiRepository, type Cliente } from '../common/database/repositories/clienti.repository.js';
import { RegoleRepository } from '../common/database/repositories/regole.repository.js';
import { TriggerService, type RichiestaAzione } from './trigger.service.js';
import { validaDatiRegola, validaProcesso } from './valida-regola.js';

// Multi-tenant: il cliente arriva sempre dal token Clerk (@ClienteCorrente),
// mai dalla richiesta. Leggere regole e azioni e' concesso a tutti i membri
// dell'organizzazione; cambiarle solo agli admin.
@Controller()
export class TriggerController {
  constructor(
    private readonly trigger: TriggerService,
    private readonly regole: RegoleRepository,
    private readonly clienti: ClientiRepository,
  ) {}

  // GET /regole
  @Get('regole')
  async elencaRegole(@ClienteCorrente() cliente: Cliente) {
    return { ok: true, regole: await this.regole.trovaPerCliente(cliente.id) };
  }

  // POST /regole?processo=solleciti  body: DatiRegola
  @Post('regole')
  @SoloAdmin()
  async salvaRegola(
    @ClienteCorrente() cliente: Cliente,
    @Query('processo') processo: string,
    @Body() corpo: unknown,
  ) {
    const regola = await this.regole.salva(cliente.id, validaProcesso(processo), validaDatiRegola(corpo));
    return { ok: true, regola };
  }

  // GET /clienti/me -> dati del cliente di chi chiama (per le impostazioni)
  @Get('clienti/me')
  clienteCorrente(@ClienteCorrente() cliente: Cliente) {
    return {
      ok: true,
      cliente: { nome: cliente.nome, email: cliente.email, interruttore_attivo: cliente.interruttore_attivo },
    };
  }

  // PATCH /clienti/me/interruttore  body: { attivo: boolean }
  // (prima era /clienti/:id/interruttore: con l'id nell'URL chiunque
  // poteva spegnere l'assistente di un altro cliente)
  @Patch('clienti/me/interruttore')
  @SoloAdmin()
  async impostaInterruttore(@ClienteCorrente() cliente: Cliente, @Body('attivo') attivo: boolean) {
    if (typeof attivo !== 'boolean') throw new BadRequestException('Campo "attivo" (true/false) mancante.');
    const aggiornato = await this.clienti.impostaInterruttore(cliente.id, attivo);
    return { ok: true, cliente: aggiornato };
  }

  // POST /trigger/valuta  body: RichiestaAzione senza clienteId —
  // endpoint di test per simulare un trigger finche' i webhook
  // Microsoft/Google non sono cablati. Il clienteId eventualmente
  // presente nel body viene ignorato e sostituito con quello del token.
  @Post('trigger/valuta')
  @SoloAdmin()
  async valutaTrigger(
    @ClienteCorrente() cliente: Cliente,
    @Body() richiesta: Omit<RichiestaAzione, 'clienteId'>,
  ) {
    if (!richiesta?.processo || !richiesta.recordRiferimento || !richiesta.tipo) {
      throw new BadRequestException('Campi obbligatori: processo, recordRiferimento, tipo.');
    }
    const d = richiesta.dettagli;
    if (d !== undefined && (d === null || typeof d !== 'object' || Array.isArray(d))) {
      throw new BadRequestException('"dettagli" deve essere un oggetto.');
    }
    const risultato = await this.trigger.valuta({ ...richiesta, clienteId: cliente.id });
    return { ok: true, risultato };
  }

  // Il registro azioni (GET /azioni, approvazioni) e' in src/approvazioni (Fase 8).
}
