param(
    [switch]$SkipBuild,
    [switch]$NoPortable,
    [string]$ElectronDist,
    [string]$NsisExe
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else {
    Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) {
    throw 'Node.js was not found. Install Node.js or add node.exe to PATH.'
}
Push-Location -LiteralPath $projectRoot
try {
    if (-not $SkipBuild) {
        $viteEntry = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $viteEntry -PathType Leaf)) {
            throw 'Project dependencies are missing. Run pnpm install or npm install first.'
        }
        & $nodeExecutable $viteEntry build
        if ($LASTEXITCODE -ne 0) { throw "Vite build failed: $LASTEXITCODE" }
    }
    if ($ElectronDist) { $env:LAST_LIGHT_ELECTRON_DIST = $ElectronDist }
    if ($NsisExe) { $env:LAST_LIGHT_NSIS_EXE = $NsisExe }
    $packageArguments = @((Join-Path $PSScriptRoot 'package.mjs'))
    if ($NoPortable) { $packageArguments += '--no-portable' }
    & $nodeExecutable @packageArguments
    if ($LASTEXITCODE -ne 0) { throw "Packaging failed: $LASTEXITCODE" }
} finally {
    Pop-Location
}
