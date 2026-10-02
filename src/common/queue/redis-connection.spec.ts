import { getRedisConnectionOptions } from './redis-connection.js';

describe('getRedisConnectionOptions', () => {
  const originale = process.env.REDIS_URL;
  afterEach(() => {
    process.env.REDIS_URL = originale;
  });

  it('Redis locale: nessun TLS, nessuna credenziale', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(getRedisConnectionOptions()).toEqual({
      host: 'localhost',
      port: 6379,
      username: undefined,
      password: undefined,
      maxRetriesPerRequest: null,
    });
  });

  it('Redis online (rediss://): TLS attivo, utente e password letti dall\'indirizzo', () => {
    process.env.REDIS_URL = 'rediss://default:pa%40ss@esempio.upstash.io:6380';
    expect(getRedisConnectionOptions()).toMatchObject({
      host: 'esempio.upstash.io',
      port: 6380,
      username: 'default',
      password: 'pa@ss',
      tls: {},
    });
  });
});
