import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export type UserProfile = {
  pk: string; // TENANT#{tenantId}
  sk: string; // USER#{sub}
  tenantId: string;
  userId: string;
  email: string;
  status: "INVITED" | "ACTIVE" | "DISABLED" | "DELETED";
  roles: string[];
  displayName?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export class ProfileStore {
  private ddb: DynamoDBDocumentClient;

  constructor(region: string, private tableName: string) {
    const client = new DynamoDBClient({ region });
    this.ddb = DynamoDBDocumentClient.from(client);
  }

  private pk(tenantId: string) { return `TENANT#${tenantId}`; }
  private sk(userId: string) { return `USER#${userId}`; }

  async get(tenantId: string, userId: string): Promise<UserProfile | null> {
    const out = await this.ddb.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk: this.pk(tenantId), sk: this.sk(userId) }
    }));
    return (out.Item as UserProfile) || null;
  }

  async list(tenantId: string, limit = 20, cursor?: string) {
    const out = await this.ddb.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": this.pk(tenantId) },
      Limit: limit,
      ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, "base64").toString("utf8")) : undefined
    }));

    const nextCursor = out.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(out.LastEvaluatedKey), "utf8").toString("base64")
      : null;

    return { items: (out.Items as UserProfile[]) || [], nextCursor };
  }

  async create(profile: UserProfile) {
    await this.ddb.send(new PutCommand({ TableName: this.tableName, Item: profile }));
  }

  async update(tenantId: string, userId: string, patch: Partial<Pick<UserProfile, "roles" | "displayName" | "status" | "email">>) {
    const now = new Date().toISOString();

    const expr: string[] = ["updatedAt = :u"];
    const values: any = { ":u": now };
    const names: any = {};

    if (patch.displayName !== undefined) { expr.push("#dn = :dn"); values[":dn"] = patch.displayName; names["#dn"] = "displayName"; }
    if (patch.email !== undefined) { expr.push("email = :e"); values[":e"] = patch.email; }
    if (patch.status !== undefined) { expr.push("#st = :s"); values[":s"] = patch.status; names["#st"] = "status"; }
    if (patch.roles !== undefined) { expr.push("roles = :r"); values[":r"] = patch.roles; }

    expr.push("version = version + :inc"); values[":inc"] = 1;

    const out = await this.ddb.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { pk: this.pk(tenantId), sk: this.sk(userId) },
      UpdateExpression: "SET " + expr.join(", "),
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      ReturnValues: "ALL_NEW"
    }));

    return out.Attributes as UserProfile;
  }
}
