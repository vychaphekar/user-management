import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { JwtValidator } from '../src/services/jwtValidator';
jest.mock('jwks-rsa');
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
beforeEach(() => { jest.mocked(jwksClient).mockReturnValue({ getSigningKey: jest.fn().mockResolvedValue({ getPublicKey: () => publicKey }) } as unknown as ReturnType<typeof jwksClient>); });
function token(extra: Record<string, unknown> = {}) { return jwt.sign({ sub: 'u1', client_id: 'client', token_use: 'access', ...extra }, keys.privateKey, { algorithm: 'RS256', keyid: 'key', issuer: 'https://issuer.example', expiresIn: 300 }); }
test('accepts a signed, unexpired access token for the expected issuer and client', async () => {
  await expect(new JwtValidator().verify(token(), 'https://issuer.example', 'client')).resolves.toMatchObject({ sub: 'u1' });
});
test.each([{ token_use: 'id' }, { client_id: 'other' }, { sub: '' }])('rejects invalid claims %j', async claims => {
  await expect(new JwtValidator().verify(token(claims), 'https://issuer.example', 'client')).rejects.toThrow();
});
test('rejects the wrong issuer', async () => { await expect(new JwtValidator().verify(token(), 'https://other.example', 'client')).rejects.toThrow(); });
test('rejects an expired signed token', async () => {
  const expired = jwt.sign({ sub: 'u1', client_id: 'client', token_use: 'access' }, keys.privateKey, { algorithm: 'RS256', keyid: 'key', issuer: 'https://issuer.example', expiresIn: -1 });
  await expect(new JwtValidator().verify(expired, 'https://issuer.example', 'client')).rejects.toThrow();
});
test('rejects a token signed by an attacker', async () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const forged = jwt.sign({ sub: 'u1', client_id: 'client', token_use: 'access' }, other.privateKey, { algorithm: 'RS256', keyid: 'key', issuer: 'https://issuer.example', expiresIn: 300 });
  await expect(new JwtValidator().verify(forged, 'https://issuer.example', 'client')).rejects.toThrow();
});
