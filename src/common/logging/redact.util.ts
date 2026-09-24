/**
 * Regola di Fase 3: nei log non deve finire MAI un token ne' il
 * contenuto di una mail del cliente. Questa utility ripulisce
 * ricorsivamente un oggetto prima che venga scritto nei log,
 * sostituendo i campi sensibili con "[REDACTED]".
 *
 * Va usata in ogni punto che logga oggetti provenienti da: richieste
 * HTTP, risposte di Microsoft Graph / Google, payload salvati o letti
 * dal database.
 */

// Nomi di campo (case-insensitive) sempre oscurati.
const SENSITIVE_KEYS = [
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authorization',
  'password',
  'secret',
  'apikey',
  'encryptionkey',
  // contenuto delle comunicazioni col cliente: mai in chiaro nei log
  'body',
  'content',
  'html',
  'text',
  'snippet',
  'subject',
];

const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, '');
  return SENSITIVE_KEYS.some((sensitive) => normalized.includes(sensitive));
}

export function redact<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1)) as unknown as T;
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redact(val, depth + 1);
    }
    return out as T;
  }

  return value;
}
