$ErrorActionPreference = "Stop"

function Run-Package($path) {
  Write-Host "`n== $path =="

  Push-Location $path

  if (!(Test-Path "package.json")) {
    throw "package.json not found in $path"
  }
  if (!(Test-Path "tsconfig.json")) {
    throw "tsconfig.json not found in $path"
  }

  npm install
  npx tsc -p tsconfig.json --noEmit

  Pop-Location
}

Run-Package "apps\user-service"
Run-Package "apps\cognito-triggers\pre-token-generation"

Write-Host "`n✅ TypeScript compiled successfully in both packages."
