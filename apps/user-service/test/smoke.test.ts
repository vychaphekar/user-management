import { buildServer } from '../src/server';
import { TenantRegistry } from '../src/services/tenantRegistry';
import { ProfileStore, UserProfile } from '../src/services/profileStore';
import { CognitoIdp } from '../src/services/cognitoIdp';
import { JwtValidator } from '../src/services/jwtValidator';
import { Env } from '../src/config/env';
import { FastifyInstance } from 'fastify';
import { RoleStore } from '../src/services/roleStore';
import jwt from 'jsonwebtoken';

const env: Env = { PORT: '3000', AWS_REGION: 'us-east-1', TENANT_TABLE_NAME: 'tenants', PROFILE_TABLE_NAME: 'profiles', DEFAULT_USER_POOL_ID: 'pool', DEFAULT_USER_POOL_ISSUER: 'https://issuer.example', DEFAULT_APP_CLIENT_ID: 'client', LOG_LEVEL: 'silent', INVITE_TABLE_NAME: 'invites', INVITE_JWT_SECRET: 'test-only-secret-not-for-deployment', SES_FROM_EMAIL: 'test@example.com' };
const profile: UserProfile = { pk: 'TENANT#t1', sk: 'USER#u1', userId: 'u1', tenantId: 't1', email: 'test@example.com', roles: ['admin'], status: 'ACTIVE', displayName: 'Test', version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const headers = { host: 'alpha.api.evanyaconsulting.com', origin: 'https://app.example.com' };
let app: FastifyInstance;
beforeEach(async () => {
  jest.spyOn(RoleStore.prototype, 'get').mockResolvedValue({ version: 0, roles: [] });
  jest.spyOn(CognitoIdp.prototype, 'getUser').mockResolvedValue({ $metadata: {}, Username: 'u1', UserAttributes: [{ Name: 'sub', Value: 'u1' }, { Name: 'email', Value: profile.email }, { Name: 'custom:tenantId', Value: 't1' }] });
  jest.spyOn(TenantRegistry.prototype, 'getTenant').mockResolvedValue({ pk: 'TENANT#alpha', tenantId: 't1', tenantSlug: 'alpha', status: 'ACTIVE', isolationMode: 'LOGICAL', uiBaseUrl: headers.origin });
  jest.spyOn(JwtValidator.prototype, 'verify').mockResolvedValue({ sub: 'u1', client_id: 'client', token_use: 'access' });
  jest.spyOn(CognitoIdp.prototype, 'getCurrentUser').mockResolvedValue({ $metadata: {}, Username: 'u1', UserAttributes: [{ Name: 'sub', Value: 'u1' }] });
  jest.spyOn(ProfileStore.prototype, 'get').mockResolvedValue({ ...profile });
  app = await buildServer(env);
});
afterEach(async () => { await app?.close(); jest.restoreAllMocks(); });
test('handles gateway preflight before body parsing or authentication', async () => {
  const res = await app.inject({ method: 'OPTIONS', url: '/v1/auth/login', headers: {
    ...headers, 'content-type': 'application/octet-stream',
    'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type',
  }, payload: '' });
  expect(res.statusCode).toBe(204);
  expect(res.headers['access-control-allow-origin']).toBe(headers.origin);
  expect(res.headers['access-control-allow-credentials']).toBe('true');
  expect(res.headers['access-control-allow-methods']).toContain('POST');
  expect(JwtValidator.prototype.verify).not.toHaveBeenCalled();
});
test('rejects untrusted preflight without granting browser access', async () => {
  const res = await app.inject({ method: 'OPTIONS', url: '/v1/auth/login', headers: {
    ...headers, origin: 'https://untrusted.example', 'access-control-request-method': 'POST',
  } });
  expect(res.statusCode).toBe(403);
  expect(res.headers['access-control-allow-origin']).toBeUndefined();
});
test('keeps parser errors readable to the configured UI', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: {
    ...headers, 'content-type': 'application/json',
  }, payload: '{broken' });
  expect(res.statusCode).toBe(400);
  expect(res.headers['access-control-allow-origin']).toBe(headers.origin);
});
test('missing tenant UI origin fails closed', async () => {
  jest.mocked(TenantRegistry.prototype.getTenant).mockResolvedValue({ pk: 'TENANT#alpha', tenantId: 't1', tenantSlug: 'alpha', status: 'ACTIVE', isolationMode: 'LOGICAL' });
  const res = await app.inject({ method: 'OPTIONS', url: '/v1/auth/login', headers: {
    ...headers, 'access-control-request-method': 'POST',
  } });
  expect(res.statusCode).toBe(403);
  expect(res.headers['access-control-allow-origin']).toBeUndefined();
});
test('rejects requests without a tenant host', async () => {
  const res = await app.inject({ method: 'GET', url: '/healthz', headers: { host: 'api.evanyaconsulting.com' } });
  expect(res.statusCode).toBe(403);
});
test('requires authentication for the current profile', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/auth/me', headers });
  expect(res.statusCode).toBe(401);
  expect(res.headers['access-control-allow-origin']).toBe(headers.origin);
  expect(res.headers['access-control-allow-credentials']).toBe('true');
});
test('returns the current database profile without tokens', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { ...headers, cookie: '__Host-blueberry-access=test-token' } });
  expect(res.statusCode).toBe(200);
  expect(res.json().user.roles).toEqual(['admin']);
  expect(res.json().user.permissions).toEqual(expect.arrayContaining(['incidents.create', 'incidents.read', 'incidents.update']));
  expect(res.json().user.pk).toBeUndefined();
  expect(res.body).not.toContain('test-token');
  expect(res.headers['cache-control']).toBe('no-store');
});
test('returns the incident permissions a field worker holds by default', async () => {
  jest.mocked(ProfileStore.prototype.get).mockResolvedValue({ ...profile, roles: ['field_worker'] });
  const res = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { ...headers, authorization: 'Bearer token' } });
  expect(res.json().user.permissions).toEqual(['incidents.create', 'incidents.read', 'incidents.update']);
});
test.each(['DISABLED', 'INVITED', 'DELETED'] as const)('denies an account that is now %s', async status => {
  jest.mocked(ProfileStore.prototype.get).mockResolvedValue({ ...profile, status });
  const res = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { ...headers, authorization: 'Bearer token' } });
  expect(res.statusCode).toBe(403);
});
test('denies a profile from a different organization', async () => {
  jest.mocked(ProfileStore.prototype.get).mockResolvedValue({ ...profile, tenantId: 'other' });
  const res = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { ...headers, authorization: 'Bearer token' } });
  expect(res.statusCode).toBe(403);
});
test('denies a revoked token even if signature verification succeeds', async () => {
  jest.mocked(CognitoIdp.prototype.getCurrentUser).mockRejectedValue(Object.assign(new Error('revoked'), { name: 'NotAuthorizedException' }));
  const res = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { ...headers, authorization: 'Bearer token' } });
  expect(res.statusCode).toBe(401);
});
test('rejects cross-origin mutations before calling the identity provider', async () => {
  const login = jest.spyOn(CognitoIdp.prototype, 'loginUserPassword');
  const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { ...headers, origin: 'https://untrusted.example' }, payload: { email: profile.email, password: 'TestPassword1!' } });
  expect(res.statusCode).toBe(403); expect(login).not.toHaveBeenCalled();
});
test('sign-in sets secure host-only HttpOnly cookies and returns no credentials', async () => {
  jest.spyOn(CognitoIdp.prototype, 'loginUserPassword').mockResolvedValue({ $metadata: {}, AuthenticationResult: { AccessToken: 'access-secret', RefreshToken: 'refresh-secret', ExpiresIn: 3600 } });
  const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers, payload: { email: profile.email, password: 'TestPassword1!' } });
  expect(res.statusCode).toBe(200);
  const cookies = res.headers['set-cookie'] as string[];
  expect(cookies).toHaveLength(2);
  for (const cookie of cookies) { expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=Strict'); expect(cookie).toContain('Path=/'); expect(cookie).not.toContain('Domain='); }
  expect(res.body).not.toContain('access-secret'); expect(res.body).not.toContain('refresh-secret');
});
test('password reset does not send codes for another tenant in a shared pool', async () => {
  jest.mocked(CognitoIdp.prototype.getUser).mockResolvedValue({ $metadata: {}, Username: 'other', UserAttributes: [{ Name: 'sub', Value: 'other' }, { Name: 'email', Value: 'other@example.com' }, { Name: 'custom:tenantId', Value: 'other-tenant' }] });
  const forgot = jest.spyOn(CognitoIdp.prototype, 'forgotPassword');
  const res = await app.inject({ method: 'POST', url: '/v1/auth/forgot-password', headers, payload: { email: 'other@example.com' } });
  expect(res.statusCode).toBe(200); expect(res.json()).toEqual({ ok: true });
  expect(forgot).not.toHaveBeenCalled();
});
test('password reset confirmation cannot affect another tenant account', async () => {
  jest.mocked(ProfileStore.prototype.get).mockResolvedValue(null);
  const confirm = jest.spyOn(CognitoIdp.prototype, 'confirmForgotPassword');
  const res = await app.inject({ method: 'POST', url: '/v1/auth/confirm-forgot-password', headers, payload: { email: profile.email, code: '123456', newPassword: 'TestPassword1!' } });
  expect(res.statusCode).toBe(400); expect(confirm).not.toHaveBeenCalled();
});
test('password reset sends a code for an active member of this tenant', async () => {
  const forgot = jest.spyOn(CognitoIdp.prototype, 'forgotPassword').mockResolvedValue({ $metadata: {} });
  const res = await app.inject({ method: 'POST', url: '/v1/auth/forgot-password', headers, payload: { email: profile.email } });
  expect(res.statusCode).toBe(200);
  expect(forgot).toHaveBeenCalledWith('client', profile.email);
});
test('unknown accounts receive the same reset response without revealing existence', async () => {
  jest.mocked(CognitoIdp.prototype.getUser).mockRejectedValue(Object.assign(new Error('missing'), { name: 'UserNotFoundException' }));
  const res = await app.inject({ method: 'POST', url: '/v1/auth/forgot-password', headers, payload: { email: 'missing@example.com' } });
  expect(res.statusCode).toBe(200); expect(res.json()).toEqual({ ok: true });
});
test('an account disabled during MFA cannot continue the challenge', async () => {
  jest.mocked(ProfileStore.prototype.get).mockResolvedValue({ ...profile, status: 'DISABLED' });
  const respond = jest.spyOn(CognitoIdp.prototype, 'respondToChallenge');
  const challengeToken = jwt.sign({ tenantId: 't1', username: profile.email, challenge: 'SOFTWARE_TOKEN_MFA', session: 'session' }, env.INVITE_JWT_SECRET, { audience: 'blueberry-challenge', expiresIn: 180 });
  const res = await app.inject({ method: 'POST', url: '/v1/auth/challenge', headers, payload: { challengeToken, answer: '123456' } });
  expect(res.statusCode).toBe(401); expect(respond).not.toHaveBeenCalled();
});
test('sign-in does not initiate password challenges for a non-member', async () => {
  jest.mocked(ProfileStore.prototype.get).mockResolvedValue(null);
  const login = jest.spyOn(CognitoIdp.prototype, 'loginUserPassword');
  const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers, payload: { email: profile.email, password: 'TestPassword1!' } });
  expect(res.statusCode).toBe(401); expect(login).not.toHaveBeenCalled();
});
