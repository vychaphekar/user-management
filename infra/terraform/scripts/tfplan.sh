#!/usr/bin/env bash
set -euo pipefail
ENV_DIR="$1"

: "${TF_STATE_BUCKET:?Missing TF_STATE_BUCKET}"
: "${TF_LOCK_TABLE:?Missing TF_LOCK_TABLE}"
: "${AWS_REGION:?Missing AWS_REGION}"

cd "infra/terraform/envs/${ENV_DIR}"

terraform init -input=false \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=${ENV_DIR}/terraform.tfstate" \
  -backend-config="region=${AWS_REGION}" \
  -backend-config="dynamodb_table=${TF_LOCK_TABLE}" \
  -backend-config="encrypt=true"

terraform validate
terraform plan -input=false -out tfplan
terraform show -json tfplan > plan.json
