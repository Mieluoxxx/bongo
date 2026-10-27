# Builds dist\Bongo.exe from this source tree: one windowed executable,
# with the model and the frontend embedded, and no console window.
#
#   powershell -ExecutionPolicy Bypass -File scripts/package-windows.ps1
param(
    [ValidateSet("amd64", "arm64")]
    [string]$Arch = "amd64"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    New-Item -ItemType Directory -Force -Path "dist" | Out-Null
    $env:CGO_ENABLED = "0"
    $env:GOOS = "windows"
    $env:GOARCH = $Arch
    $out = if ($Arch -eq "amd64") { "dist\Bongo.exe" } else { "dist\Bongo-$Arch.exe" }
    go build -trimpath -ldflags "-s -w -H=windowsgui" -o $out .
    if ($LASTEXITCODE -ne 0) {
        throw "go build failed"
    }
    Write-Host $out
}
finally {
    Pop-Location
}
