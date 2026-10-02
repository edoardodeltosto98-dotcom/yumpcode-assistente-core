import { UnrecoverableError } from 'bullmq';
import type { Azione } from '../common/database/repositories/azioni.repository.js';
import type { GoogleCalendarService } from '../calendar/google-calendar.service.js';

// Errore che non ha senso ritentare (azione sparita, interruttore spento,
// nessun esecutore, dati dell'azione sbagliati): estende UnrecoverableError,
// cosi' BullMQ non ritenta e l'azione va subito in "fallita".
export class ErroreDefinitivo extends UnrecoverableError {}

// Un esecutore sa fare UNA cosa concreta per un tipo di azione (es. inviare
// un sollecito via mail, creare un evento in calendario). Il worker cerca
// l'esecutore per azione.tipo: se non esiste, l'azione finisce in "fallita"
// con un messaggio chiaro, invece di risultare eseguita senza aver fatto nulla.
//
// Cio' che l'esecutore restituisce viene salvato in azioni.dettagli.risultato
// (es. il link dell'evento creato) e si vede nel cruscotto.
export interface EsecutoreAzione {
  tipo: string;
  esegui(azione: Azione): Promise<Record<string, unknown> | void>;
}

export const ESECUTORI_AZIONE = 'ESECUTORI_AZIONE';

// Esecutore di prova: non fa nulla di esterno. Serve a verificare il giro
// completo approvazione -> coda -> eseguita.
export const esecutoreTest: EsecutoreAzione = {
  tipo: 'test',
  async esegui() {
    // volutamente vuoto
  },
};

// Esecutore di prova che fallisce al primo tentativo di ogni azione e riesce
// al successivo: serve a provare dal vivo "fallita" -> Riprova -> "eseguita".
// La memoria e' solo in RAM: va bene per una prova, non per altro.
export function creaEsecutoreTestFallisce(): EsecutoreAzione {
  const giaProvate = new Set<string>();
  return {
    tipo: 'test-fallisce',
    async esegui(azione) {
      if (!giaProvate.has(azione.id)) {
        giaProvate.add(azione.id);
        throw new ErroreDefinitivo('Errore di prova: il primo tentativo fallisce apposta. Premi "Riprova".');
      }
      giaProvate.delete(azione.id);
    },
  };
}

export const TIPO_EVENTO_CALENDARIO = 'evento-calendario';

const ISO_CON_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

// Primo esecutore vero: crea un evento nel Google Calendar del cliente.
// I dati dell'evento stanno in azione.dettagli.evento:
//   { titolo, descrizione?, inizio, fine }  (date ISO 8601 con fuso orario)
//
// Niente doppioni: l'id dell'evento su Google e' ricavato dall'id dell'azione,
// quindi se un tentativo crea l'evento ma poi cade la rete, il tentativo
// successivo ritrova lo stesso evento invece di crearne un secondo.
export function creaEsecutoreEventoCalendario(calendar: GoogleCalendarService): EsecutoreAzione {
  return {
    tipo: TIPO_EVENTO_CALENDARIO,
    async esegui(azione) {
      const evento = leggiEvento(azione);
      let creato;
      try {
        creato = await calendar.creaEvento(azione.cliente_id, evento, azione.id.replace(/-/g, ''));
      } catch (err) {
        // Account Google non collegato (404) o dati rifiutati (400): ritentare
        // da soli non serve, deve intervenire una persona.
        const status = (err as { getStatus?: () => number }).getStatus?.();
        if (status === 404 || status === 400) throw new ErroreDefinitivo((err as Error).message);
        throw err;
      }
      return { eventoId: creato.id, link: creato.link, inizio: creato.inizio, fine: creato.fine };
    },
  };
}

function leggiEvento(azione: Azione) {
  const e = (azione.dettagli?.evento ?? null) as Record<string, unknown> | null;
  if (!e || typeof e !== 'object') throw new ErroreDefinitivo('Dati dell\'evento mancanti (dettagli.evento).');
  const titolo = typeof e.titolo === 'string' ? e.titolo.trim() : '';
  if (!titolo) throw new ErroreDefinitivo('Evento senza titolo.');
  for (const campo of ['inizio', 'fine'] as const) {
    if (typeof e[campo] !== 'string' || !ISO_CON_FUSO.test(e[campo])) {
      throw new ErroreDefinitivo(`Evento: "${campo}" deve essere una data ISO 8601 con fuso orario.`);
    }
  }
  if (new Date(e.fine as string) <= new Date(e.inizio as string)) {
    throw new ErroreDefinitivo('Evento: la fine deve essere dopo l\'inizio.');
  }
  return {
    titolo,
    descrizione: typeof e.descrizione === 'string' ? e.descrizione : undefined,
    inizio: e.inizio as string,
    fine: e.fine as string,
  };
}
