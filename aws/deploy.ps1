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
$buildLog = Join-Path $env:TEMP "cercit-sam-build.log"
cmd /c "sam build > ""$buildLog"" 2>&1"
if ($LASTEXITCODE -ne 0) {
  if (Test-Path $buildLog) { Write-Host (Get-Content $buildLog -Raw) }
  throw "sam build failed. The full log is at $buildLog"
}

if ($BuildOnly) {
  Write-Host "Built. Skipping the deploy (-BuildOnly)."
  return
}

Write-Host "Deploying to ap-south-1..."
# Windows PowerShell turns a native command's error output into a failure, and
# sam writes normal progress there. Run it through cmd and read the log instead.
$log = Join-Path $env:TEMP "cercit-sam-deploy.log"
cmd /c "sam deploy > ""$log"" 2>&1"
$code = $LASTEXITCODE
$text = if (Test-Path $log) { Get-Content $log -Raw } else { "" }
if ($text) { Write-Host $text }

# "No changes to deploy" means AWS already matches the template: a normal outcome.
if ($code -ne 0) {
  if ($text -match "No changes to deploy") {
    Write-Host "Nothing to deploy: AWS already matches this template."
    return
  }
  throw "sam deploy failed (exit $code). The full log is at $log"
}
Write-Host "Done."
