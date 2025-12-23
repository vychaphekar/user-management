import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

export type TenantRecord = {
  pk: string; // TENANT#{tenantSlug}
  tenantId: string;
  tenantSlug: string;
  status: "ACTIVE" | "SUSPENDED";
  isolationMode: "LOGICAL" | "DEDICATED_POOL" | "DEDICATED_DB" | "DEDICATED_ACCOUNT";
  cognitoUserPoolId?: string;
  cognitoIssuer?: string;
  cognitoAppClientId?: string;
  profileTableName?: string;
};

export class TenantRegistry {
  private ddb: DynamoDBDocumentClient;

  constructor(region: string, private tableName: string) {
    const client = new DynamoDBClient({ region });
    this.ddb = DynamoDBDocumentClient.from(client);
  }

  async getTenant(tenantSlug: string): Promise<TenantRecord | null> {
    const pk = `TENANT#${tenantSlug}`;
    const out = await this.ddb.send(new GetCommand({ TableName: this.tableName, Key: { pk } }));
    return (out.Item as TenantRecord) || null;
  }
}
