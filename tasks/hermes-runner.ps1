<#
  hermes-runner.ps1 - Fan-out task runner using FREE OpenRouter models only.
  Reads task .md files from tasks/queue/, sends to free models, applies code,
  runs tsc --noEmit, moves to done/ or failed/, writes JSON report.
#>
param(
  [string]$TaskFile = "",
  [string]$Model = "inkling",
  [switch]$DryRun,
  [int]$TimeoutSec = 120,
  [int]$Retries = 1
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$FreeModels = [ordered]@{
  "inkling"      = "thinkingmachines/inkling"
  "deepseek"     = "deepseek/deepseek-chat-v3-0324:free"
  "deepseek-r1"  = "deepseek/deepseek-r1:free"
  "gemini-flash" = "google/gemini-2.0-flash-exp:free"
  "llama"        = "meta-llama/llama-3.3-70b-instruct:free"
  "qwen-coder"   = "qwen/qwen-2.5-coder-32b-instruct:free"
}

function Resolve-Model {
  param([string]$Name)
  if ($FreeModels.Contains($Name)) { return $FreeModels[$Name] }
  if ($Name -match ":free$" -or $Name -match "^thinkingmachines/") { return $Name }
  Write-Warning "Unknown model '$Name'. Falling back to inkling."
  return $FreeModels["inkling"]
}

function Get-FallbackChain {
  param([string]$Primary)
  $chain = @($Primary)
  foreach ($m in $FreeModels.Values) {
    if ($m -ne $Primary) { $chain += $m }
  }
  return $chain
}

$PrimaryModel = Resolve-Model $Model
$FallbackChain = Get-FallbackChain $PrimaryModel

$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
  $ProjectRoot = $PSScriptRoot | Split-Path -Parent
}
$QueueDir  = Join-Path $PSScriptRoot "queue"
$DoneDir   = Join-Path $PSScriptRoot "done"
$FailedDir = Join-Path $PSScriptRoot "failed"
$ReportDir = Join-Path $PSScriptRoot "reports"

