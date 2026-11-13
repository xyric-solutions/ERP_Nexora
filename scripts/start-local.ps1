<#
  Starts the complete local Nexora stack and keeps the web server running.

  1. Waits for Docker Desktop (launching it when necessary).
  2. Rebuilds the shared workspace packages (packages/*/dist) so the web app
     never imports stale contracts after a pull.
  3. Starts PostgreSQL, Redis, MinIO, migrations and the API through
     compose.yaml; images are rebuilt only when backend sources change.
  4. Starts the Next.js dev server on 127.0.0.1:<WebPort> and restarts it if it
     exits.

  Safe to run repeatedly. Registered to run at Windows logon by
  scripts/install-local-autostart.ps1. Logs are written to tmp/logs/.
#>
param(
  [int]$WebPort = 3005,
  [switch]$NoSupervise
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$logDir = Join-Path $root 'tmp\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$startupLog = Join-Path $logDir 'startup.log'

function Write-Log([string]$message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
  $line | Out-File -FilePath $startupLog -Append -Encoding utf8
  Write-Output $line
}

# Runs a native command through cmd so its stdout/stderr are appended to the
# log as plain UTF-8 text; returns the command's exit code.
function Invoke-Logged([string]$commandLine) {
  & cmd.exe /d /c "$commandLine 2>&1" | Out-File -FilePath $startupLog -Append -Encoding utf8
  return $LASTEXITCODE
}

# Start each logon with a fresh startup log (previous run kept as .previous).
if (Test-Path $startupLog) { Move-Item -Force $startupLog "$startupLog.previous" }

function Test-Docker {
  & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Test-PortListening([int]$port) {
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

function Get-NexoraWebProcess {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*next*dev*' -and $_.CommandLine -like "*--port*$WebPort*" }
}

Write-Log "---- Nexora startup (root: $root, web port: $WebPort) ----"

# 1. Docker Desktop -----------------------------------------------------------
if (-not (Test-Docker)) {
  $dockerCli = (Get-Command docker -ErrorAction SilentlyContinue).Source
  $candidates = @(
    $(if ($dockerCli) { Join-Path (Split-Path (Split-Path (Split-Path $dockerCli))) 'frontend\Docker Desktop.exe' }),
    "$env:LOCALAPPDATA\Programs\DockerDesktop\frontend\Docker Desktop.exe",
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  ) | Where-Object { $_ -and (Test-Path $_) }
  if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue) -and $candidates) {
    Write-Log "Launching Docker Desktop: $($candidates[0])"
    Start-Process -FilePath $candidates[0] | Out-Null
  }
  Write-Log 'Waiting for the Docker engine...'
  $deadline = (Get-Date).AddMinutes(6)
  while (-not (Test-Docker) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 5 }
  if (-not (Test-Docker)) { Write-Log 'ERROR: Docker engine did not become ready within 6 minutes.'; exit 1 }
}
Write-Log 'Docker engine ready.'

# 2. Shared workspace packages ------------------------------------------------
Write-Log 'Building shared packages (incremental)...'
$tscExit = Invoke-Logged 'node node_modules/typescript/bin/tsc -b --pretty false packages/contracts packages/observability packages/auth packages/db packages/domain packages/testing'
if ($tscExit -ne 0) { Write-Log 'WARNING: shared package build reported errors (see startup.log); continuing.' }

# 3. Backend services ---------------------------------------------------------
$backendPaths = @('server', 'packages', 'docker', 'compose.yaml', 'package.json', 'package-lock.json')
$head = (& git rev-parse HEAD 2>$null)
$changes = ((& git diff HEAD -- $backendPaths 2>$null) + (& git ls-files --others --exclude-standard -- $backendPaths 2>$null)) -join "`n"
$sha = [Security.Cryptography.SHA256]::Create()
$fingerprint = "$head-" + [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($changes))).Replace('-', '').Substring(0, 16)
$fingerprintFile = Join-Path $logDir 'backend-image.fingerprint'
$previous = if (Test-Path $fingerprintFile) { (Get-Content $fingerprintFile -Raw).Trim() } else { '' }

$composeCommand = 'docker compose up -d --wait --wait-timeout 600'
if ($previous -ne $fingerprint) {
  Write-Log 'Backend sources changed since the last image build; rebuilding images.'
  $composeCommand += ' --build'
}
# The worker is not started: its bank-revaluation reversal job posts financial
# entries and requires an approved BANK_REVALUATION_REVERSAL_ACTOR_ID, which
# compose.yaml does not yet pass through. Start it deliberately once configured.
$composeExit = Invoke-Logged "$composeCommand api"
if ($composeExit -eq 0) {
  Set-Content -Path $fingerprintFile -Value $fingerprint
  Write-Log 'Backend services healthy (postgres, redis, minio, migrations, api).'
} else {
  Write-Log 'ERROR: docker compose could not start the backend; container states follow (inspect with `docker compose logs <service>`).'
  Invoke-Logged 'docker compose ps -a' | Out-Null
}

# 4. Web server ---------------------------------------------------------------
function Start-NexoraWeb {
  if (Get-NexoraWebProcess) { return }
  if (Test-PortListening $WebPort) {
    Write-Log "ERROR: port $WebPort is used by another program; Nexora web not started."
    return
  }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  Write-Log "Starting Nexora web on http://127.0.0.1:$WebPort"
  Start-Process -FilePath (Get-Command node).Source `
    -ArgumentList @('node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', "$WebPort") `
    -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "web-$stamp.log") `
    -RedirectStandardError (Join-Path $logDir "web-$stamp.err.log") | Out-Null
  # Warm the login route so the first browser visit is fast.
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$WebPort/login" -TimeoutSec 120
      Write-Log "Web ready: /login returned $($response.StatusCode)."
      return
    } catch { }
  }
  Write-Log 'WARNING: web server did not answer /login within 2 minutes.'
}

# Keep only the logs of the 10 most recent web runs (stdout + stderr each).
Get-ChildItem $logDir -Filter 'web-*.log' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 20 | Remove-Item -Force -ErrorAction SilentlyContinue

Start-NexoraWeb
Write-Log 'Startup complete.'

if ($NoSupervise) { exit 0 }
while ($true) {
  Start-Sleep -Seconds 30
  if (-not (Get-NexoraWebProcess)) {
    Write-Log 'Nexora web process is not running; restarting.'
    Start-NexoraWeb
  }
}
