# Installs npm dependencies OUTSIDE OneDrive and links them back with a junction.
# OneDrive does not sync junction contents, and npm deletes a node_modules junction when it runs in the project,
# so all installs on this machine go through this script:
#   npm run deps                 # install from package.json / package-lock.json
#   npm run deps -- -D some-pkg  # add a package (any `npm install` arguments)
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$NpmArgs)
$ErrorActionPreference = 'Stop'

$project = Split-Path -Parent $PSScriptRoot
$store = if ($env:JORGU_DEPS_DIR) { $env:JORGU_DEPS_DIR } else { 'C:\dev\jorgu-deps' }
New-Item -ItemType Directory -Force $store | Out-Null

Copy-Item (Join-Path $project 'package.json') (Join-Path $store 'package.json') -Force
$lock = Join-Path $project 'package-lock.json'
if (Test-Path $lock) { Copy-Item $lock (Join-Path $store 'package-lock.json') -Force }

Push-Location $store
try {
  if ($NpmArgs.Count -gt 0) { & npm install --no-fund --no-audit @NpmArgs } else { & npm install --no-fund --no-audit }
  if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }
} finally { Pop-Location }

Copy-Item (Join-Path $store 'package.json') (Join-Path $project 'package.json') -Force
Copy-Item (Join-Path $store 'package-lock.json') $lock -Force

$nm = Join-Path $project 'node_modules'
$item = Get-Item $nm -ErrorAction SilentlyContinue
if ($item -and $item.LinkType -ne 'Junction') { Remove-Item $nm -Recurse -Force }
if (-not (Get-Item $nm -ErrorAction SilentlyContinue)) {
  New-Item -ItemType Junction -Path $nm -Target (Join-Path $store 'node_modules') | Out-Null
}
Write-Host "node_modules -> $(Join-Path $store 'node_modules')"
