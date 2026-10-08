// Promemoria di scadenza: il cliente inserisce una scadenza (fattura,
// contratto, pagamento...) dal cruscotto, l'assistente propone un'azione e,
// dopo l'approvazione, crea un evento di tutto il giorno nel Google Calendar
// del cliente con un avviso N giorni prima.

export const PROCESSO_SCADENZE = 'scadenze';
export const TIPO_PROMEMORIA_SCADENZA = 'promemoria-scadenza';

// Google accetta avvisi al massimo 4 settimane prima dell'evento.
export const PREAVVISO_MASSIMO = 28;

export interface Scadenza {
  titolo: string;
  data: string; // "AAAA-MM-GG"
  giorniPreavviso: number;
  note?: string;
}

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

// Controlla i dati di una scadenza e li restituisce ripuliti, oppure
// restituisce il messaggio d'errore (chi chiama decide che eccezione usare).
export function leggiScadenza(valore: unknown): Scadenza | string {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) return 'Dati della scadenza mancanti.';
  const v = valore as Record<string, unknown>;

  const titolo = typeof v.titolo === 'string' ? v.titolo.trim() : '';
  if (!titolo) return 'La scadenza deve avere un titolo.';
  if (titolo.length > 200) return 'Titolo troppo lungo (massimo 200 caratteri).';

  if (typeof v.data !== 'string' || !dataValida(v.data)) return 'Data non valida: usa il formato AAAA-MM-GG.';

  const g = v.giorniPreavviso;
  if (typeof g !== 'number' || !Number.isInteger(g) || g < 0 || g > PREAVVISO_MASSIMO) {
    return `I giorni di preavviso devono essere un numero intero tra 0 e ${PREAVVISO_MASSIMO}.`;
  }

  let note: string | undefined;
  if (v.note !== undefined && v.note !== null) {
    if (typeof v.note !== 'string') return 'Le note devono essere un testo.';
    if (v.note.length > 2000) return 'Note troppo lunghe (massimo 2000 caratteri).';
    note = v.note.trim() || undefined;
  }

  return { titolo, data: v.data, giorniPreavviso: g, ...(note ? { note } : {}) };
}

function dataValida(testo: string): boolean {
  const m = DATA.exec(testo);
  if (!m) return false;
  const [anno, mese, giorno] = m.slice(1).map(Number);
  const d = new Date(Date.UTC(anno, mese - 1, giorno));
  return d.getUTCFullYear() === anno && d.getUTCMonth() === mese - 1 && d.getUTCDate() === giorno;
}

// Il giorno dopo, sempre "AAAA-MM-GG" (per Google la fine di un evento di
// tutto il giorno e' esclusa).
export function giornoDopo(data: string): string {
  const [anno, mese, giorno] = data.split('-').map(Number);
  return new Date(Date.UTC(anno, mese - 1, giorno + 1)).toISOString().slice(0, 10);
}

// Minuti di anticipo dell'avviso rispetto all'inizio dell'evento (mezzanotte
// del giorno di scadenza): N giorni prima alle 9:00. Con 0 giorni l'avviso
// arriva a mezzanotte del giorno stesso (Google non accetta anticipi negativi).
export function minutiAvviso(giorniPreavviso: number): number {
  return giorniPreavviso === 0 ? 0 : giorniPreavviso * 24 * 60 - 9 * 60;
}
