import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export class InviteStore {
  private ddb: DynamoDBDocumentClient;
  constructor(region: string, private tableName: string) {
    this.ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  async createInvite(params: {
    tenantId: string;
    inviteId: string;
    email: string;
    userId: string; // Cognito sub (or internal user id)
    createdBy: string;
    expiresAt: number; // epoch seconds
    }) {
    await this.ddb.send(
        new PutCommand({
        TableName: this.tableName,
        Item: {
            pk: `TENANT#${params.tenantId}`,
            sk: `INVITE#${params.inviteId}`,
            inviteId: params.inviteId,
            email: params.email.toLowerCase(),
            userId: params.userId,
            status: "ISSUED",
            createdBy: params.createdBy,
            createdAt: new Date().toISOString(),
            expiresAt: params.expiresAt
        }
        })
    );}

  async useInviteOnce(params: { tenantId: string; inviteId: string; nowEpoch: number }) {
    // Atomic one-time use enforcement
    await this.ddb.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { pk: `TENANT#${params.tenantId}`, sk: `INVITE#${params.inviteId}` },
      UpdateExpression: "SET #s = :used, usedAt = :usedAt",
      ConditionExpression: "#s = :issued AND expiresAt > :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":issued": "ISSUED",
        ":used": "USED",
        ":usedAt": new Date().toISOString(),
        ":now": params.nowEpoch
      }
    }));
  }
}