foreach ($d in @($QueueDir, $DoneDir, $FailedDir, $ReportDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

$KeyFile = Join-Path $env:USERPROFILE ".deepseek\api_key.txt"
if (-not (Test-Path $KeyFile)) {
  Write-Error "OpenRouter key not found at $KeyFile"
  exit 1
}
$ApiKey = (Get-Content $KeyFile -Raw).Trim()

$NL = [Environment]::NewLine

function Parse-TaskFrontmatter {
  param([string]$Content)
  $result = @{ type = "new"; target = ""; context = @(); model = "" }
  if ($Content -match "(?s)^---\r?\n(.+?)\r?\n---") {
    $fm = $Matches[1]
    if ($fm -match "type:\s*(\S+)")   { $result.type = $Matches[1] }
    if ($fm -match "target:\s*(\S+)") { $result.target = $Matches[1] }
    if ($fm -match "model:\s*(\S+)")  { $result.model = $Matches[1] }
    $contextLines = ($fm -split "`n") | Where-Object { $_ -match "^\s+-\s+(.+)" }
    $result.context = @()
    foreach ($cl in $contextLines) {
      if ($cl -match "^\s+-\s+(.+)") { $result.context += $Matches[1].Trim() }
    }
  }
  return $result
}

function Get-ShortName {
  param([string]$ModelId)
  foreach ($entry in $FreeModels.GetEnumerator()) {
    if ($entry.Value -eq $ModelId) { return $entry.Key }
  }
  return $ModelId
}

function Call-OpenRouter {
  param([string]$SystemPrompt, [string]$UserPrompt, [string]$TaskModel)
  $body = @{
    model    = $TaskModel
    messages = @(
      @{ role = "system"; content = $SystemPrompt }
      @{ role = "user";   content = $UserPrompt }
    )
    max_tokens = 8192
    temperature = 0.1
  } | ConvertTo-Json -Depth 8

  $headers = @{
    "Authorization" = "Bearer $ApiKey"
    "HTTP-Referer"  = "https://cercit.github.io"
    "X-Title"       = "hermes-runner"
  }

  $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)

  $resp = Invoke-RestMethod -Uri "https://openrouter.ai/api/v1/chat/completions" -Method Post -Headers $headers -ContentType "application/json; charset=utf-8" -Body $bodyBytes -TimeoutSec $TimeoutSec -ErrorAction Stop

  return $resp.choices[0].message.content
}

function Call-WithFallback {
  param([string]$SystemPrompt, [string]$UserPrompt, [int]$MaxAttempts, [array]$Chain)
  if (-not $Chain) { $Chain = $FallbackChain }
  $modelsToTry = $Chain | Select-Object -First $MaxAttempts
  foreach ($m in $modelsToTry) {
    $sn = Get-ShortName $m
    try {
      Write-Host "  Trying $sn ..." -ForegroundColor Gray
      $result = Call-OpenRouter -SystemPrompt $SystemPrompt -UserPrompt $UserPrompt -TaskModel $m
      Write-Host "  Got response from $sn" -ForegroundColor Gray
      return @{ content = $result; model = $sn; error = $null }
    } catch {
      $msg = $_.Exception.Message
      Write-Host "  $sn failed: $msg" -ForegroundColor Yellow
    }
  }
  return @{ content = $null; model = $null; error = "All $MaxAttempts models failed" }
}

function Extract-CodeBlock {
  param([string]$Text)
  if ($Text -match '(?s)```\w*\r?\n(.+?)```') {
    return $Matches[1].TrimEnd()
  }
  return $null
}

function Run-Tsc {
  Push-Location $ProjectRoot
  try {
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & npx tsc --noEmit 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $prevPref
    $outText = ($output | ForEach-Object { $_.ToString() }) -join $NL
    return @{ passed = ($exitCode -eq 0); output = $outText }
  } finally {
    Pop-Location
  }
}

function Build-SystemPrompt {
  $lines = @(
    "You are a code generator. You receive a task and return ONLY code."
    "No explanation, no markdown prose."
    ""
    "Rules:"
    "- Return the COMPLETE file content in a single code block"
    "- For new files: return the full file"
    "- For edits: return the COMPLETE modified file (not a diff)"
    "- No comments like // # reason: or // Self-review"
    "- Use @/ import aliases (e.g. @/lib/utils, @/components/ui/button)"
    "- TypeScript strict mode with exactOptionalPropertyTypes: true"
    "- React project using shadcn/ui, TanStack Router, Tailwind CSS, sonner"
    "- Respond with ONLY a single code block. Nothing before or after it."
  )
  return ($lines -join $NL)
}

function Process-Task {
  param([string]$TaskPath)

  $taskName = [System.IO.Path]::GetFileNameWithoutExtension($TaskPath)
  $content  = Get-Content $TaskPath -Raw -Encoding UTF8
  $meta     = Parse-TaskFrontmatter $content
  $targetPath = Join-Path $ProjectRoot $meta.target

  Write-Host ""
  Write-Host "[$taskName] type=$($meta.type) target=$($meta.target)" -ForegroundColor Cyan

  $contextContent = ""
  foreach ($cf in $meta.context) {
    $cfPath = Join-Path $ProjectRoot $cf
    if (Test-Path $cfPath) {
      $contextContent += $NL + "--- File: $cf ---" + $NL
      $contextContent += (Get-Content $cfPath -Raw -Encoding UTF8)
    }
  }

  $existingCode = ""
  if ((Test-Path $targetPath) -and ($meta.type -eq "edit")) {
    $existingCode = Get-Content $targetPath -Raw -Encoding UTF8
  }

  $systemPrompt = Build-SystemPrompt
  $userPrompt = "TASK:" + $NL + $content

  if ($existingCode) {
    $userPrompt += $NL + $NL + "CURRENT FILE ($($meta.target)):" + $NL + '```tsx' + $NL + $existingCode + $NL + '```'
  }
  if ($contextContent) {
    $userPrompt += $NL + $NL + "CONTEXT FILES:" + $NL + $contextContent
  }

  if ($DryRun) {
    $fb = $Retries - 1
    Write-Host "  [DRY RUN] Would send to $PrimaryModel (+ $fb fallbacks)" -ForegroundColor Yellow
    Write-Host "  Target: $targetPath" -ForegroundColor Gray
    $ctxJoined = $meta.context -join ", "
    Write-Host "  Context: $ctxJoined" -ForegroundColor Gray
    if ($meta.model) { Write-Host "  Task model: $($meta.model)" -ForegroundColor Gray }
    return @{ task = $taskName; status = "dry_run"; model = $meta.model }
  }

  $taskChain = $FallbackChain
  if ($meta.model) {
    $taskPrimary = Resolve-Model $meta.model
    $taskChain = Get-FallbackChain $taskPrimary
    Write-Host "  Task model: $($meta.model) -> $taskPrimary" -ForegroundColor Gray
  }

  $apiResult = Call-WithFallback -SystemPrompt $systemPrompt -UserPrompt $userPrompt -MaxAttempts $Retries -Chain $taskChain
  if (-not $apiResult.content) {
    Write-Host "  ALL MODELS FAILED" -ForegroundColor Red
    return @{ task = $taskName; status = "api_error"; error = $apiResult.error }
  }

  $response = $apiResult.content
  $usedModel = $apiResult.model

  $code = Extract-CodeBlock $response
  if (-not $code) { $code = $response.Trim() }

  if (-not $code -or $code.Length -lt 20) {
    Write-Host "  NO CODE returned from $usedModel" -ForegroundColor Red
    $snippet = $response.Substring(0, [Math]::Min(500, $response.Length))
    return @{ task = $taskName; status = "no_code"; model = $usedModel; response = $snippet }
  }

  $parentDir = Split-Path $targetPath -Parent
  if (-not (Test-Path $parentDir)) {
    New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
  }

  $backupPath = ""
  if (Test-Path $targetPath) {
    $backupPath = $targetPath + ".bak"
    Copy-Item $targetPath $backupPath -Force
  }

  [System.IO.File]::WriteAllText($targetPath, $code, [System.Text.Encoding]::UTF8)
  $charCount = $code.Length
  Write-Host "  Wrote $charCount chars to $($meta.target)" -ForegroundColor Gray

  Write-Host "  Running tsc --noEmit..." -ForegroundColor Gray
  $tsc = Run-Tsc

  if ($tsc.passed) {
    Write-Host "  PASS ($usedModel)" -ForegroundColor Green
    if ($backupPath -and (Test-Path $backupPath)) { Remove-Item $backupPath -Force }
    return @{ task = $taskName; status = "pass"; model = $usedModel; target = $meta.target; chars = $charCount }
  } else {
    Write-Host "  FAIL ($usedModel) - tsc errors:" -ForegroundColor Red
    $errLines = ($tsc.output -split "`n") | Select-Object -First 10
    foreach ($eLine in $errLines) { Write-Host "    $eLine" -ForegroundColor Red }

    if ($backupPath -and (Test-Path $backupPath)) {
      Copy-Item $backupPath $targetPath -Force
      Remove-Item $backupPath -Force
      Write-Host "  Restored backup" -ForegroundColor Yellow
    } elseif ($meta.type -eq "new") {
      Remove-Item $targetPath -Force
      Write-Host "  Removed failed new file" -ForegroundColor Yellow
    }

    $errJoined = $errLines -join $NL
    return @{ task = $taskName; status = "fail"; model = $usedModel; target = $meta.target; errors = $errJoined }
  }
}

# --- Main ---

Write-Host ""
Write-Host "  hermes-runner (free models only)" -ForegroundColor White
Write-Host "  primary: $Model -> $PrimaryModel" -ForegroundColor Gray
Write-Host "  retries: $Retries" -ForegroundColor Gray
Write-Host "  project: $ProjectRoot" -ForegroundColor Gray
Write-Host ""

$tasks = @()
if ($TaskFile) {
  $path = Join-Path $QueueDir $TaskFile
  if (-not (Test-Path $path)) { $path = $TaskFile }
  if (-not (Test-Path $path)) { Write-Error "Task not found: $TaskFile"; exit 1 }
  $tasks = @($path)
} else {
  $tasks = Get-ChildItem $QueueDir -Filter "*.md" | Sort-Object Name | Select-Object -ExpandProperty FullName
}

if ($tasks.Count -eq 0) {
  Write-Host "No tasks in queue." -ForegroundColor Yellow
  exit 0
}

$taskCount = $tasks.Count
Write-Host "Tasks queued: $taskCount" -ForegroundColor White

$results = @()
foreach ($taskPath in $tasks) {
  $taskName = [System.IO.Path]::GetFileName($taskPath)
  $r = Process-Task $taskPath

  if (-not $DryRun) {
    if ($r.status -eq "pass") {
      Move-Item $taskPath (Join-Path $DoneDir $taskName) -Force
    } elseif ($r.status -eq "fail" -or $r.status -eq "api_error" -or $r.status -eq "no_code") {
      Move-Item $taskPath (Join-Path $FailedDir $taskName) -Force
    }
  }

  $results += $r
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportPath = Join-Path $ReportDir "run-$timestamp.json"
$results | ConvertTo-Json -Depth 4 | Out-File $reportPath -Encoding utf8

Write-Host ""
Write-Host "--- Summary ---" -ForegroundColor White
$passCount = ($results | Where-Object { $_.status -eq "pass" }).Count
$failCount = ($results | Where-Object { $_.status -ne "pass" -and $_.status -ne "dry_run" }).Count
Write-Host "  Passed: $passCount" -ForegroundColor Green
if ($failCount -gt 0) { Write-Host "  Failed: $failCount" -ForegroundColor Red }
Write-Host "  Report: $reportPath" -ForegroundColor Gray

foreach ($r in $results) {
  if ($r.status -eq "pass") { $icon = "[OK]"; $color = "Green" }
  elseif ($r.status -eq "dry_run") { $icon = "[--]"; $color = "Gray" }
  else { $icon = "[XX]"; $color = "Red" }

  $tag = ""
  if ($r.model) { $tag = " ($($r.model))" }
  $taskLabel = $r.task
  Write-Host "  $icon $taskLabel$tag" -ForegroundColor $color
}
