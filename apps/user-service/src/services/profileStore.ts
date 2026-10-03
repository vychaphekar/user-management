import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
export const ProfileSchema = z.object({ pk: z.string(), sk: z.string(), tenantId: z.string(), userId: z.string(), email: z.string().email(), status: z.enum(["INVITED", "ACTIVE", "DISABLED", "DELETED"]), roles: z.array(z.string()), displayName: z.string().optional(), createdAt: z.string(), updatedAt: z.string(), version: z.number().int(), inviteId: z.string().optional(), inviteExpiresAt: z.number().optional() });
export type UserProfile = z.infer<typeof ProfileSchema>;
export type ProfilePatch = Partial<Pick<UserProfile, "roles" | "displayName" | "status" | "inviteId" | "inviteExpiresAt">>;
export class ProfileStore {
  private ddb: DynamoDBDocumentClient;
  constructor(region: string, private tableName: string) { this.ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region })); }
  private pk(tenantId: string) { return "TENANT#" + tenantId; }
  private sk(userId: string) { return "USER#" + userId; }
  async get(tenantId: string, userId: string): Promise<UserProfile | null> {
    const out = await this.ddb.send(new GetCommand({ TableName: this.tableName, Key: { pk: this.pk(tenantId), sk: this.sk(userId) }, ConsistentRead: true }));
    return out.Item ? ProfileSchema.parse(out.Item) : null;
  }
  async list(tenantId: string, limit = 20, cursor?: string, search = "", status?: string) {
    let start: { pk: string; sk: string } | undefined;
    if (cursor) {
      try { start = z.object({ pk: z.literal(this.pk(tenantId)), sk: z.string().startsWith("USER#") }).strict().parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))); }
      catch { throw Object.assign(new Error("Invalid pagination cursor"), { statusCode: 400 }); }
    }
    const filters: string[] = []; const values: Record<string, string> = { ":pk": this.pk(tenantId), ":prefix": "USER#" };
    if (status) { filters.push("#status = :status"); values[":status"] = status; }
    else { filters.push("#status <> :deleted"); values[":deleted"] = "DELETED"; }
    // Search applies to every scanned page, not just the first fetched UI page.
    if (search) { filters.push("(contains(email, :search) OR contains(displayName, :search))"); values[":search"] = search; }
    const out = await this.ddb.send(new QueryCommand({ TableName: this.tableName, KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)", FilterExpression: filters.join(" AND "), ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: values, Limit: limit, ExclusiveStartKey: start, ConsistentRead: true }));
    return { items: (out.Items || []).map(item => ProfileSchema.parse(item)), nextCursor: out.LastEvaluatedKey ? Buffer.from(JSON.stringify(out.LastEvaluatedKey)).toString("base64url") : null };
  }
  private audit(tenantId: string, userId: string, actorId: string, action: string) {
    const timestamp = new Date().toISOString();
    return { Put: { TableName: this.tableName, Item: { pk: this.pk(tenantId), sk: "AUDIT#" + userId + "#" + timestamp + "#" + randomUUID(), userId, actorId, action, timestamp }, ConditionExpression: "attribute_not_exists(pk)" } };
  }
  private roleCheck(tenantId: string, version?: number) {
    return version === undefined ? [] : [{ ConditionCheck: {
      TableName: this.tableName, Key: { pk: this.pk(tenantId), sk: "ROLE_CATALOG" },
      ConditionExpression: version === 0 ? "attribute_not_exists(pk)" : "version = :expected",
      ExpressionAttributeValues: version === 0 ? undefined : { ":expected": version },
    } }];
  }
  async create(profile: UserProfile, actorId: string, roleVersion?: number) {
    await this.ddb.send(new TransactWriteCommand({ TransactItems: [{ Put: { TableName: this.tableName, Item: profile, ConditionExpression: "attribute_not_exists(pk)" } }, this.audit(profile.tenantId, profile.userId, actorId, "USER_INVITED"), ...this.roleCheck(profile.tenantId, roleVersion) ] }));
  }
  async update(tenantId: string, userId: string, patch: ProfilePatch, expectedVersion: number, actorId: string, action = "USER_UPDATED", roleVersion?: number): Promise<UserProfile> {
    const names: Record<string, string> = {}; const values: Record<string, unknown> = { ":now": new Date().toISOString(), ":one": 1, ":version": expectedVersion };
    const sets = ["updatedAt = :now"];
    Object.entries(patch).forEach(([key, value], index) => { names["#f" + index] = key; values[":f" + index] = value; sets.push("#f" + index + " = :f" + index); });
    await this.ddb.send(new TransactWriteCommand({ TransactItems: [{ Update: { TableName: this.tableName, Key: { pk: this.pk(tenantId), sk: this.sk(userId) }, UpdateExpression: "SET " + sets.join(", ") + " ADD version :one", ConditionExpression: "attribute_exists(pk) AND version = :version", ExpressionAttributeNames: Object.keys(names).length ? names : undefined, ExpressionAttributeValues: values } }, this.audit(tenantId, userId, actorId, action), ...this.roleCheck(tenantId, roleVersion) ] }));
    const result = await this.get(tenantId, userId);
    if (!result) throw new Error("Updated profile unavailable");
    return result;
  }
  async activateInvited(tenantId: string, userId: string, inviteId: string, expectedVersion: number) {
    // Optimistic concurrency prevents a replaced/revoked invitation from activating the profile.
    const profile = await this.get(tenantId, userId);
    if (!profile || profile.status !== "INVITED" || profile.inviteId !== inviteId || profile.version !== expectedVersion) throw Object.assign(new Error("Invitation changed"), { statusCode: 409 });
    return this.update(tenantId, userId, { status: "ACTIVE" }, expectedVersion, userId, "INVITATION_ACCEPTED");
  }
  async history(tenantId: string, userId: string) {
    const out = await this.ddb.send(new QueryCommand({ TableName: this.tableName, KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)", ExpressionAttributeValues: { ":pk": this.pk(tenantId), ":prefix": "AUDIT#" + userId + "#" }, ScanIndexForward: false, Limit: 50 }));
    return (out.Items || []).map(item => ({ action: String(item.action), actorId: String(item.actorId), timestamp: String(item.timestamp) }));
  }
}
