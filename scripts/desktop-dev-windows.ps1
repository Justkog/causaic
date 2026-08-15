$ErrorActionPreference = 'Stop'

$repository = Split-Path -Parent $PSScriptRoot
Set-Location $repository

if ($repository.StartsWith('\\wsl$', [System.StringComparison]::OrdinalIgnoreCase) -or
    $repository.StartsWith('\\wsl.localhost', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Use a separate checkout on an NTFS Windows path; Windows and WSL must not share node_modules.'
}

corepack pnpm install
corepack pnpm desktop:dev
