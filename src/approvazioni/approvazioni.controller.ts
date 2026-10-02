import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Contesto, SoloAdmin, type ContestoRichiesta } from '../common/auth/decorators.js';
import { AzioniRepository, STATI_AZIONE, type StatoAzione } from '../common/database/repositories/azioni.repository.js';
import { ApprovazioniService } from './approvazioni.service.js';

// Registro azioni e approvazioni (Fase 8). Il cliente arriva sempre dal
// login Clerk. Leggere: tutti i membri. Decidere: solo gli admin.
@Controller('azioni')
export class ApprovazioniController {
  constructor(
    private readonly azioni: AzioniRepository,
    private readonly approvazioni: ApprovazioniService,
  ) {}

  // GET /azioni?stato=in_attesa&limite=50
  @Get()
  async elenca(@Contesto() ctx: ContestoRichiesta, @Query('stato') stato?: string, @Query('limite') limite?: string) {
    if (stato && !STATI_AZIONE.includes(stato as StatoAzione)) {
      throw new BadRequestException(`Stato non valido. Ammessi: ${STATI_AZIONE.join(', ')}.`);
    }
    const n = Math.min(Math.max(Number(limite) || 50, 1), 200);
    return { ok: true, azioni: await this.azioni.trovaPerCliente(ctx.cliente.id, n, stato as StatoAzione | undefined) };
  }

  // GET /azioni/:id  -> azione + storico dei passaggi di stato
  @Get(':id')
  async dettaglio(@Contesto() ctx: ContestoRichiesta, @Param('id', ParseUUIDPipe) id: string) {
    const azione = await this.azioni.trovaPerId(ctx.cliente.id, id);
    if (!azione) throw new NotFoundException('Azione non trovata.');
    return { ok: true, azione, eventi: await this.azioni.eventi(ctx.cliente.id, id) };
  }

  @Post(':id/approva')
  @SoloAdmin()
  async approva(@Contesto() ctx: ContestoRichiesta, @Param('id', ParseUUIDPipe) id: string) {
    return { ok: true, azione: await this.approvazioni.approva(ctx.cliente.id, id, ctx.userId) };
  }

  // body: { motivo?: string }
  @Post(':id/rifiuta')
  @SoloAdmin()
  async rifiuta(@Contesto() ctx: ContestoRichiesta, @Param('id', ParseUUIDPipe) id: string, @Body('motivo') motivo?: string) {
    return { ok: true, azione: await this.approvazioni.rifiuta(ctx.cliente.id, id, ctx.userId, motivo) };
  }

  @Post(':id/riprova')
  @SoloAdmin()
  async riprova(@Contesto() ctx: ContestoRichiesta, @Param('id', ParseUUIDPipe) id: string) {
    return { ok: true, azione: await this.approvazioni.riprova(ctx.cliente.id, id, ctx.userId) };
  }
}
