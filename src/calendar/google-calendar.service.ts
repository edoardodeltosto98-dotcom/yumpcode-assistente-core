import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GoogleTokenService } from '../auth/google-token.service.js';

// Solo i campi che ci servono davvero dalla risposta di Google Calendar
// (l'API ne restituisce molti di piu').
export interface EventoCalendario {
  id: string;
  titolo: string;
  inizio: string | null;
  fine: string | null;
  link: string | null;
}

export interface NuovoEvento {
  titolo: string;
  descrizione?: string;
  // Con "fuso": orario da orologio senza fuso, es. "2026-10-01T10:00:00".
  // Senza "fuso": ISO 8601 completo, es. "2026-10-01T10:00:00+02:00".
  inizio: string;
  fine: string;
  // Fuso IANA in cui leggere inizio e fine, es. "Europe/Rome".
  fuso?: string;
}

const CALENDAR_BASE_URL = 'https://www.googleapis.com/calendar/v3';

// Wrapper minimo sulle API di Google Calendar (calendario primario del
// cliente). Usa sempre GoogleTokenService per avere un access token
// valido: nessuna chiamata Google va fatta leggendo il token a mano da
// ConnessioniRepository.
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private readonly googleToken: GoogleTokenService) {}

  async elencaProssimiEventi(clienteId: string, giorni = 7): Promise<EventoCalendario[]> {
    const accessToken = await this.googleToken.ottieniAccessTokenValido(clienteId);

    const ora = new Date();
    const fine = new Date(ora.getTime() + giorni * 24 * 60 * 60 * 1000);
    const parametri = new URLSearchParams({
      timeMin: ora.toISOString(),
      timeMax: fine.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50',
    });

    const risposta = await fetch(
      `${CALENDAR_BASE_URL}/calendars/primary/events?${parametri.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!risposta.ok) {
      await this.gestisciErrore(clienteId, risposta, 'lettura eventi');
    }

    const dati = (await risposta.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        htmlLink?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };

    return (dati.items ?? []).map((evento) => ({
      id: evento.id,
      titolo: evento.summary ?? '(senza titolo)',
      inizio: evento.start?.dateTime ?? evento.start?.date ?? null,
      fine: evento.end?.dateTime ?? evento.end?.date ?? null,
      link: evento.htmlLink ?? null,
    }));
  }

  // idEvento (facoltativo): id scelto da noi (solo cifre e lettere a-v). Se
  // l'evento con quell'id esiste gia', Google risponde 409 e noi restituiamo
  // quello esistente: richiamare due volte non crea doppioni.
  async creaEvento(clienteId: string, evento: NuovoEvento, idEvento?: string): Promise<EventoCalendario> {
    if (!evento.titolo?.trim()) {
      throw new BadRequestException('"titolo" e obbligatorio.');
    }
    if (!evento.inizio || !evento.fine) {
      throw new BadRequestException('"inizio" e "fine" sono obbligatori (ISO 8601).');
    }

    const accessToken = await this.googleToken.ottieniAccessTokenValido(clienteId);

    const risposta = await fetch(`${CALENDAR_BASE_URL}/calendars/primary/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: idEvento,
        summary: evento.titolo,
        description: evento.descrizione,
        start: { dateTime: evento.inizio, timeZone: evento.fuso },
        end: { dateTime: evento.fine, timeZone: evento.fuso },
      }),
    });

    let rispostaEvento = risposta;
    if (risposta.status === 409 && idEvento) {
      rispostaEvento = await fetch(`${CALENDAR_BASE_URL}/calendars/primary/events/${idEvento}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
    if (!rispostaEvento.ok) {
      await this.gestisciErrore(clienteId, rispostaEvento, 'creazione evento');
    }

    const creato = (await rispostaEvento.json()) as {
      id: string;
      summary?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    };

    return {
      id: creato.id,
      titolo: creato.summary ?? evento.titolo,
      inizio: creato.start?.dateTime ?? creato.start?.date ?? null,
      fine: creato.end?.dateTime ?? creato.end?.date ?? null,
      link: creato.htmlLink ?? null,
    };
  }

  private async gestisciErrore(clienteId: string, risposta: Response, contesto: string): Promise<never> {
    const corpo = await risposta.text();
    this.logger.error(`Google Calendar (${contesto}) fallita per cliente ${clienteId}: ${corpo}`);
    throw new Error(`Chiamata a Google Calendar fallita (${contesto}, status ${risposta.status}).`);
  }
}
