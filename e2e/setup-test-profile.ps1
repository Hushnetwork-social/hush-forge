# e2e/setup-test-profile.ps1
#
# ONE-TIME SETUP: Copies only the NeoLine-relevant parts of your Edge profile
# into e2e/wallet-profile/ so that Playwright integration tests can launch
# Edge with NeoLine already configured (wallet + myDevChain network).
#
# Prerequisites:
#   - NeoLine is installed and configured in your Edge browser
#   - NeoLine is connected to myDevChain (neo3-privatenet-docker)
#   - The funded containerAccount wallet is imported in NeoLine
#
# Run from the hush-forge root:
#   powershell -ExecutionPolicy Bypass -File e2e\setup-test-profile.ps1

$ErrorActionPreference = "Stop"

$NEOLINE_ID = "cphhlgmgameodnhkjdmkpanlelnlohao"
$edgeSrc    = "C:\Users\$env:USERNAME\AppData\Local\Microsoft\Edge\User Data\Default"
$destRoot   = Join-Path $PSScriptRoot "wallet-profile"
$dest       = Join-Path $destRoot "Default"

Write-Host "Source  : $edgeSrc"
Write-Host "Dest    : $dest"
Write-Host ""

if (-not (Test-Path $edgeSrc)) {
    Write-Error "Edge Default profile not found at: $edgeSrc"
    exit 1
}

# Wipe any previous copy
if (Test-Path $destRoot) {
    Write-Host "Removing previous test profile..."
    Remove-Item $destRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# ── 1. NeoLine extension binary only (NOT all extensions) ────────────────────
$extSrc = Join-Path $edgeSrc "Extensions\$NEOLINE_ID"
$extDst = Join-Path $dest    "Extensions\$NEOLINE_ID"
if (Test-Path $extSrc) {
    Write-Host "  Copying NeoLine extension (~17MB)..."
    Copy-Item -Path $extSrc -Destination $extDst -Recurse -Force
} else {
    Write-Error "NeoLine extension not found at: $extSrc"
    exit 1
}

# ── 2. Local Storage (NeoLine popup page uses localStorage for wallet data) ───
$lsSrc = Join-Path $edgeSrc "Local Storage"
$lsDst = Join-Path $dest    "Local Storage"
if (Test-Path $lsSrc) {
    Write-Host "  Copying Local Storage (~11MB - contains NeoLine wallet data)..."
    Copy-Item -Path $lsSrc -Destination $lsDst -Recurse -Force
}

# ── 3. Local Extension Settings (chrome.storage.local for NeoLine) ───────────
$lesSrc = Join-Path $edgeSrc "Local Extension Settings\$NEOLINE_ID"
$lesDst = Join-Path $dest    "Local Extension Settings\$NEOLINE_ID"
if (Test-Path $lesSrc) {
    Write-Host "  Copying NeoLine extension settings..."
    New-Item -ItemType Directory -Force -Path (Split-Path $lesDst) | Out-Null
    Copy-Item -Path $lesSrc -Destination $lesDst -Recurse -Force
}

# ── 4. Extension State (tracks which extensions are enabled) ──────────────────
$esSrc = Join-Path $edgeSrc "Extension State"
$esDst = Join-Path $dest    "Extension State"
if (Test-Path $esSrc) {
    Write-Host "  Copying Extension State (~3MB)..."
    Copy-Item -Path $esSrc -Destination $esDst -Recurse -Force
}

# ── 5. Session Storage ────────────────────────────────────────────────────────
$ssSrc = Join-Path $edgeSrc "Session Storage"
$ssDst = Join-Path $dest    "Session Storage"
if (Test-Path $ssSrc) {
    Write-Host "  Copying Session Storage (~5MB)..."
    Copy-Item -Path $ssSrc -Destination $ssDst -Recurse -Force
}

# ── 6. Preferences (contains extension enable/disable state) ──────────────────
$prefSrc = Join-Path $edgeSrc "Preferences"
if (Test-Path $prefSrc) {
    Write-Host "  Copying Preferences..."
    Copy-Item $prefSrc (Join-Path $dest "Preferences") -Force
}

# ── Size summary ─────────────────────────────────────────────────────────────
$totalMB = (Get-ChildItem $destRoot -Recurse -ErrorAction SilentlyContinue |
    Measure-Object Length -Sum).Sum / 1MB

Write-Host ""
Write-Host "Done! Profile size: $([math]::Round($totalMB, 1)) MB at:"
Write-Host "  $destRoot"
Write-Host ""
Write-Host "Next step: npm run test:integration"
