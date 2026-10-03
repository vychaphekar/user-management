import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ProfileStore } from '../src/services/profileStore';
const ddb = mockClient(DynamoDBDocumentClient);
const profile = { pk: 'TENANT#t1', sk: 'USER#u1', tenantId: 't1', userId: 'u1', email: 'test@example.com', roles: ['admin'], status: 'ACTIVE', version: 2, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
beforeEach(() => ddb.reset());
afterAll(() => ddb.restore());
test('rejects a cursor from another tenant before querying storage', async () => {
  const cursor = Buffer.from(JSON.stringify({ pk: 'TENANT#other', sk: 'USER#u1' })).toString('base64url');
  await expect(new ProfileStore('us-east-1', 'profiles').list('t1', 20, cursor)).rejects.toMatchObject({ statusCode: 400 });
  expect(ddb.commandCalls(QueryCommand)).toHaveLength(0);
});
test('preserves the continuation cursor for an empty filtered page', async () => {
  const key = { pk: 'TENANT#t1', sk: 'USER#u1' };
  ddb.on(QueryCommand).resolves({ Items: [], LastEvaluatedKey: key });
  const result = await new ProfileStore('us-east-1', 'profiles').list('t1', 20, undefined, 'someone');
  expect(result.items).toEqual([]);
  expect(JSON.parse(Buffer.from(result.nextCursor!, 'base64url').toString())).toEqual(key);
});
test('writes a version-checked edit and audit record in the same transaction', async () => {
  ddb.on(TransactWriteCommand).resolves({}); ddb.on(GetCommand).resolves({ Item: profile });
  await new ProfileStore('us-east-1', 'profiles').update('t1', 'u1', { displayName: 'Updated' }, 1, 'actor');
  const transaction = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
  expect(transaction).toHaveLength(2);
  expect(transaction[0].Update).toMatchObject({ Key: { pk: 'TENANT#t1', sk: 'USER#u1' }, ConditionExpression: 'attribute_exists(pk) AND version = :version', ExpressionAttributeValues: { ':version': 1 } });
  expect(transaction[1].Put?.Item).toMatchObject({ pk: 'TENANT#t1', userId: 'u1', actorId: 'actor', action: 'USER_UPDATED' });
});
test('does not activate an invitation replaced by a newer invitation', async () => {
  ddb.on(GetCommand).resolves({ Item: { ...profile, status: 'INVITED', inviteId: 'new' } });
  await expect(new ProfileStore('us-east-1', 'profiles').activateInvited('t1', 'u1', 'old', 2)).rejects.toMatchObject({ statusCode: 409 });
  expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
});
