import type { StatoAzione } from '../common/database/repositories/azioni.repository.js';

// Numeri di un mese: tutti riferiti alle azioni PROPOSTE in quel mese, contate
// secondo lo stato in cui si trovano adesso.
export interface Conteggi {
  proposte: number;
  inAttesa: number;
  // approvate = decise con un si': in esecuzione + eseguite + fallite
  approvate: number;
  rifiutate: number;
  eseguite: number;
  fallite: number;
}

export interface NumeriMese {
  mese: string; // "YYYY-MM"
  totale: Conteggi;
  perProcesso: Array<{ processo: string } & Conteggi>;
}

export interface RigaConteggio {
  mese: string;
  processo: string;
  stato: StatoAzione;
  totale: number;
}

const MESE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const meseValido = (mese: string) => MESE.test(mese);

// Il "mese" segue il calendario italiano, non quello UTC del server.
export const FUSO = 'Europe/Rome';

export function meseCorrente(adesso = new Date()): string {
  const parti = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit' }).formatToParts(adesso);
  const valore = (tipo: string) => parti.find((p) => p.type === tipo)!.value;
  return `${valore('year')}-${valore('month')}`;
}

export function mesePrecedente(mese: string): string {
  const [anno, m] = mese.split('-').map(Number);
  return m === 1 ? `${anno - 1}-12` : `${anno}-${String(m - 1).padStart(2, '0')}`;
}

const vuoti = (): Conteggi => ({ proposte: 0, inAttesa: 0, approvate: 0, rifiutate: 0, eseguite: 0, fallite: 0 });

function somma(c: Conteggi, stato: StatoAzione, n: number) {
  c.proposte += n;
  if (stato === 'in_attesa') c.inAttesa += n;
  if (stato === 'rifiutata') c.rifiutate += n;
  if (stato === 'eseguita') c.eseguite += n;
  if (stato === 'fallita') c.fallite += n;
  if (stato === 'approvata' || stato === 'eseguita' || stato === 'fallita') c.approvate += n;
}

export function calcolaNumeri(mese: string, righe: RigaConteggio[]): NumeriMese {
  const totale = vuoti();
  const processi = new Map<string, Conteggi>();
  for (const r of righe) {
    if (r.mese !== mese) continue;
    somma(totale, r.stato, r.totale);
    if (!processi.has(r.processo)) processi.set(r.processo, vuoti());
    somma(processi.get(r.processo)!, r.stato, r.totale);
  }
  const perProcesso = [...processi.entries()]
    .map(([processo, c]) => ({ processo, ...c }))
    .sort((a, b) => b.proposte - a.proposte || a.processo.localeCompare(b.processo));
  return { mese, totale, perProcesso };
}
