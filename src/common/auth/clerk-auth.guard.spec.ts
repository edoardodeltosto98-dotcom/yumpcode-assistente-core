import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClerkAuthGuard } from './clerk-auth.guard.js';
import { TokenNonValidoError, type ClaimsClerk } from './clerk-jwt.verifier.js';
import { CHIAVE_PUBBLICO, CHIAVE_SOLO_ADMIN, type RichiestaConContesto } from './decorators.js';

const cliente = {
  id: 'cliente-1',
  nome: 'Cliente Test',
  email: 'test@example.com',
  interruttore_attivo: true,
  org_id: 'org_1',
  created_at: '',
  updated_at: '',
};

function contesto(req: Partial<RichiestaConContesto>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('ClerkAuthGuard', () => {
  let metadati: Record<string, boolean>;
  let reflector: Reflector;
  let verifica: ReturnType<typeof vi.fn>;
  let trovaPerOrgId: ReturnType<typeof vi.fn>;
  let guard: ClerkAuthGuard;

  const claims = (o?: ClaimsClerk['o']): ClaimsClerk => ({ sub: 'user_1', iss: 'x', exp: 0, o });

  beforeEach(() => {
    metadati = {};
    reflector = { getAllAndOverride: (chiave: string) => metadati[chiave] } as unknown as Reflector;
    verifica = vi.fn().mockResolvedValue(claims({ id: 'org_1', rol: 'admin' }));
    trovaPerOrgId = vi.fn().mockResolvedValue(cliente);
    guard = new ClerkAuthGuard(reflector, { verifica } as never, { trovaPerOrgId } as never);
  });

  it('lascia passare gli endpoint @Pubblico() senza token', async () => {
    metadati[CHIAVE_PUBBLICO] = true;
    await expect(guard.canActivate(contesto({ headers: {} }))).resolves.toBe(true);
    expect(verifica).not.toHaveBeenCalled();
  });

  it('rifiuta senza header Authorization', async () => {
    await expect(guard.canActivate(contesto({ headers: {} }))).rejects.toThrow(UnauthorizedException);
  });

  it('rifiuta un token non valido con 401', async () => {
    verifica.mockRejectedValue(new TokenNonValidoError('Token scaduto.'));
    await expect(
      guard.canActivate(contesto({ headers: { authorization: 'Bearer abc' } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rifiuta se non c\'e\' un\'organizzazione attiva', async () => {
    verifica.mockResolvedValue(claims(undefined));
    await expect(
      guard.canActivate(contesto({ headers: { authorization: 'Bearer abc' } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rifiuta se l\'organizzazione non e\' ancora un cliente', async () => {
    trovaPerOrgId.mockResolvedValue(null);
    await expect(
      guard.canActivate(contesto({ headers: { authorization: 'Bearer abc' } })),
    ).rejects.toThrow('non ancora registrata');
  });

  it('mette nel contesto il cliente ricavato dall\'organizzazione del token', async () => {
    const req: Partial<RichiestaConContesto> = { headers: { authorization: 'Bearer abc' } };
    await expect(guard.canActivate(contesto(req))).resolves.toBe(true);
    expect(trovaPerOrgId).toHaveBeenCalledWith('org_1');
    expect(req.contesto).toMatchObject({ userId: 'user_1', orgId: 'org_1', admin: true, cliente });
  });

  it('blocca i membri non admin sugli endpoint @SoloAdmin()', async () => {
    metadati[CHIAVE_SOLO_ADMIN] = true;
    verifica.mockResolvedValue(claims({ id: 'org_1', rol: 'member' }));
    await expect(
      guard.canActivate(contesto({ headers: { authorization: 'Bearer abc' } })),
    ).rejects.toThrow('amministratori');
  });

  it('lascia passare i membri non admin sugli endpoint normali', async () => {
    verifica.mockResolvedValue(claims({ id: 'org_1', rol: 'member' }));
    const req: Partial<RichiestaConContesto> = { headers: { authorization: 'Bearer abc' } };
    await expect(guard.canActivate(contesto(req))).resolves.toBe(true);
    expect(req.contesto?.admin).toBe(false);
  });
});
