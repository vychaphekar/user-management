import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server";
import { Env } from "../src/config/env";
import { TenantRegistry } from "../src/services/tenantRegistry";
import { ProfileStore, UserProfile } from "../src/services/profileStore";
import { CognitoIdp } from "../src/services/cognitoIdp";
import { JwtValidator } from "../src/services/jwtValidator";
import { RoleStore, PERMISSIONS, INCIDENT_PERMISSIONS, RoleCatalog, effectivePermissions } from "../src/services/roleStore";

const env: Env = { PORT: "3000", AWS_REGION: "us-east-1", TENANT_TABLE_NAME: "tenants", PROFILE_TABLE_NAME: "profiles", DEFAULT_USER_POOL_ID: "pool", DEFAULT_USER_POOL_ISSUER: "https://issuer.example", DEFAULT_APP_CLIENT_ID: "client", LOG_LEVEL: "silent", INVITE_TABLE_NAME: "invites", INVITE_JWT_SECRET: "test-only-secret-not-for-deployment", SES_FROM_EMAIL: "test@example.com" };
const headers = { host: "alpha.api.evanyaconsulting.com", origin: "https://app.example.com", authorization: "Bearer token" };
const actor: UserProfile = { pk: "TENANT#t1", sk: "USER#actor", userId: "actor", tenantId: "t1", email: "actor@example.com", roles: ["limited"], status: "ACTIVE", displayName: "Actor", version: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
let app: FastifyInstance;
let catalog: RoleCatalog;
beforeEach(async () => {
  catalog = { version: 3, roles: [{ id: "limited", name: "Limited", enabled: true, permissions: ["users.read", "roles.manage", "users.assign_roles"] }] };
  jest.spyOn(TenantRegistry.prototype, "getTenant").mockResolvedValue({ pk: "TENANT#alpha", tenantId: "t1", tenantSlug: "alpha", status: "ACTIVE", isolationMode: "LOGICAL", uiBaseUrl: headers.origin });
  jest.spyOn(JwtValidator.prototype, "verify").mockResolvedValue({ sub: "actor", client_id: "client", token_use: "access" });
  jest.spyOn(CognitoIdp.prototype, "getCurrentUser").mockResolvedValue({ $metadata: {}, Username: "actor", UserAttributes: [{ Name: "sub", Value: "actor" }] });
  jest.spyOn(ProfileStore.prototype, "get").mockImplementation(async (_tenant, id) => id === "actor" ? { ...actor } : { ...actor, userId: id, roles: ["field_worker"] });
  jest.spyOn(RoleStore.prototype, "get").mockImplementation(async () => catalog);
  jest.spyOn(RoleStore.prototype, "save").mockResolvedValue({ version: 4, roles: [] });
  jest.spyOn(ProfileStore.prototype, "list").mockResolvedValue({ items: [], nextCursor: null });
  jest.spyOn(ProfileStore.prototype, "update").mockResolvedValue({ ...actor });
  app = await buildServer(env);
});
afterEach(async () => { await app?.close(); jest.restoreAllMocks(); });

test("custom role grants access without the admin role", async () => {
  const result = await app.inject({ method: "GET", url: "/v1/users", headers });
  expect(result.statusCode).toBe(200);
  expect(ProfileStore.prototype.list).toHaveBeenCalledWith("t1", 20, undefined, "", undefined);
});
test("disabled and unknown roles grant no permissions", () => {
  expect(effectivePermissions(["limited", "unknown"], { ...catalog, roles: catalog.roles.map(role => ({ ...role, enabled: false })) })).toEqual([]);
  expect(effectivePermissions(["admin"], catalog)).toEqual([...PERMISSIONS]);
});
test("admins and field workers hold every incident permission by default", () => {
  expect(INCIDENT_PERMISSIONS).toEqual(["incidents.create", "incidents.read", "incidents.update"]);
  expect(effectivePermissions(["admin"], catalog)).toEqual(expect.arrayContaining([...INCIDENT_PERMISSIONS]));
  expect(effectivePermissions(["field_worker"], catalog)).toEqual([...INCIDENT_PERMISSIONS]);
});
test("the built-in View only role reads incidents and changes nothing", async () => {
  expect(effectivePermissions(["view_only"], catalog)).toEqual(["incidents.read"]);
  const listed = (await app.inject({ method: "GET", url: "/v1/roles", headers })).json().roles.find((role: { id: string }) => role.id === "view_only");
  expect(listed).toMatchObject({ name: "View only", permissions: ["incidents.read"], enabled: true, builtin: true });
});
test("a custom role gets an incident permission only when it is switched on", () => {
  expect(effectivePermissions(["limited"], catalog)).not.toContain("incidents.read");
  catalog.roles.push({ id: "viewer", name: "Viewer", enabled: true, permissions: ["incidents.read"] });
  expect(effectivePermissions(["viewer"], catalog)).toEqual(["incidents.read"]);
  catalog.roles[1].enabled = false;
  expect(effectivePermissions(["viewer"], catalog)).toEqual([]);
});
test("the role catalog lists the incident permissions", async () => {
  const result = await app.inject({ method: "GET", url: "/v1/roles", headers });
  expect(result.json().permissions).toEqual(expect.arrayContaining([...INCIDENT_PERMISSIONS]));
  expect(result.json().roles.find((role: { id: string }) => role.id === "field_worker").permissions).toEqual([...INCIDENT_PERMISSIONS]);
});
test("a role editor can switch on only the incident permissions they hold", async () => {
  const role = { id: "intake", name: "Intake", enabled: true, permissions: ["incidents.create"] };
  expect((await app.inject({ method: "POST", url: "/v1/roles", headers, payload: { version: 3, role } })).statusCode).toBe(403);
  catalog.roles[0].permissions.push("incidents.create");
  expect((await app.inject({ method: "POST", url: "/v1/roles", headers, payload: { version: 3, role } })).statusCode).toBe(201);
});
test("revoked custom permissions take effect on the next request", async () => {
  expect((await app.inject({ method: "GET", url: "/v1/users", headers })).statusCode).toBe(200);
  catalog.roles[0].enabled = false;
  expect((await app.inject({ method: "GET", url: "/v1/users", headers })).statusCode).toBe(403);
});
test.each([
  ["POST", "/v1/users/invite", { email: "new@example.com", displayName: "New", roles: ["field_worker"] }],
  ["DELETE", "/v1/users/target", { version: 1 }],
  ["POST", "/v1/users/target/reset-password", { version: 1 }],
  ["POST", "/v1/users/target/disable", { version: 1 }],
  ["POST", "/v1/users/target/enable", { version: 1 }],
  ["POST", "/v1/users/target/invitation/resend", { version: 1 }],
] as const)("rejects an unauthorized direct %s %s request", async (method, url, payload) => {
  const result = await app.inject({ method, url, payload, headers });
  expect(result.statusCode).toBe(403);
});
test.each([{ displayName: "Changed" }, { status: "DISABLED" }, { roles: ["admin"] }])("checks each PATCH field independently: %j", async change => {
  const result = await app.inject({ method: "PATCH", url: "/v1/users/target", headers, payload: { version: 1, ...change } });
  expect(result.statusCode).toBe(403);
  expect(ProfileStore.prototype.update).not.toHaveBeenCalled();
});
test("allows role-only assignment without edit-details permission", async () => {
  catalog.roles[0].permissions.push(...INCIDENT_PERMISSIONS);
  const result = await app.inject({ method: "PATCH", url: "/v1/users/target", headers, payload: { version: 1, roles: ["field_worker"] } });
  expect(result.statusCode).toBe(200);
});
test("cannot make someone a field worker without holding the incident permissions field workers get", async () => {
  const result = await app.inject({ method: "PATCH", url: "/v1/users/target", headers, payload: { version: 1, roles: ["field_worker"] } });
  expect(result.statusCode).toBe(403);
});
test.each(["unknown", "other_tenant_role"])("rejects assigning non-tenant role %s", async role => {
  const result = await app.inject({ method: "PATCH", url: "/v1/users/target", headers, payload: { version: 1, roles: [role] } });
  expect(result.statusCode).toBe(400);
});
test("rejects assigning a disabled role", async () => {
  catalog.roles.push({ id: "disabled", name: "Disabled", enabled: false, permissions: [] });
  const result = await app.inject({ method: "PATCH", url: "/v1/users/target", headers, payload: { version: 1, roles: ["disabled"] } });
  expect(result.statusCode).toBe(400);
});
test("saves an allowed custom role in the authenticated tenant", async () => {
  const role = { id: "reader", name: "Reader", enabled: true, permissions: ["users.read"] };
  const result = await app.inject({ method: "POST", url: "/v1/roles", headers, payload: { version: 3, role } });
  expect(result.statusCode).toBe(201);
  expect(RoleStore.prototype.save).toHaveBeenCalledWith("t1", catalog, role, expect.objectContaining({ userId: "actor" }));
});
test.each(["admin", "field_worker", "view_only"])("protects built-in role %s", async id => {
  const result = await app.inject({ method: "PUT", url: "/v1/roles/" + id, headers, payload: { version: 3, role: { id, name: "Changed", permissions: [], enabled: false } } });
  expect(result.statusCode).toBe(400); expect(RoleStore.prototype.save).not.toHaveBeenCalled();
});
test("rejects escalating permissions through the role editor", async () => {
  const result = await app.inject({ method: "PUT", url: "/v1/roles/limited", headers, payload: { version: 3, role: { ...catalog.roles[0], permissions: [...PERMISSIONS] } } });
  expect(result.statusCode).toBe(403); expect(RoleStore.prototype.save).not.toHaveBeenCalled();
});
test("rejects managing an existing role whose permissions exceed the caller", async () => {
  catalog.roles.push({ id: "powerful", name: "Powerful", enabled: true, permissions: [...PERMISSIONS] });
  const result = await app.inject({ method: "PUT", url: "/v1/roles/powerful", headers, payload: { version: 3, role: { ...catalog.roles[1], permissions: [] } } });
  expect(result.statusCode).toBe(403);
});
test("rejects stale edits without writing", async () => {
  const result = await app.inject({ method: "PUT", url: "/v1/roles/limited", headers, payload: { version: 2, role: catalog.roles[0] } });
  expect(result.statusCode).toBe(409); expect(RoleStore.prototype.save).not.toHaveBeenCalled();
});
test("rejects undeclared permissions", async () => {
  const result = await app.inject({ method: "PUT", url: "/v1/roles/limited", headers, payload: { version: 3, role: { ...catalog.roles[0], permissions: ["children.read"] } } });
  expect(result.statusCode).toBe(400);
});
test("loads the role catalog with the current tenant", async () => {
  const result = await app.inject({ method: "GET", url: "/v1/roles", headers });
  expect(result.statusCode).toBe(200);
  expect(RoleStore.prototype.get).toHaveBeenCalledWith("t1");
  expect(result.json().roles[0]).toMatchObject({ id: "admin", builtin: true });
});
test("creating a role cannot overwrite an existing identifier", async () => {
  const result = await app.inject({ method: "POST", url: "/v1/roles", headers, payload: { version: 3, role: { ...catalog.roles[0], permissions: [] } } });
  expect(result.statusCode).toBe(409);
  expect(RoleStore.prototype.save).not.toHaveBeenCalled();
});
test("editing an unknown identifier cannot create a role", async () => {
  const result = await app.inject({ method: "PUT", url: "/v1/roles/missing", headers, payload: { version: 3, role: { id: "missing", name: "Missing", enabled: true, permissions: [] } } });
  expect(result.statusCode).toBe(404);
  expect(RoleStore.prototype.save).not.toHaveBeenCalled();
});
