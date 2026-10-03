import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { RoleStore, effectivePermissions, CatalogSchema } from "../src/services/roleStore";

const ddb = mockClient(DynamoDBDocumentClient);
const role = { id: "reader", name: "Reader", permissions: ["users.read" as const], enabled: true };
beforeEach(() => ddb.reset());
afterAll(() => ddb.restore());
test("reads roles consistently from the tenant partition", async () => {
  ddb.on(GetCommand).resolves({ Item: { version: 2, roles: [role] } });
  await expect(new RoleStore("us-east-1", "profiles").get("tenant")).resolves.toEqual({ version: 2, roles: [role] });
  expect(ddb.commandCalls(GetCommand)[0].args[0].input).toMatchObject({ Key: { pk: "TENANT#tenant", sk: "ROLE_CATALOG" }, ConsistentRead: true });
});
test("saves the version-checked catalog and audit atomically, checking the actor is still active", async () => {
  ddb.on(TransactWriteCommand).resolves({});
  const next = await new RoleStore("us-east-1", "profiles").save("tenant", { version: 2, roles: [role] }, { ...role, enabled: false }, { userId: "actor", version: 5 });
  expect(next.version).toBe(3);
  const transaction = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
  expect(transaction).toHaveLength(3);
  expect(transaction[0].Put).toMatchObject({ ConditionExpression: "version = :expected", ExpressionAttributeValues: { ":expected": 2 } });
  expect(transaction[1].ConditionCheck).toMatchObject({ Key: { pk: "TENANT#tenant", sk: "USER#actor" }, ExpressionAttributeValues: { ":version": 5, ":active": "ACTIVE" } });
  expect(transaction[2].Put?.Item).toMatchObject({ pk: "TENANT#tenant", actorId: "actor", before: role, after: { ...role, enabled: false } });
});
test("fails rather than silently dropping a conflicting save", async () => {
  const error = Object.assign(new Error("Conflict"), { name: "TransactionCanceledException" });
  ddb.on(TransactWriteCommand).rejects(error);
  await expect(new RoleStore("us-east-1", "profiles").save("tenant", { version: 2, roles: [] }, role, { userId: "actor", version: 1 })).rejects.toMatchObject({ name: "TransactionCanceledException" });
});
test("merges enabled assigned roles without retaining a disabled role's permissions", () => {
  expect(effectivePermissions(["reader", "editor", "inactive"], { version: 1, roles: [role, { id: "editor", name: "Editor", enabled: true, permissions: ["users.update"] }, { id: "inactive", name: "Inactive", enabled: false, permissions: ["users.delete"] }] })).toEqual(["users.read", "users.update"]);
});
test("rejects duplicate or reserved IDs in persisted custom roles", () => {
  expect(CatalogSchema.safeParse({ version: 1, roles: [role, role] }).success).toBe(false);
  expect(CatalogSchema.safeParse({ version: 1, roles: [{ ...role, id: "admin" }] }).success).toBe(false);
});
