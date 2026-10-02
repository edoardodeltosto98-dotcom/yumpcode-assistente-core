import type { RedisOptions } from 'ioredis';

// BullMQ vuole una connessione ioredis con maxRetriesPerRequest: null
// (obbligatorio per i worker/blocking client di BullMQ).
export function getRedisConnectionOptions(): RedisOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      'REDIS_URL mancante. Avvia Redis in locale (docker-compose.yml, servizio "redis") e imposta REDIS_URL=redis://localhost:6379 in .env.local.',
    );
  }
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    // "rediss://" (due s) = connessione cifrata: la richiedono i Redis
    // ospitati online (es. Upstash). In locale si usa "redis://", senza TLS.
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
