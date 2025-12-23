# Evanya Consulting - Multi-tenant User Backend (Cognito + ECS + API Gateway + WAF)

Tenant routing: `https://{tenant}.api.evanyaconsulting.com`

This repo provides:
- TypeScript Fastify service for user management (Cognito + DynamoDB profiles)
- Cognito Pre Token Generation Lambda trigger (fail-closed) to inject `tenantId` + `roles`
- Terraform to provision:
  - VPC (private subnets)
  - ECS Fargate service behind internal NLB
  - API Gateway HTTP API with VPC Link
  - WAF associated with API Gateway
  - DynamoDB tables (`tenant_registry`, `user_profiles`)
  - Shared Cognito User Pool (logical tenants)
  - Route53 + ACM cert for `api.evanyaconsulting.com` and `*.api.evanyaconsulting.com`
  - Per-tenant API Gateway custom domain + Route53 record (required for subdomain tenancy)
- GitHub Actions CI/CD: Innovation → Dev → QA → Prod (Prod requires manual approval)
- OPA/Conftest policy checks for CRI-style guardrails

## Assumptions (edit as needed)
- Default AWS region: `us-east-1`
- Route53 hosted zone for `evanyaconsulting.com` exists in the same AWS account.
- Terraform state backend (S3 + DynamoDB lock) is pre-created and configured in each env `backend.tf`.
- UI callback URLs in Cognito client are placeholders (update for your UI):
  - https://app.evanyaconsulting.com/callback
  - https://app.evanyaconsulting.com/logout

## Quick start (local)
```bash
cd apps/user-service
npm ci
npm run dev
```

## CI/CD setup
### Required GitHub Secrets
- `DEPLOY_ROLE_ARN` : IAM role ARN for GitHub OIDC
- `ECR_REPO` : ECR repository URI, e.g. `123456789012.dkr.ecr.us-east-1.amazonaws.com/user-service`

### Environments (GitHub Settings → Environments)
Create:
- `innovation`, `dev`, `qa`, `prod`
Enable required reviewers on `prod` to enforce manual promotion.

## Tenant provisioning (subdomain)
API Gateway custom domains are **per-tenant** (API Gateway does not support wildcard custom domains).
Use workflow: `.github/workflows/provision-tenant.yml` to create:
- `tenantSlug.api.evanyaconsulting.com` custom domain + API mapping
- Route53 record
- DynamoDB tenant_registry item

## Notes
- PreTokenGeneration Lambda is **fail-closed**: token issuance fails if `custom:tenantId` is missing.
- Roles are injected into token as JSON string claim `roles`.

FINAL ARCHITECTURE
Accounts
    dns (shared services)
      Owns only the public hosted zone: evanyaconsulting.com
      No runtime infrastructure
    innovation / dev / qa / prod
      Own their own infrastructure
      Own delegated Route53 zones
      Own ACM certs, API Gateway custom domains, WAF, ECS, Cognito

Delegated zones
    Account	Delegated Zone
    innovation	innovation.evanyaconsulting.com
    dev	dev.evanyaconsulting.com
    qa	qa.evanyaconsulting.com
    prod	api.evanyaconsulting.com

Tenant domains
  Prod: {tenant}.api.evanyaconsulting.com

  Nonprod:
    {tenant}.api.innovation.evanyaconsulting.com
    {tenant}.api.dev.evanyaconsulting.com
    {tenant}.api.qa.evanyaconsulting.com

✅ CI/CD model

    GitHub → AWS via OIDC assume-role
    Separate AWS account per environment
    GitHub environment-scoped secrets
    Manual approval on prod
    DNS delegation is:
      Automated
      Manually triggered (Option A – safest)

✅ Workflows 
    1) Deploy pipeline
          Builds once
          Pushes image per account
          Terraform plan + OPA
          Auto deploys: innovation → dev → qa
          Manual approval: prod

    2) Auto Delegate Subzone (manual trigger)
          Reads delegated zone + NS from Terraform outputs
          Switches to DNS account
          Creates NS delegation record

    3) Provision Tenant
          Selects environment
          Automatically uses env secrets
          Creates:
            {tenant}.api.<env>.evanyaconsulting.com
            API Gateway mapping
            DynamoDB registry entry

✅ Final checklist GitHub
    Environments created: dns, innovation, dev, qa, prod
    Secrets set per environment:
      DEPLOY_ROLE_ARN
      TF_STATE_BUCKET
      TF_LOCK_TABLE
    prod environment has required reviewers

AWS (per account)
  GitHub OIDC provider exists
  IAM deploy role exists and trust policy is correct
  Terraform backend S3 bucket + DynamoDB lock table exist
  ECR repo exists in workload accounts
  Root hosted zone exists in DNS account

Terraform
  backend.tf files are backend "s3" {}
  Env stacks output delegated zone + NS
  Prod stack creates delegated zone api.evanyaconsulting.com
  ACM validation uses delegated zone IDs (not root zone)

exact order
  Deploy innovation
  Run Auto Delegate Subzone → innovation
  Re-run innovation deploy (ACM validation completes)
  Repeat for dev → qa
  Deploy prod
  Run Auto Delegate Subzone → prod
  Re-run prod deploy
  Provision first tenant
