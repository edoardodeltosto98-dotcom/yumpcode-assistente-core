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
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  };
}
