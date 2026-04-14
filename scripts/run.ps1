param(
  [Parameter(Position = 0)]
  [ValidateSet("gui", "cli", "help", "repair")]
  [string]$Mode = "gui",

  [Parameter()]
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

function Read-RequiredNodeMajor([string]$Root) {
  $pkgPath = Join-Path $Root "package.json"
  if (-not (Test-Path $pkgPath)) {
    return 22
  }

  try {
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    $engineText = [string]$pkg.engines.node
    if (-not $engineText) {
      return 22
    }

    # Supports strings like ">=22" or ">= 22"
    $m = [regex]::Match($engineText, ">=\s*(\d+)")
    if ($m.Success) {
      return [int]$m.Groups[1].Value
    }

    return 22
  } catch {
    return 22
  }
}

function Get-OsNodeArchTag {
  # Node.js dist tags: win-x64 / win-arm64 / win-x86
  $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()

  if ($arch -eq "Arm64") {
    return "win-arm64"
  }

  if ($arch -eq "X64") {
    return "win-x64"
  }

  # Best-effort. Modern Node may not ship x86; we'll handle download failures gracefully.
  return "win-x86"
}

function Parse-SemVer([string]$v) {
  $t = $v.Trim()
  if ($t.StartsWith("v")) { $t = $t.Substring(1) }
  $parts = $t.Split(".")
  if ($parts.Length -lt 3) { return $null }
  try {
    return [PSCustomObject]@{
      Major = [int]$parts[0]
      Minor = [int]$parts[1]
      Patch = [int]$parts[2]
      Text  = $t
    }
  } catch {
    return $null
  }
}

function Select-LatestNodeVersion([int]$Major) {
  # Uses official index: https://nodejs.org/dist/index.json
  $indexUrl = "https://nodejs.org/dist/index.json"
  try {
    $entries = Invoke-RestMethod -Uri $indexUrl -Method Get -TimeoutSec 30
  } catch {
    return $null
  }

  $candidates = @()
  foreach ($e in $entries) {
    $sv = Parse-SemVer -v ([string]$e.version)
    if (-not $sv) { continue }
    if ($sv.Major -ne $Major) { continue }
    $isLts = $false
    if ($null -ne $e.lts -and [string]$e.lts -ne "" -and [string]$e.lts -ne "False") {
      $isLts = $true
    }
    $candidates += [PSCustomObject]@{
      SemVer = $sv
      IsLts  = $isLts
    }
  }

  if ($candidates.Count -eq 0) { return $null }

  $sorted = $candidates | Sort-Object -Property @{ Expression = { $_.IsLts }; Descending = $true }, `
    @{ Expression = { $_.SemVer.Major }; Descending = $true }, `
    @{ Expression = { $_.SemVer.Minor }; Descending = $true }, `
    @{ Expression = { $_.SemVer.Patch }; Descending = $true }

  return "v$($sorted[0].SemVer.Text)"
}

function Get-LocalNodePaths([string]$Root) {
  $dir = Join-Path $Root ".runtime\\node\\current"
  return [PSCustomObject]@{
    Dir = $dir
    NodeExe = Join-Path $dir "node.exe"
    NpmCmd = Join-Path $dir "npm.cmd"
  }
}

function Ensure-LocalNode([string]$Root, [int]$RequiredMajor) {
  $archTag = Get-OsNodeArchTag
  $paths = Get-LocalNodePaths -Root $Root
  $runtimeRoot = Join-Path $Root ".runtime"
  $nodeRoot = Join-Path $runtimeRoot "node"
  $statePath = Join-Path $nodeRoot "state.json"

  New-Item -ItemType Directory -Path $nodeRoot -Force | Out-Null

  $needInstall = $true
  if (Test-Path $paths.NodeExe) {
    try {
      $v = & $paths.NodeExe --version
      $sv = Parse-SemVer -v $v
      if ($sv -and $sv.Major -ge $RequiredMajor) {
        $needInstall = $false
      }
    } catch {
      $needInstall = $true
    }
  }

  # Reinstall if OS arch changed (e.g. node from x86 on x64 system) or if state is missing.
  if (-not (Test-Path $statePath)) {
    $needInstall = $true
  } else {
    try {
      $state = Get-Content $statePath -Raw | ConvertFrom-Json
      if ([string]$state.archTag -ne $archTag) {
        $needInstall = $true
      }
    } catch {
      $needInstall = $true
    }
  }

  if (-not $needInstall) {
    return $paths
  }

  $targetMajor = $RequiredMajor
  if ($targetMajor -lt 22) { $targetMajor = 22 }

  Write-Info "Preparing Node.js runtime (required: >= $RequiredMajor, platform: $archTag)..."

  $version = Select-LatestNodeVersion -Major $targetMajor
  if (-not $version) {
    Write-Info "Cannot reach nodejs.org to download Node.js runtime."
    Write-Info "If you have Node.js already installed, install/upgrade it to $RequiredMajor+ and re-run."
    Write-Info "Download page:"
    Write-Info "  https://nodejs.org/en/download"
    Write-Fail "Node.js runtime is required."
  }

  $zipName = "node-$version-$archTag.zip".Replace("v", "v") # keep stable format
  $distZip = "node-$version-$archTag.zip"
  $distUrl = "https://nodejs.org/dist/$version/node-$version-$archTag.zip"
  $cacheDir = Join-Path $nodeRoot "cache"
  $zipPath = Join-Path $cacheDir $distZip
  New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null

  Write-Info "Downloading $distUrl"
  try {
    Invoke-WebRequest -Uri $distUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 120 | Out-Null
  } catch {
    # Fallback for some PowerShell configurations (TLS/proxy).
    Write-Info "Download failed via Invoke-WebRequest. Trying BITS..."
    try {
      Start-BitsTransfer -Source $distUrl -Destination $zipPath -ErrorAction Stop
    } catch {
      Write-Info "Cannot download Node.js runtime automatically."
      Write-Info "If you are on 32-bit Windows, Node.js $targetMajor may be unavailable for x86."
      Write-Info "Install Node.js $RequiredMajor+ manually and re-run."
      Start-Process "https://nodejs.org/en/download"
      Write-Fail "Node.js runtime download failed."
    }
  }

  if (-not (Test-Path $zipPath)) {
    Write-Fail "Downloaded file not found: $zipPath"
  }
  $zipSize = (Get-Item $zipPath).Length
  if ($zipSize -lt 5MB) {
    Write-Fail "Downloaded Node.js archive looks too small ($zipSize bytes). Check your internet/proxy and try again."
  }

  $tmpDir = Join-Path $nodeRoot "tmp"
  if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
  New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

  Write-Info "Extracting Node.js runtime..."
  try {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $tmpDir -Force
  } catch {
    Write-Fail "Cannot extract Node.js archive. Try running again, or re-download Node.js manually."
  }

  $extracted = Get-ChildItem -Path $tmpDir -Directory | Select-Object -First 1
  if (-not $extracted) {
    Write-Fail "Node.js archive extracted but folder not found."
  }

  if (Test-Path $paths.Dir) { Remove-Item $paths.Dir -Recurse -Force }
  Move-Item -LiteralPath $extracted.FullName -Destination $paths.Dir -Force

  if (-not (Test-Path $paths.NodeExe)) {
    Write-Fail "Node.js runtime installed but node.exe not found."
  }
  if (-not (Test-Path $paths.NpmCmd)) {
    Write-Fail "Node.js runtime installed but npm.cmd not found."
  }

  $finalVersion = & $paths.NodeExe --version
  $finalSv = Parse-SemVer -v $finalVersion
  if (-not $finalSv -or $finalSv.Major -lt $RequiredMajor) {
    Write-Fail "Installed Node.js is too old ($finalVersion). Required: $RequiredMajor+"
  }

  $state = [PSCustomObject]@{
    nodeVersion = $finalVersion.Trim()
    archTag     = $archTag
    installedAt = (Get-Date).ToString("o")
  }
  $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding UTF8

  Write-Info "Node.js runtime ready: $finalVersion ($archTag)"
  return $paths
}

function Ensure-Dependencies {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,

    [Parameter(Mandatory = $true)]
    [string]$NpmCmd,

    [Parameter(Mandatory = $true)]
    [string]$NodeVersion,

    [Parameter(Mandatory = $true)]
    [string]$ArchTag,

    [switch]$ForceReinstall
  )

  $runtimeRoot = Join-Path $Root ".runtime"
  $depsStatePath = Join-Path $runtimeRoot "deps-state.json"
  $nodeModules = Join-Path $Root "node_modules"

  $needInstall = $ForceReinstall.IsPresent -or (-not (Test-Path $nodeModules))

  if (-not $needInstall -and (Test-Path $depsStatePath)) {
    try {
      $depsState = Get-Content $depsStatePath -Raw | ConvertFrom-Json
      if ([string]$depsState.nodeVersion -ne $NodeVersion) { $needInstall = $true }
      if ([string]$depsState.archTag -ne $ArchTag) { $needInstall = $true }
    } catch {
      $needInstall = $true
    }
  }

  if (-not $needInstall -and (Test-Path $nodeModules)) {
    $tsxCmd = Join-Path $nodeModules ".bin\\tsx.cmd"
    $tsxPs1 = Join-Path $nodeModules ".bin\\tsx.ps1"
    if (-not ((Test-Path $tsxCmd) -or (Test-Path $tsxPs1))) {
      $needInstall = $true
    }
  }

  # If node_modules exists but we have no state yet, avoid touching files (Windows may lock Electron binaries).
  # Do a quick sanity check for a required tool and then write state.
  if (-not $needInstall -and (-not (Test-Path $depsStatePath))) {
    $tsxCmd = Join-Path $nodeModules ".bin\\tsx.cmd"
    $tsxPs1 = Join-Path $nodeModules ".bin\\tsx.ps1"
    if ((Test-Path $tsxCmd) -or (Test-Path $tsxPs1)) {
      New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
      ([PSCustomObject]@{
        nodeVersion = $NodeVersion
        archTag     = $ArchTag
        installedAt = (Get-Date).ToString("o")
      }) | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $depsStatePath -Encoding UTF8
      return
    }

    # Something is off (partial install). Reinstall.
    $needInstall = $true
  }

  if (-not $needInstall) { return }

  $electronProcs = @(Get-Process electron -ErrorAction SilentlyContinue)
  if ($electronProcs.Count -gt 0) {
    Write-Info "Cannot reinstall dependencies while Electron is running."
    Write-Info "Close Magic Imger (all windows) and try again."
    Write-Fail "Electron is running."
  }

  Write-Info "Installing npm dependencies (npm ci)..."
  Push-Location $Root
  try {
    & $NpmCmd ci
    if ($LASTEXITCODE -ne 0) {
      Write-Info ""
      Write-Info "npm ci failed."
      Write-Info "Common Windows fix:"
      Write-Info "  - Close Magic Imger / Electron / VS Code that might use files in node_modules"
      Write-Info "  - Temporarily disable antivirus scanning of this folder"
      Write-Info "  - Re-run: repair-win.bat"
      Write-Fail "Dependency install failed (exit code: $LASTEXITCODE)."
    }
  } finally {
    Pop-Location
  }

  $depsState = [PSCustomObject]@{
    nodeVersion = $NodeVersion
    archTag     = $ArchTag
    installedAt = (Get-Date).ToString("o")
  }
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  $depsState | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $depsStatePath -Encoding UTF8
}

function Print-Help {
  Write-Host @"
Magic Imger launcher (Windows)

Usage:
  run-win.bat                 # GUI
  run-win.bat cli --help      # CLI
  run-win.bat repair          # Re-download runtime + reinstall deps

Or:
  powershell -ExecutionPolicy Bypass -File scripts\run.ps1 gui
  powershell -ExecutionPolicy Bypass -File scripts\run.ps1 repair
"@
}

$root = Get-RepoRoot
Set-Location $root

if ($Mode -eq "help") {
  Print-Help
  exit 0
}

$requiredMajor = Read-RequiredNodeMajor -Root $root
$nodePaths = Ensure-LocalNode -Root $root -RequiredMajor $requiredMajor

$archTag = Get-OsNodeArchTag
$nodeVersion = (& $nodePaths.NodeExe --version).Trim()
Write-Info "Repo: $root"
Write-Info "Runtime: $nodeVersion ($archTag)"

$forceDeps = $false
if ($Mode -eq "repair") {
  Write-Info "Repair mode: re-installing runtime and dependencies..."
  # Force reinstall deps; Node runtime is already ensured but we also reset state so it won't be skipped.
  $forceDeps = $true
  $depsStatePath = Join-Path (Join-Path $root ".runtime") "deps-state.json"
  if (Test-Path $depsStatePath) { Remove-Item $depsStatePath -Force }
}

Ensure-Dependencies -Root $root -NpmCmd $nodePaths.NpmCmd -NodeVersion $nodeVersion -ArchTag $archTag -ForceReinstall:$forceDeps

if ($Mode -eq "gui") {
  Write-Info "Starting GUI..."
  & $nodePaths.NpmCmd run gui
  exit $LASTEXITCODE
}

if ($Mode -eq "cli") {
  Write-Info "Starting CLI..."
  & $nodePaths.NpmCmd run cli -- @CliArgs
  exit $LASTEXITCODE
}

if ($Mode -eq "repair") {
  Write-Info "Repair completed."
  Write-Info "Starting GUI..."
  & $nodePaths.NpmCmd run gui
  exit $LASTEXITCODE
}

Write-Fail "Unknown mode: $Mode"
