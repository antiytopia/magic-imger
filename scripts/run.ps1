param(
  [Parameter(Position = 0)]
  [ValidateSet("gui", "cli", "help")]
  [string]$Mode = "gui",

  [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs = @()
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
  Write-Host $Message
}

function Write-Fail([string]$Message) {
  Write-Host $Message -ForegroundColor Red
  exit 1
}

function Get-RepoRoot {
  # scripts/run.ps1 -> repo root
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Ensure-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
      Write-Info "Node.js not found. Attempting to install via winget (OpenJS.NodeJS.LTS)..."

      $installCmd = @"
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
Write-Host ''
Write-Host 'Node.js installation finished. Close this window and run Magic Imger again.'
pause
"@

      Start-Process powershell.exe -ArgumentList @(
        "-NoLogo",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $installCmd
      ) -WindowStyle Normal

      exit 2
    }

    Write-Info "Node.js not found and winget is not available."
    Write-Info "Opening Node.js download page..."
    Start-Process "https://nodejs.org/en/download"
    Write-Fail "Install Node.js 22+ and re-run."
  }

  $versionText = & node --version
  if (-not $versionText) {
    Write-Fail "Cannot read Node.js version."
  }

  $versionText = $versionText.Trim()
  if ($versionText.StartsWith("v")) {
    $versionText = $versionText.Substring(1)
  }

  try {
    $major = [int]($versionText.Split(".")[0])
  } catch {
    Write-Fail "Unrecognized Node.js version: $versionText"
  }

  if ($major -lt 22) {
    Write-Fail "Node.js 22+ required. Current: $versionText"
  }

  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npm) {
    Write-Fail "npm not found. Install npm (usually bundled with Node.js) and re-run."
  }
}

function Ensure-Dependencies([string]$Root) {
  $nodeModules = Join-Path $Root "node_modules"
  if (Test-Path $nodeModules) {
    return
  }

  Write-Info "Installing npm dependencies (npm ci)..."
  Push-Location $Root
  try {
    & npm ci
  } finally {
    Pop-Location
  }
}

function Print-Help {
  Write-Host @"
Magic Imger launcher (Windows)

Usage:
  run-win.bat                 # GUI
  run-win.bat cli -- --help   # CLI (passes args after --)

Or:
  powershell -ExecutionPolicy Bypass -File scripts\run.ps1 gui
  powershell -ExecutionPolicy Bypass -File scripts\run.ps1 cli -- --help
"@
}

$root = Get-RepoRoot
Set-Location $root

if ($Mode -eq "help") {
  Print-Help
  exit 0
}

Ensure-Node
Ensure-Dependencies -Root $root

if ($Mode -eq "gui") {
  Write-Info "Starting GUI..."
  & npm run gui
  exit $LASTEXITCODE
}

if ($Mode -eq "cli") {
  Write-Info "Starting CLI..."
  if ($CliArgs.Count -gt 0 -and $CliArgs[0] -eq "--") {
    $CliArgs = $CliArgs[1..($CliArgs.Count - 1)]
  }
  & npm run cli -- @CliArgs
  exit $LASTEXITCODE
}

Write-Fail "Unknown mode: $Mode"
