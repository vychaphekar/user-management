import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";

export const PERMISSIONS = [
  "users.read", "users.invite", "users.update", "users.assign_roles",
  "users.disable", "users.delete", "users.reset_password", "roles.manage",
  // Enforced by the CaseManagement service, which reads them from GET /v1/auth/me.
  "incidents.create", "incidents.read", "incidents.update",
  // The Prevention add-on (Prevention BRD Step A), enforced by the CaseManagement service with its per-case access.
  "prevention.read", "prevention.work", "prevention.supervise", "prevention.manage",
] as const;
export type Permission = typeof PERMISSIONS[number];
export const INCIDENT_PERMISSIONS: readonly Permission[] = ["incidents.create", "incidents.read", "incidents.update"];
export const PREVENTION_PERMISSIONS: readonly Permission[] = ["prevention.read", "prevention.work", "prevention.supervise", "prevention.manage"];
/**
 * No built-in role holds a Prevention permission: an agency gives them through a custom role of its own. So whoever may manage roles or
 * assign them may also hand these out without holding them; otherwise nobody could ever grant the first one. Access to a case is
 * still decided case by case in CaseManagement.
 */
export const needsHolding = (permission: Permission) => !PREVENTION_PERMISSIONS.includes(permission);
export const RoleSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  name: z.string().trim().min(1).max(80),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length)
    .refine(values => new Set(values).size === values.length, "Duplicate permissions"),
  enabled: z.boolean(),
}).strict();
export type Role = z.infer<typeof RoleSchema>;
export const BUILTIN_ROLES: readonly Role[] = [
  { id: "admin", name: "Administrator", permissions: PERMISSIONS.filter(needsHolding), enabled: true },
  // Field workers record, open and edit incidents by default; custom roles get them only when switched on.
  { id: "field_worker", name: "Field worker", permissions: [...INCIDENT_PERMISSIONS], enabled: true },
  // View only (9 Oct 2026): reads incidents, cases and assessments in CaseManagement; changes nothing.
  { id: "view_only", name: "View only", permissions: ["incidents.read"], enabled: true },
];
export const CatalogSchema = z.object({
  version: z.number().int().nonnegative(),
  roles: z.array(RoleSchema).max(100).refine(roles =>
    new Set(roles.map(role => role.id)).size === roles.length &&
    roles.every(role => !BUILTIN_ROLES.some(builtin => builtin.id === role.id)),
  "Duplicate or reserved role ID"),
});
export type RoleCatalog = z.infer<typeof CatalogSchema>;

export function effectivePermissions(ids: readonly string[], catalog: RoleCatalog): Permission[] {
  return [...new Set([...BUILTIN_ROLES, ...catalog.roles]
    .filter(role => role.enabled && ids.includes(role.id))
    .flatMap(role => role.permissions))];
}

export class RoleStore {
  private ddb: DynamoDBDocumentClient;
  constructor(region: string, private tableName: string) {
    this.ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  async get(tenantId: string): Promise<RoleCatalog> {
    const result = await this.ddb.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk: "TENANT#" + tenantId, sk: "ROLE_CATALOG" },
      ConsistentRead: true,
    }));
    if (!result.Item) return { version: 0, roles: [] };
    // A custom role saved before a built-in role took its id (e.g. view_only) gives way to the built-in one.
    const roles = Array.isArray(result.Item.roles) ? result.Item.roles.filter((role: { id?: string }) => !BUILTIN_ROLES.some(builtin => builtin.id === role.id)) : result.Item.roles;
    return CatalogSchema.parse({ ...result.Item, roles });
  }

  async save(tenantId: string, catalog: RoleCatalog, role: Role, actor: { userId: string; version: number }) {
    if (BUILTIN_ROLES.some(builtin => builtin.id === role.id)) {
      throw Object.assign(new Error("Built-in roles cannot be changed"), { statusCode: 400 });
    }
    const next = CatalogSchema.parse({
      version: catalog.version + 1,
      roles: catalog.roles.filter(existing => existing.id !== role.id).concat(RoleSchema.parse(role)),
    });
    const timestamp = new Date().toISOString();
    await this.ddb.send(new TransactWriteCommand({ TransactItems: [
      { Put: {
        TableName: this.tableName,
        Item: { pk: "TENANT#" + tenantId, sk: "ROLE_CATALOG", ...next },
        ConditionExpression: catalog.version === 0 ? "attribute_not_exists(pk)" : "version = :expected",
        ExpressionAttributeValues: catalog.version === 0 ? undefined : { ":expected": catalog.version },
      } },
      { ConditionCheck: {
        TableName: this.tableName,
        Key: { pk: "TENANT#" + tenantId, sk: "USER#" + actor.userId },
        ConditionExpression: "version = :version AND #status = :active",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":version": actor.version, ":active": "ACTIVE" },
      } },
      { Put: {
        TableName: this.tableName,
        Item: {
          pk: "TENANT#" + tenantId, sk: "ROLE_AUDIT#" + timestamp + "#" + randomUUID(),
          actorId: actor.userId, roleId: role.id, action: "ROLE_SAVED", timestamp,
          before: catalog.roles.find(existing => existing.id === role.id) || null, after: role,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      } },
    ] }));
    return next;
  }
}
