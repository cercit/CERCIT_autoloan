# cercit — build and deploy the AWS functions in one go.
#
# Why this exists: sam build fails with "Access is denied" whenever the previous
# build folder is still there, because the packages it copied in are marked
# read-only. Clearing the folder first makes the build reliable.
#
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File aws\deploy.ps1
param(
  [switch]$BuildOnly  # build, don't deploy
)

$ErrorActionPreference = "Stop"
$buildDir = Join-Path $env:LOCALAPPDATA "cercit-sam"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

if (Test-Path $buildDir) {
  Write-Host "Clearing the old build folder..."
  # -Recurse -Force still trips over read-only files, so clear the flag first.
  Get-ChildItem $buildDir -Recurse -Force -ErrorAction SilentlyContinue |
    ForEach-Object { try { $_.Attributes = "Normal" } catch {} }
  cmd /c rd /s /q "\\?\$buildDir"
}

Set-Location $here
Write-Host "Building..."
sam build
if ($LASTEXITCODE -ne 0) { throw "sam build failed" }

if ($BuildOnly) {
  Write-Host "Built. Skipping the deploy (-BuildOnly)."
  return
}

Write-Host "Deploying to ap-south-1..."
sam deploy
if ($LASTEXITCODE -ne 0) { throw "sam deploy failed" }
Write-Host "Done."
