import type { PreTokenGenerationTriggerHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "us-east-1";
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE_NAME;

if (!USER_PROFILES_TABLE) {
  throw new Error("Missing env USER_PROFILES_TABLE_NAME");
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function getRolesFromProfile(tenantId: string, sub: string): Promise<string[]> {
  const pk = `TENANT#${tenantId}`;
  const sk = `USER#${sub}`;

  const out = await ddb.send(new GetCommand({
    TableName: USER_PROFILES_TABLE,
    Key: { pk, sk }
  }));

  const item: any = out.Item;
  const roles = Array.isArray(item?.roles) ? item.roles : null;
  return roles && roles.length ? roles : ["user"];
}

/**
 * FAIL-CLOSED behavior:
 * - If custom:tenantId is missing, token issuance fails.
 * - If profile lookup fails, token issuance fails (prevents ambiguous access).
 */
export const handler: PreTokenGenerationTriggerHandler = async (event) => {
  const sub = event.request.userAttributes?.sub;
  const tenantIdAttr = event.request.userAttributes?.["custom:tenantId"];

  if (!sub) throw new Error("Missing sub");
  if (!tenantIdAttr) throw new Error("Missing custom:tenantId");

  const tenantId = tenantIdAttr;

  const roles = await getRolesFromProfile(tenantId, sub);

  event.response = event.response || {};
  event.response.claimsOverrideDetails = {
    claimsToAddOrOverride: {
      tenantId,
      roles: JSON.stringify(roles)
    }
  };

  return event;
};
