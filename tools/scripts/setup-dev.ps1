# First-time bootstrap for Windows (PowerShell 5.1+). Safe to re-run.
#   powershell -ExecutionPolicy Bypass -File tools\scripts\setup-dev.ps1
# Checks Node.js 24 and Git, installs pnpm if missing, installs dependencies, then runs
# `pnpm setup:dev`.
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot\..\..")

function Test-Command($Name) { $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }

Write-Host "`n> Checking Node.js"
if (-not (Test-Command node)) { throw 'Node.js is not installed. Install Node.js 24 LTS from https://nodejs.org' }
$nodeVersion = (node -v).TrimStart('v')
if ([int]($nodeVersion.Split('.')[0]) -ne 24) { throw "Node.js 24 LTS is required (found $nodeVersion)." }
Write-Host "  ok Node.js $nodeVersion"

Write-Host "`n> Checking Git"
if (-not (Test-Command git)) { throw 'Git is not installed. Install Git for Windows from https://git-scm.com' }
$autocrlf = git config --get core.autocrlf
if ($autocrlf -eq 'true') {
  Write-Warning 'git core.autocrlf=true. The repository uses LF (.gitattributes handles it), but consider: git config --global core.autocrlf input'
}
Write-Host '  ok Git'

Write-Host "`n> Checking pnpm"
if (-not (Test-Command pnpm)) {
  Write-Host '  installing pnpm 10 for the current user (npm install -g pnpm@10)'
  npm install -g pnpm@10
  if ($LASTEXITCODE -ne 0) { throw 'pnpm installation failed.' }
}
Write-Host "  ok pnpm $(pnpm -v)"

Write-Host "`n> Installing dependencies"
pnpm install
if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }

pnpm setup:dev
if ($LASTEXITCODE -ne 0) { throw 'pnpm setup:dev failed.' }
