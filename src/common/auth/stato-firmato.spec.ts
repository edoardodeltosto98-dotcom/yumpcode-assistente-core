import { randomBytes } from 'node:crypto';
import { chiaveFirmaStato, firmaStato, verificaStato } from './stato-firmato.js';

describe('stato OAuth firmato', () => {
  const chiave = chiaveFirmaStato(randomBytes(32).toString('base64'));

  it('restituisce il clienteId da un token integro', () => {
    const token = firmaStato({ clienteId: 'cliente-1' }, chiave);
    expect(verificaStato(token, chiave)).toEqual({ clienteId: 'cliente-1' });
  });

  it('rifiuta un token con il clienteId cambiato', () => {
    const [, firma] = firmaStato({ clienteId: 'cliente-1' }, chiave).split('.');
    const falso = Buffer.from(JSON.stringify({ c: 'cliente-altrui', exp: 9999999999, n: 'x' })).toString('base64url');
    expect(verificaStato(`${falso}.${firma}`, chiave)).toBeNull();
  });

  it('rifiuta un token firmato con un\'altra chiave', () => {
    const altraChiave = chiaveFirmaStato(randomBytes(32).toString('base64'));
    expect(verificaStato(firmaStato({ clienteId: 'c' }, altraChiave), chiave)).toBeNull();
  });

  it('rifiuta un token scaduto', () => {
    expect(verificaStato(firmaStato({ clienteId: 'c' }, chiave, -1), chiave)).toBeNull();
  });

  it('rifiuta un vecchio state in chiaro (solo clienteId)', () => {
    expect(verificaStato('cliente-1', chiave)).toBeNull();
  });
});
