import { BadRequestException } from '@nestjs/common';
import type { DatiRegola } from '../common/database/repositories/regole.repository.js';

const ORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;
// Nome del processo: minuscole, cifre e trattini (es. "solleciti-fatture").
const PROCESSO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validaProcesso(processo: unknown): string {
  if (typeof processo !== 'string' || processo.length > 60 || !PROCESSO.test(processo)) {
    throw new BadRequestException('Nome del processo non valido: solo minuscole, cifre e trattini (max 60 caratteri).');
  }
  return processo;
}

// Controlla i dati di una regola prima di salvarli e restituisce solo i campi
// noti, ripuliti. Senza questo controllo un valore sbagliato (es. un orario
// "25:00" o un tetto negativo) finirebbe nel database e bloccherebbe o
// sbloccherebbe le azioni in modo imprevedibile.
export function validaDatiRegola(corpo: unknown): DatiRegola {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new BadRequestException('Il corpo della richiesta deve essere un oggetto.');
  }
  const c = corpo as Record<string, unknown>;
  const dati: DatiRegola = {};

  const intero = (campo: 'giorniAttesa' | 'maxAzioniGiorno', min: number, max: number) => {
    const v = c[campo];
    if (v === undefined) return;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      throw new BadRequestException(`"${campo}" deve essere un numero intero tra ${min} e ${max}.`);
    }
    dati[campo] = v;
  };
  intero('giorniAttesa', 0, 365);
  intero('maxAzioniGiorno', 0, 1000);

  for (const campo of ['fasciaOrariaInizio', 'fasciaOrariaFine'] as const) {
    const v = c[campo];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !ORARIO.test(v)) {
      throw new BadRequestException(`"${campo}" deve essere un orario nel formato HH:MM.`);
    }
    dati[campo] = v;
  }

  if (c.contattiEsclusi !== undefined) {
    const lista = c.contattiEsclusi;
    if (!Array.isArray(lista) || lista.length > 500 || lista.some((x) => typeof x !== 'string' || x.length > 200)) {
      throw new BadRequestException('"contattiEsclusi" deve essere un elenco di testi (max 500).');
    }
    // Minuscolo e senza doppioni: il filtro confronta in minuscolo.
    dati.contattiEsclusi = [...new Set((lista as string[]).map((x) => x.trim().toLowerCase()).filter(Boolean))];
  }

  if (c.attiva !== undefined) {
    if (typeof c.attiva !== 'boolean') throw new BadRequestException('"attiva" deve essere true o false.');
    dati.attiva = c.attiva;
  }
  return dati;
}
