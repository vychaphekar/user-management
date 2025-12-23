# Tenancy model (subdomain-based)

Requests come in on:
- `https://{tenant}.api.evanyaconsulting.com`

The service extracts `{tenant}` from the Host header and loads tenant metadata from DynamoDB `tenant_registry`.

## Why per-tenant API Gateway domains?
API Gateway custom domains do **not** support wildcard domain names. Therefore each tenant needs:
- an API Gateway domain name: `{tenant}.api.evanyaconsulting.com`
- an API mapping to the shared HTTP API
- a Route53 alias record pointing to the API Gateway domain target

This repo includes a `Provision Tenant Subdomain` GitHub workflow to automate it.

## Token enforcement
Cognito Pre Token Generation trigger injects:
- `tenantId` (string)
- `roles` (JSON string)

The API:
- validates JWT issuer/audience based on tenant registry
- **requires** `tenantId` claim and matches it with the registry tenantId (fail closed)
